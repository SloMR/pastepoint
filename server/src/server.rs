use std::collections::HashMap;
use actix::prelude::*;
use actix_broker::BrokerSubscribe;

use crate::message::{ChatMessage, Client, JoinRoom, LeaveRoom, ListRooms, Room, SendFile, SendMessage, WsChatServer, WsChatSession};

impl WsChatServer {
    fn take_room(&mut self, room_name: &str) -> Option<Room> {
        let room = self.rooms.get_mut(room_name)?;
        let room = std::mem::take(room);
        Some(room)
    }

    fn add_client_to_room(&mut self, room_name: &str, id: Option<usize>, client: Client) -> usize {
        let mut id = id.unwrap_or_else(rand::random::<usize>);

        if let Some(room) = self.rooms.get_mut(room_name) {
            loop {
                if room.contains_key(&id) {
                    id = rand::random::<usize>();
                } else {
                    break;
                }
            }

            room.insert(id, client);
            return id;
        }

        // Create a new room for the first client
        let mut room: Room = HashMap::new();

        room.insert(id, client);
        self.rooms.insert(room_name.to_owned(), room);
        self.broadcast_room_list();

        id
    }

    fn send_chat_message(&mut self, room_name: &str, msg: &str, _src: usize) -> Option<()> {
        let mut room = self.take_room(room_name)?;

        for (id, client) in room.drain() {
            if client.try_send(ChatMessage(msg.to_owned())).is_ok() {
                self.add_client_to_room(room_name, Some(id), client);
            }
        }

        Some(())
    }

    fn send_chat_attachment(&mut self, room_name: &str, file_name: &str, mime_type: &str, file_data: Vec<u8>, _src: usize) -> Option<()> {
        let mut room = self.take_room(room_name)?;

        for (id, client) in room.drain() {
            log::info!(
                "Sending file {} to client {} in room {}",
                file_name,
                id,
                room_name
            );

            if client.try_send(ChatMessage(format!(
                "File Sending:{}:{}:{}",
                file_name,
                mime_type,
                base64::encode(&file_data)
            )).to_owned()).is_ok() {
                self.add_client_to_room(room_name, Some(id), client);
            }
        }

        Some(())
    }

    fn broadcast_room_list(&self) {
        let room_list = self
            .rooms
            .keys()
            .cloned()
            .collect::<Vec<String>>()
            .join(", ");
        let message = format!("Rooms available: {}", room_list);

        for room in self.rooms.values() {
            for client in room.values() {
                let _ = client.try_send(ChatMessage(message.clone()));
            }
        }
    }

    fn remove_empty_rooms(&mut self) {
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
        let SendFile (room_name, id, file_name, mime_type, file_data) = msg;
        self.send_chat_attachment(&room_name, &file_name, &mime_type, file_data, id);
    }
}

impl Handler<JoinRoom> for WsChatServer {
    type Result = MessageResult<JoinRoom>;

    fn handle(&mut self, msg: JoinRoom, _ctx: &mut Self::Context) -> Self::Result {
        let JoinRoom(room_name, client_name, client) = msg;

        let id = self.add_client_to_room(&room_name, None, client);
        let join_msg = format!("{} joined {}", client_name, room_name);

        self.send_chat_message(&room_name, &join_msg, id);
        MessageResult(id)
    }
}

impl Handler<LeaveRoom> for WsChatServer {
    type Result = ();

    fn handle(&mut self, msg: LeaveRoom, _ctx: &mut Self::Context) {
        if let Some(room) = self.rooms.get_mut(&msg.0) {
            // Send a confirmation message back to the client
            if let Some(client) = room.get(&msg.1) {
                let _ = client.try_send(ChatMessage(format!("You have left the room: {}", msg.0)));
            }

            room.remove(&msg.1);
            // Remove the room if it's empty
            if room.is_empty() && msg.0 != "main" {
                self.rooms.remove(&msg.0);
            }

            self.remove_empty_rooms();
            self.broadcast_room_list();

            // Log for debugging purposes
            log::info!(
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
