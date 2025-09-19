use crate::{
    consts::MAX_SIGNAL_SIZE,
    error::ServerError,
    message::{
        JoinRoom, LeaveRoom, ListRooms, ValidateAndRelaySignal, WsChatServer, WsChatSession,
    },
    SessionStore, HEARTBEAT_INTERVAL, HEARTBEAT_TIMEOUT, WS_PREFIX_SIGNAL_MESSAGE,
    WS_PREFIX_SYSTEM_ERROR, WS_PREFIX_SYSTEM_NAME, WS_PREFIX_SYSTEM_ROOMS, WS_PREFIX_USER_COMMAND,
    WS_PREFIX_USER_DISCONNECTED,
};
use actix::prelude::*;
use actix_web_actors::ws;
use fake::{
    faker::name::{en::FirstName, en::LastName},
    Fake,
};
use rand::{rng, Rng};
use serde_json::Value;
use std::time::Instant;

impl WsChatSession {
    pub fn new(session_id: &str, auto_join: bool, session_store: SessionStore) -> Self {
        let id = rng().random_range(0..usize::MAX);
        let first_name = FirstName().fake::<String>();
        let last_name = LastName().fake::<String>();
        let name = format!("{} {}", first_name, last_name);

        WsChatSession {
            session_id: session_id.to_owned(),
            id,
            room: "".to_owned(),
            name,
            auto_join,
            session_store,
            last_heartbeat: None,
        }
    }

    pub fn join_room(&mut self, room_name: &str, ctx: &mut ws::WebsocketContext<Self>) {
        if self.room == room_name {
            log::debug!(
                target: "Websocket",
                "User '{}' is already in room '{}'. Skipping join.",
                self.name,
                room_name
            );
            return;
        }

        let room_name = room_name.to_owned();
        let name = self.name.clone();
        let leave_msg = LeaveRoom(self.session_id.clone(), self.room.clone(), self.id);

        WsChatServer::from_registry()
            .send(leave_msg)
            .into_actor(self)
            .then(|_result, _act, _ctx| fut::ready(()))
            .wait(ctx);

        let join_msg = JoinRoom(
            self.session_id.clone(),
            room_name.to_owned(),
            self.name.clone(),
            ctx.address().recipient(),
        );

        WsChatServer::from_registry()
            .send(join_msg)
            .into_actor(self)
            .then(|id, act, _ctx| {
                if let Ok(id) = id {
                    log::debug!(
                        target: "Websocket",
                        "{} successfully joined room '{}'",
                        act.session_id,
                        &room_name
                    );

                    act.id = id;
                    act.room = room_name;
                    act.name = name
                }
                fut::ready(())
            })
            .wait(ctx);
    }

    pub fn list_rooms(&mut self, ctx: &mut ws::WebsocketContext<Self>) {
        WsChatServer::from_registry()
            .send(ListRooms(self.session_id.clone()))
            .into_actor(self)
            .then(|res, _, ctx| {
                if let Ok(rooms) = res {
                    log::debug!(target: "Websocket", "{} Rooms Available: {:?}", WS_PREFIX_SYSTEM_ROOMS, rooms);

                    let room_list = rooms.join(", ");
                    ctx.text(format!("{} {}", WS_PREFIX_SYSTEM_ROOMS, room_list));
                } else {
                    ctx.text(format!("{} Failed to retrieve room list.", WS_PREFIX_SYSTEM_ERROR));
                }
                fut::ready(())
            })
            .wait(ctx);
    }

    fn user_command(&mut self, command_str: &str, ctx: &mut ws::WebsocketContext<WsChatSession>) {
        let command_str = command_str.trim();
        log::debug!(target: "Websocket","Processing command: '{}'", command_str);

        let mut parts = command_str.splitn(2, ' ');
        let cmd = parts.next().unwrap_or("");
        let args = parts.next();
        match cmd {
            "/list" => {
                log::debug!(target: "Websocket","Received list command");
                self.list_rooms(ctx);
            }
            "/join" => {
                if let Some(room_name) = args {
                    log::debug!(target: "Websocket", "Received join command for room '{}'", room_name);
                    self.join_room(room_name, ctx);
                } else {
                    ctx.text(format!("{} Room name is required", WS_PREFIX_SYSTEM_ERROR));
                }
            }
            "/name" => {
                log::debug!(target: "Websocket","Received name command");
                ctx.text(format!("{} {}", WS_PREFIX_SYSTEM_NAME, self.name));
            }
            _ => {
                log::debug!(target: "Websocket", "Unknown command: '{}'", cmd);
                ctx.text(format!(
                    "{} Error Unknown command: {}",
                    WS_PREFIX_SYSTEM_ERROR,
                    ServerError::NotFound
                ))
            }
        }
    }

    fn handle_signal_message(&self, msg: &str, ctx: &mut ws::WebsocketContext<Self>) {
        // 1. Size validation
        if msg.len() > MAX_SIGNAL_SIZE {
            log::warn!(
                target: "Websocket",
                "Oversize signaling message ({} bytes) from user {}",
                msg.len(),
                self.name
            );
            ctx.text(format!(
                "{} Signal message too large",
                WS_PREFIX_SYSTEM_ERROR
            ));
            return;
        }

        // 2. Parse and validate the message
        let payload = msg.trim_start_matches(WS_PREFIX_SIGNAL_MESSAGE).trim();
        let value = match serde_json::from_str::<Value>(payload) {
            Ok(v) => v,
            Err(e) => {
                log::warn!(target: "Websocket", "Invalid signal JSON from {}: {}", self.name, e);
                ctx.text(format!(
                    "{} Invalid signaling message format",
                    WS_PREFIX_SYSTEM_ERROR
                ));
                return;
            }
        };

        // 3. Validate target user
        let to_user = match value.get("to").and_then(|v| v.as_str()) {
            Some(user) => user,
            None => {
                log::warn!(target: "Websocket", "Signal missing 'to' field from {}", self.name);
                ctx.text(format!(
                    "{} Signaling message missing 'to' field",
                    WS_PREFIX_SYSTEM_ERROR
                ));
                return;
            }
        };

        // 4. Send validation and relay message to server instead of trying to check here
        WsChatServer::from_registry().do_send(ValidateAndRelaySignal {
            session_id: self.session_id.clone(),
            from_user: self.name.clone(),
            to_user: to_user.to_string(),
            payload: payload.to_string(),
        });
    }

    fn handle_user_disconnect(&self) {
        let leave_msg = LeaveRoom(self.session_id.clone(), self.room.clone(), self.id);
        WsChatServer::from_registry().do_send(leave_msg);
        log::debug!(target: "Websocket", "User {} disconnected", self.name);
    }

    pub fn start_heartbeat(&self, ctx: &mut ws::WebsocketContext<Self>) {
        ctx.run_interval(HEARTBEAT_INTERVAL, |act, ctx| {
            if let Some(last) = act.last_heartbeat {
                if Instant::now().duration_since(last) > HEARTBEAT_TIMEOUT {
                    log::debug!(
                        target: "Websocket",
                        "Heartbeat failed for user {}, disconnecting!",
                        act.name
                    );
                    act.handle_user_disconnect();
                    ctx.stop();
                    return;
                }
            }
            log::debug!(target: "Websocket", "Sending heartbeat to user {}", act.name);
            ctx.ping(b"");
        });
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WsChatSession {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        let msg = match msg {
            Err(_) => {
                ctx.text(format!(
                    "{} Invalid message format: {}",
                    WS_PREFIX_SYSTEM_ERROR,
                    ServerError::InternalServerError
                ));
                ctx.stop();
                return;
            }
            Ok(msg) => msg,
        };

        match msg {
            ws::Message::Text(text) => {
                let msg = text.trim();
                log::debug!(target: "Websocket", "Received message: '{}'", msg);
                if msg.starts_with(WS_PREFIX_SIGNAL_MESSAGE) {
                    self.handle_signal_message(msg, ctx);
                } else if msg.starts_with(WS_PREFIX_USER_COMMAND) {
                    let command_str = msg.trim_start_matches(WS_PREFIX_USER_COMMAND).trim();
                    log::debug!(
                        target: "Websocket",
                        "Command string after trimming: '{}'",
                        command_str
                    );
                    self.user_command(command_str, ctx);
                } else if msg.starts_with(WS_PREFIX_USER_DISCONNECTED) {
                    log::debug!(target: "Websocket","Received disconnect command");
                    self.handle_user_disconnect();
                } else {
                    log::debug!(target: "Websocket","Unknown command: {}", msg);
                    ctx.text(format!(
                        "{} Error Unknown command: {}",
                        WS_PREFIX_SYSTEM_ERROR,
                        ServerError::NotFound
                    ));
                }
            }
            ws::Message::Ping(msg) => {
                log::debug!(target: "Websocket", "Received ping message");
                self.last_heartbeat = Some(Instant::now());
                ctx.pong(&msg);
            }
            ws::Message::Pong(_) => {
                log::debug!(target: "Websocket", "Received pong message");
                self.last_heartbeat = Some(Instant::now());
            }
            ws::Message::Close(reason) => {
                log::debug!(target: "Websocket", "Closing connection: {:?}", reason);
                self.handle_user_disconnect();
                ctx.close(reason);
                ctx.stop();
            }
            _ => {}
        }
    }
}
