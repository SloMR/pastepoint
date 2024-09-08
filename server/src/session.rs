use actix::prelude::*;
use actix_broker::BrokerIssue;
use actix_web_actors::ws;
use names::Generator;

use crate::{
    error::ServerError,
    message::{JoinRoom, LeaveRoom, ListRooms, SendFile, SendMessage, WsChatServer, WsChatSession},
};

impl WsChatSession {
    pub fn new(session_id: &str) -> Self {
        let mut generator = Generator::default();
        let name = generator.next().unwrap();
        WsChatSession {
            session_id: session_id.to_owned(),
            id: 0,
            room: "main".to_owned(),
            name,
        }
    }

    pub fn join_room(&mut self, room_name: &str, ctx: &mut ws::WebsocketContext<Self>) {
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
                    log::debug!("[SystemRooms] Rooms Availabe: {:?}", rooms);

                    let room_list = rooms.join(", ");
                    ctx.text(format!("[SystemRooms]: {}", room_list));
                } else {
                    ctx.text("[SystemError] Failed to retrieve room list.");
                }
                fut::ready(())
            })
            .wait(ctx);
    }

    pub fn send_msg(&self, msg: &str) {
        let msg = msg.replace("[UserMessage]", "");
        let content = format!("{}: {msg}", self.name.clone(),);
        let msg = SendMessage(self.session_id.clone(), self.room.clone(), self.id, content);

        self.issue_system_async(msg);
    }

    pub fn send_file(&self, file_name: &str, mime_type: &str, file_data: &[u8]) {
        let msg = SendFile(
            self.session_id.clone(),
            self.room.clone(),
            self.id,
            file_name.to_string(),
            mime_type.to_string(),
            file_data.to_vec(),
        );

        self.issue_system_async(msg);
    }

    fn user_command(
        &mut self,
        mut command: std::str::SplitN<'_, char>,
        msg: &str,
        ctx: &mut ws::WebsocketContext<WsChatSession>,
    ) {
        match command.next() {
            Some("/list") => {
                log::debug!("Received list command");
                self.list_rooms(ctx)
            }

            Some("/join") => {
                if let Some(room_name) = command.next() {
                    log::debug!("Received join command");
                    self.join_room(room_name, ctx);
                } else {
                    ctx.text(format!(
                        "[SystemError] Room name is required: {}",
                        ServerError::InternalServerError
                    ))
                }
            }

            Some("/name") => {
                log::debug!("Received name command");
                ctx.text(format!("[SystemName]: {}", self.name))
            }

            _ => {
                log::error!("Unknown command: {}", msg);
                ctx.text(format!(
                    "[SystemError] Error Unknown command: {}",
                    ServerError::NotFound
                ))
            }
        }
    }

    fn handle_user_disconnect(&self) {
        let leave_msg = LeaveRoom(self.session_id.clone(), self.room.clone(), self.id);
        self.issue_system_async(leave_msg);
        log::debug!("User {} disconnected", self.name);
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
                log::debug!("Received message: {}", text);

                let msg = text.trim();

                if msg.contains("[UserCommand]") {
                    let msg = msg.replace("[UserCommand]", "").trim().to_string();
                    if msg.starts_with("/") {
                        let command = msg.splitn(2, ' ');
                        self.user_command(command, &msg, ctx);
                    }
                } else if msg.contains("[UserMessage]") {
                    self.send_msg(msg);
                } else if msg.contains("[UserDisconnected]") {
                    log::debug!("Received disconnect command");
                    self.handle_user_disconnect();
                } else {
                    log::error!("Unknown command: {}", msg);
                    ctx.text(format!(
                        "[SystemError] Error Unknown command: {}",
                        ServerError::NotFound
                    ));
                }
            }
            ws::Message::Binary(bin) => {
                log::debug!("Received binary message");
                self.handle_binary_message(&bin, ctx);
            }
            ws::Message::Close(reason) => {
                log::debug!("Closing connection: {:?}", reason);
                self.handle_user_disconnect();
                ctx.close(reason);
                ctx.stop();
            }
            _ => {}
        }
    }
}
