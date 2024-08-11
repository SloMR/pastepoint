use std::collections::HashMap;

use actix::prelude::*;
use actix_broker::BrokerIssue;
use actix_web_actors::ws;
use names::Generator;

use crate::{
    error::ServerError,
    message::{
        FileChunkMetadata, FileReassembler, JoinRoom, LeaveRoom, ListRooms, SendFile, SendMessage,
        WsChatServer, WsChatSession,
    },
};

impl FileReassembler {
    pub fn new(total_chunks: usize) -> Self {
        FileReassembler {
            chunks: HashMap::new(),
            total_chunks,
        }
    }

    pub fn add_chunk(&mut self, index: usize, data: Vec<u8>) -> Result<(), ServerError> {
        if index >= self.total_chunks {
            return Err(ServerError::IndexOutOfBounds);
        }
        self.chunks.insert(index, data);
        Ok(())
    }

    pub fn is_complete(&self) -> bool {
        self.chunks.len() == self.total_chunks
    }

    pub fn reassemble(&self) -> Result<Vec<u8>, ServerError> {
        let mut file_data = Vec::new();
        for i in 0..self.total_chunks {
            if let Some(chunk) = self.chunks.get(&i) {
                file_data.extend(chunk);
            } else {
                return Err(ServerError::ChunkMissing);
            }
        }
        Ok(file_data)
    }
}

impl Default for WsChatSession {
    fn default() -> Self {
        let mut generator = Generator::default();
        let name = generator.next().unwrap();
        Self {
            id: rand::random::<usize>(),
            room: "main".to_owned(),
            name,
            file_reassemblers: HashMap::new(),
        }
    }
}

impl WsChatSession {
    fn split_metadata_and_data(&self, bin: &[u8]) -> Result<(Vec<u8>, Vec<u8>), ServerError> {
        if let Some(pos) = bin.iter().position(|&byte| byte == 0) {
            let metadata = bin[..pos].to_vec();
            let data = bin[pos + 1..].to_vec();
            Ok((metadata, data))
        } else {
            Err(ServerError::MetadataParsingError)
        }
    }

    pub fn join_room(&mut self, room_name: &str, ctx: &mut ws::WebsocketContext<Self>) {
        let room_name = room_name.to_owned();
        let name = self.name.clone();
        let leave_msg = LeaveRoom(self.room.clone(), self.id);

        self.issue_system_sync(leave_msg, ctx);

        let join_msg = JoinRoom(
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
            .send(ListRooms)
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
        let msg = SendMessage(self.room.clone(), self.id, content);

        self.issue_system_async(msg);
    }

    fn send_file(&self, file_name: &str, mime_type: &str, file_data: &[u8]) {
        let msg = SendFile(
            self.room.clone(),
            self.id,
            file_name.to_string(),
            mime_type.to_string(),
            file_data.to_vec(),
        );

        self.issue_system_async(msg);
    }

    fn handle_user_disconnect(&self) {
        let leave_msg = LeaveRoom(self.room.clone(), self.id);
        self.issue_system_async(leave_msg);
        log::debug!("User {} disconnected", self.name);
    }
}

impl Actor for WsChatSession {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        self.id = rand::random::<usize>();
        log::debug!("Session started for {} with ID {}", self.name, self.id);

        self.join_room("main", ctx);
    }

    fn stopped(&mut self, _ctx: &mut Self::Context) {
        log::debug!(
            "WsChatSession closed for {}({}) in room {}",
            self.name.clone(),
            self.id,
            self.room
        );
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WsChatSession {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        let msg = match msg {
            Err(_) => {
                ctx.text(format!("[SystemError] Invalid message format: {}", ServerError::InternalServerError));
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
                        let mut command = msg.splitn(2, ' ');
                
                        match command.next() {
                            Some("/list") => {
                                log::debug!("Received list command");
                                self.list_rooms(ctx)
                            },
                
                            Some("/join") => {
                                if let Some(room_name) = command.next() {
                                    log::debug!("Received join command");
                                    self.join_room(room_name, ctx);
                                } else {
                                    ctx.text(format!("[SystemError] Room name is required: {}", ServerError::InternalServerError))
                                }
                            },
                
                            Some("/name") => {
                                log::debug!("Received name command");
                                ctx.text(format!("[SystemName]: {}", self.name))
                            },
                
                            _ => {
                                log::error!("Unknown command: {}", msg);
                                ctx.text(format!("[SystemError] Error Unknown command: {}", ServerError::NotFound))
                            },
                        }
                    }
                    return;
                } else if msg.contains("[UserMessage]") {
                    self.send_msg(msg);
                } else if msg.contains("[UserDisconnected]") {
                    log::debug!("Received disconnect command");
                    self.handle_user_disconnect();
                } else {
                    log::error!("Unknown command: {}", msg);
                    ctx.text(format!("[SystemError] Error Unknown command: {}", ServerError::NotFound));
                }
            },
            ws::Message::Binary(bin) => {
                log::debug!("Received binary message");

                match self.split_metadata_and_data(&bin) {
                    Ok((metadata, chunk_data)) => {
                        log::debug!("Received file chunk");
                        match serde_json::from_slice::<FileChunkMetadata>(&metadata) {
                            Ok(chunk_metadata) => {
                                log::debug!(
                                    "Received chunk {} of file {} (total chunks: {})",
                                    chunk_metadata.current_chunk,
                                    chunk_metadata.file_name,
                                    chunk_metadata.total_chunks
                                );
    
                                let reassembler = self
                                    .file_reassemblers
                                    .entry(chunk_metadata.file_name.clone())
                                    .or_insert_with(|| {
                                        FileReassembler::new(chunk_metadata.total_chunks)
                                    });
    
                                if let Err(e) =
                                    reassembler.add_chunk(chunk_metadata.current_chunk, chunk_data)
                                {
                                    log::error!("Failed to add chunk: {:?}", e);
                                    ctx.text(format!("[SystemError] Error file cannot be processed: {}", ServerError::FileReassemblyError));
                                }
    
                                if reassembler.is_complete() {
                                    match reassembler.reassemble() {
                                        Ok(file_data) => {
                                            self.send_file(
                                                &chunk_metadata.file_name,
                                                &chunk_metadata.mime_type,
                                                &file_data,
                                            );
                                        }
                                        Err(e) => {
                                            log::error!("Failed to reassemble file: {:?}", e);
                                            ctx.text(format!("[SystemError] Error file cannot be processed: {}", e));
                                        }
                                    }
                                    self.file_reassemblers.remove(&chunk_metadata.file_name);
                                }
                            }
                            Err(e) => {
                                log::error!("Failed to parse file chunk metadata: {:?}", e);
                                ctx.text(format!("[SystemError] Error: {:?}", ServerError::MetadataParsingError));
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Invalid file message format: {:?}", e);
                        ctx.text(format!("[SystemError] Error: {:?}", ServerError::InvalidFile));
                    }
                }
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
