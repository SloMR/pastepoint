use std::collections::HashMap;

use actix::prelude::*;

pub type Client = Recipient<ChatMessage>;
pub type Room = HashMap<usize, ClientMetadata>;

#[derive(Default)]
pub struct WsChatServer {
    pub rooms: HashMap<String, HashMap<String, Room>>,
}

#[derive(Default)]
pub struct WsChatSession {
    pub session_id: String,
    pub id: usize,
    pub room: String,
    pub name: String,
    pub file_reassemblers: HashMap<String, FileReassembler>,
}

pub struct ClientMetadata {
    pub recipient: Client,
    pub name: String,
}

#[derive(Clone, Message)]
#[rtype(result = "()")]
pub struct ChatMessage(pub String);

#[derive(Clone, Message)]
#[rtype(result = "usize")]
pub struct JoinRoom(
    pub String,
    pub String,
    pub String,
    pub Recipient<ChatMessage>,
);

#[derive(Clone, Message)]
#[rtype(result = "()")]
pub struct LeaveRoom(pub String, pub String, pub usize);

#[derive(Clone, Message)]
#[rtype(result = "Vec<String>")]
pub struct ListRooms(pub String);

#[derive(Clone, Message)]
#[rtype(result = "()")]
pub struct SendMessage(pub String, pub String, pub usize, pub String);

#[derive(Clone, Message)]
#[rtype(result = "()")]
pub struct SendFile(
    pub String,
    pub String,
    pub usize,
    pub String,
    pub String,
    pub Vec<u8>,
);

#[derive(serde::Deserialize)]
pub struct FileChunkMetadata {
    pub file_name: String,
    pub mime_type: String,
    pub total_chunks: usize,
    pub current_chunk: usize,
}

pub struct FileReassembler {
    pub chunks: HashMap<usize, Vec<u8>>,
    pub total_chunks: usize,
}
