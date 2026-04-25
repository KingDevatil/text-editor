//! Simple undo/redo stack

#[derive(Clone, Debug)]
pub enum EditOp {
    Insert { pos: usize, text: String },
    Delete { pos: usize, text: String },
}

pub struct UndoStack {
    stack: Vec<Vec<EditOp>>,
    redo_stack: Vec<Vec<EditOp>>,
    max_size: usize,
}

impl UndoStack {
    pub fn new() -> Self {
        Self { stack: Vec::new(), redo_stack: Vec::new(), max_size: 1000 }
    }

    pub fn push(&mut self, ops: Vec<EditOp>) {
        if self.stack.len() >= self.max_size {
            self.stack.remove(0);
        }
        self.stack.push(ops);
        self.redo_stack.clear();
    }

    pub fn undo(&mut self) -> Option<Vec<EditOp>> {
        if let Some(ops) = self.stack.pop() {
            self.redo_stack.push(ops.clone());
            Some(ops)
        } else {
            None
        }
    }

    pub fn redo(&mut self) -> Option<Vec<EditOp>> {
        if let Some(ops) = self.redo_stack.pop() {
            self.stack.push(ops.clone());
            Some(ops)
        } else {
            None
        }
    }

    pub fn can_undo(&self) -> bool {
        !self.stack.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }
}
