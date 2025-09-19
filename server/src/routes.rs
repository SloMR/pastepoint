use crate::{
    session_store::SessionData, ServerConfig, ServerError, SessionStore, CONTENT_TYPE_TEXT_PLAIN,
    MIN_USER_AGENT_LENGTH, SESSION_CODE_LENGTH,
};
use actix_web::{get, http::header, web, Error, HttpRequest, HttpResponse, Responder};
use serde_json::json;
use uuid::Uuid;

// -----------------------------------------------------
// Simple index route
// -----------------------------------------------------
#[get("/")]
pub async fn index() -> impl Responder {
    HttpResponse::SeeOther()
        .append_header(("Location", "/health"))
        .finish()
}

// -----------------------------------------------------
// Simple health check route
// -----------------------------------------------------
#[get("/health")]
pub async fn health() -> impl Responder {
    HttpResponse::Ok()
        .content_type(CONTENT_TYPE_TEXT_PLAIN)
        .body("PastePoint Server is running!")
}

// -----------------------------------------------------
// Create Session route
// -----------------------------------------------------
#[get("/create-session")]
pub async fn create_session(store: web::Data<SessionStore>) -> Result<HttpResponse, ServerError> {
    let code = SessionStore::generate_random_code(SESSION_CODE_LENGTH);
    // Insert the new session without calling get_or_create_session_uuid.
    let new_uuid = Uuid::new_v4();
    {
        let mut map = match store.key_to_session.lock() {
            Ok(guard) => guard,
            Err(e) => {
                log::error!(
                    target: "Websocket",
                    "Failed to acquire lock on key_to_session: {:?}",
                    e
                );
                return Err(ServerError::InternalServerError);
            }
        };
        map.insert(
            code.clone(),
            SessionData {
                uuid: new_uuid,
                is_private: true,
            },
        );
    }
    Ok(HttpResponse::Ok()
        .content_type(header::ContentType::json())
        .json(json!({ "code": code })))
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
    let is_dev_mode = ServerConfig::is_dev_env();

    let ip_str = get_client_ip(&req, is_dev_mode)?;
    check_suspicious_connection(&req, &ip_str);

    let session_key = create_session_key(&req, &ip_str);

    log::debug!(target: "Websocket", "Connection request - IP: {}, Session Key: {}", ip_str, session_key);
    store.start_websocket(config.get_ref(), &req, stream, &session_key, false, false)
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
    log::debug!(target: "Websocket", "Received session code: {}", code);
    if code.trim().is_empty() {
        log::debug!(target: "Websocket", "Empty code => returning 400");
        return Ok(HttpResponse::BadRequest()
            .content_type("text/plain; charset=utf-8")
            .body("Session code cannot be empty"));
    }

    store.start_websocket(config.get_ref(), &req, stream, &code, true, true)
}

// -----------------------------------------------------
// Helper functions for WebSocket connections
// -----------------------------------------------------
// Helper function to get client IP based on environment
fn get_client_ip(req: &HttpRequest, is_dev_mode: bool) -> Result<String, Error> {
    if !is_dev_mode {
        log::info!(target: "Websocket", "Production mode detected, checking headers for IP");
        req.headers()
            .get("X-Forwarded-For")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.split(',').next().map(str::trim))
            .or_else(|| req.headers()
                .get("X-Real-IP")
                .and_then(|v| v.to_str().ok())
                .map(str::trim))
            .map(|ip| ip.to_string())
            .ok_or_else(|| {
                log::warn!(target: "Websocket", "Production connection attempt without proper headers");
                actix_web::error::ErrorForbidden("Access denied: Missing required headers")
            })
    } else {
        log::info!(target: "Websocket", "Development mode detected, using direct peer IP");
        req.peer_addr()
            .map(|peer| {
                let peer_ip = peer.ip().to_string();
                log::info!(target: "Websocket", "Using direct peer IP in dev mode: {}", peer_ip);
                peer_ip
            })
            .ok_or_else(|| {
                log::warn!(target: "Websocket", "Development connection with no determinable IP");
                actix_web::error::ErrorBadRequest("Client IP could not be determined")
            })
    }
}

// Helper function to create a session key
fn create_session_key(req: &HttpRequest, ip_str: &str) -> String {
    let host = req
        .headers()
        .get("Host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("unknown_host");

    format!("{}:{}", host, ip_str)
}

// Helper function to check for suspicious connections
fn check_suspicious_connection(req: &HttpRequest, ip_str: &str) {
    let user_agent = req
        .headers()
        .get("User-Agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown");

    if user_agent.len() < 5 || user_agent.to_lowercase().contains("bot") {
        log::error!(target: "Websocket", "Suspicious connection attempt - IP: {}, UA: {}", ip_str, user_agent);
    }
}
