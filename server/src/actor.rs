use crate::{LeaveRoom, WsChatServer, WsChatSession};
use actix::{prelude::Actor, Context};
use actix_broker::BrokerSubscribe;
use actix_web_actors::ws;
use std::time::Instant;
use uuid::Uuid;

impl Actor for WsChatServer {
    type Context = Context<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        self.subscribe_system_async::<LeaveRoom>(ctx);
        self.start_cleanup_interval(ctx);
    }
}

impl Actor for WsChatSession {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        self.id = rand::random::<usize>();
        log::debug!(
            target: "Websocket",
            "Session started for {} with ID {}",
            self.name,
            self.id
        );
        log::debug!(target: "Websocket","Auto-join is set to: {}", self.auto_join);

        self.last_heartbeat = Some(Instant::now());
        self.start_heartbeat(ctx);

        if self.auto_join {
            self.join_room("main", ctx);
        }
    }

    fn stopped(&mut self, _ctx: &mut Self::Context) {
        log::debug!(
            target: "Websocket",
            "WsChatSession closed for {}({}) in room {}",
            self.name.clone(),
            self.id,
            self.room
        );

        if let Ok(uuid) = Uuid::parse_str(&self.session_id) {
            log::debug!(target: "Websocket","Removing client {} from session", uuid);
            self.session_store.remove_client(&uuid);
        } else {
            log::debug!(
                target: "Websocket",
                "Invalid UUID format for session_id: {}",
                self.session_id
            );
        }
    }
}
