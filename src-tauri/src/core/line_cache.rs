//! Line offset cache for fast line→char and char→line conversion
//!
//! ropey already provides efficient line conversion, so this is mostly a thin wrapper
//! for future optimizations (e.g., caching visible line widths).

pub struct LineCache {
    // Currently ropey handles this internally; we can add cached line widths here later
}

impl LineCache {
    pub fn new() -> Self {
        Self {}
    }

    pub fn invalidate(&mut self) {
        // Placeholder for future invalidation logic
    }
}
