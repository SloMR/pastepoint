use config::{Config, ConfigError, File};
use serde::Deserialize;
use std::env;

// This function provides a default value for the log level.
fn default_log_level() -> String {
    "debug".to_string()
}

#[derive(Clone, Debug, Deserialize)]
pub struct ServerConfig {
    pub bind_address: String,
    pub key_file_path: String,
    pub cert_file_path: String,
    pub auto_join: bool,
    pub rate_limit_per_second: u64,
    pub rate_limit_burst_size: u32,
    #[serde(default = "default_log_level")]
    pub log_level: String,
}

impl ServerConfig {
    pub fn load(auto_join_override: Option<bool>) -> Result<Self, ConfigError> {
        let environment = env::var("RUN_ENV").unwrap_or_else(|_| "development".to_string());
        log::debug!(
            target: "Websocket",
            "Loading configuration for environment: {}",
            environment
        );

        let mut builder = Config::builder()
            .add_source(File::with_name(&format!("config/{}", environment)).required(true));

        if let Some(auto_join) = auto_join_override {
            builder = builder.set_override("server.auto_join", auto_join)?;
        }

        let settings = builder.build()?;
        settings.get::<ServerConfig>("server")
    }

    pub fn is_dev_env() -> bool {
        let environment = env::var("RUN_ENV").unwrap_or_else(|_| "development".to_string());
        environment == "development" || environment == "docker-dev"
    }
}
