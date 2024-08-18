use std::{env, net::IpAddr};

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
    // Extract client IP address
    if let Some(peer_addr) = req.peer_addr() {
        let client_ip = peer_addr.ip();
        if !is_private_ip(client_ip) {
            return Ok(HttpResponse::Forbidden().body("Access denied"));
        }

        // Extract home network (e.g., using the first 3 octets for IPv4)
        let home_network = match client_ip {
            IpAddr::V4(ipv4) => format!(
                "{}.{}.{}",
                ipv4.octets()[0],
                ipv4.octets()[1],
                ipv4.octets()[2]
            ),
            IpAddr::V6(ipv6) => format!(
                "{:x}:{:x}:{:x}:{:x}",
                ipv6.segments()[0],
                ipv6.segments()[1],
                ipv6.segments()[2],
                ipv6.segments()[3]
            ),
        };
        log::debug!("Client IP: {}, Home network: {}", client_ip, home_network);

        let session = WsChatSession {
            local_network: home_network,
            ..WsChatSession::default()
        };

        ws::start(session, &req, stream)
    } else {
        Ok(HttpResponse::Forbidden().body("Unable to determine client IP"))
    }
}

fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ipv4) => ipv4.is_private() || ipv4.is_loopback(),
        IpAddr::V6(ipv6) => ipv6.is_loopback(),
    }
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
        ("certs/key.pem".to_string(), "certs/cert.pem".to_string())
    };

    // Load TLS keys
    let mut builder = SslAcceptor::mozilla_intermediate(SslMethod::tls()).unwrap();
    builder
        .set_private_key_file(key_file.clone(), SslFiletype::PEM)
        .unwrap();
    builder
        .set_certificate_chain_file(cert_file.clone())
        .unwrap();

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
