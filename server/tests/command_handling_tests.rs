use crate::common::init_test_server;
use awc::{
    Client,
    ws::{Frame, Message},
};
use futures_util::{SinkExt, StreamExt};
use tokio::time::{Duration, timeout};

mod common;

#[actix_rt::test]
async fn test_ws_unknown_command() {
    let srv = init_test_server(false);

    let url = srv.url("/ws");

    let (_resp, mut framed) = Client::new()
        .ws(&url)
        .connect()
        .await
        .expect("Failed to connect");

    framed
        .send(Message::Text("[UserCommand]/unknown".into()))
        .await
        .unwrap();

    let mut unknown_command = false;

    let result = timeout(Duration::from_secs(5), async {
        while let Some(Ok(Frame::Text(text))) = framed.next().await {
            let text_str = std::str::from_utf8(&text).unwrap();
            if text_str.contains("[SystemError]") {
                unknown_command = true;
                break;
            }
        }
    })
    .await;

    if result.is_err() {
        panic!("Test timed out waiting for server responses");
    }
    assert!(
        unknown_command,
        "Did not receive an error message for unknown command"
    );

    framed.close().await.unwrap();
}

#[actix_rt::test]
async fn test_ws_normal_text_message() {
    let srv = init_test_server(false);

    let url = srv.url("/ws");

    let (_resp, mut framed) = Client::new()
        .ws(&url)
        .connect()
        .await
        .expect("Failed to connect");

    framed
        .send(Message::Text("Hello, World!".into()))
        .await
        .unwrap();

    let mut unknown_command = false;
    let result = timeout(Duration::from_secs(5), async {
        while let Some(Ok(Frame::Text(text))) = framed.next().await {
            let text_str = std::str::from_utf8(&text).unwrap();
            if text_str.contains("[SystemError]") {
                unknown_command = true;
                break;
            }
        }
    })
    .await;

    if result.is_err() {
        panic!("Test timed out waiting for server responses");
    }
    assert!(
        unknown_command,
        "Did not receive an error message for unknown command"
    );

    framed.close().await.unwrap();
}

#[actix_rt::test]
async fn test_ws_invalid_signal_message() {
    use serde_json::json;

    let srv = init_test_server(false);

    let url = srv.url("/ws");

    let (_resp, mut framed) = Client::new()
        .ws(&url)
        .connect()
        .await
        .expect("Failed to connect");

    let invalid_signal_payload = json!({
        "from": "user1",
        "data": "test signal data"
    })
    .to_string();

    framed
        .send(Message::Text(
            format!("[SignalMessage] {invalid_signal_payload}").into(),
        ))
        .await
        .unwrap();

    let mut received_error = false;
    let result = timeout(Duration::from_secs(5), async {
        while let Some(Ok(Frame::Text(text))) = framed.next().await {
            let text_str = std::str::from_utf8(&text).unwrap();
            if text_str.contains("[SystemError]") {
                received_error = true;
                break;
            }
        }
    })
    .await;

    if result.is_err() {
        panic!("Test timed out waiting for server responses");
    }
    assert!(
        received_error,
        "Did not receive an error message for invalid signal message"
    );

    framed.close().await.unwrap();
}
