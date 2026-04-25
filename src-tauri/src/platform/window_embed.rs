//! Platform-agnostic window embedding trait
//!
//! The native editor window/view is positioned over the WebView's editor area.

pub trait NativeWindowEmbed {
    fn create(parent_handle: *mut std::ffi::c_void) -> Self;
    fn destroy(&self);
    fn resize(&self, x: i32, y: i32, width: i32, height: i32);
    fn show(&self);
    fn hide(&self);
}
