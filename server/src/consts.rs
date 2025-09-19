use std::time::Duration;

// WebSocket frame and message size limits
pub const MAX_FRAME_SIZE: usize = 64 * 1024;
pub const MAX_SIGNAL_SIZE: usize = 1024 * 1024;

// Timing intervals
pub const KEEP_ALIVE_INTERVAL: Duration = Duration::from_secs(3600);
pub const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(120);
pub const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(300);
pub const SESSION_EXPIRATION_TIME: Duration = Duration::from_secs(60);
pub const CLEANUP_INTERVAL: Duration = Duration::from_secs(3600);

// Session configuration
pub const SESSION_CODE_LENGTH: usize = 10;
pub const SAFE_CHARSET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

// HTTP configuration
pub const CORS_MAX_AGE: usize = 3600;
pub const CONTENT_TYPE_TEXT_PLAIN: &str = "text/plain; charset=utf-8";
pub const MIN_USER_AGENT_LENGTH: usize = 5;

// WebSocket message prefixes
pub const WS_PREFIX_SYSTEM_ERROR: &str = "[SystemError]";
pub const WS_PREFIX_SYSTEM_ROOMS: &str = "[SystemRooms]";
pub const WS_PREFIX_SYSTEM_NAME: &str = "[SystemName]";
pub const WS_PREFIX_SYSTEM_JOIN: &str = "[SystemJoin]";
pub const WS_PREFIX_SYSTEM_MEMBERS: &str = "[SystemMembers]";
pub const WS_PREFIX_SIGNAL_MESSAGE: &str = "[SignalMessage]";
pub const WS_PREFIX_USER_COMMAND: &str = "[UserCommand]";
pub const WS_PREFIX_USER_DISCONNECTED: &str = "[UserDisconnected]";
