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
) -> Result<HttpResponse, ServerError> {
    // Validate that this is a proper WebSocket connection
    if let Err(response) = validate_websocket_headers(&req) {
        return Err(response);
    }

    let is_dev_mode = ServerConfig::is_dev_env();

    let ip_str = get_client_ip(&req, is_dev_mode)
        .map_err(|e| ServerError::BadRequest(format!("Failed to get client IP: {}", e)))?;
    check_suspicious_connection(&req, &ip_str);

    let session_key = create_session_key(&req, &ip_str);

    log::debug!(target: "Websocket", "Connection request - IP: {}, Session Key: {}", ip_str, session_key);
    store
        .start_websocket(config.get_ref(), &req, stream, &session_key, false, false)
        .map_err(|e| ServerError::BadRequest(format!("WebSocket connection failed: {}", e)))
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
) -> Result<HttpResponse, ServerError> {
    // Validate that this is a proper WebSocket connection
    if let Err(response) = validate_websocket_headers(&req) {
        return Err(response);
    }

    let code = path.into_inner();
    log::debug!(target: "Websocket", "Received session code: {}", code);
    if code.trim().is_empty() {
        log::debug!(target: "Websocket", "Empty code => returning 400");
        return Err(ServerError::BadRequest(
            "Session code cannot be empty".to_string(),
        ));
    }

    store
        .start_websocket(config.get_ref(), &req, stream, &code, true, true)
        .map_err(|e| ServerError::BadRequest(format!("WebSocket connection failed: {}", e)))
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

    if user_agent.len() < MIN_USER_AGENT_LENGTH || user_agent.to_lowercase().contains("bot") {
        log::error!(target: "Websocket", "Suspicious connection attempt - IP: {}, UA: {}", ip_str, user_agent);
    }
}

// Helper function to validate WebSocket connection headers
fn validate_websocket_headers(req: &HttpRequest) -> Result<(), ServerError> {
    let connection = req
        .headers()
        .get("Connection")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let upgrade = req
        .headers()
        .get("Upgrade")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let websocket_key = req
        .headers()
        .get("Sec-WebSocket-Key")
        .and_then(|v| v.to_str().ok());

    let websocket_version = req
        .headers()
        .get("Sec-WebSocket-Version")
        .and_then(|v| v.to_str().ok());

    let x_real_ip = req.headers().get("X-Real-IP").and_then(|v| v.to_str().ok());

    let x_forwarded_for = req
        .headers()
        .get("X-Forwarded-For")
        .and_then(|v| v.to_str().ok());

    // Check if this is a proper WebSocket upgrade request
    if !connection.to_lowercase().contains("upgrade")
        || !upgrade.eq_ignore_ascii_case("websocket")
        || websocket_key.is_none()
        || websocket_version.is_none()
    {
        log::warn!(
            target: "Websocket",
            "Invalid WebSocket connection attempt - Connection: '{}', Upgrade: '{}', Key present: {}, Version present: {}, X-Real-IP: '{}', X-Forwarded-For: '{}'",
            connection,
            upgrade,
            websocket_key.is_some(),
            websocket_version.is_some(),
            x_real_ip.is_some(),
            x_forwarded_for.is_some()
        );

        return Err(ServerError::BadRequest(
            "This endpoint requires a WebSocket connection. Please use a WebSocket client."
                .to_string(),
        ));
    }

    log::debug!(
        target: "Websocket",
        "Valid WebSocket connection - Connection: '{}', Upgrade: '{}', Key: present={}, Version: present={}, X-Real-IP: present={}, X-Forwarded-For: present={}",
        connection,
        upgrade,
        websocket_key.is_some(),
        websocket_version.is_some(),
        x_real_ip.is_some(),
        x_forwarded_for.is_some()
    );

    Ok(())
}
