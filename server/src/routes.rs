use crate::{session_store::SessionData, ServerConfig, SessionStore};
use actix_web::{get, web, Error, HttpRequest, HttpResponse, Responder};
use serde_json::json;
use uuid::Uuid;

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
    // Insert the new session without calling get_or_create_session_uuid.
    let new_uuid = Uuid::new_v4();
    {
        let mut map = store.key_to_session.lock().unwrap();
        map.insert(
            code.clone(),
            SessionData {
                uuid: new_uuid,
                is_private: true,
            },
        );
    }
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

        store.start_websocket(config.get_ref(), &req, stream, &ip_str, false, false)
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
    if code.trim().is_empty() {
        log::warn!("[Websocket] Empty code => returning 400");
        return Ok(HttpResponse::BadRequest().body("Session code cannot be empty"));
    }

    store.start_websocket(config.get_ref(), &req, stream, &code, true, true)
}
