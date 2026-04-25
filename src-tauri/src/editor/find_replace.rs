//! Find and replace using simple string search

pub fn find_all(text: &str, query: &str, case_sensitive: bool) -> Vec<usize> {
    if query.is_empty() {
        return Vec::new();
    }
    let mut results = Vec::new();
    let search_text = if case_sensitive { text.to_string() } else { text.to_lowercase() };
    let search_query = if case_sensitive { query.to_string() } else { query.to_lowercase() };
    let mut start = 0;
    while let Some(pos) = search_text[start..].find(&search_query) {
        let absolute_pos = start + pos;
        results.push(absolute_pos);
        start = absolute_pos + search_query.len();
        if search_query.is_empty() {
            break;
        }
    }
    results
}

pub fn replace_all(text: &str, query: &str, replacement: &str, case_sensitive: bool) -> String {
    if query.is_empty() {
        return text.to_string();
    }
    let mut result = text.to_string();
    let search_query = if case_sensitive { query.to_string() } else { query.to_lowercase() };
    let search_text = if case_sensitive { text.to_string() } else { text.to_lowercase() };

    let mut offsets: Vec<usize> = Vec::new();
    let mut start = 0;
    while let Some(pos) = search_text[start..].find(&search_query) {
        let absolute_pos = start + pos;
        offsets.push(absolute_pos);
        start = absolute_pos + search_query.len();
    }

    // Replace from end to start to preserve offsets
    for &pos in offsets.iter().rev() {
        result.replace_range(pos..pos + query.len(), replacement);
    }

    result
}
