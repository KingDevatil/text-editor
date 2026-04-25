//! macOS native NSView for editor rendering

pub struct MacOSEditorView {
    // TODO: NSView subclass
}

impl MacOSEditorView {
    pub fn new(_parent_view: *mut std::ffi::c_void) -> Self {
        Self {}
    }

    pub fn resize(&self, _x: i32, _y: i32, _width: i32, _height: i32) {
        // TODO: setFrame
    }
}
