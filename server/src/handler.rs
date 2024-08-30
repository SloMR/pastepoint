use actix::{Handler, MessageResult};

use crate::{
    ChatMessage, JoinRoom, LeaveRoom, ListRooms, SendFile, SendMessage, WsChatServer, WsChatSession,
};

impl Handler<SendMessage> for WsChatServer {
    type Result = ();

    fn handle(&mut self, msg: SendMessage, _ctx: &mut Self::Context) {
        let SendMessage(session_id, room_name, id, msg) = msg;
        self.send_chat_message(&session_id, &room_name, &msg, id);
    }
}

impl Handler<SendFile> for WsChatServer {
    type Result = ();

    fn handle(&mut self, msg: SendFile, _ctx: &mut Self::Context) {
        let SendFile(session_id, room_name, id, file_name, mime_type, file_data) = msg;
        self.send_chat_attachment_in_chunks(
            &session_id,
            &room_name,
            &file_name,
            &mime_type,
            file_data,
            id,
        );
    }
}

impl Handler<JoinRoom> for WsChatServer {
    type Result = MessageResult<JoinRoom>;

    fn handle(&mut self, msg: JoinRoom, _ctx: &mut Self::Context) -> Self::Result {
        let JoinRoom(session_id, room_name, client_name, client) = msg;

        let id =
            self.add_client_to_room(&session_id, &room_name, None, client, client_name.clone());
        let join_msg = format!("{} [SystemJoin] {}", client_name, room_name);

        self.send_chat_message(&session_id, &room_name, &join_msg, id);
        self.broadcast_room_members(&session_id, &room_name);
        MessageResult(id)
    }
}

impl Handler<LeaveRoom> for WsChatServer {
    type Result = ();

    fn handle(&mut self, msg: LeaveRoom, _ctx: &mut Self::Context) {
        if let Some(rooms) = self.rooms.get_mut(&msg.0) {
            if let Some(room) = rooms.get_mut(&msg.1) {
                room.remove(&msg.2);

                if room.is_empty() && msg.1 != "main" {
                    self.rooms.remove(&msg.1);
                }

                self.remove_empty_rooms(&msg.0);
                self.broadcast_room_list(&msg.0);
                self.broadcast_room_members(&msg.0, &msg.1);

                log::debug!(
                    "User {} in {} left room {}. Current rooms: {:?}",
                    msg.0,
                    msg.2,
                    msg.1,
                    self.rooms.keys().collect::<Vec<_>>()
                );
            }
        }
    }
}

impl Handler<ListRooms> for WsChatServer {
    type Result = MessageResult<ListRooms>;

    fn handle(&mut self, msg: ListRooms, _ctx: &mut Self::Context) -> Self::Result {
        let ListRooms(session_id) = msg;
        MessageResult(
            self.rooms
                .get(&session_id)
                .unwrap()
                .keys()
                .cloned()
                .collect(),
        )
    }
}

impl Handler<ChatMessage> for WsChatSession {
    type Result = ();

    fn handle(&mut self, msg: ChatMessage, ctx: &mut Self::Context) {
        ctx.text(msg.0);
    }
}
