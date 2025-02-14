use rand::{distributions::Alphanumeric, thread_rng, Rng};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
use uuid::Uuid;

// For building the WebSocket response
use actix_web::{web::Payload, Error, HttpRequest, HttpResponse};
use actix_web_actors::ws as actix_actor_ws;

use crate::{ServerConfig, WsChatSession, MAX_FRAME_SIZE};

#[derive(Default, Clone)]
pub struct SessionStore {
    /// Maps an arbitrary "key" (IP or code) to a UUID
    pub key_to_uuid_map: Arc<Mutex<HashMap<String, Uuid>>>,
    /// Tracks how many WebSocket clients reference each UUID
    pub uuid_client_counts: Arc<Mutex<HashMap<Uuid, AtomicUsize>>>,
}

impl SessionStore {
    /// If `strict_mode` is false, create a new UUID if key not found.
    /// If `strict_mode` is true, return None if key not found.
    pub fn get_or_create_session_uuid(&self, key: &str, strict_mode: bool) -> Option<String> {
        // 1) Check if we already have a UUID for this key
        {
            let map_guard = self.key_to_uuid_map.lock().unwrap();
            if let Some(existing_uuid) = map_guard.get(key) {
                let uuid = *existing_uuid;
                drop(map_guard); // release lock
                self.increment_client_count(uuid);
                return Some(uuid.to_string());
            }
        }

        // 2) If strict mode, do not auto-create; return None => 404 scenario
        if strict_mode {
            return None;
        }

        // 3) Otherwise, auto-create
        let new_uuid = Uuid::new_v4();
        {
            let mut map_guard = self.key_to_uuid_map.lock().unwrap();
            map_guard.insert(key.to_string(), new_uuid);
        }
        self.increment_client_count(new_uuid);

        Some(new_uuid.to_string())
    }

    /// Encapsulates the common handshake logic for WebSocket routes.
    /// - Looks up (or creates) a UUID for `key` (IP or code).
    /// - Fails with 404 if not found in strict mode.
    /// - Otherwise, starts the WebSocket session if valid UUID is returned.
    pub fn start_websocket(
        &self,
        config: &ServerConfig,
        req: &HttpRequest,
        stream: Payload,
        key: &str,
        strict_mode: bool,
    ) -> Result<HttpResponse, Error> {
        match self.get_or_create_session_uuid(key, strict_mode) {
            Some(uuid_string) => {
                // Validate that the returned string is a proper UUID
                match Uuid::parse_str(&uuid_string) {
                    Ok(_) => {
                        // Build the WebSocket response
                        actix_actor_ws::WsResponseBuilder::new(
                            WsChatSession::new(&uuid_string, config.auto_join, self.clone()),
                            req,
                            stream,
                        )
                        .codec(actix_http::ws::Codec::new())
                        .frame_size(MAX_FRAME_SIZE)
                        .start()
                    }
                    Err(_) => {
                        log::error!("Invalid UUID returned: {}", uuid_string);
                        Ok(HttpResponse::InternalServerError().body("Server configuration error"))
                    }
                }
            }
            None => {
                log::warn!(
                    "[Websocket] Key '{}' not found in strict mode, returning 404",
                    key
                );
                Ok(HttpResponse::NotFound().body("Unknown session code"))
            }
        }
    }

    /// Increments the client count for the given UUID, used by both paths
    fn increment_client_count(&self, uuid: Uuid) {
        let mut client_map = self.uuid_client_counts.lock().unwrap();
        let counter = client_map.entry(uuid).or_default();
        counter.fetch_add(1, Ordering::SeqCst);
        log::debug!(
            "[Websocket] Session {} now has {} clients",
            uuid,
            counter.load(Ordering::SeqCst)
        );
    }

    /// Decrements the client count for the given UUID.
    /// If the client count reaches zero, removes the UUID from both maps.
    pub fn remove_client(&self, uuid: &Uuid) {
        let mut client_map = self.uuid_client_counts.lock().expect("lock poisoned");
        if let Some(counter) = client_map.get_mut(uuid) {
            if counter.fetch_sub(1, Ordering::SeqCst) > 0 {
                log::debug!(
                    "[Websocket] Session {} decremented to {} clients",
                    uuid,
                    counter.load(Ordering::SeqCst)
                );
                if counter.load(Ordering::SeqCst) == 0 {
                    client_map.remove(uuid);
                    log::debug!(
                        "[Websocket] Session {} has no more clients and is being removed",
                        uuid
                    );
                    let mut map_guard = self.key_to_uuid_map.lock().expect("lock poisoned");
                    map_guard.retain(|_, v| *v != *uuid);
                    log::debug!("[Websocket] Session {} removed from key_to_uuid_map", uuid);
                }
            }
        } else {
            log::debug!(
                "[Websocket] Attempted to remove client from unknown session {}",
                uuid
            );
        }
    }

    /// Generates a random alphanumeric code of the given length
    pub fn generate_random_code(length: usize) -> String {
        thread_rng()
            .sample_iter(&Alphanumeric)
            .take(length)
            .map(char::from)
            .collect()
    }
}
