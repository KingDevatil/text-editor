//! Editor state machine

use crate::core::rope_buffer::TextBuffer;
use crate::core::undo_stack::{UndoStack, EditOp};

pub struct EditorState {
    pub buffer: TextBuffer,
    pub undo_stack: UndoStack,
    pub dirty: bool,
}

impl EditorState {
    pub fn new() -> Self {
        Self {
            buffer: TextBuffer::new(),
            undo_stack: UndoStack::new(),
            dirty: false,
        }
    }

    pub fn from_text(text: &str) -> Self {
        Self {
            buffer: TextBuffer::from_str(text),
            undo_stack: UndoStack::new(),
            dirty: false,
        }
    }

    pub fn insert_text(&mut self, pos: usize, text: &str) {
        self.undo_stack.push(vec![EditOp::Delete { pos, text: text.to_string() }]);
        self.buffer.insert(pos, text);
        self.dirty = true;
    }

    pub fn delete_range(&mut self, range: std::ops::Range<usize>) {
        let deleted = self.buffer.slice(range.clone()).to_string();
        self.undo_stack.push(vec![EditOp::Insert { pos: range.start, text: deleted }]);
        self.buffer.remove(range);
        self.dirty = true;
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
            // redo logic similar to undo but inverted
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
}
