use std::collections::HashMap;

use actix_web_actors::ws;
use base64::{engine::general_purpose, Engine as _};

use crate::{
    message::FileChunkMetadata, ChatMessage, FileReassembler, ServerError, WsChatServer,
    WsChatSession, MAX_FRAME_SIZE
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

impl WsChatServer {
    #[allow(dead_code)]
    pub fn send_chat_attachment(
        &mut self,
        session_id: &str,
        room_name: &str,
        file_name: &str,
        mime_type: &str,
        file_data: Vec<u8>,
        src: usize,
    ) -> Option<()> {
        let rooms = self.rooms.get_mut(session_id)?;
        let room = rooms.get_mut(room_name)?;

        let client_ids: Vec<usize> = room.keys().cloned().collect();

        for id in client_ids {
            if let Some(client) = room.get(&id) {
                if id == src {
                    log::debug!(
                        "Sending confirmation to sender {} in room {}",
                        id,
                        room_name
                    );
                    client
                        .recipient
                        .try_send(ChatMessage(format!(
                            "[SystemAck]: File '{}' sent successfully.",
                            file_name
                        )))
                        .ok();
                    continue;
                }

                if id == src {
                    client
                        .recipient
                        .try_send(ChatMessage(format!(
                            "[SystemAck]: File '{}' sent successfully.",
                            file_name
                        )))
                        .ok();
                } else {
                    log::debug!(
                        "Sending file {} to client {} in room {}",
                        file_name,
                        id,
                        room_name
                    );

                    if client
                        .recipient
                        .try_send(ChatMessage(format!(
                            "[SystemFile]:{}:{}:{}",
                            file_name,
                            mime_type,
                            general_purpose::STANDARD.encode(&file_data)
                        )))
                        .is_ok()
                    {
                        continue;
                    } else {
                        log::warn!(
                            "Failed to send file {} to client {}, removing from room: {}",
                            file_name,
                            id,
                            room_name
                        );
                        room.remove(&id);
                    }
                }
            }
        }

        Some(())
    }

    pub fn send_chat_attachment_in_chunks(
        &mut self,
        session_id: &str,
        room_name: &str,
        file_name: &str,
        mime_type: &str,
        file_data: Vec<u8>,
        src: usize,
    ) -> Option<()> {
        let total_chunks = (file_data.len() as f64 / MAX_FRAME_SIZE as f64).ceil() as usize;
        let max_retries = 3;
        let delay_between_chunks = std::time::Duration::from_millis(10);

        let rooms = self.rooms.get_mut(session_id)?;
        let room = rooms.get_mut(room_name)?;

        let client_ids: Vec<usize> = room.keys().cloned().collect();

        for id in client_ids {
            if let Some(client) = room.get(&id) {
                if id == src {
                    log::debug!(
                        "Sending confirmation to sender {} in room {}",
                        id,
                        room_name
                    );
                    client
                        .recipient
                        .try_send(ChatMessage(format!(
                            "[SystemAck]: File '{}' sent successfully.",
                            file_name
                        )))
                        .ok();
                    continue;
                }

                let mut success = true;

                for (i, chunk) in file_data.chunks(MAX_FRAME_SIZE).enumerate() {
                    let encoded_chunk = general_purpose::STANDARD.encode(chunk);

                    log::debug!(
                        "Sending chunk {} of {} for file {} to client {} in room {}",
                        i + 1,
                        total_chunks,
                        file_name,
                        id,
                        room_name
                    );

                    let chat_message = format!(
                        "[SystemFileChunk]:{}:{}:{}:{}:{}",
                        file_name,
                        mime_type,
                        i + 1,
                        total_chunks,
                        encoded_chunk
                    );

                    let mut retries = 0;
                    while retries < max_retries {
                        if client
                            .recipient
                            .try_send(ChatMessage(chat_message.clone()))
                            .is_ok()
                        {
                            break;
                        } else {
                            retries += 1;
                            log::warn!(
                                "Failed to send chunk {} of file {} to client {}, retrying ({}/{})",
                                i + 1,
                                file_name,
                                id,
                                retries,
                                max_retries
                            );
                            std::thread::sleep(delay_between_chunks);
                        }
                    }

                    if retries == max_retries {
                        log::warn!(
                            "Failed to send chunk {} of file {} to client {} after {} retries, removing from room: {}",
                            i + 1,
                            file_name,
                            id,
                            max_retries,
                            room_name
                        );
                        success = false;
                        break;
                    }

                    std::thread::sleep(delay_between_chunks);
                }

                if !success {
                    room.remove(&id);
                }
            }
        }

        Some(())
    }
}

impl WsChatSession {
    pub fn handle_binary_message(&mut self, bin: &[u8], ctx: &mut ws::WebsocketContext<Self>) {
        match self.split_metadata_and_data(bin) {
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

                        if let Err(e) = self.handle_file_chunk(chunk_metadata, chunk_data) {
                            log::error!("Failed to process file chunk: {:?}", e);
                            ctx.text(format!("[SystemError] Error processing file chunk: {}", e));
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to parse file chunk metadata: {:?}", e);
                        ctx.text(format!(
                            "[SystemError] Error: {:?}",
                            ServerError::MetadataParsingError
                        ));
                    }
                }
            }
            Err(e) => {
                log::error!("Invalid file message format: {:?}", e);
                ctx.text(format!(
                    "[SystemError] Error: {:?}",
                    ServerError::InvalidFile
                ));
            }
        }
    }

    fn handle_file_chunk(
        &mut self,
        chunk_metadata: FileChunkMetadata,
        chunk_data: Vec<u8>,
    ) -> Result<(), ServerError> {
        let reassembler = self
            .file_reassemblers
            .entry(chunk_metadata.file_name.clone())
            .or_insert_with(|| FileReassembler::new(chunk_metadata.total_chunks));

        reassembler.add_chunk(chunk_metadata.current_chunk, chunk_data)?;

        if reassembler.is_complete() {
            let file_data = reassembler.reassemble()?;
            self.send_file(
                &chunk_metadata.file_name,
                &chunk_metadata.mime_type,
                &file_data,
            );
            self.file_reassemblers.remove(&chunk_metadata.file_name);
        }

        Ok(())
    }

    fn split_metadata_and_data(&self, bin: &[u8]) -> Result<(Vec<u8>, Vec<u8>), ServerError> {
        if let Some(pos) = bin.iter().position(|&byte| byte == 0) {
            let metadata = bin[..pos].to_vec();
            let data = bin[pos + 1..].to_vec();
            Ok((metadata, data))
        } else {
            Err(ServerError::MetadataParsingError)
        }
    }
}
