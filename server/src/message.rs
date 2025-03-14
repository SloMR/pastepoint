use std::collections::HashMap;

use crate::SessionStore;
use actix::prelude::*;

pub type Client = Recipient<ChatMessage>;
pub type Room = HashMap<usize, ClientMetadata>;

#[derive(Default)]
pub struct WsChatServer {
    pub rooms: HashMap<String, HashMap<String, Room>>, // session_id -> room_name -> clients
}

#[derive(Default, Clone)]
pub struct WsChatSession {
    pub session_id: String,          // session id
    pub id: usize,                   // client id
    pub room: String,                // room name
    pub name: String,                // client name
    pub auto_join: bool,             // flag to control auto-join
    pub session_store: SessionStore, // reference to SessionStore
}

pub struct ClientMetadata {
    pub recipient: Client, // client
    pub name: String,      // client name
}

#[derive(Clone, Message)]
#[rtype(result = "()")]
pub struct ChatMessage(pub String /* message */);

#[derive(Clone, Message)]
#[rtype(result = "usize")]
pub struct JoinRoom(
    pub String,                 // session_id
    pub String,                 // room_name
    pub String,                 // client_name
    pub Recipient<ChatMessage>, // client
);

#[derive(Clone, Message)]
#[rtype(result = "()")]
pub struct LeaveRoom(
    pub String, // session_id
    pub String, // room_name
    pub usize,  // id
);

#[derive(Clone, Message)]
#[rtype(result = "Vec<String>")]
pub struct ListRooms(pub String /* session_id */);

#[derive(Message)]
#[rtype(result = "()")]
pub struct RelaySignalMessage {
    pub(crate) from: String,            // session_id
    pub(crate) to: String,              // session_id
    pub(crate) message: ChatMessage,    // signal message
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct CleanupSession(pub String /* session_id */);

