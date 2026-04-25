//! Edit commands: insert, delete, newline, indent

use crate::editor::editor_state::EditorState;

pub fn insert_char(state: &mut EditorState, cursor: &mut crate::editor::cursor::Cursor, ch: char) {
    let pos = cursor.pos;
    state.insert_text(pos, &ch.to_string());
    cursor.pos += 1;
}

pub fn insert_text(state: &mut EditorState, cursor: &mut crate::editor::cursor::Cursor, text: &str) {
    let pos = cursor.pos;
    let char_len = text.chars().count();
    state.insert_text(pos, text);
    cursor.pos += char_len;
}

pub fn delete_forward(state: &mut EditorState, cursor: &mut crate::editor::cursor::Cursor) {
    if cursor.pos < state.buffer.len_chars() {
        state.delete_range(cursor.pos..cursor.pos + 1);
    }
}

pub fn delete_backward(state: &mut EditorState, cursor: &mut crate::editor::cursor::Cursor) {
    if cursor.pos > 0 {
        state.delete_range(cursor.pos - 1..cursor.pos);
        cursor.pos -= 1;
    }
}

pub fn insert_newline(state: &mut EditorState, cursor: &mut crate::editor::cursor::Cursor) {
    insert_text(state, cursor, "\n");
}
