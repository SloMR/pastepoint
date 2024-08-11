use std::collections::HashMap;

use actix::prelude::*;
use actix_broker::BrokerSubscribe;
use base64::{engine::general_purpose, Engine as _};

use crate::message::{
    ChatMessage, Client, ClientMetadata, JoinRoom, LeaveRoom, ListRooms, Room, SendFile,
    SendMessage, WsChatServer, WsChatSession,
};

impl WsChatServer {
    fn take_room(&mut self, room_name: &str) -> Option<Room> {
        log::debug!("Getting room: {}", room_name);
        let room = self.rooms.get_mut(room_name)?;
        let room = std::mem::take(room);
        Some(room)
    }

    pub fn add_client_to_room(
        &mut self,
        room_name: &str,
        id: Option<usize>,
        client: Client,
        name: String,
    ) -> usize {
        log::debug!("Adding client to room: {}", room_name);
        let mut id = id.unwrap_or_else(rand::random::<usize>);

        if let Some(room) = self.rooms.get_mut(room_name) {
            loop {
                if room.contains_key(&id) {
                    id = rand::random::<usize>();
                } else {
                    break;
                }
            }

            room.insert(
                id,
                ClientMetadata {
                    recipient: client,
                    name,
                },
            );
            return id;
        }

        let mut room: Room = HashMap::new();

        room.insert(
            id,
            ClientMetadata {
                recipient: client,
                name,
            },
        );
        self.rooms.insert(room_name.to_owned(), room);
        self.broadcast_room_list();

        id
    }

    pub fn send_chat_message(&mut self, room_name: &str, msg: &str, _src: usize) -> Option<()> {
        log::debug!("Sending message to room {}: {}", room_name, msg);
        let mut room = self.take_room(room_name)?;

        for (id, client) in room.drain() {
            if client
                .recipient
                .try_send(ChatMessage(msg.to_owned()))
                .is_ok()
            {
                self.add_client_to_room(room_name, Some(id), client.recipient, client.name);
            }
        }

        Some(())
    }

    pub fn send_chat_attachment(
        &mut self,
        room_name: &str,
        file_name: &str,
        mime_type: &str,
        file_data: Vec<u8>,
        src: usize,
    ) -> Option<()> {
        let mut room = self.take_room(room_name)?;

        for (id, client) in room.drain() {
            if id == src {
                client
                    .recipient
                    .try_send(ChatMessage(format!(
                        "[SystemAck]: File '{}' sent successfully.",
                        file_name
                    )))
                    .ok();
            } else {
                log::debug!(
                    "Sending file {} to client {} in room {}",
                    file_name,
                    id,
                    room_name
                );

                if client
                    .recipient
                    .try_send(
                        ChatMessage(format!(
                            "[SystemFile]:{}:{}:{}",
                            file_name,
                            mime_type,
                            general_purpose::STANDARD.encode(&file_data)
                        ))
                        .to_owned(),
                    )
                    .is_ok()
                {
                    self.add_client_to_room(room_name, Some(id), client.recipient, client.name);
                }
            }
        }

        Some(())
    }

    fn send_chat_attachment_in_chunks(
        &mut self,
        room_name: &str,
        file_name: &str,
        mime_type: &str,
        file_data: Vec<u8>,
        _src: usize,
    ) -> Option<()> {
        let chunk_size = 64 * 1024;
        let total_chunks = (file_data.len() as f64 / chunk_size as f64).ceil() as usize;

        let mut room = self.take_room(room_name)?;

        for (id, client) in room.drain() {
            for (i, chunk) in file_data.chunks(chunk_size).enumerate() {
                let encoded_chunk = general_purpose::STANDARD.encode(chunk);

                log::debug!(
                    "Sending chunk {} of {} for file {} to client {} in room {}",
                    i + 1,
                    total_chunks,
                    file_name,
                    id,
                    room_name
                );

                let chat_message = format!(
                    "[SystemFileChunk]:{}:{}:{}:{}:{}",
                    file_name,
                    mime_type,
                    i + 1,
                    total_chunks,
                    encoded_chunk
                );

                if client.recipient.try_send(ChatMessage(chat_message)).is_ok() {
                    self.add_client_to_room(
                        room_name,
                        Some(id),
                        client.recipient.clone(),
                        client.name.clone(),
                    );
                }
            }
        }

        Some(())
    }

    pub fn broadcast_room_list(&self) {
        let room_list = self
            .rooms
            .keys()
            .cloned()
            .collect::<Vec<String>>()
            .join(", ");
        let message = format!("[SystemRooms]: {}", room_list);

        for room in self.rooms.values() {
            for client in room.values() {
                let _ = client.recipient.try_send(ChatMessage(message.clone()));
            }
        }
    }

    pub fn broadcast_room_members(&self, room_name: &str) {
        if let Some(room) = self.rooms.get(room_name) {
            let member_list: Vec<String> = room
                .values()
                .map(|client_metadata| client_metadata.name.clone())
                .collect();
            log::debug!("Broadcasting members of room {}: {:?}", room_name, member_list);
            let member_message = format!("[SystemMembers]: {}", member_list.join(", "));

            for client_metadata in room.values() {
                client_metadata
                    .recipient
                    .do_send(ChatMessage(member_message.clone()));
            }
        }
    }

    pub fn remove_empty_rooms(&mut self) {
        self.rooms
            .retain(|name, room| !room.is_empty() || name == "main");
        self.broadcast_room_list();
    }
}

impl Actor for WsChatServer {
    type Context = Context<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        self.subscribe_system_async::<LeaveRoom>(ctx);
        self.subscribe_system_async::<SendMessage>(ctx);
        self.subscribe_system_async::<SendFile>(ctx);
    }
}

impl Handler<SendMessage> for WsChatServer {
    type Result = ();

    fn handle(&mut self, msg: SendMessage, _ctx: &mut Self::Context) {
        let SendMessage(room_name, id, msg) = msg;
        self.send_chat_message(&room_name, &msg, id);
    }
}

impl Handler<SendFile> for WsChatServer {
    type Result = ();

    fn handle(&mut self, msg: SendFile, _ctx: &mut Self::Context) {
        let SendFile(room_name, id, file_name, mime_type, file_data) = msg;
        self.send_chat_attachment(&room_name, &file_name, &mime_type, file_data, id);
    }
}

impl Handler<JoinRoom> for WsChatServer {
    type Result = MessageResult<JoinRoom>;

    fn handle(&mut self, msg: JoinRoom, _ctx: &mut Self::Context) -> Self::Result {
        let JoinRoom(room_name, client_name, client) = msg;

        let id = self.add_client_to_room(&room_name, None, client, client_name.clone());
        let join_msg = format!("{} [SystemJoin] {}", client_name, room_name);

        self.send_chat_message(&room_name, &join_msg, id);
        self.broadcast_room_members(&room_name);
        MessageResult(id)
    }
}

impl Handler<LeaveRoom> for WsChatServer {
    type Result = ();

    fn handle(&mut self, msg: LeaveRoom, _ctx: &mut Self::Context) {
        if let Some(room) = self.rooms.get_mut(&msg.0) {
            room.remove(&msg.1);

            if room.is_empty() && msg.0 != "main" {
                self.rooms.remove(&msg.0);
            }

            self.remove_empty_rooms();
            self.broadcast_room_list();
            self.broadcast_room_members(&msg.0);

            log::debug!(
                "User {} left room {}. Current rooms: {:?}",
                msg.1,
                msg.0,
                self.rooms.keys().collect::<Vec<_>>()
            );
        }
    }
}

impl Handler<ListRooms> for WsChatServer {
    type Result = MessageResult<ListRooms>;

    fn handle(&mut self, _: ListRooms, _ctx: &mut Self::Context) -> Self::Result {
        MessageResult(self.rooms.keys().cloned().collect())
    }
}

impl Handler<ChatMessage> for WsChatSession {
    type Result = ();

    fn handle(&mut self, msg: ChatMessage, ctx: &mut Self::Context) {
        ctx.text(msg.0);
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
