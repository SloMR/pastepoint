use std::collections::HashMap;

use actix::prelude::*;

use crate::message::{ChatMessage, Client, ClientMetadata, Room, WsChatServer};

impl WsChatServer {
    pub fn take_room(&mut self, session_id: &str, room_name: &str) -> Option<Room> {
        log::debug!("Getting room: {}", room_name);
        let session_id = self.rooms.get_mut(session_id)?;
        let room = session_id.get_mut(room_name)?;
        let room = std::mem::take(room);
        Some(room)
    }

    pub fn add_client_to_room(
        &mut self,
        session_id: &str,
        room_name: &str,
        id: Option<usize>,
        client: Client,
        name: String,
    ) -> usize {
        let id = id.unwrap_or_else(rand::random::<usize>);

        if let Some(room) = self.rooms.get_mut(session_id) {
            if let Some(existing_room) = room.get_mut(room_name) {
                if existing_room.contains_key(&id) {
                    log::debug!(
                        "Client {} already in room: {}, skipping addition",
                        id,
                        room_name
                    );
                    return id;
                } else {
                    log::debug!("Adding client to room: {}", room_name);
                    existing_room.insert(
                        id,
                        ClientMetadata {
                            recipient: client,
                            name,
                        },
                    );
                    return id;
                }
            }
        }

        let mut room: Room = HashMap::new();
        room.insert(
            id,
            ClientMetadata {
                recipient: client,
                name,
            },
        );

        self.rooms
            .entry(session_id.to_string())
            .or_insert_with(HashMap::new)
            .insert(room_name.to_owned(), room);

        self.broadcast_room_list(session_id);
        id
    }

    pub fn send_chat_message(
        &mut self,
        session_id: &str,
        room_name: &str,
        msg: &str,
        _src: usize,
    ) -> Option<()> {
        log::debug!("Sending message to room {}: {}", room_name, msg);

        if let Some(room) = self.rooms.get_mut(session_id)?.get_mut(room_name) {
            let client_ids: Vec<usize> = room.keys().cloned().collect();

            for id in client_ids {
                if let Some(client) = room.get(&id) {
                    if client
                        .recipient
                        .try_send(ChatMessage(msg.to_owned()))
                        .is_ok()
                    {
                        log::debug!(
                            "Message sent to client {}, staying in room: {}",
                            id,
                            room_name
                        );
                    } else {
                        log::warn!(
                            "Failed to send message to client {}, removing from room: {}",
                            id,
                            room_name
                        );
                        room.remove(&id);
                    }
                }
            }

            Some(())
        } else {
            log::error!("Room {} not found in session {}", room_name, session_id);
            None
        }
    }

    pub fn broadcast_room_list(&self, session_id: &str) {
        if let Some(users) = self.rooms.get(session_id) {
            let room_list = users.keys().cloned().collect::<Vec<String>>().join(", ");
            let message = format!("[SystemRooms]: {}", room_list);

            for room in users.values() {
                for client in room.values() {
                    let _ = client.recipient.try_send(ChatMessage(message.clone()));
                }
            }
        }
    }

    pub fn broadcast_room_members(&self, session_id: &str, room_name: &str) {
        if let Some(users) = self.rooms.get(session_id) {
            if let Some(room) = users.get(room_name) {
                let member_list: Vec<String> = room
                    .values()
                    .map(|client_metadata| client_metadata.name.clone())
                    .collect();
                log::debug!(
                    "Broadcasting members of room {}: {:?}",
                    room_name,
                    member_list
                );
                let member_message = format!("[SystemMembers]: {}", member_list.join(", "));

                for client_metadata in room.values() {
                    client_metadata
                        .recipient
                        .do_send(ChatMessage(member_message.clone()));
                }
            }
        }
    }

    pub fn remove_empty_rooms(&mut self, session_id: &str) {
        self.rooms.get_mut(session_id).map(|rooms| {
            rooms.retain(|name, room| !room.is_empty() || name == "main");
        });
        self.broadcast_room_list(session_id);
    }
}

impl SystemService for WsChatServer {
    fn service_started(&mut self, _ctx: &mut Context<Self>) {
        log::info!("WsChatServer started");
    }
}

impl Supervised for WsChatServer {
    fn restarting(&mut self, _ctx: &mut Context<Self>) {
        log::info!("WsChatServer restarting");
    }
}
