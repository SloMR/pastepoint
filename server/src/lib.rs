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

pub use consts::MAX_FRAME_SIZE;

use actix_web::{
    get, middleware::Logger, web, App, Error, HttpRequest, HttpResponse, HttpServer, Responder,
};
use actix_web_actors::ws;
use openssl::ssl::{SslAcceptor, SslFiletype, SslMethod};
use uuid::Uuid;

#[get("/")]
pub async fn index() -> impl Responder {
    HttpResponse::Ok().body("Hello, this is PastePoint!")
}

#[get("/ws")]
pub async fn chat_ws(
    req: HttpRequest,
    stream: web::Payload,
    manager: web::Data<SessionManager>,
    config: web::Data<ServerConfig>,
) -> Result<HttpResponse, Error> {
    if let Some(ip) = req.peer_addr() {
        log::debug!("[Websocket] Peer address: {}", &ip.ip().to_string());
        let network = &ip.ip().to_string();
        let uuid = manager.get_or_create_uuid(network);
        log::debug!("[Websocket] Assigned UUID for {}: {}", &network, &uuid);
        match Uuid::parse_str(&uuid) {
            Ok(_) => {}
            Err(e) => {
                log::error!("[Websocket] Invalid fixed UUID: {}", e);
                return Ok(HttpResponse::InternalServerError().body("Server configuration error"));
            }
        };

        ws::WsResponseBuilder::new(
            WsChatSession::new(&uuid, config.auto_join, manager.get_ref().clone()),
            &req,
            stream,
        )
        .codec(actix_http::ws::Codec::new())
        .frame_size(MAX_FRAME_SIZE)
        .start()
    } else {
        log::error!("[Websocket] No Public IP Address found");
        Ok(HttpResponse::BadRequest().body("No Public IP Address found"))
    }
}

pub async fn run_server() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("debug"));
    let config = ServerConfig::load(None).expect("Failed to load server configuration");

    log::info!(
        "[Websocket] Starting HTTPS server at https://{}",
        config.bind_address
    );

    let mut builder = SslAcceptor::mozilla_intermediate(SslMethod::tls())?;
    builder
        .set_private_key_file(&config.key_file_path, SslFiletype::PEM)
        .map_err(|e| log::error!("[Websocket] Failed to load private key: {}", e))
        .expect("Cannot find private key file");
    builder
        .set_certificate_chain_file(&config.cert_file_path)
        .map_err(|e| log::error!("[Websocket] Failed to load certificate chain file: {}", e))
        .expect("Cannot find certificate chain file");

    log::debug!("[Websocket] Using key file: {}", &config.key_file_path);
    log::debug!("[Websocket] Using cert file: {}", &config.cert_file_path);

    let session_manager = web::Data::new(SessionManager::default());
    let server_config = web::Data::new(config.clone());

    HttpServer::new(move || {
        App::new()
            .app_data(session_manager.clone())
            .app_data(server_config.clone())
            .service(index)
            .service(chat_ws)
            .wrap(Logger::default())
    })
    .bind_openssl(&config.bind_address, builder)?
    .run()
    .await
}
