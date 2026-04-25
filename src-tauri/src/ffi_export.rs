//! Tauri command exports for the native editor
//!
//! These commands are called from the frontend to control the native editor.

use serde::Serialize;

#[derive(Serialize)]
pub struct EditorStats {
    pub line_count: usize,
    pub char_count: usize,
    pub word_count: usize,
}

#[tauri::command]
pub fn native_editor_get_stats() -> EditorStats {
    EditorStats { line_count: 0, char_count: 0, word_count: 0 }
}

#[tauri::command]
pub fn native_editor_resize(x: i32, y: i32, width: i32, height: i32) {
    log::info!("Native editor resize: {} {} {} {}", x, y, width, height);
}

#[tauri::command]
pub fn native_editor_load_text(text: String) -> Result<(), String> {
    log::info!("Native editor load text: {} chars", text.chars().count());
    Ok(())
}

#[tauri::command]
pub fn native_editor_get_text() -> Result<String, String> {
    Ok(String::new())
}
