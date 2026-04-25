//! Win32 native child window for editor rendering

use raw_window_handle::{
    HasDisplayHandle, HasWindowHandle, DisplayHandle, WindowHandle,
    Win32WindowHandle, WindowsDisplayHandle,
    RawWindowHandle, RawDisplayHandle, HandleError,
};
use std::num::NonZeroIsize;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::Graphics::Gdi::{ValidateRect, HBRUSH, COLOR_WINDOW};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::*;

/// Wrapper to implement raw-window-handle traits for a Win32 HWND
pub struct Win32WindowWrapper {
    hwnd: isize,
}

impl Win32WindowWrapper {
    pub fn new(hwnd: isize) -> Self {
        Self { hwnd }
    }
}

impl HasWindowHandle for Win32WindowWrapper {
    fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
        let handle = Win32WindowHandle::new(
            NonZeroIsize::new(self.hwnd).unwrap()
        );
        unsafe {
            Ok(WindowHandle::borrow_raw(RawWindowHandle::Win32(handle)))
        }
    }
}

impl HasDisplayHandle for Win32WindowWrapper {
    fn display_handle(&self) -> Result<DisplayHandle<'_>, HandleError> {
        let handle = WindowsDisplayHandle::new();
        unsafe {
            Ok(DisplayHandle::borrow_raw(RawDisplayHandle::Windows(handle)))
        }
    }
}

/// Native editor child window (hwnd stored as isize for Send + Sync)
pub struct Win32EditorWindow {
    hwnd: isize,
}

impl Win32EditorWindow {
    pub fn new(parent_hwnd: isize, x: i32, y: i32, width: i32, height: i32) -> Result<Self, String> {
        unsafe {
            let hinstance = GetModuleHandleW(None).map_err(|e| format!("GetModuleHandleW failed: {}", e))?;
            let class_name: Vec<u16> = "TextEditorNativeWindow\0".encode_utf16().collect();

            let wc = WNDCLASSW {
                hInstance: hinstance.into(),
                lpszClassName: windows::core::PCWSTR(class_name.as_ptr()),
                lpfnWndProc: Some(editor_wndproc),
                hbrBackground: HBRUSH((COLOR_WINDOW.0 + 1) as _),
                ..Default::default()
            };
            RegisterClassW(&wc);

            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                windows::core::PCWSTR(class_name.as_ptr()),
                windows::core::PCWSTR::null(),
                WS_CHILD | WS_CLIPCHILDREN,
                x,
                y,
                width.max(1),
                height.max(1),
                HWND(parent_hwnd as _),
                HMENU(std::ptr::null_mut()),
                hinstance,
                None,
            ).map_err(|e| format!("CreateWindowExW failed: {}", e))?;

            Ok(Self { hwnd: hwnd.0 as isize })
        }
    }

    pub fn hwnd(&self) -> isize {
        self.hwnd
    }

    pub fn show(&self) {
        unsafe {
            let _ = ShowWindow(HWND(self.hwnd as _), SW_SHOW);
        }
    }

    pub fn hide(&self) {
        unsafe {
            let _ = ShowWindow(HWND(self.hwnd as _), SW_HIDE);
        }
    }

    pub fn resize(&self, x: i32, y: i32, width: i32, height: i32) {
        unsafe {
            SetWindowPos(
                HWND(self.hwnd as _),
                HWND(std::ptr::null_mut()),
                x,
                y,
                width.max(1),
                height.max(1),
                SWP_NOZORDER | SWP_NOACTIVATE,
            );
        }
    }
}

extern "system" fn editor_wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match msg {
        WM_PAINT => {
            unsafe {
                ValidateRect(hwnd, None);
            }
            LRESULT(0)
        }
        _ => unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
    }
}
