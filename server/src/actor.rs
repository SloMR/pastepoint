use crate::{LeaveRoom, WsChatServer, WsChatSession};
use actix::{prelude::Actor, Context};
use actix_broker::BrokerSubscribe;
use actix_web_actors::ws;
use uuid::Uuid;

impl Actor for WsChatServer {
    type Context = Context<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        self.subscribe_system_async::<LeaveRoom>(ctx);
    }
}

impl Actor for WsChatSession {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        self.id = rand::random::<usize>();
        log::debug!(
            "[Websocket] Session started for {} with ID {}",
            self.name,
            self.id
        );
        log::debug!("[Websocket] Auto-join is set to: {}", self.auto_join);

        if self.auto_join {
            self.join_room("main", ctx);
        }
    }

    fn stopped(&mut self, _ctx: &mut Self::Context) {
        log::debug!(
            "[Websocket] WsChatSession closed for {}({}) in room {}",
            self.name.clone(),
            self.id,
            self.room
        );

        if let Ok(uuid) = Uuid::parse_str(&self.session_id) {
            log::debug!("[Websocket] Removing client {} from session", uuid);
            self.session_store.remove_client(&uuid);
        } else {
            log::error!(
                "[Websocket] Invalid UUID format for session_id: {}",
                self.session_id
            );
        }
    }
}
