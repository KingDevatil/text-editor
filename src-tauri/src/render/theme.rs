//! Theme colors

#[derive(Clone, Debug)]
pub struct Theme {
    pub background: [f32; 4],
    pub foreground: [f32; 4],
    pub line_number: [f32; 4],
    pub cursor: [f32; 4],
    pub selection: [f32; 4],
}

impl Default for Theme {
    fn default() -> Self {
        Self {
            background: [0.12, 0.12, 0.14, 1.0], // dark bg
            foreground: [0.85, 0.85, 0.85, 1.0], // light text
            line_number: [0.5, 0.5, 0.5, 1.0],
            cursor: [0.9, 0.9, 0.9, 1.0],
            selection: [0.2, 0.4, 0.7, 0.4],
        }
    }
}
