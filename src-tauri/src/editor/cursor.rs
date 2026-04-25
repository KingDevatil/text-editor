//! Cursor and selection management (single cursor for now, multi-cursor later)

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Cursor {
    pub pos: usize,     // character index
    pub line: usize,
    pub col: usize,
}

impl Cursor {
    pub fn new() -> Self {
        Self { pos: 0, line: 0, col: 0 }
    }

    pub fn set_pos(&mut self, pos: usize, line: usize, col: usize) {
        self.pos = pos;
        self.line = line;
        self.col = col;
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Selection {
    pub anchor: usize,
    pub head: usize,
}

impl Selection {
    pub fn new() -> Self {
        Self { anchor: 0, head: 0 }
    }

    pub fn is_empty(&self) -> bool {
        self.anchor == self.head
    }

    pub fn range(&self) -> std::ops::Range<usize> {
        if self.anchor <= self.head {
            self.anchor..self.head
        } else {
            self.head..self.anchor
        }
    }
}
