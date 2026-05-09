use tauri::{Manager, Emitter};
use std::fs;
use std::sync::Mutex;
use encoding_rs::{
    Encoding, UTF_8, GBK, BIG5, SHIFT_JIS, EUC_JP, EUC_KR, ISO_2022_JP,
    ISO_8859_2, ISO_8859_5, ISO_8859_7, KOI8_R, KOI8_U, MACINTOSH,
    WINDOWS_874, WINDOWS_1250, WINDOWS_1251, WINDOWS_1252, WINDOWS_1253,
    WINDOWS_1254, WINDOWS_1255, WINDOWS_1256, WINDOWS_1257, WINDOWS_1258,
    X_MAC_CYRILLIC, IBM866,
};
use chardetng::EncodingDetector;
use serde::Serialize;


fn get_encoding(name: &str) -> Result<&'static Encoding, String> {
    match name.to_lowercase().as_str() {
        "utf-8" | "utf8" | "utf-8 bom" => Ok(UTF_8),
        "ansi" => Ok(WINDOWS_1252),
        "gbk" | "gb2312" => Ok(GBK),
        "gb18030" => Ok(encoding_rs::GB18030),
        "big5" => Ok(BIG5),
        "shift-jis" | "shift_jis" | "sjis" => Ok(SHIFT_JIS),
        "euc-jp" | "euc_jp" => Ok(EUC_JP),
        "euc-kr" | "euc_kr" => Ok(EUC_KR),
        "iso-2022-jp" | "iso_2022_jp" => Ok(ISO_2022_JP),
        "iso-8859-2" | "iso_8859_2" => Ok(ISO_8859_2),
        "iso-8859-5" | "iso_8859_5" => Ok(ISO_8859_5),
        "iso-8859-7" | "iso_8859_7" => Ok(ISO_8859_7),
        "iso-8859-9" | "iso_8859_9" => Ok(WINDOWS_1254),
        "koi8-r" | "koi8_r" => Ok(KOI8_R),
        "koi8-u" | "koi8_u" => Ok(KOI8_U),
        "macintosh" | "mac" => Ok(MACINTOSH),
        "windows-874" | "cp874" => Ok(WINDOWS_874),
        "windows-1250" | "cp1250" => Ok(WINDOWS_1250),
        "windows-1251" | "cp1251" => Ok(WINDOWS_1251),
        "windows-1252" | "cp1252" => Ok(WINDOWS_1252),
        "windows-1253" | "cp1253" => Ok(WINDOWS_1253),
        "windows-1254" | "cp1254" => Ok(WINDOWS_1254),
        "windows-1255" | "cp1255" => Ok(WINDOWS_1255),
        "windows-1256" | "cp1256" => Ok(WINDOWS_1256),
        "windows-1257" | "cp1257" => Ok(WINDOWS_1257),
        "windows-1258" | "cp1258" => Ok(WINDOWS_1258),
        "x-mac-cyrillic" | "x_mac_cyrillic" => Ok(X_MAC_CYRILLIC),
        "ibm866" | "cp866" => Ok(IBM866),
        "iso-8859-1" | "latin1" => Ok(WINDOWS_1252),
        _ => Err(format!("Unsupported encoding: {}", name)),
    }
}

/// Map encoding_rs name to frontend display name
fn encoding_name_for_frontend(encoding: &'static Encoding) -> String {
    match encoding.name() {
        "UTF-8" => "UTF-8".to_string(),
        "GBK" => "GBK".to_string(),
        "GB18030" => "GB18030".to_string(),
        "Big5" => "BIG5".to_string(),
        "Shift_JIS" => "Shift-JIS".to_string(),
        "EUC-JP" => "EUC-JP".to_string(),
        "EUC-KR" => "EUC-KR".to_string(),
        "ISO-2022-JP" => "ISO-2022-JP".to_string(),
        "ISO-8859-2" => "ISO-8859-2".to_string(),
        "ISO-8859-5" => "ISO-8859-5".to_string(),
        "ISO-8859-7" => "ISO-8859-7".to_string(),
        "ISO-8859-9" => "ISO-8859-9".to_string(),
        "KOI8-R" => "KOI8-R".to_string(),
        "KOI8-U" => "KOI8-U".to_string(),
        "macintosh" => "Macintosh".to_string(),
        "windows-874" => "Windows-874".to_string(),
        "windows-1250" => "Windows-1250".to_string(),
        "windows-1251" => "Windows-1251".to_string(),
        "windows-1252" => "Windows-1252".to_string(),
        "windows-1253" => "Windows-1253".to_string(),
        "windows-1254" => "Windows-1254".to_string(),
        "windows-1255" => "Windows-1255".to_string(),
        "windows-1256" => "Windows-1256".to_string(),
        "windows-1257" => "Windows-1257".to_string(),
        "windows-1258" => "Windows-1258".to_string(),
        "x-mac-cyrillic" => "X-Mac-Cyrillic".to_string(),
        "IBM866" => "IBM866".to_string(),
        other => other.to_string(),
    }
}

/// Detect file encoding from raw bytes using chardetng (Mozilla Firefox algorithm)
fn detect_file_encoding(bytes: &[u8]) -> &'static Encoding {
    let mut detector = EncodingDetector::new(chardetng::Iso2022JpDetection::Allow);
    detector.feed(bytes, true);
    detector.guess(None, chardetng::Utf8Detection::Allow)
}

/// Try decoding with a candidate encoding and return whether it succeeded without errors.
fn try_decode(bytes: &[u8], encoding: &'static Encoding) -> Option<String> {
    let (cow, _, had_errors) = encoding.decode(bytes);
    if had_errors {
        None
    } else {
        Some(cow.into_owned())
    }
}

/// Smart encoding detection with fallback chain:
/// 1. UTF-8 (most common modern encoding)
/// 2. GBK (Chinese Windows legacy files)
/// 3. chardetng statistical detection (fallback)
/// 4. If chardetng result has decoding errors, try GBK/UTF-8 as final fallback
fn smart_detect_encoding(bytes: &[u8]) -> (String, String) {
    // 1. Check UTF-8 BOM first
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        let (cow, _, _) = UTF_8.decode(&bytes[3..]);
        return (cow.into_owned(), "UTF-8 BOM".to_string());
    }

    // 2. Try UTF-8 first (most common) - use full bytes, no sample truncation.
    // Sample truncation was cutting GBK/UTF-8 multi-byte sequences at 64KB boundaries,
    // causing false negatives and chardetng fallback to Windows-1252.
    if let Some(text) = try_decode(bytes, UTF_8) {
        return (text, "UTF-8".to_string());
    }

    // 3. Try GB18030 first (superset of GBK, avoids misidentifying GB18030 as GBK)
    let gb18030 = encoding_rs::GB18030;
    if let Some(text) = try_decode(bytes, gb18030) {
        return (text, "GB18030".to_string());
    }

    // 4. Try GBK (Chinese Windows legacy) - use full bytes
    if let Some(text) = try_decode(bytes, GBK) {
        return (text, "GBK".to_string());
    }

    // 5. Fallback to chardetng statistical detection (on a safely-truncated sample).
    // chardetng is statistical and fast even on small samples, so we truncate
    // at a safe boundary to avoid splitting multi-byte sequences.
    const SAMPLE_SIZE: usize = 64 * 1024;
    let sample = if bytes.len() > SAMPLE_SIZE {
        let mut end = SAMPLE_SIZE;
        let min_end = SAMPLE_SIZE.saturating_sub(6);
        // Walk back to avoid cutting in the middle of a multi-byte sequence.
        // Max sequence length: UTF-8 = 4 bytes, GB18030 = 4 bytes.
        while end > min_end && bytes[end - 1] >= 0x80 {
            end -= 1;
        }
        &bytes[..end]
    } else {
        bytes
    };
    let detected = detect_file_encoding(sample);
    let detected_name = encoding_name_for_frontend(detected);
    let (cow, _, had_errors) = detected.decode(bytes);
    if !had_errors {
        return (cow.into_owned(), detected_name);
    }

    // 6. Final fallback: GBK with replacement chars
    let (cow, _, _) = GBK.decode(bytes);
    (cow.into_owned(), "GBK".to_string())
}

#[derive(Serialize)]
struct ReadFileResult {
    text: String,
    encoding: String,
}

#[derive(Serialize)]
struct FileMeta {
    file_size: usize,
    encoding: String,
    total_lines: usize,
    first_chunk: String,
}

#[derive(Serialize, Clone)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[derive(Default)]
struct AppState {
    pending_files: Mutex<Vec<String>>,
}

/// Read file bytes (mmap removed: to_vec() negates zero-copy benefit;
/// fs::read is simpler and equally efficient for our sequential-read use case)
fn read_file_bytes_inner(path: &str) -> Result<Vec<u8>, String> {
    fs::read(path).map_err(|e| e.to_string())
}

/// Read only the first N bytes of a file (for sampling / progressive loading).
/// Truncates at the last newline to avoid cutting multi-byte characters (GBK/GB18030
/// etc.) mid-sequence, which would cause decoding errors and chardetng fallback to
/// Windows-1252.
fn read_file_head_bytes(path: &str, max_bytes: usize) -> Result<Vec<u8>, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    if metadata.len() <= max_bytes as u64 {
        fs::read(path).map_err(|e| e.to_string())
    } else {
        use std::io::Read;
        let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; max_bytes];
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        buf.truncate(n);
        // Truncate at the last newline so no multi-byte character is split.
        if let Some(last_nl) = buf.iter().rposition(|&b| b == b'\n') {
            buf.truncate(last_nl + 1);
        }
        Ok(buf)
    }
}

#[tauri::command]
fn read_file_with_encoding(path: String, encoding: String) -> Result<String, String> {
    let bytes = read_file_bytes_inner(&path)?;

    // Handle UTF-8 BOM
    if encoding.to_lowercase().starts_with("utf-8") && bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        let encoding_obj = get_encoding("utf-8")?;
        let (cow, _, _) = encoding_obj.decode(&bytes[3..]);
        return Ok(cow.into_owned());
    }

    let encoding_obj = get_encoding(&encoding)?;
    let (cow, _, had_errors) = encoding_obj.decode(&bytes);
    if had_errors {
        // Return content even if there were decoding errors (may contain replacement chars)
    }
    Ok(cow.into_owned())
}

#[tauri::command]
fn read_file_auto_detect(path: String) -> Result<ReadFileResult, String> {
    let bytes = read_file_bytes_inner(&path)?;

    // Check UTF-8 BOM first
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        let (cow, _, _) = UTF_8.decode(&bytes[3..]);
        return Ok(ReadFileResult {
            text: cow.into_owned(),
            encoding: "UTF-8 BOM".to_string(),
        });
    }

    let (text, encoding) = smart_detect_encoding(&bytes);
    Ok(ReadFileResult { text, encoding })
}

/// Return raw bytes for zero-copy IPC (avoid JSON string serialization overhead)
#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    read_file_bytes_inner(&path)
}

/// Progressive loading: return metadata + first 1000 lines for instant display
/// Only reads the first 256KB of the file to avoid decoding multi-MB content just for preview
#[tauri::command]
fn read_file_meta(path: String) -> Result<FileMeta, String> {
    let full_metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    let file_size = full_metadata.len() as usize;

    // Only decode first 256KB to get the first 1000 lines quickly
    const HEAD_BYTES: usize = 256 * 1024;
    let bytes = read_file_head_bytes(&path, HEAD_BYTES)?;

    let (text, encoding) = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        let (cow, _, _) = UTF_8.decode(&bytes[3..]);
        (cow.into_owned(), "UTF-8 BOM".to_string())
    } else {
        smart_detect_encoding(&bytes)
    };

    let total_lines_approx = text.lines().count();
    let first_chunk = text.lines().take(1000).collect::<Vec<_>>().join("\n");

    Ok(FileMeta {
        file_size,
        encoding,
        total_lines: total_lines_approx,
        first_chunk,
    })
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let mut entries: Vec<DirEntry> = Vec::new();
    let dir = fs::read_dir(&path).map_err(|e| e.to_string())?;
    const EXCLUDED_NAMES: &[&str] = &[
        "node_modules", "target", "dist", "build", "out", ".git", ".svn", ".hg",
        "__pycache__", ".pytest_cache", ".next", ".nuxt", ".vuepress",
    ];

    for entry in dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        // Skip hidden files/folders and common build/output directories
        if name.starts_with('.') || EXCLUDED_NAMES.contains(&name.as_str()) {
            continue;
        }
        let path_str = entry.path().to_string_lossy().to_string();
        let is_dir = entry.file_type().map_err(|e| e.to_string())?.is_dir();
        entries.push(DirEntry {
            name,
            path: path_str,
            is_dir,
        });
    }

    // Sort: directories first, then files, both alphabetically (case-insensitive)
    entries.sort_by(|a, b| {
        match (b.is_dir, a.is_dir) {
            (true, false) => std::cmp::Ordering::Greater,
            (false, true) => std::cmp::Ordering::Less,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

#[tauri::command]
fn write_file_with_encoding(path: String, content: String, encoding: String) -> Result<(), String> {
    let encoding_obj = get_encoding(&encoding)?;
    let mut bytes: Vec<u8> = Vec::new();

    // Handle UTF-8 BOM
    if encoding.to_lowercase().starts_with("utf-8 bom") {
        bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }

    let (encoded, _, _) = encoding_obj.encode(&content);
    bytes.extend_from_slice(&encoded);

    // Atomic write: write to temp file, then rename to avoid partial writes
    let path_obj = std::path::Path::new(&path);
    let parent = path_obj.parent().ok_or("Invalid file path: no parent directory")?;
    let file_name = path_obj.file_name().ok_or("Invalid file path: no file name")?;

    let mut temp_path = parent.to_path_buf();
    let temp_name = format!("~{}.tmp", file_name.to_string_lossy());
    temp_path.push(&temp_name);

    fs::write(&temp_path, bytes).map_err(|e| e.to_string())?;
    fs::rename(&temp_path, &path).map_err(|e| format!("Failed to rename temp file: {}", e))
}

#[tauri::command]
fn get_pending_files(state: tauri::State<AppState>) -> Vec<String> {
    let mut files = state.pending_files.lock().unwrap();
    let result = files.clone();
    files.clear();
    result
}

/// Reveal a file or folder in the system's file manager
#[tauri::command]
fn reveal_in_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| format!("无法打开文件夹: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("无法打开文件夹: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        let path_obj = std::path::Path::new(&path);
        let target = if path_obj.is_file() {
            path_obj.parent().unwrap_or(path_obj)
        } else {
            path_obj
        };
        use std::process::Command;
        Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| format!("无法打开文件夹: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
fn register_as_default_app() -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        return Err("此功能仅在 Windows 上可用".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_path_str = exe_path.to_string_lossy().to_string();

        // HKEY_CURRENT_USER\Software\Classes is the per-user HKCR
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let classes = hkcu
            .open_subkey_with_flags("Software\\Classes", KEY_WRITE)
            .map_err(|e| format!("打开注册表失败: {}", e))?;

        // Register TextFile type with open command
        let (textfile_key, _) = classes
            .create_subkey("TextFile")
            .map_err(|e| format!("创建 TextFile 键失败: {}", e))?;
        textfile_key
            .set_value("", &"Text Document")
            .map_err(|e| format!("设置 TextFile 默认值失败: {}", e))?;

        let (shell_key, _) = textfile_key
            .create_subkey("shell")
            .map_err(|e| format!("创建 shell 键失败: {}", e))?;
        shell_key
            .set_value("", &"open")
            .map_err(|e| format!("设置默认 shell 失败: {}", e))?;

        let (open_key, _) = shell_key
            .create_subkey("open")
            .map_err(|e| format!("创建 open 键失败: {}", e))?;
        open_key
            .set_value("", &"打开")
            .map_err(|e| format!("设置 open 标签失败: {}", e))?;

        let (command_key, _) = open_key
            .create_subkey("command")
            .map_err(|e| format!("创建 command 键失败: {}", e))?;
        let command = format!("\"{}\" \"%1\"", exe_path_str);
        command_key
            .set_value("", &command)
            .map_err(|e| format!("设置命令失败: {}", e))?;

        // Register common text file extensions
        let extensions = [
            ".txt", ".md", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts",
            ".html", ".htm", ".xhtml", ".css", ".scss", ".sass", ".less",
            ".json", ".jsonc", ".json5", ".py", ".pyw", ".java", ".cpp", ".cc", ".cxx",
            ".c", ".h", ".hpp", ".cs", ".rs", ".go", ".mdx", ".yml", ".yaml",
            ".xml", ".svg", ".ini", ".cfg", ".inf", ".csv", ".tsv", ".env",
            ".properties", ".log", ".sh", ".bash", ".zsh", ".bat", ".cmd", ".ps1",
            ".toml", ".vue", ".svelte", ".astro", ".rb", ".php", ".swift", ".kt",
            ".scala", ".r", ".lua", ".pl",
        ];

        for ext in extensions {
            let (ext_key, _) = classes
                .create_subkey(ext)
                .map_err(|e| format!("创建 {} 键失败: {}", ext, e))?;
            ext_key
                .set_value("", &"TextFile")
                .map_err(|e| format!("设置 {} 默认值失败: {}", ext, e))?;
        }

        // Notify Windows to refresh file associations
        unsafe {
            extern "system" {
                fn SHChangeNotify(
                    wEventId: i32,
                    uFlags: u32,
                    dwItem1: *const std::ffi::c_void,
                    dwItem2: *const std::ffi::c_void,
                );
            }
            SHChangeNotify(0x08000000, 0, std::ptr::null(), std::ptr::null());
        }

        Ok(format!(
            "已成功将 Text Editor 注册为 {} 种文件类型的默认打开方式",
            extensions.len()
        ))
    }
}

#[tauri::command]
fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_maximize(window: tauri::Window) -> Result<bool, String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        window.maximize().map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| format!("重命名文件失败: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Collect startup file paths from command line arguments
    let args: Vec<String> = std::env::args().collect();
    let startup_files: Vec<String> = args.iter().skip(1)
        .filter(|arg| {
            let path = std::path::Path::new(arg);
            path.exists() && path.is_file()
        })
        .cloned()
        .collect();

    let app_state = AppState {
        pending_files: Mutex::new(startup_files),
    };

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                // Restore window from minimized state before focusing,
                // otherwise set_focus has no effect when the window is minimized.
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            
            // When app is already running and a new file is opened,
            // emit open-file event for each valid file path
            if argv.len() > 1 {
                for arg in &argv[1..] {
                    let path = std::path::Path::new(arg);
                    if path.exists() && path.is_file() {
                        let _ = app.emit("open-file", arg);
                    }
                }
            }
        }))
        .manage(app_state)
        .setup(|app| {
            #[cfg(desktop)]
            {
                let window = app.get_webview_window("main").unwrap();
                let _ = window.set_title("Text Editor");
                let _ = window.show();
            }
            // Warm up encoding detection libraries (avoid cold-start on first file open)
            let _ = smart_detect_encoding(b"warmup");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_file_with_encoding,
            read_file_auto_detect,
            read_file_bytes,
            read_file_meta,
            list_directory,
            write_file_with_encoding,
            get_pending_files,
            reveal_in_folder,
            register_as_default_app,
            window_minimize,
            window_maximize,
            window_close,
            rename_file,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, _event| {
        // File open events on Windows are handled via single-instance plugin
        // and startup arguments in the setup hook above.
    });
}
