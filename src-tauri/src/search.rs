use regex::Regex;
use serde::Serialize;
use std::fs;
use std::io::{BufReader, Read};

#[derive(Serialize, Clone)]
pub struct SearchMatch {
    pub file_path: String,
    pub line_number: usize,
    pub line_text: String,
    pub match_start: usize,
    pub match_end: usize,
}

const EXCLUDED_NAMES: &[&str] = &[
    "node_modules", "target", "dist", "build", "out", ".git", ".svn", ".hg",
    "__pycache__", ".pytest_cache", ".next", ".nuxt", ".vuepress",
];

/// Maximum bytes to read from a single file (5 MB).
const MAX_FILE_BYTES: u64 = 5 * 1024 * 1024;
/// Maximum lines to scan per file.
const MAX_SCAN_LINES: usize = 50_000;
/// Maximum total matches before early termination.
const MAX_TOTAL_MATCHES: usize = 1_000;
/// Maximum characters of a line to return in results (avoid huge minified lines).
const MAX_LINE_CHARS: usize = 2_000;

/// Check if a file should be skipped during text search because it appears binary.
/// Reads the first 8KB and looks for null bytes. UTF-16 files (which contain
/// null bytes for ASCII chars via BOM) are explicitly allowed.
fn should_skip_as_binary(path: &str) -> Result<bool, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(file);
    let mut buf = vec![0u8; 8192];
    let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
    buf.truncate(n);

    // UTF-16 files contain null bytes for ASCII chars — don't treat as binary
    if buf.starts_with(&[0xFF, 0xFE]) || buf.starts_with(&[0xFE, 0xFF]) {
        return Ok(false);
    }

    Ok(buf.contains(&0))
}

fn should_skip_entry(name: &str) -> bool {
    name.starts_with('.') || EXCLUDED_NAMES.contains(&name)
}

/// Build a regex or literal matcher.
fn build_matcher(query: &str, case_sensitive: bool, regex_mode: bool) -> Result<Regex, String> {
    if query.is_empty() {
        return Err("搜索内容不能为空".to_string());
    }
    if regex_mode {
        let flags = if case_sensitive { "" } else { "(?i)" };
        let pattern = format!("{}{}", flags, query);
        Regex::new(&pattern).map_err(|e| format!("无效的正则表达式: {}", e))
    } else {
        let escaped = regex::escape(query);
        let flags = if case_sensitive { "" } else { "(?i)" };
        let pattern = format!("{}{}", flags, escaped);
        Regex::new(&pattern).map_err(|e| format!("搜索模式编译失败: {}", e))
    }
}

/// Search a single file for matches, with automatic encoding detection.
///
/// Reads the entire file (up to MAX_FILE_BYTES), detects encoding via
/// `smart_detect_encoding`, decodes to String, then searches line-by-line.
/// This supports GBK, Big5, UTF-16, Shift-JIS, and other encodings.
fn search_file(
    path: &str,
    matcher: &Regex,
    max_results: usize,
) -> Result<Vec<SearchMatch>, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    if !metadata.is_file() {
        return Ok(vec![]);
    }
    if metadata.len() > MAX_FILE_BYTES {
        return Ok(vec![]);
    }
    if should_skip_as_binary(path)? {
        return Ok(vec![]);
    }

    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let (text, _encoding) = crate::encoding::smart_detect_encoding(&bytes);
    let mut matches = Vec::new();

    for (line_number, line) in text.lines().enumerate() {
        if line_number >= MAX_SCAN_LINES {
            break;
        }

        for m in matcher.find_iter(line) {
            // Convert byte offsets to character offsets so JS String.slice() works correctly
            let match_char_start = line[..m.start()].chars().count();
            let match_char_end = match_char_start + line[m.start()..m.end()].chars().count();
            let line_char_len = line.chars().count();

            let (line_text, match_start, match_end) = if line_char_len > MAX_LINE_CHARS {
                // Truncate around the match to keep results useful (in character units)
                let match_mid = (match_char_start + match_char_end) / 2;
                let start = match_mid.saturating_sub(MAX_LINE_CHARS / 2);
                let end = (start + MAX_LINE_CHARS).min(line_char_len);
                let prefix = if start > 0 { "…" } else { "" };
                let suffix = if end < line_char_len { "…" } else { "" };

                // Convert character offsets back to byte offsets for slicing
                let byte_start = line.char_indices().nth(start).map(|(i, _)| i).unwrap_or(line.len());
                let byte_end = line.char_indices().nth(end).map(|(i, _)| i).unwrap_or(line.len());
                let text = format!("{}{}{}", prefix, &line[byte_start..byte_end], suffix);

                // Adjust match offsets to be relative to the truncated string
                let prefix_offset = prefix.chars().count();
                let adjusted_start = match_char_start.saturating_sub(start) + prefix_offset;
                let adjusted_end = match_char_end.saturating_sub(start) + prefix_offset;
                let adjusted_start = adjusted_start.min(text.chars().count());
                let adjusted_end = adjusted_end.min(text.chars().count());
                (text, adjusted_start, adjusted_end)
            } else {
                (line.to_string(), match_char_start, match_char_end)
            };
            matches.push(SearchMatch {
                file_path: path.to_string(),
                line_number: line_number + 1,
                line_text,
                match_start,
                match_end,
            });
            if matches.len() >= max_results {
                return Ok(matches);
            }
        }
    }

    Ok(matches)
}

/// Recursively search a directory.
pub fn search_directory_impl(
    dir: &str,
    query: &str,
    case_sensitive: bool,
    regex_mode: bool,
    max_results: usize,
) -> Result<Vec<SearchMatch>, String> {
    let matcher = build_matcher(query, case_sensitive, regex_mode)?;
    let mut results = Vec::new();
    let mut dirs_to_visit = vec![dir.to_string()];

    while let Some(current_dir) = dirs_to_visit.pop() {
        let entries = match fs::read_dir(&current_dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let name = entry.file_name().to_string_lossy().to_string();
            if should_skip_entry(&name) {
                continue;
            }
            let path = entry.path().to_string_lossy().to_string();
            let file_type = match entry.file_type() {
                Ok(ft) => ft,
                Err(_) => continue,
            };

            if file_type.is_dir() {
                dirs_to_visit.push(path);
            } else if file_type.is_file() {
                let remaining = max_results.saturating_sub(results.len());
                if remaining == 0 {
                    return Ok(results);
                }
                match search_file(&path, &matcher, remaining) {
                    Ok(mut file_matches) => results.append(&mut file_matches),
                    Err(_) => continue,
                }
            }
        }
    }

    Ok(results)
}

#[tauri::command]
pub fn search_directory(
    dir: String,
    query: String,
    case_sensitive: bool,
    regex_mode: bool,
    max_results: Option<usize>,
) -> Result<Vec<SearchMatch>, String> {
    let max = max_results.unwrap_or(MAX_TOTAL_MATCHES);
    search_directory_impl(&dir, &query, case_sensitive, regex_mode, max)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_file_with(content: &str) -> (std::path::PathBuf, String) {
        let dir = std::env::temp_dir();
        let id = COUNTER.fetch_add(1, Ordering::SeqCst);
        let name = format!("te2_search_test_{}_{}.txt", std::process::id(), id);
        let path = dir.join(&name);
        let mut file = std::fs::File::create(&path).unwrap();
        file.write_all(content.as_bytes()).unwrap();
        drop(file);
        (path, name)
    }

    #[test]
    fn test_search_file_ascii_char_offsets() {
        let (path, _name) = temp_file_with("hello world\nsecond line");
        let matcher = build_matcher("world", true, false).unwrap();
        let results = search_file(path.to_str().unwrap(), &matcher, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].line_number, 1);
        assert_eq!(results[0].match_start, 6);
        assert_eq!(results[0].match_end, 11);
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn test_search_file_chinese_char_offsets() {
        // Regression test: regex byte offsets must be converted to character
        // offsets so JS String.slice() in the frontend highlights correctly.
        let (path, _name) = temp_file_with("这是一个测试文本\n第二行内容");
        let matcher = build_matcher("测试", true, false).unwrap();
        let results = search_file(path.to_str().unwrap(), &matcher, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].line_number, 1);
        // Byte offset of "测试" would be 12; character offset should be 4.
        assert_eq!(results[0].match_start, 4);
        assert_eq!(results[0].match_end, 6);
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn test_search_file_chinese_with_prefix_char_offsets() {
        let (path, _name) = temp_file_with("前缀内容测试后缀\nanother");
        let matcher = build_matcher("测试", true, false).unwrap();
        let results = search_file(path.to_str().unwrap(), &matcher, 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].line_number, 1);
        assert_eq!(results[0].match_start, 4);
        assert_eq!(results[0].match_end, 6);
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn test_search_file_truncated_line_char_offsets() {
        // Build a line longer than MAX_LINE_CHARS (2000) with Chinese chars.
        let prefix = "开头".to_string();
        let middle = "测".repeat(3000);
        let line = format!("{}{}", prefix, middle);
        let (path, _name) = temp_file_with(&line);
        let matcher = build_matcher("测", true, false).unwrap();
        let results = search_file(path.to_str().unwrap(), &matcher, 10).unwrap();
        assert!(!results.is_empty());
        let m = &results[0];
        // match_start / match_end must be character offsets within the
        // truncated line_text, not byte offsets.
        assert!(m.match_start < m.line_text.chars().count());
        assert!(m.match_end <= m.line_text.chars().count());
        assert!(m.match_start < m.match_end);
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn test_search_file_case_insensitive() {
        let (path, _name) = temp_file_with("Hello World\nHELLO again");
        let matcher = build_matcher("hello", false, false).unwrap();
        let results = search_file(path.to_str().unwrap(), &matcher, 10).unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].match_start, 0);
        assert_eq!(results[0].match_end, 5);
        assert_eq!(results[1].match_start, 0);
        assert_eq!(results[1].match_end, 5);
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn test_search_file_regex_mode() {
        let (path, _name) = temp_file_with("foo123bar\nfoo456bar");
        let matcher = build_matcher(r"foo\d+bar", true, true).unwrap();
        let results = search_file(path.to_str().unwrap(), &matcher, 10).unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].match_start, 0);
        assert_eq!(results[0].match_end, 9);
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn test_search_file_max_results_early_stop() {
        let (path, _name) = temp_file_with("abc abc abc abc abc");
        let matcher = build_matcher("abc", true, false).unwrap();
        let results = search_file(path.to_str().unwrap(), &matcher, 3).unwrap();
        assert_eq!(results.len(), 3);
        std::fs::remove_file(&path).unwrap();
    }
}
