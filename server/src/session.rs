use crate::{
    error::ServerError,
    message::{ChatMessage, JoinRoom, LeaveRoom, ListRooms, WsChatServer, WsChatSession},
    SessionStore,
};
use actix::prelude::*;
use actix_broker::BrokerIssue;
use actix_web_actors::ws;
use names::Generator;
use serde_json::Value;

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
        }
    }

    pub fn join_room(&mut self, room_name: &str, ctx: &mut ws::WebsocketContext<Self>) {
        if self.room == room_name {
            log::debug!(
                "[Websocket] User '{}' is already in room '{}'. Skipping join.",
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
                        "[Websocket] {} successfully joined room '{}'",
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
                    log::debug!("[Websocket] [SystemRooms] Rooms Available: {:?}", rooms);

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
        log::debug!("[Websocket] Processing command: '{}'", command_str);

        let mut parts = command_str.splitn(2, ' ');
        let cmd = parts.next().unwrap_or("");
        let args = parts.next();
        match cmd {
            "/list" => {
                log::debug!("[Websocket] Received list command");
                self.list_rooms(ctx);
            }
            "/join" => {
                if let Some(room_name) = args {
                    log::debug!("[Websocket] Received join command for room '{}'", room_name);
                    self.join_room(room_name, ctx);
                } else {
                    ctx.text("[SystemError] Room name is required");
                }
            }
            "/name" => {
                log::debug!("[Websocket] Received name command");
                ctx.text(format!("[SystemName] {}", self.name));
            }
            _ => {
                log::debug!("[Websocket] Unknown command: '{}'", cmd);
                ctx.text(format!(
                    "[SystemError] Error Unknown command: {}",
                    ServerError::NotFound
                ))
            }
        }
    }

    fn handle_signal_message(&self, msg: &str, ctx: &mut ws::WebsocketContext<Self>) {
        let payload = msg.trim_start_matches("[SignalMessage]").trim();

        if let Ok(value) = serde_json::from_str::<Value>(payload) {
            if let Some(to_user) = value.get("to").and_then(|v| v.as_str()) {
                let relay_msg = ChatMessage(format!("[SignalMessage] {}", payload));

                WsChatServer::from_registry().do_send(crate::message::RelaySignalMessage {
                    from: self.name.clone(),
                    to: to_user.to_string(),
                    message: relay_msg,
                });
            } else {
                ctx.text("[SystemError] Invalid signaling message format");
            }
        } else {
            ctx.text("[SystemError] Failed to parse signaling message");
        }
    }

    fn handle_user_disconnect(&self) {
        let leave_msg = LeaveRoom(self.session_id.clone(), self.room.clone(), self.id);
        self.issue_system_async(leave_msg);
        log::debug!("[Websocket] User {} disconnected", self.name);
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
                log::debug!("[Websocket] Received message: '{}'", msg);
                if msg.starts_with("[SignalMessage]") {
                    self.handle_signal_message(msg, ctx);
                } else if msg.starts_with("[UserCommand]") {
                    let command_str = msg.trim_start_matches("[UserCommand]").trim();
                    log::debug!(
                        "[Websocket] Command string after trimming: '{}'",
                        command_str
                    );
                    self.user_command(command_str, ctx);
                } else if msg.starts_with("[UserDisconnected]") {
                    log::debug!("[Websocket] Received disconnect command");
                    self.handle_user_disconnect();
                } else {
                    log::debug!("[Websocket] Unknown command: {}", msg);
                    ctx.text(format!(
                        "[SystemError] Error Unknown command: {}",
                        ServerError::NotFound
                    ));
                }
            }
            ws::Message::Close(reason) => {
                log::debug!("[Websocket] Closing connection: {:?}", reason);
                self.handle_user_disconnect();
                ctx.close(reason);
                ctx.stop();
            }
            _ => {}
        }
    }
}
