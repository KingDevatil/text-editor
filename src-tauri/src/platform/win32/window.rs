//! Win32 native child window for editor rendering

pub struct Win32EditorWindow {
    hwnd: isize,
}

impl Win32EditorWindow {
    pub fn new(_parent_hwnd: isize) -> Self {
        // TODO: Register window class and create WS_CHILD window
        Self { hwnd: 0 }
    }

    pub fn hwnd(&self) -> isize {
        self.hwnd
    }

    pub fn resize(&self, _x: i32, _y: i32, _width: i32, _height: i32) {
        // TODO: SetWindowPos
    }
}
