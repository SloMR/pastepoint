use actix::{Handler, MessageResult};

use crate::{
    message::RelaySignalMessage, ChatMessage, JoinRoom, LeaveRoom, ListRooms, WsChatServer,
    WsChatSession,
};

impl Handler<JoinRoom> for WsChatServer {
    type Result = MessageResult<JoinRoom>;

    fn handle(&mut self, msg: JoinRoom, _ctx: &mut Self::Context) -> Self::Result {
        let JoinRoom(session_id, room_name, client_name, client) = msg;

        let id =
            self.add_client_to_room(&session_id, &room_name, None, client, client_name.clone());
        let join_msg = format!("{} [SystemJoin] {}", client_name, room_name);

        self.send_join_message(&session_id, &room_name, &join_msg, id);
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

impl Handler<RelaySignalMessage> for WsChatServer {
    type Result = ();

    fn handle(&mut self, msg: RelaySignalMessage, _ctx: &mut Self::Context) {
        #[allow(unused_variables)]
        let RelaySignalMessage { from, to, message } = msg;

        // Find the recipient's session and send the message
        for rooms in self.rooms.values() {
            for room in rooms.values() {
                for client in room.values() {
                    if client.name == to {
                        let _ = client.recipient.do_send(message.clone());
                        return;
                    }
                }
            }
        }
    }
}
