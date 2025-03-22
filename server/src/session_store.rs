use crate::{message::CleanupSession, ServerConfig, WsChatServer, WsChatSession, MAX_FRAME_SIZE};
use actix::SystemService;
use actix_web::{web::Payload, Error, HttpRequest, HttpResponse};
use actix_web_actors::ws as actix_actor_ws;
use rand::{distributions::Alphanumeric, thread_rng, Rng};
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
use actix_rt::{spawn, task, time};
use uuid::Uuid;

/// Stores the session’s UUID and whether it’s private.
#[derive(Clone, Copy)]
pub struct SessionData {
    pub uuid: Uuid,
    pub is_private: bool,
}

#[derive(Default, Clone)]
pub struct SessionStore {
    /// Maps a key (IP for public or generated code for private sessions)
    /// to its session data.
    pub key_to_session: Arc<Mutex<HashMap<String, SessionData>>>,
    /// Tracks how many WebSocket clients reference each UUID.
    pub uuid_client_counts: Arc<Mutex<HashMap<Uuid, AtomicUsize>>>,
    /// For private sessions, tracks expired codes.
    pub expired_private_codes: Arc<Mutex<HashSet<String>>>,
    /// For private sessions, tracks scheduled expirations.
    pub scheduled_expirations: Arc<Mutex<HashMap<String, task::JoinHandle<()>>>>,
}

impl SessionStore {
    /// Returns true if the private session code has been marked expired.
    fn is_code_expired(&self, key: &str) -> bool {
        self.expired_private_codes.lock().unwrap().contains(key)
    }

    /// Looks up (or creates) a session UUID for the given key.
    /// The caller must indicate whether this is a private session.
    /// - If the session exists, its client count is incremented and its UUID returned.
    /// - If not found and strict_mode is false, a new session is auto‑created.
    /// - If strict_mode is true, None is returned (resulting in a 404).
    pub fn get_or_create_session_uuid(
        &self,
        key: &str,
        strict_mode: bool,
        is_private: bool,
    ) -> Option<String> {
        // For private sessions, check if the code is expired.
        if is_private && self.is_code_expired(key) {
            log::debug!(target: "Websocket", "Private session code {} is expired", key);
            return None;
        }

        // Make sure to always cancel any scheduled expiration when reconnecting
        if is_private {
            let mut scheduled = self.scheduled_expirations.lock().expect("lock poisoned");
            if let Some(handle) = scheduled.remove(key) {
                handle.abort();
                log::debug!("Cancelled scheduled expiration for {}", key);
            }
        }

        {
            let map = match self.key_to_session.lock() {
                Ok(guard) => guard,
                Err(e) => {
                    log::error!(
                        target: "Websocket",
                        "Failed to acquire lock on key_to_session: {:?}",
                        e
                    );
                    return None;
                }
            };
            if let Some(data) = map.get(key) {
                self.increment_client_count(data.uuid);
                return Some(data.uuid.to_string());
            }
        }

        if strict_mode {
            return None;
        }

        let new_uuid = Uuid::new_v4();
        let new_data = SessionData {
            uuid: new_uuid,
            is_private,
        };
        {
            let mut map = match self.key_to_session.lock() {
                Ok(guard) => guard,
                Err(e) => {
                    log::error!(
                        target: "Websocket",
                        "Failed to acquire lock on key_to_session: {:?}",
                        e
                    );
                    return None;
                }
            };
            map.insert(key.to_string(), new_data);
        }
        self.increment_client_count(new_uuid);
        Some(new_uuid.to_string())
    }

    /// Starts a WebSocket session using the stored session UUID.
    pub fn start_websocket(
        &self,
        config: &ServerConfig,
        req: &HttpRequest,
        stream: Payload,
        key: &str,
        strict_mode: bool,
        is_private: bool,
    ) -> Result<HttpResponse, Error> {
        match self.get_or_create_session_uuid(key, strict_mode, is_private) {
            Some(uuid_str) => match Uuid::parse_str(&uuid_str) {
                Ok(_) => actix_actor_ws::WsResponseBuilder::new(
                    WsChatSession::new(&uuid_str, config.auto_join, self.clone()),
                    req,
                    stream,
                )
                .codec(actix_http::ws::Codec::new())
                .frame_size(MAX_FRAME_SIZE)
                .start(),
                Err(_) => {
                    log::error!(target: "Websocket", "Invalid UUID returned: {}", uuid_str);
                    Ok(HttpResponse::InternalServerError()
                        .content_type("text/plain; charset=utf-8")
                        .body("Server configuration error"))
                }
            },
            None => {
                log::warn!(
                    target: "Websocket",
                    "Key '{}' not found in strict mode, returning 404",
                    key
                );
                Ok(HttpResponse::NotFound()
                    .content_type("text/plain; charset=utf-8")
                    .body("Unknown session code"))
            }
        }
    }

    /// Increments the client count for the session with the given UUID.
    fn increment_client_count(&self, uuid: Uuid) {
        let mut counts = match self.uuid_client_counts.lock() {
            Ok(guard) => guard,
            Err(e) => {
                log::error!(
                    target: "Websocket",
                    "Failed to acquire lock on uuid_client_counts: {:?}",
                    e
                );
                return;
            }
        };
        let counter = counts.entry(uuid).or_default();
        let new_count = counter.fetch_add(1, Ordering::SeqCst) + 1;
        log::debug!(target: "Websocket", "Session {} now has {} clients", uuid, new_count);
    }

    /// Decrements the client count. If it reaches zero for a private session,
    /// the key is removed and marked as expired.
    pub fn remove_client(&self, uuid: &Uuid) {
        let mut counts = self.uuid_client_counts.lock().expect("lock poisoned");
        if let Some(counter) = counts.get_mut(uuid) {
            let prev = counter.fetch_sub(1, Ordering::SeqCst);
            let new_count = prev.saturating_sub(1);
            log::debug!(
                target: "Websocket",
                "Client count for session {} decreased from {} to {}",
                uuid,
                prev,
                new_count
            );
            if new_count == 0 {
                counts.remove(uuid);

                if WsChatServer::from_registry()
                    .try_send(CleanupSession(uuid.to_string()))
                    .is_ok()
                {
                    log::debug!(target: "Websocket", "Sent cleanup request for session {}", uuid);
                }

                let map = self.key_to_session.lock().expect("lock poisoned");
                let keys: Vec<(String, bool)> = map
                    .iter()
                    .filter(|(_, data)| data.uuid == *uuid)
                    .map(|(k, data)| (k.clone(), data.is_private))
                    .collect();
                drop(map);

                for (key, is_private) in keys {
                    if !is_private {
                        let mut map = self.key_to_session.lock().expect("lock poisoned");
                        map.remove(&key);
                        log::debug!(target: "Websocket", "Public session code {} removed", key);
                    } else {
                        let store_clone = self.clone();
                        let key_clone = key.clone();

                        let handle = spawn(async move {
                            time::sleep(std::time::Duration::from_secs(60)).await;

                            let mut scheduled = store_clone.scheduled_expirations
                                .lock()
                                .expect("lock poisoned");

                            if scheduled.remove(&key_clone).is_some() {
                                let mut map = store_clone.key_to_session
                                    .lock()
                                    .expect("lock poisoned");

                                if map.remove(&key_clone).is_some() {
                                    let mut expired = store_clone.expired_private_codes
                                        .lock()
                                        .unwrap();
                                    expired.insert(key_clone.clone());
                                    log::debug!("Private session code {} expired", key_clone);
                                }
                            }
                        });

                        self.scheduled_expirations
                            .lock()
                            .expect("lock poisoned")
                            .insert(key.clone(), handle);
                    }
                }
            }
        } else {
            log::debug!(
                target: "Websocket",
                "Attempted to remove client from unknown session {}",
                uuid
            );
        }
    }

    /// Generates a random alphanumeric code.
    pub fn generate_random_code(length: usize) -> String {
        thread_rng()
            .sample_iter(&Alphanumeric)
            .take(length)
            .map(char::from)
            .collect()
    }
}
