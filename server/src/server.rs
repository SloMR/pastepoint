use crate::{
    message::{ChatMessage, Client, ClientMetadata, Room, WsChatServer},
    LeaveRoom,
};
use actix::prelude::*;
use std::{
    collections::{hash_map::Entry::Vacant, HashMap},
    time::Duration,
};

impl WsChatServer {
    pub fn take_room(&mut self, session_id: &str, room_name: &str) -> Option<Room> {
        log::debug!(target: "Websocket","Getting room: {}", room_name);
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
                return if let Vacant(e) = existing_room.entry(id) {
                    log::debug!(target: "Websocket", "Adding client to room: {}", room_name);
                    e.insert(ClientMetadata {
                        recipient: client,
                        name,
                    });
                    id
                } else {
                    log::debug!(
                        target: "Websocket",
                        "Client {} already in room: {}, skipping addition",
                        id,
                        room_name
                    );
                    id
                };
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
            .or_default()
            .insert(room_name.to_owned(), room);

        self.broadcast_room_list(session_id);
        id
    }

    pub fn send_join_message(
        &mut self,
        session_id: &str,
        room_name: &str,
        msg: &str,
        _src: usize,
    ) -> Option<()> {
        log::debug!(
            target: "Websocket",
            "Sending join message to room {}: {}",
            room_name,
            msg
        );

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
                            target: "Websocket",
                            "Join Message sent to client {}, staying in room: {}",
                            id,
                            room_name
                        );
                    } else {
                        log::debug!(
                            target: "Websocket",
                            "Failed to send join message to client {}, removing from room: {}",
                            id,
                            room_name
                        );
                        room.remove(&id);
                    }
                }
            }

            Some(())
        } else {
            log::debug!(
                target: "Websocket",
                "Room {} not found in session {}",
                room_name,
                session_id
            );
            None
        }
    }

    pub fn broadcast_room_list(&self, session_id: &str) {
        if let Some(users) = self.rooms.get(session_id) {
            let room_list = users.keys().cloned().collect::<Vec<String>>().join(", ");
            let message = format!("[SystemRooms] {}", room_list);

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
                    target: "Websocket",
                    "Broadcasting members of room {}: {:?}",
                    room_name,
                    member_list
                );
                let member_message = format!("[SystemMembers] {}", member_list.join(", "));

                for client_metadata in room.values() {
                    client_metadata
                        .recipient
                        .do_send(ChatMessage(member_message.clone()));
                }
            }
        }
    }

    pub fn remove_empty_rooms(&mut self, session_id: &str) {
        if let Some(rooms) = self.rooms.get_mut(session_id) {
            rooms.retain(|name, room| !room.is_empty() || name == "main");

            let total_users = rooms.values().flat_map(|r| r.keys()).count();
            if total_users == 0 {
                self.rooms.remove(session_id);
                log::debug!(
                    target: "Websocket",
                    "Session {} has no more users and is being removed",
                    session_id
                );
            }
        }
        self.broadcast_room_list(session_id);
    }

    pub fn handle_leave_room(&mut self, msg: LeaveRoom) {
        if let Some(rooms) = self.rooms.get_mut(&msg.0) {
            if let Some(room) = rooms.get_mut(&msg.1) {
                room.remove(&msg.2);

                if room.is_empty() && msg.1 != "main" {
                    rooms.remove(&msg.1);
                }

                self.remove_empty_rooms(&msg.0);
                self.broadcast_room_list(&msg.0);
                self.broadcast_room_members(&msg.0, &msg.1);
            }
        }
    }

    pub fn start_cleanup_interval(&self, ctx: &mut Context<Self>) {
        ctx.run_interval(Duration::from_secs(3600 /* Every Hour */), |act, _| {
            act.cleanup_stale_sessions();
        });
    }

    fn cleanup_stale_sessions(&mut self) {
        let empty_sessions: Vec<String> = self
            .rooms
            .iter()
            .filter(|(_, rooms_map)| rooms_map.values().all(|room| room.is_empty()))
            .map(|(session_id, _)| session_id.clone())
            .collect();

        for session_id in empty_sessions {
            log::debug!(target: "Websocket","Cleanup: Removing empty session {}", session_id);
            self.rooms.remove(&session_id);
        }

        log::debug!(
            target: "Websocket",
            "Current server state: {} active sessions",
            self.rooms.len()
        );
    }

    pub fn users_share_room(&self, session_id: &str, user1: &str, user2: &str) -> bool {
        if let Some(rooms) = self.rooms.get(session_id) {
            for room in rooms.values() {
                let user1_in_room = room.values().any(|cm| cm.name == user1);
                let user2_in_room = room.values().any(|cm| cm.name == user2);

                if user1_in_room && user2_in_room {
                    return true;
                }
            }
        }
        false
    }

    pub fn relay_message_to_user(&self, to_user: &str, message: ChatMessage, from_user: &str) {
        for rooms in self.rooms.values() {
            for room in rooms.values() {
                for client in room.values() {
                    if client.name == to_user {
                        // try_send returns a Result
                        if let Err(e) = client.recipient.try_send(message) {
                            log::error!(
                                target: "Websocket",
                                "Failed to relay signal from {} to {}: {:?}",
                                from_user,
                                to_user,
                                e
                            );
                        } else {
                            log::debug!(
                                target: "Websocket",
                                "Successfully relayed signal from {} to {}",
                                from_user,
                                to_user
                            );
                        }
                        return;
                    }
                }
            }
        }

        log::debug!(
            target: "Websocket",
            "Could not find target user {} to relay message from {}",
            to_user,
            from_user
        );
    }
}

impl SystemService for WsChatServer {
    fn service_started(&mut self, _ctx: &mut Context<Self>) {
        log::info!(target: "Websocket","WsChatServer started");
    }
}

impl Supervised for WsChatServer {
    fn restarting(&mut self, _ctx: &mut Context<Self>) {
        log::info!(target: "Websocket","WsChatServer restarting");
    }
}
