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
    log::debug!("starting HTTPS server at https://127.0.0.1:9000");

    // load TLS keys
    // to create a self-signed temporary cert for testing:
    // `openssl req -x509 -newkey rsa:4096 -nodes -keyout key.pem -out cert.pem -days 365 -subj '/CN=localhost'`
    let mut builder = SslAcceptor::mozilla_intermediate(SslMethod::tls()).unwrap();
    builder
        .set_private_key_file("certs/key.pem", SslFiletype::PEM)
        .unwrap();
    builder
        .set_certificate_chain_file("certs/cert.pem")
        .unwrap();

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(AppState {
                _app_name: String::from("PastePoint"),
            }))
            .service(index)
            .service(chat_ws)
            .wrap(Logger::default())
    })
    .bind_openssl("127.0.0.1:9000", builder)?
    .run()
    .await
}
