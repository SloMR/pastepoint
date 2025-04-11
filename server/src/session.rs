use crate::{
    consts::MAX_SIGNAL_SIZE,
    error::ServerError,
    message::{
        JoinRoom, LeaveRoom, ListRooms, ValidateAndRelaySignal, WsChatServer, WsChatSession,
    },
    SessionStore,
};
use actix::prelude::*;
use actix_broker::BrokerIssue;
use actix_web_actors::ws;
use names::Generator;
use serde_json::Value;
use std::time::{Duration, Instant};

impl WsChatSession {
    pub fn new(session_id: &str, auto_join: bool, session_store: SessionStore) -> Self {
        let mut generator = Generator::default();
        let id = rand::random::<usize>();
        let name = generator.next().unwrap_or_else(|| "Anonymous".to_string());
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

        self.issue_system_sync(leave_msg, ctx);

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
                    log::debug!(target: "Websocket", "[SystemRooms] Rooms Available: {:?}", rooms);

                    let room_list = rooms.join(", ");
                    ctx.text(format!("[SystemRooms] {}", room_list));
                } else {
                    ctx.text("[SystemError] Failed to retrieve room list.");
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
                    ctx.text("[SystemError] Room name is required");
                }
            }
            "/name" => {
                log::debug!(target: "Websocket","Received name command");
                ctx.text(format!("[SystemName] {}", self.name));
            }
            _ => {
                log::debug!(target: "Websocket", "Unknown command: '{}'", cmd);
                ctx.text(format!(
                    "[SystemError] Error Unknown command: {}",
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
            ctx.text("[SystemError] Signal message too large");
            return;
        }

        // 2. Parse and validate the message
        let payload = msg.trim_start_matches("[SignalMessage]").trim();
        let value = match serde_json::from_str::<Value>(payload) {
            Ok(v) => v,
            Err(e) => {
                log::warn!(target: "Websocket", "Invalid signal JSON from {}: {}", self.name, e);
                ctx.text("[SystemError] Invalid signaling message format");
                return;
            }
        };

        // 3. Validate target user
        let to_user = match value.get("to").and_then(|v| v.as_str()) {
            Some(user) => user,
            None => {
                log::warn!(target: "Websocket", "Signal missing 'to' field from {}", self.name);
                ctx.text("[SystemError] Signaling message missing 'to' field");
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
        self.issue_system_async(leave_msg);
        log::debug!(target: "Websocket", "User {} disconnected", self.name);
    }

    pub fn start_heartbeat(&self, ctx: &mut ws::WebsocketContext<Self>) {
        ctx.run_interval(Duration::from_secs(120), |act, ctx| {
            if let Some(last) = act.last_heartbeat {
                if Instant::now().duration_since(last) > Duration::from_secs(300) {
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
                    "[SystemError] Invalid message format: {}",
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
                if msg.starts_with("[SignalMessage]") {
                    self.handle_signal_message(msg, ctx);
                } else if msg.starts_with("[UserCommand]") {
                    let command_str = msg.trim_start_matches("[UserCommand]").trim();
                    log::debug!(
                        target: "Websocket",
                        "Command string after trimming: '{}'",
                        command_str
                    );
                    self.user_command(command_str, ctx);
                } else if msg.starts_with("[UserDisconnected]") {
                    log::debug!(target: "Websocket","Received disconnect command");
                    self.handle_user_disconnect();
                } else {
                    log::debug!(target: "Websocket","Unknown command: {}", msg);
                    ctx.text(format!(
                        "[SystemError] Error Unknown command: {}",
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
