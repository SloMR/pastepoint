use std::env;

use actix_web::{
    get, middleware::Logger, web, App, Error, HttpRequest, HttpResponse, HttpServer, Responder,
};
use actix_web_actors::ws;
use openssl::ssl::{SslAcceptor, SslFiletype, SslMethod};
use server::{
    SessionManager, WsChatSession, DEV_CERT_FILE, DEV_KEY_FILE, MAX_FRAME_SIZE, PROD_CERT_FILE,
    PROD_KEY_FILE,
};

#[get("/")]
async fn index() -> impl Responder {
    HttpResponse::Ok().body("Hello, this is PastePoint!")
}

#[get("/ws")]
async fn chat_ws(
    req: HttpRequest,
    stream: web::Payload,
    manager: web::Data<SessionManager>,
) -> Result<impl Responder, Error> {
    // "0.0.0.0" to test in development mode
    if let Some(ip) = req.peer_addr() {
        log::info!("Peer address: {}", &ip.ip().to_string());
        let network = &ip.ip().to_string();
        let uuid = manager.get_or_create_uuid(network);
        log::info!("Assigned UUID for {}: {}", &network, &uuid);

        ws::WsResponseBuilder::new(WsChatSession::new(&uuid), &req, stream)
            .codec(actix_http::ws::Codec::new())
            .frame_size(MAX_FRAME_SIZE)
            .start()
    } else {
        log::error!("No Public IP Address found");
        Ok(HttpResponse::BadRequest().body("No Public IP Address found"))
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("debug"));
    let environment: String = env::var("RUN_ENV").unwrap_or_else(|_| "development".to_string());

    log::info!("starting HTTPS server at https://0.0.0.0:9000");

    let (key_file, cert_file) = match environment.as_str() {
        "production" => (PROD_KEY_FILE.to_string(), PROD_CERT_FILE.to_string()),
        _ => (DEV_KEY_FILE.to_string(), DEV_CERT_FILE.to_string()),
    };

    // Load TLS keys
    let mut builder = SslAcceptor::mozilla_intermediate(SslMethod::tls())?;
    builder.set_private_key_file(key_file.clone(), SslFiletype::PEM)?;
    builder.set_certificate_chain_file(cert_file.clone())?;

    log::debug!("Using key file: {}", key_file);
    log::debug!("Using cert file: {}", cert_file);

    // Initialize SessionManager
    let session_manager = web::Data::new(SessionManager::default());

    HttpServer::new(move || {
        App::new()
            .app_data(session_manager.clone())
            .service(index)
            .service(chat_ws)
            .wrap(Logger::default())
    })
    .bind_openssl("0.0.0.0:9000", builder)?
    .run()
    .await
}
