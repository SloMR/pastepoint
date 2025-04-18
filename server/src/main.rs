use actix_cors::Cors;
use actix_governor::{Governor, GovernorConfigBuilder};
use actix_http::KeepAlive;
use actix_web::{middleware::Logger, web::Data, App, HttpServer};
use openssl::ssl::{SslAcceptor, SslFiletype, SslMethod};
use server::{
    chat_ws, create_session, index, private_chat_ws, ServerConfig, SessionStore,
    KEEP_ALIVE_INTERVAL,
};
use std::io::Result;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const NAME: &str = env!("CARGO_PKG_NAME");
const AUTHORS: &str = env!("CARGO_PKG_AUTHORS");

#[actix_web::main]
async fn main() -> Result<()> {
    let config = ServerConfig::load(None).expect("Failed to load server configuration");

    env_logger::init_from_env(env_logger::Env::new().default_filter_or(&config.log_level));
    let governor_conf = GovernorConfigBuilder::default()
        .requests_per_second(config.rate_limit_per_second)
        .burst_size(config.rate_limit_burst_size)
        .use_headers()
        .finish()
        .expect("Invalid rate limit configuration");

    log::debug!(target: "Websocket", "Rate limiting configured: {:?}", governor_conf);

    log::info!(
        target: "Websocket",
        "Starting HTTPS server at https://{} - PastePoint({}) - {} - {}",
        config.bind_address,
        NAME,
        VERSION,
        AUTHORS
    );

    let mut builder = SslAcceptor::mozilla_intermediate(SslMethod::tls())?;
    builder
        .set_private_key_file(&config.key_file_path, SslFiletype::PEM)
        .map_err(|e| log::error!(target: "Websocket","Failed to load private key: {}", e))
        .expect("Cannot find private key file");
    builder
        .set_certificate_chain_file(&config.cert_file_path)
        .map_err(
            |e| log::error!(target: "Websocket","Failed to load certificate chain file: {}", e),
        )
        .expect("Cannot find certificate chain file");

    log::debug!(target: "Websocket","Using key file: {}", &config.key_file_path);
    log::debug!(target: "Websocket","Using cert file: {}", &config.cert_file_path);

    let session_manager = Data::new(SessionStore::default());
    let server_config = Data::new(config.clone());

    HttpServer::new(move || {
        let server_config = server_config.clone();
        let server_config_for_app = server_config.clone();
        let cors = Cors::default()
            .allowed_origin_fn(move |origin, _req_head| server_config.check_origin(origin))
            .allowed_methods(vec!["GET", "OPTIONS"])
            .supports_credentials()
            .max_age(3600);

        App::new()
            .wrap(Governor::new(&governor_conf))
            .wrap(Logger::default())
            .wrap(cors)
            .app_data(session_manager.clone())
            .app_data(server_config_for_app)
            .service(index)
            .service(create_session)
            .service(chat_ws)
            .service(private_chat_ws)
    })
    .keep_alive(KeepAlive::Timeout(KEEP_ALIVE_INTERVAL))
    .bind_openssl(&config.bind_address, builder)?
    .run()
    .await
}
