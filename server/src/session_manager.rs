use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
use uuid::Uuid;

#[derive(Default, Clone)]
pub struct SessionManager {
    pub ip_to_uuid: Arc<Mutex<HashMap<String, Uuid>>>,
    pub uuid_to_client_count: Arc<Mutex<HashMap<Uuid, AtomicUsize>>>,
}

impl SessionManager {
    /// Retrieves the existing UUID for the given IP or creates a new one.
    /// Increments the client count for the session.
    pub fn get_or_create_uuid(&self, ip: &str) -> String {
        let mut ip_map = self.ip_to_uuid.lock().expect("lock poisoned");
        let uuid = *ip_map.entry(ip.to_string()).or_insert_with(|| {
            let new_uuid = Uuid::new_v4();
            log::debug!("Created new UUID {} for IP {}", new_uuid, ip);
            new_uuid
        });

        let mut client_map = self.uuid_to_client_count.lock().expect("lock poisoned");
        let counter = client_map
            .entry(uuid)
            .or_insert_with(|| AtomicUsize::new(0));
        counter.fetch_add(1, Ordering::SeqCst);
        log::debug!(
            "Session {} now has {} clients",
            uuid,
            counter.load(Ordering::SeqCst)
        );

        uuid.to_string()
    }

    /// Decrements the client count for the given UUID.
    /// If the client count reaches zero, removes the UUID from both maps.
    pub fn remove_client(&self, uuid: &Uuid) {
        let mut client_map = self.uuid_to_client_count.lock().expect("lock poisoned");
        if let Some(counter) = client_map.get_mut(uuid) {
            if counter.fetch_sub(1, Ordering::SeqCst) > 0 {
                log::debug!(
                    "Session {} decremented to {} clients",
                    uuid,
                    counter.load(Ordering::SeqCst)
                );
                if counter.load(Ordering::SeqCst) == 0 {
                    client_map.remove(uuid);
                    log::debug!("Session {} has no more clients and is being removed", uuid);
                    let mut ip_map = self.ip_to_uuid.lock().expect("lock poisoned");
                    ip_map.retain(|_, v| *v != *uuid);
                    log::debug!("Session {} removed from ip_to_uuid map", uuid);
                }
            }
        } else {
            log::debug!("Attempted to remove client from unknown session {}", uuid);
        }
    }

    /// Forcefully removes a UUID from the manager, regardless of client count.
    /// Useful for scenarios where sessions need to be terminated abruptly.
    pub fn force_remove_uuid(&self, uuid: &Uuid) {
        let mut client_map = self.uuid_to_client_count.lock().expect("lock poisoned");
        if client_map.remove(uuid).is_some() {
            log::debug!(
                "Session {} forcefully removed from uuid_to_client_count map",
                uuid
            );
        }

        let mut ip_map = self.ip_to_uuid.lock().expect("lock poisoned");
        ip_map.retain(|_, v| *v != *uuid);
        log::debug!("Session {} forcefully removed from ip_to_uuid map", uuid);
    }
}
