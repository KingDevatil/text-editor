//! Text buffer using ropey (B-tree based rope)

use ropey::Rope;

pub struct TextBuffer {
    rope: Rope,
}

impl TextBuffer {
    pub fn new() -> Self {
        Self { rope: Rope::new() }
    }

    pub fn from_str(text: &str) -> Self {
        Self { rope: Rope::from_str(text) }
    }

    pub fn len_chars(&self) -> usize {
        self.rope.len_chars()
    }

    pub fn len_lines(&self) -> usize {
        self.rope.len_lines()
    }

    pub fn line(&self, line_idx: usize) -> ropey::RopeSlice {
        self.rope.line(line_idx)
    }

    pub fn insert(&mut self, char_idx: usize, text: &str) {
        self.rope.insert(char_idx, text);
    }

    pub fn remove(&mut self, char_range: std::ops::Range<usize>) {
        self.rope.remove(char_range);
    }

    pub fn slice(&self, char_range: std::ops::Range<usize>) -> ropey::RopeSlice {
        self.rope.slice(char_range)
    }

    pub fn char_to_line(&self, char_idx: usize) -> usize {
        self.rope.char_to_line(char_idx)
    }

    pub fn line_to_char(&self, line_idx: usize) -> usize {
        self.rope.line_to_char(line_idx)
    }

    pub fn to_string(&self) -> String {
        self.rope.to_string()
    }

    pub fn inner(&self) -> &Rope {
        &self.rope
    }

    pub fn inner_mut(&mut self) -> &mut Rope {
        &mut self.rope
    }
}
