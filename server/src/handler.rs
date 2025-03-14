use actix::{Handler, MessageResult};

use crate::{
    message::{CleanupSession, RelaySignalMessage, ValidateAndRelaySignal},
    ChatMessage, JoinRoom, LeaveRoom, ListRooms, WsChatServer, WsChatSession,
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
                    rooms.remove(&msg.1);
                    log::debug!(
                        target: "Websocket",
                        "Room '{}' removed from session {}",
                        msg.1,
                        msg.0
                    );
                }

                let all_empty = rooms.values().all(|r| r.is_empty());
                if all_empty {
                    self.rooms.remove(&msg.0);
                    log::debug!(
                        target: "Websocket",
                        "All rooms in session {} are empty, removing session",
                        msg.0
                    );
                } else {
                    self.remove_empty_rooms(&msg.0);
                }

                self.broadcast_room_list(&msg.0);
                self.broadcast_room_members(&msg.0, &msg.1);

                log::debug!(
                    target: "Websocket",
                    "User {} in {} left room {}. Rooms: {:?}",
                    msg.2,
                    msg.0,
                    msg.1,
                    self.rooms
                        .values()
                        .map(|r| r.keys().cloned().collect::<Vec<String>>())
                        .collect::<Vec<Vec<String>>>()
                );
            }
        }
    }
}

impl Handler<ListRooms> for WsChatServer {
    type Result = MessageResult<ListRooms>;

    fn handle(&mut self, msg: ListRooms, _ctx: &mut Self::Context) -> Self::Result {
        let ListRooms(session_id) = msg;
        let rooms_list = self
            .rooms
            .get(&session_id)
            .map(|rooms_map| rooms_map.keys().cloned().collect())
            .unwrap_or_default();
        MessageResult(rooms_list)
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
        let RelaySignalMessage { from, to, message } = msg;

        if from == to {
            log::debug!(
                target: "Websocket",
                "Skipping self-to-self signal from '{}' to '{}'",
                from,
                to
            );
            return;
        }

        for rooms in self.rooms.values() {
            for room in rooms.values() {
                for client in room.values() {
                    if client.name == to {
                        client.recipient.do_send(message.clone());
                        return;
                    }
                }
            }
        }
    }
}

impl Handler<CleanupSession> for WsChatServer {
    type Result = ();

    fn handle(&mut self, msg: CleanupSession, _ctx: &mut Self::Context) -> Self::Result {
        if self.rooms.contains_key(&msg.0) {
            log::debug!(target: "Websocket","Removing session {} from rooms", msg.0);
            self.rooms.remove(&msg.0);
        }
    }
}

impl Handler<ValidateAndRelaySignal> for WsChatServer {
    type Result = ();

    fn handle(&mut self, msg: ValidateAndRelaySignal, _ctx: &mut Self::Context) -> Self::Result {
        let shared_room = self.users_share_room(&msg.session_id, &msg.from_user, &msg.to_user);

        if !shared_room {
            log::warn!(
                target: "Websocket",
                "Attempted signal to user not in same room: {} -> {}",
                msg.from_user,
                msg.to_user
            );
            return;
        }

        let relay_msg = ChatMessage(format!("[SignalMessage] {}", msg.payload));
        self.relay_message_to_user(&msg.to_user, relay_msg, &msg.from_user);
    }
}
