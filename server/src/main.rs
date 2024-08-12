use std::env;

use actix_web::{
    get, middleware::Logger, web, App, Error, HttpRequest, HttpResponse, HttpServer, Responder,
};
use actix_web_actors::ws;
use openssl::ssl::{SslAcceptor, SslFiletype, SslMethod};
use server::WsChatSession;

struct AppState {
    _app_name: String,
}

#[get("/")]
async fn index() -> impl Responder {
    HttpResponse::Ok().body("Hello, this is PastePoint!")
}

#[get("/ws")]
async fn chat_ws(req: HttpRequest, stream: web::Payload) -> Result<impl Responder, Error> {
    ws::start(WsChatSession::default(), &req, stream)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("debug"));
    log::debug!("starting HTTPS server at https://0.0.0.0:9000");

    let environment = env::var("RUN_ENV").unwrap_or_else(|_| "development".to_string());

    let (key_file, cert_file) = if environment == "production" {
        (
            "/etc/ssl/certs/key.pem".to_string(),
            "/etc/ssl/certs/cert.pem".to_string(),
        )
    } else {
        (
            "certs/key.pem".to_string(),
            "certs/cert.pem".to_string(),
        )
    };

    // Load TLS keys
    let mut builder = SslAcceptor::mozilla_intermediate(SslMethod::tls()).unwrap();
    builder.set_private_key_file(key_file.clone(), SslFiletype::PEM).unwrap();
    builder.set_certificate_chain_file(cert_file.clone()).unwrap();

    log::debug!("Using key file: {}", key_file);
    log::debug!("Using cert file: {}", cert_file);

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(AppState {
                _app_name: String::from("PastePoint"),
            }))
            .service(index)
            .service(chat_ws)
            .wrap(Logger::default())
    })
    .bind_openssl("0.0.0.0:9000", builder)?
    .run()
    .await
}
