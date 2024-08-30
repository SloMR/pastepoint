mod actor;
mod attachment;
mod consts;
mod error;
mod handler;
mod message;
mod server;
mod session;

pub use error::ServerError;
pub use message::{
    ChatMessage, ClientMetadata, FileReassembler, JoinRoom, LeaveRoom, ListRooms, SendFile,
    SendMessage, WsChatServer, WsChatSession,
};

pub use consts::{DEV_CERT_FILE, DEV_KEY_FILE, MAX_FRAME_SIZE, PROD_CERT_FILE, PROD_KEY_FILE};