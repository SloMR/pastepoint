use actix::prelude::*;
use actix_cors::Cors;
use actix_web::{http::StatusCode, test, web, App};
use bytes::Bytes;
use server::{
    chat_ws, index, private_chat_ws, ChatMessage, LeaveRoom, ServerConfig, SessionStore,
    WsChatServer,
};

#[actix_rt::test]
async fn test_index() {
    let app = test::init_service(App::new().service(index)).await;
    let req = test::TestRequest::get().uri("/").to_request();
    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), StatusCode::OK);

    let body = test::read_body(resp).await;

    assert_eq!(body, Bytes::from_static(b"Hello, this is PastePoint!"));
}

#[actix_rt::test]
async fn test_ws_upgrade() {
    let session_manager = web::Data::new(SessionStore::default());
    let config = web::Data::new(
        ServerConfig::load(Some(false)).expect("Failed to load server configuration"),
    );

    let app = test::init_service(
        App::new()
            .app_data(session_manager.clone())
            .app_data(config.clone())
            .service(chat_ws),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/ws")
        .insert_header(("Upgrade", "websocket"))
        .insert_header(("Connection", "Upgrade"))
        .insert_header(("Sec-WebSocket-Version", "13"))
        .insert_header(("Sec-WebSocket-Key", "test_key"))
        .peer_addr("127.0.0.1:12345".parse().unwrap())
        .to_request();

    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), StatusCode::SWITCHING_PROTOCOLS);
}

#[actix_rt::test]
async fn test_private_ws_upgrade() {
    let session_manager = web::Data::new(SessionStore::default());
    let config = web::Data::new(
        ServerConfig::load(Some(false)).expect("Failed to load server configuration"),
    );

    let code = "TESTCODE123";
    session_manager
        .get_or_create_session_uuid(code, false, true)
        .expect("Failed to create session UUID in non-strict mode first");

    session_manager
        .get_or_create_session_uuid(code, true, true)
        .expect("Failed to retrieve session UUID in strict mode");

    let app = test::init_service(
        App::new()
            .app_data(session_manager.clone())
            .app_data(config.clone())
            .service(private_chat_ws),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/ws/TESTCODE123")
        .insert_header(("Upgrade", "websocket"))
        .insert_header(("Connection", "Upgrade"))
        .insert_header(("Sec-WebSocket-Version", "13"))
        .insert_header(("Sec-WebSocket-Key", "test_key"))
        .peer_addr("127.0.0.1:12345".parse().unwrap())
        .to_request();

    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), StatusCode::SWITCHING_PROTOCOLS);
}

#[actix_rt::test]
async fn test_private_ws_unknown_code() {
    let session_manager = web::Data::new(SessionStore::default());
    let config = web::Data::new(
        ServerConfig::load(Some(false)).expect("Failed to load server configuration"),
    );

    let app = test::init_service(
        App::new()
            .app_data(session_manager.clone())
            .app_data(config.clone())
            .service(private_chat_ws),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/ws/unknown_code")
        .insert_header(("Upgrade", "websocket"))
        .insert_header(("Connection", "Upgrade"))
        .insert_header(("Sec-WebSocket-Version", "13"))
        .insert_header(("Sec-WebSocket-Key", "test_key"))
        .peer_addr("127.0.0.1:12345".parse().unwrap())
        .to_request();

    let resp = test::call_service(&app, req).await;

    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[actix_rt::test]
async fn test_session_manager() {
    let manager = SessionStore::default();
    let ip = "127.0.0.1";
    let uuid1 = manager
        .get_or_create_session_uuid(ip, false, false)
        .expect("Failed to create UUID");
    let uuid2 = manager
        .get_or_create_session_uuid(ip, true, false)
        .expect("Failed to create UUID");

    assert_eq!(uuid1, uuid2);

    let ip2 = "127.0.0.2";
    let uuid3 = manager
        .get_or_create_session_uuid(ip2, false, false)
        .expect("Failed to create UUID");

    assert_ne!(uuid1, uuid3);
}

#[actix_rt::test]
async fn test_join_leave_room() {
    let mut server = WsChatServer::default();

    let session_id = "test_session";
    let room_name = "test_room";
    let client_name = "test_client";

    struct DummyActor;

    impl Actor for DummyActor {
        type Context = Context<Self>;
    }

    impl Handler<ChatMessage> for DummyActor {
        type Result = ();

        fn handle(&mut self, _msg: ChatMessage, _ctx: &mut Context<Self>) {
            // Do nothing just for testing purposes
        }
    }

    let dummy_actor = DummyActor.start();
    let client_recipient = dummy_actor.recipient();

    let id = server.add_client_to_room(
        session_id,
        room_name,
        None,
        client_recipient,
        client_name.to_string(),
    );

    assert!(server
        .rooms
        .get(session_id)
        .unwrap()
        .get(room_name)
        .unwrap()
        .contains_key(&id));

    let leave_msg = LeaveRoom(session_id.to_string(), room_name.to_string(), id);
    server.handle_leave_room(leave_msg);

    assert!(server
        .rooms
        .get(session_id)
        .and_then(|rooms| rooms.get(room_name))
        .is_none());
}

#[actix_rt::test]
async fn test_cors_origin_checking() {
    let session_manager = web::Data::new(SessionStore::default());
    let mut config_value =
        ServerConfig::load(Some(false)).expect("Failed to load server configuration");
    config_value.cors_allowed_origins = "https://pastepoint.com".to_string();
    let config = web::Data::new(config_value);
    let config_for_test = config.clone();
    let allowed_domain = config_for_test.cors_allowed_origins.clone();

    let app = test::init_service(
        App::new()
            .wrap(
                Cors::default()
                    .allowed_origin_fn(move |origin, _req_head| {
                        config_for_test.check_origin(origin)
                    })
                    .allowed_methods(vec!["GET", "OPTIONS"])
                    .supports_credentials()
                    .max_age(3600),
            )
            .app_data(session_manager.clone())
            .app_data(config.clone())
            .service(index),
    )
    .await;

    // Test allowed origin based on configuration
    let origin = allowed_domain.clone();
    let req = test::TestRequest::get()
        .uri("/")
        .insert_header(("Origin", origin.clone()))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(
        resp.headers().get("Access-Control-Allow-Origin").unwrap(),
        &origin
    );

    // Test allowed origin with www subdomain
    let domain_only = allowed_domain
        .trim_start_matches("https://")
        .trim_start_matches("http://");
    let origin = format!("https://www.{}", domain_only);
    let req = test::TestRequest::get()
        .uri("/")
        .insert_header(("Origin", origin.clone()))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(
        resp.headers().get("Access-Control-Allow-Origin").unwrap(),
        &origin
    );

    // Test disallowed origin
    let origin = "https://malicious-site.com";
    let req = test::TestRequest::get()
        .uri("/")
        .insert_header(("Origin", origin))
        .to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);
    assert!(resp.headers().get("Access-Control-Allow-Origin").is_none());

    // Test missing origin header
    let req = test::TestRequest::get().uri("/").to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);
    assert!(resp.headers().get("Access-Control-Allow-Origin").is_none());
}
