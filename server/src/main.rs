use actix_files::{Files, NamedFile};
use actix_web::{middleware::Logger, web, App, Error, HttpRequest, HttpServer, Responder, get, HttpResponse};
use actix_web_actors::ws;

mod message;
mod server;
mod session;

use session::WsChatSession;

struct AppState {
    app_name: String,
}

#[get("/")]
async fn index() -> impl Responder {
    HttpResponse::Ok().body("Hello, this is PasteDrop!")
}

#[get("/ws")]
async fn chat_ws(req: HttpRequest, stream: web::Payload) -> Result<impl Responder, Error> {
    ws::start(WsChatSession::default(), &req, stream)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));

    log::info!("starting HTTP server at http://0.0.0.0:9000");

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(AppState {
                app_name: String::from("PasteDrop"),
            }))
            .service(index)
            .service(chat_ws)
            .wrap(Logger::default())
    })
        .workers(2)
        .bind(("0.0.0.0", 9000))?
        .run()
        .await
}
