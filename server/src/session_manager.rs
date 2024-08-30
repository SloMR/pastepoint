use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use uuid::Uuid;

#[derive(Default, Clone)]
pub struct SessionManager {
    pub ip_to_uuid: Arc<Mutex<HashMap<String, Uuid>>>,
}

impl SessionManager {
    pub fn get_or_create_uuid(&self, ip: &str) -> String {
        let mut map = self.ip_to_uuid.lock().expect("lock poisoned");
        if let Some(uuid) = map.get(ip) {
            uuid.to_string()
        } else {
            let new_uuid = Uuid::new_v4();
            map.insert(ip.to_string(), new_uuid);
            new_uuid.to_string()
        }
    }
}
