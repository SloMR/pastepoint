use std::collections::HashMap;
use actix::prelude::*;
use actix_broker::BrokerIssue;
use actix_web_actors::ws;
use names::Generator;

use crate::message::{WsChatServer, FileChunkMetadata, FileReassembler, JoinRoom, LeaveRoom, ListRooms, SendFile, SendMessage, WsChatSession};

impl FileReassembler {
    fn new(total_chunks: usize) -> Self {
        FileReassembler {
            chunks: HashMap::new(),
            total_chunks,
        }
    }

    fn add_chunk(&mut self, index: usize, data: Vec<u8>) -> Result<(), &'static str> {
        if index >= self.total_chunks {
            return Err("Chunk index out of bounds");
        }
        self.chunks.insert(index, data);
        Ok(())
    }

    fn is_complete(&self) -> bool {
        self.chunks.len() == self.total_chunks
    }

    fn reassemble(&self) -> Result<Vec<u8>, &'static str> {
        let mut file_data = Vec::new();
        for i in 0..self.total_chunks {
            if let Some(chunk) = self.chunks.get(&i) {
                file_data.extend(chunk);
            } else {
                return Err("Missing chunks");
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
            id: rand::random::<usize>(),  // Assign a random unique ID
            room: "main".to_owned(),
            name,
            file_reassemblers: HashMap::new(),
        }
    }
}

impl WsChatSession {
    fn split_metadata_and_data(&self, bin: &[u8]) -> Option<(Vec<u8>, Vec<u8>)> {
        if let Some(pos) = bin.iter().position(|&byte| byte == 0) {
            let metadata = bin[..pos].to_vec();
            let data = bin[pos + 1..].to_vec();
            Some((metadata, data))
        } else {
            None
        }
    }

    pub fn join_room(&mut self, room_name: &str, ctx: &mut ws::WebsocketContext<Self>) {
        let room_name = room_name.to_owned();
        let name = self.name.clone();

        // First send a leave message for the current room
        let leave_msg = LeaveRoom(self.room.clone(), self.id);

        // issue_sync comes from having the `BrokerIssue` trait in scope.
        self.issue_system_sync(leave_msg, ctx);

        // Then send a join message for the new room
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
                    log::info!("Rooms available: {:?}", rooms);
                    let room_list = rooms.join(", ");
                    ctx.text(format!("Rooms available: {}", room_list));
                } else {
                    ctx.text("Failed to retrieve room list.");
                }
                fut::ready(())
            })
            .wait(ctx);
    }

    pub fn send_msg(&self, msg: &str) {
        let content = format!("{}: {msg}", self.name.clone(),);
        let msg = SendMessage(self.room.clone(), self.id, content);

        // issue_async comes from having the `BrokerIssue` trait in scope.
        self.issue_system_async(msg);
    }

    fn send_file(&self, file_name: &str, mime_type: &str, file_data: &[u8]) {
        let msg = SendFile (self.room.clone(), self.id, file_name.to_string(), mime_type.to_string(), file_data.to_vec());

        // Issue the file message
        self.issue_system_async(msg);
    }
}

impl Actor for WsChatSession {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        // Use a unique ID for this session
        self.id = rand::random::<usize>();
        log::info!("Session started for {} with ID {}", self.name, self.id);

        self.join_room("main", ctx);
    }

    fn stopped(&mut self, _ctx: &mut Self::Context) {
        log::info!(
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
                ctx.stop();
                return;
            }
            Ok(msg) => msg,
        };

        log::debug!("WEBSOCKET MESSAGE: {msg:?}");

        match msg {
            ws::Message::Text(text) => {
                let msg = text.trim();

                if msg.starts_with('/') {
                    let mut command = msg.splitn(2, ' ');

                    match command.next() {
                        Some("/list") => self.list_rooms(ctx),

                        Some("/join") => {
                            if let Some(room_name) = command.next() {
                                self.join_room(room_name, ctx);
                            } else {
                                ctx.text("Room name is required for /join command.");
                            }
                        }

                        _ => ctx.text(format!("Unknown command: {msg}")),
                    }

                    return;
                }
                self.send_msg(msg);
            }
            ws::Message::Binary(bin) => {
                // Handle incoming binary message as a file chunk
                if let Some((metadata, chunk_data)) = self.split_metadata_and_data(&bin) {
                    log::info!("Received file chunk");
                    match serde_json::from_slice::<FileChunkMetadata>(&metadata) {
                        Ok(chunk_metadata) => {
                            log::info!(
                                "Received chunk {} of file {} (total chunks: {})",
                                chunk_metadata.current_chunk,
                                chunk_metadata.file_name,
                                chunk_metadata.total_chunks
                            );

                            let reassembler = self.file_reassemblers
                                .entry(chunk_metadata.file_name.clone())
                                .or_insert_with(|| FileReassembler::new(chunk_metadata.total_chunks));

                            if let Err(e) = reassembler.add_chunk(chunk_metadata.current_chunk, chunk_data) {
                                log::error!("Failed to add chunk: {:?}", e);
                            }

                            if reassembler.is_complete() {
                                match reassembler.reassemble() {
                                    Ok(file_data) => {
                                        ctx.text(format!("File {} received", chunk_metadata.file_name));
                                        self.send_file(&chunk_metadata.file_name, &chunk_metadata.mime_type, &file_data);
                                    }
                                    Err(e) => {
                                        log::error!("Failed to reassemble file: {:?}", e);
                                    }
                                }
                                self.file_reassemblers.remove(&chunk_metadata.file_name);
                            }
                        }
                        Err(e) => {
                            log::error!("Failed to parse file chunk metadata: {:?}", e);
                        }
                    }
                } else {
                    log::error!("Invalid file message format.");
                    ctx.text("Invalid file message format.");
                }
            }
            ws::Message::Close(reason) => {
                // Close the connection
                ctx.close(reason);
                ctx.stop();
            }
            _ => {}
        }
    }
}
