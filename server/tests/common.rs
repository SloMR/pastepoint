use actix_test::{TestServer, start};
use actix_web::{App, web};
use server::{ServerConfig, SessionStore, chat_ws};

pub fn init_test_server(auto_join: bool) -> TestServer {
    let config = ServerConfig::load(Some(auto_join)).expect("Failed to load server configuration");
    let session_manager = web::Data::new(SessionStore::default());
    let config_data = web::Data::new(config);

    start(move || {
        App::new()
            .app_data(session_manager.clone())
            .app_data(config_data.clone())
            .service(chat_ws)
    })
}
