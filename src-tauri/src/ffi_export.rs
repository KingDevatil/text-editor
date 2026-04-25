//! Tauri command exports for the native editor

use serde::Serialize;
use std::sync::{Arc, Mutex};
use crate::AppEditorState;

#[derive(Serialize)]
pub struct EditorStats {
    pub line_count: usize,
    pub char_count: usize,
    pub word_count: usize,
}

#[tauri::command]
pub fn native_editor_get_stats(
    _state: tauri::State<'_, Arc<Mutex<AppEditorState>>>,
) -> EditorStats {
    EditorStats { line_count: 0, char_count: 0, word_count: 0 }
}

#[tauri::command]
pub fn native_editor_resize(
    state: tauri::State<'_, Arc<Mutex<AppEditorState>>>,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) {
    let mut state = state.inner().lock().unwrap();

    #[cfg(windows)]
    if let Some(win) = &state.win32_window {
        win.resize(x, y, width, height);
        if width > 1 && height > 1 {
            win.show();
        }
    }

    if let Some(wgpu) = &mut state.wgpu_context {
        wgpu.resize(width as u32, height as u32);
    }
}

#[tauri::command]
pub fn native_editor_load_text(
    _state: tauri::State<'_, Arc<Mutex<AppEditorState>>>,
    text: String,
) -> Result<(), String> {
    log::info!("Native editor load text: {} chars", text.chars().count());
    Ok(())
}

#[tauri::command]
pub fn native_editor_get_text(
    _state: tauri::State<'_, Arc<Mutex<AppEditorState>>>,
) -> Result<String, String> {
    Ok(String::new())
}
