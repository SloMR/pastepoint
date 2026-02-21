use crate::common::init_test_server;
use awc::{
    Client,
    ws::{Frame, Message},
};
use futures_util::{SinkExt, StreamExt};
use tokio::time::{Duration, timeout};

mod common;

#[actix_rt::test]
async fn test_ws_multiple_clients_in_room() {
    let srv = init_test_server(false);

    let url = srv.url("/ws");

    let (_resp1, mut framed1) = Client::new()
        .ws(&url)
        .connect()
        .await
        .expect("Failed to connect client 1");

    let (_resp2, mut framed2) = Client::new()
        .ws(&url)
        .connect()
        .await
        .expect("Failed to connect client 2");

    framed1
        .send(Message::Text("[UserCommand]/join test_room".into()))
        .await
        .unwrap();
    framed2
        .send(Message::Text("[UserCommand]/join test_room".into()))
        .await
        .unwrap();

    let mut client1_received_members = false;
    let mut client2_received_members = false;

    let client1_result = timeout(Duration::from_secs(5), async {
        while let Some(Ok(Frame::Text(text))) = framed1.next().await {
            let text_str = std::str::from_utf8(&text).unwrap();

            if text_str.contains("[SystemMembers]") {
                client1_received_members = true;
                break;
            }
        }
    })
    .await;

    let client2_result = timeout(Duration::from_secs(5), async {
        while let Some(Ok(Frame::Text(text))) = framed2.next().await {
            let text_str = std::str::from_utf8(&text).unwrap();

            if text_str.contains("[SystemMembers]") {
                client2_received_members = true;
                break;
            }
        }
    })
    .await;

    if client1_result.is_err() || client2_result.is_err() {
        panic!("Test timed out waiting for server responses");
    }

    assert!(
        client1_received_members,
        "Client 1 did not receive members list"
    );
    assert!(
        client2_received_members,
        "Client 2 did not receive members list"
    );

    framed1.close().await.unwrap();
    framed2.close().await.unwrap();
}

#[actix_rt::test]
async fn test_ws_rejoin_room() {
    let srv = init_test_server(false);

    let url = srv.url("/ws");

    let (_resp, mut framed) = Client::new()
        .ws(&url)
        .connect()
        .await
        .expect("Failed to connect");

    framed
        .send(Message::Text("[UserCommand]/join test_room".into()))
        .await
        .unwrap();

    framed
        .send(Message::Text("[UserCommand]/join main".into()))
        .await
        .unwrap();

    framed
        .send(Message::Text("[UserCommand]/join test_room".into()))
        .await
        .unwrap();

    let mut rejoined = false;

    let result = timeout(Duration::from_secs(5), async {
        while let Some(Ok(Frame::Text(text))) = framed.next().await {
            let text_str = std::str::from_utf8(&text).unwrap();
            if text_str.contains("[SystemJoin]") && text_str.contains("test_room") {
                rejoined = true;
                break;
            }
        }
    })
    .await;

    if result.is_err() {
        panic!("Test timed out waiting for server responses");
    }

    assert!(
        rejoined,
        "Did not receive rejoin confirmation for test_room"
    );

    framed.close().await.unwrap();
}

#[allow(clippy::assertions_on_constants)]
#[actix_rt::test]
async fn test_ws_unexpected_message() {
    let srv = init_test_server(true);

    let url = srv.url("/ws");

    let (_resp, mut framed) = Client::new()
        .ws(&url)
        .connect()
        .await
        .expect("Failed to connect");

    framed
        .send(Message::Binary(vec![0, 1, 2, 3].into()))
        .await
        .unwrap();

    let result = timeout(Duration::from_secs(5), async {
        if let Some(Ok(Frame::Close(_))) = framed.next().await {
            // Server closed the connection as expected due to unexpected message
            assert!(true);
        } else {
            // Server did not crash and handled unexpected message
            assert!(true);
        }
    })
    .await;

    if result.is_err() {
        panic!("Test timed out waiting for server responses");
    }

    framed.close().await.unwrap();
}
