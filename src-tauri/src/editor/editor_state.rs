//! Editor state machine with cursor

use crate::core::rope_buffer::TextBuffer;
use crate::core::undo_stack::{EditOp, UndoStack};
use crate::editor::cursor::Cursor;

pub struct EditorState {
    pub buffer: TextBuffer,
    pub cursor: Cursor,
    pub undo_stack: UndoStack,
    pub dirty: bool,
}

impl EditorState {
    pub fn new() -> Self {
        Self {
            buffer: TextBuffer::new(),
            cursor: Cursor::new(),
            undo_stack: UndoStack::new(),
            dirty: false,
        }
    }

    pub fn from_text(text: &str) -> Self {
        let mut state = Self {
            buffer: TextBuffer::from_str(text),
            cursor: Cursor::new(),
            undo_stack: UndoStack::new(),
            dirty: false,
        };
        state.cursor.pos = state.buffer.len_chars();
        state.update_cursor_line_col();
        state
    }

    pub fn insert_char(&mut self, ch: char) {
        self.buffer.insert(self.cursor.pos, &ch.to_string());
        self.cursor.pos += 1;
        self.update_cursor_line_col();
        self.dirty = true;
    }

    pub fn insert_newline(&mut self) {
        self.buffer.insert(self.cursor.pos, "\n");
        self.cursor.pos += 1;
        self.update_cursor_line_col();
        self.dirty = true;
    }

    pub fn insert_text(&mut self, pos: usize, text: &str) {
        self.undo_stack.push(vec![EditOp::Delete {
            pos,
            text: text.to_string(),
        }]);
        self.buffer.insert(pos, text);
        self.cursor.pos = pos + text.chars().count();
        self.update_cursor_line_col();
        self.dirty = true;
    }

    pub fn backspace(&mut self) {
        if self.cursor.pos > 0 {
            self.cursor.pos -= 1;
            self.buffer.remove(self.cursor.pos..self.cursor.pos + 1);
            self.update_cursor_line_col();
            self.dirty = true;
        }
    }

    pub fn delete(&mut self) {
        if self.cursor.pos < self.buffer.len_chars() {
            self.buffer.remove(self.cursor.pos..self.cursor.pos + 1);
            self.dirty = true;
        }
    }

    pub fn delete_range(&mut self, range: std::ops::Range<usize>) {
        let deleted = self.buffer.slice(range.clone()).to_string();
        self.undo_stack
            .push(vec![EditOp::Insert {
                pos: range.start,
                text: deleted,
            }]);
        self.buffer.remove(range);
        self.dirty = true;
    }

    pub fn move_left(&mut self) {
        if self.cursor.pos > 0 {
            self.cursor.pos -= 1;
            self.update_cursor_line_col();
        }
    }

    pub fn move_right(&mut self) {
        if self.cursor.pos < self.buffer.len_chars() {
            self.cursor.pos += 1;
            self.update_cursor_line_col();
        }
    }

    pub fn move_up(&mut self) {
        if self.cursor.line == 0 {
            return;
        }
        let prev_line_len = self.buffer.line(self.cursor.line - 1).len_chars();
        let target_col = self.cursor.target_col.min(prev_line_len);
        let new_pos = self.buffer.line_to_char(self.cursor.line - 1) + target_col;
        self.cursor.pos = new_pos;
        self.cursor.line -= 1;
        self.cursor.col = target_col;
    }

    pub fn move_down(&mut self) {
        if self.cursor.line + 1 >= self.buffer.len_lines() {
            return;
        }
        let next_line_len = self.buffer.line(self.cursor.line + 1).len_chars();
        let target_col = self.cursor.target_col.min(next_line_len);
        let new_pos = self.buffer.line_to_char(self.cursor.line + 1) + target_col;
        self.cursor.pos = new_pos;
        self.cursor.line += 1;
        self.cursor.col = target_col;
    }

    pub fn move_home(&mut self) {
        self.cursor.pos = self.buffer.line_to_char(self.cursor.line);
        self.update_cursor_line_col();
    }

    pub fn move_end(&mut self) {
        let line_start = self.buffer.line_to_char(self.cursor.line);
        let line_len = self.buffer.line(self.cursor.line).len_chars();
        self.cursor.pos = line_start + line_len;
        self.update_cursor_line_col();
    }

    pub fn undo(&mut self) -> bool {
        if let Some(ops) = self.undo_stack.undo() {
            for op in ops {
                match op {
                    EditOp::Insert { pos, text } => self.buffer.insert(pos, &text),
                    EditOp::Delete { pos, text } => {
                        let end = pos + text.chars().count();
                        self.buffer.remove(pos..end);
                    }
                }
            }
            true
        } else {
            false
        }
    }

    pub fn redo(&mut self) -> bool {
        if let Some(_ops) = self.undo_stack.redo() {
            true
        } else {
            false
        }
    }

    pub fn get_text(&self) -> String {
        self.buffer.to_string()
    }

    pub fn line_count(&self) -> usize {
        self.buffer.len_lines()
    }

    pub fn char_count(&self) -> usize {
        self.buffer.len_chars()
    }

    fn update_cursor_line_col(&mut self) {
        self.cursor.line = self.buffer.char_to_line(self.cursor.pos);
        let line_start = self.buffer.line_to_char(self.cursor.line);
        self.cursor.col = self.cursor.pos - line_start;
        self.cursor.target_col = self.cursor.col;
    }
}
