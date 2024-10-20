#[derive(Clone)]
pub struct ServerConfig {
    pub auto_join: bool,
}

impl Default for ServerConfig {
    fn default() -> Self {
        ServerConfig { auto_join: true }
    }
}
