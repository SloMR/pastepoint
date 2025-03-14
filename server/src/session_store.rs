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
            log::debug!("[Websocket] Private session code {} is expired", key);
            return None;
        }

        {
            let map = match self.key_to_session.lock() {
                Ok(guard) => guard,
                Err(e) => {
                    log::error!(
                        "[Websocket] Failed to acquire lock on key_to_session: {:?}",
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
                        "[Websocket] Failed to acquire lock on key_to_session: {:?}",
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
                    log::error!("Invalid UUID returned: {}", uuid_str);
                    Ok(HttpResponse::InternalServerError().body("Server configuration error"))
                }
            },
            None => {
                log::warn!(
                    "[Websocket] Key '{}' not found in strict mode, returning 404",
                    key
                );
                Ok(HttpResponse::NotFound().body("Unknown session code"))
            }
        }
    }

    /// Increments the client count for the session with the given UUID.
    fn increment_client_count(&self, uuid: Uuid) {
        let mut counts = match self.uuid_client_counts.lock() {
            Ok(guard) => guard,
            Err(e) => {
                log::error!(
                    "[Websocket] Failed to acquire lock on uuid_client_counts: {:?}",
                    e
                );
                return;
            }
        };
        let counter = counts.entry(uuid).or_default();
        let new_count = counter.fetch_add(1, Ordering::SeqCst) + 1;
        log::debug!("[Websocket] Session {} now has {} clients", uuid, new_count);
    }

    /// Decrements the client count. If it reaches zero for a private session,
    /// the key is removed and marked as expired.
    pub fn remove_client(&self, uuid: &Uuid) {
        let mut counts = self.uuid_client_counts.lock().expect("lock poisoned");
        if let Some(counter) = counts.get_mut(uuid) {
            let prev = counter.fetch_sub(1, Ordering::SeqCst);
            let new_count = prev.saturating_sub(1);
            log::debug!(
                "[Websocket] Removing session {}: count went from {} to {}",
                uuid,
                prev,
                new_count
            );
            if new_count == 0 {
                counts.remove(uuid);
                log::debug!(
                    "[Websocket] Session {} has no more clients and is being removed",
                    uuid
                );

                if let Ok(_) =
                    WsChatServer::from_registry().try_send(CleanupSession(uuid.to_string()))
                {
                    log::debug!("[Websocket] Sent cleanup request for session {}", uuid);
                }

                let mut map = self.key_to_session.lock().expect("lock poisoned");
                // Remove all keys mapping to this UUID.
                let keys: Vec<(String, bool)> = map
                    .iter()
                    .filter(|(_, data)| data.uuid == *uuid)
                    .map(|(k, data)| (k.clone(), data.is_private))
                    .collect();
                for (key, is_private) in keys {
                    map.remove(&key);
                    if is_private {
                        self.expired_private_codes
                            .lock()
                            .unwrap()
                            .insert(key.clone());
                        log::debug!("[Websocket] Private session code {} marked as expired", key);
                    } else {
                        log::debug!("[Websocket] Public session code {} removed", key);
                    }
                }
            }
        } else {
            log::debug!(
                "[Websocket] Attempted to remove client from unknown session {}",
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
