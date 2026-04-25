//! UTF-8 utilities

/// Count UTF-8 characters in a byte slice (not Unicode scalar values, but grapheme clusters are not handled here)
pub fn byte_to_char_idx(text: &str, byte_idx: usize) -> usize {
    text[..byte_idx.min(text.len())].chars().count()
}

/// Convert character index to byte index
pub fn char_to_byte_idx(text: &str, char_idx: usize) -> usize {
    text.chars().take(char_idx).map(|c| c.len_utf8()).sum()
}

/// Count Chinese characters and words in text
pub fn count_words(text: &str) -> usize {
    let mut count = 0;
    let mut in_word = false;
    for ch in text.chars() {
        if ch >= '\u{4e00}' && ch <= '\u{9fa5}' {
            count += 1;
            in_word = false;
        } else if ch.is_whitespace() {
            in_word = false;
        } else if !in_word {
            count += 1;
            in_word = true;
        }
    }
    count
}
