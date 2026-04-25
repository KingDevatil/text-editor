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
    state: tauri::State<'_, Arc<Mutex<AppEditorState>>>,
) -> EditorStats {
    let state = state.inner().lock().unwrap();
    let text = state.editor_state.get_text();
    let word_count = text.split_whitespace().count();
    EditorStats {
        line_count: state.editor_state.line_count(),
        char_count: state.editor_state.char_count(),
        word_count,
    }
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

    let w = width as u32;
    let h = height as u32;
    let current_text = state.editor_state.get_text();

    if let Some(ref mut text_atlas) = state.text_atlas {
        text_atlas.resize(w, h);
        text_atlas.render_text(&current_text, 24.0);
    }

    if let Some(ref mut wgpu) = state.wgpu_context {
        wgpu.resize(w, h);
    }
    let atlas_data = state.text_atlas.as_ref().map(|a| (a.cpu_buffer.as_ptr(), a.width, a.height, a.cpu_buffer.len()));
    if let Some((ptr, width, height, len)) = atlas_data {
        if let Some(ref mut wgpu) = state.wgpu_context {
            unsafe {
                let data = std::slice::from_raw_parts(ptr, len);
                wgpu.update_text_texture(data, width, height);
            }
        }
    }
}

#[tauri::command]
pub fn native_editor_load_text(
    state: tauri::State<'_, Arc<Mutex<AppEditorState>>>,
    text: String,
) -> Result<(), String> {
    let mut state = state.inner().lock().unwrap();
    state.editor_state = crate::editor::editor_state::EditorState::from_text(&text);
    let wgpu_ptr = state.wgpu_context.as_mut().map(|w| w as *mut crate::render::wgpu_context::WgpuContext);
    if let Some(ref mut text_atlas) = state.text_atlas {
        text_atlas.render_text(&text, 24.0);
        if let Some(wgpu) = wgpu_ptr {
            unsafe {
                (*wgpu).update_text_texture(&text_atlas.cpu_buffer, text_atlas.width, text_atlas.height);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn native_editor_get_text(
    state: tauri::State<'_, Arc<Mutex<AppEditorState>>>,
) -> Result<String, String> {
    let state = state.inner().lock().unwrap();
    Ok(state.editor_state.get_text())
}

#[tauri::command]
pub fn native_editor_key_event(
    state: tauri::State<'_, Arc<Mutex<AppEditorState>>>,
    key: String,
    _code: String,
    ctrl: bool,
    _shift: bool,
    _alt: bool,
    meta: bool,
) {
    // Ignore UI shortcuts (Ctrl+Key or Meta+Key)
    if ctrl || meta {
        return;
    }

    let mut state = state.inner().lock().unwrap();
    let wgpu_ptr = state.wgpu_context.as_mut().map(|w| w as *mut crate::render::wgpu_context::WgpuContext);
    let handled = match key.as_str() {
        "Backspace" => {
            state.editor_state.backspace();
            true
        }
        "Delete" => {
            state.editor_state.delete();
            true
        }
        "Enter" | "Return" => {
            state.editor_state.insert_newline();
            true
        }
        "ArrowLeft" => {
            state.editor_state.move_left();
            true
        }
        "ArrowRight" => {
            state.editor_state.move_right();
            true
        }
        "ArrowUp" => {
            state.editor_state.move_up();
            true
        }
        "ArrowDown" => {
            state.editor_state.move_down();
            true
        }
        "Home" => {
            state.editor_state.move_home();
            true
        }
        "End" => {
            state.editor_state.move_end();
            true
        }
        // Printable characters
        _ => {
            if let Some(ch) = key.chars().next() {
                if key.len() == 1 && !ch.is_control() {
                    state.editor_state.insert_char(ch);
                    true
                } else {
                    false
                }
            } else {
                false
            }
        }
    };

    if handled {
        let text = state.editor_state.get_text();
        if let Some(ref mut text_atlas) = state.text_atlas {
            text_atlas.render_text(&text, 24.0);
            if let Some(wgpu) = wgpu_ptr {
                unsafe {
                    (*wgpu).update_text_texture(&text_atlas.cpu_buffer, text_atlas.width, text_atlas.height);
                }
            }
        }
    }
}
