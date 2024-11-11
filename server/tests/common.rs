use actix_test::{start, TestServer};
use actix_web::{web, App};
use server::{chat_ws, ServerConfig, SessionManager};

pub fn init_test_server(auto_join: bool) -> TestServer {
    let config = ServerConfig::load(Some(auto_join)).expect("Failed to load server configuration");
    let session_manager = web::Data::new(SessionManager::default());
    let config_data = web::Data::new(config);

    start(move || {
        App::new()
            .app_data(session_manager.clone())
            .app_data(config_data.clone())
            .service(chat_ws)
    })
}
