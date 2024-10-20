mod actor;
mod config;
mod consts;
mod error;
mod handler;
mod message;
mod server;
mod session;
mod session_manager;

pub use config::ServerConfig;
pub use error::ServerError;
pub use message::{
    ChatMessage, ClientMetadata, JoinRoom, LeaveRoom, ListRooms, RelaySignalMessage, WsChatServer,
    WsChatSession,
};
pub use session_manager::SessionManager;

pub use consts::{DEV_CERT_FILE, DEV_KEY_FILE, MAX_FRAME_SIZE, PROD_CERT_FILE, PROD_KEY_FILE};

use std::env;

use actix_web::{
    get, middleware::Logger, web, App, Error, HttpRequest, HttpResponse, HttpServer, Responder,
};
use actix_web_actors::ws;
use openssl::ssl::{SslAcceptor, SslFiletype, SslMethod};
use uuid::Uuid;

