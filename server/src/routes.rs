use crate::{ServerConfig, SessionStore};
use actix_web::{get, web, Error, HttpRequest, HttpResponse, Responder};
use serde_json::json;

// -----------------------------------------------------
// Simple "Hello" index route
// -----------------------------------------------------
#[get("/")]
pub async fn index() -> impl Responder {
    HttpResponse::Ok().body("Hello, this is PastePoint!")
}

// -----------------------------------------------------
// Create Session route
// -----------------------------------------------------
#[get("/create-session")]
pub async fn create_session(store: web::Data<SessionStore>) -> impl Responder {
    let code = SessionStore::generate_random_code(10);
    store.get_or_create_session_uuid(&code, false);
    HttpResponse::Ok().json(json!({ "code": code }))
}

// -----------------------------------------------------
// Chat WS route (non-private)
// -----------------------------------------------------
#[get("/ws")]
pub async fn chat_ws(
    req: HttpRequest,
    stream: web::Payload,
    store: web::Data<SessionStore>,
    config: web::Data<ServerConfig>,
) -> Result<HttpResponse, Error> {
    if let Some(peer) = req.peer_addr() {
        let ip_str = peer.ip().to_string();
        log::debug!("[Websocket] Peer IP: {}", ip_str);

        // Now just call the new helper
        store.start_websocket(config.get_ref(), &req, stream, &ip_str, false)
    } else {
        log::error!("[Websocket] No Public IP address found!");
        Ok(HttpResponse::BadRequest().body("No Public IP Address found"))
    }
}

// -----------------------------------------------------
// Private Chat WS route
// -----------------------------------------------------
#[get("/ws/{code}")]
pub async fn private_chat_ws(
    req: HttpRequest,
    stream: web::Payload,
    path: web::Path<String>,
    store: web::Data<SessionStore>,
    config: web::Data<ServerConfig>,
) -> Result<HttpResponse, Error> {
    let code = path.into_inner();
    log::debug!("[Websocket] Received session code: {}", code);

    // Optional: If the code is empty or invalid in some way
    if code.trim().is_empty() {
        log::warn!("[Websocket] Empty code => returning 400");
        return Ok(HttpResponse::BadRequest().body("Session code cannot be empty"));
    }

    // The same helper, but with strict_mode = true
    store.start_websocket(config.get_ref(), &req, stream, &code, true)
}
