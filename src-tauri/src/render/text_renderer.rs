//! High-level text renderer: visible lines → glyph quads → wgpu render pass

use crate::render::wgpu_context::WgpuContext;

pub struct TextRenderer;

impl TextRenderer {
    pub fn new() -> Self {
        Self
    }

    pub fn render(&self, _ctx: &WgpuContext) {
        // TODO: render visible lines
    }
}
