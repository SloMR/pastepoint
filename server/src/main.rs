use actix_web::{middleware::Logger, web::Data, App, HttpServer};
use openssl::ssl::{SslAcceptor, SslFiletype, SslMethod};
use server_lib::{chat_ws, create_session, index, private_chat_ws, ServerConfig, SessionStore};
use std::io::Result;

#[actix_web::main]
async fn main() -> Result<()> {
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

    let session_manager = Data::new(SessionStore::default());
    let server_config = Data::new(config.clone());

    HttpServer::new(move || {
        App::new()
            .app_data(session_manager.clone())
            .app_data(server_config.clone())
            .service(index)
            .service(create_session)
            .service(chat_ws)
            .service(private_chat_ws)
            .wrap(Logger::default())
    })
    .bind_openssl(&config.bind_address, builder)?
    .run()
    .await
}
