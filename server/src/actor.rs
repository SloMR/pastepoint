use actix::{prelude::Actor, Context};
use actix_broker::BrokerSubscribe;
use actix_web_actors::ws;

use crate::{LeaveRoom, WsChatServer, WsChatSession};

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
        log::debug!("Session started for {} with ID {}", self.name, self.id);

        self.join_room("main", ctx);
    }

    fn stopped(&mut self, _ctx: &mut Self::Context) {
        log::debug!(
            "WsChatSession closed for {}({}) in room {}",
            self.name.clone(),
            self.id,
            self.room
        );
    }
}
