use std::time::Duration;

pub const MAX_FRAME_SIZE: usize = 64 * 1024;
pub const MAX_SIGNAL_SIZE: usize = 1024 * 1024;
pub const KEEP_ALIVE_INTERVAL: Duration = Duration::from_secs(55);
