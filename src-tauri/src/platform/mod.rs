pub mod window_embed;

#[cfg(target_os = "windows")]
pub mod win32;

#[cfg(target_os = "macos")]
pub mod macos;
