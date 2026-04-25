//! Glyph atlas using cosmic-text: CPU-side text rendering to RGBA buffer

use cosmic_text::{Attrs, Buffer, Color, Family, FontSystem, Metrics, Shaping, SwashCache};

pub struct TextAtlas {
    pub font_system: FontSystem,
    pub swash_cache: SwashCache,
    pub cpu_buffer: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

impl TextAtlas {
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            font_system: FontSystem::new(),
            swash_cache: SwashCache::new(),
            cpu_buffer: vec![0u8; (width * height * 4) as usize],
            width,
            height,
        }
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        self.cpu_buffer = vec![0u8; (width * height * 4) as usize];
        self.width = width;
        self.height = height;
    }

    /// Render text into the CPU RGBA buffer using cosmic-text.
    /// Returns the number of layout lines.
    pub fn render_text(&mut self, text: &str, font_size: f32) -> usize {
        // Clear to transparent
        for pixel in self.cpu_buffer.chunks_exact_mut(4) {
            pixel[0] = 0;
            pixel[1] = 0;
            pixel[2] = 0;
            pixel[3] = 0;
        }

        let metrics = Metrics::new(font_size, font_size * 1.4);
        let mut buffer = Buffer::new(&mut self.font_system, metrics);

        buffer.set_text(
            &mut self.font_system,
            text,
            Attrs::new()
                .color(Color::rgb(255, 255, 255))
                .family(Family::Name("Microsoft YaHei")),
            Shaping::Advanced,
        );

        buffer.shape_until_scroll(&mut self.font_system, false);

        // Use cosmic-text's official Buffer::draw which computes correct pixel positions
        buffer.draw(
            &mut self.font_system,
            &mut self.swash_cache,
            Color::rgb(255, 255, 255),
            |x, y, _w, _h, color| {
                if x < 0 || x >= self.width as i32 || y < 0 || y >= self.height as i32 {
                    return;
                }
                let dst_idx = ((y as u32 * self.width + x as u32) * 4) as usize;
                if dst_idx + 3 >= self.cpu_buffer.len() {
                    return;
                }
                let (r, g, b, a) = color.as_rgba_tuple();
                let alpha = a as f32 / 255.0;
                self.cpu_buffer[dst_idx] = (r as f32 * alpha) as u8;
                self.cpu_buffer[dst_idx + 1] = (g as f32 * alpha) as u8;
                self.cpu_buffer[dst_idx + 2] = (b as f32 * alpha) as u8;
                self.cpu_buffer[dst_idx + 3] = a;
            },
        );

        buffer.lines.len()
    }
}
