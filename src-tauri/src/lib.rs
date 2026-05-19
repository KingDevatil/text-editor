use tauri::{Manager, Emitter};
use std::fs;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use encoding_rs::UTF_8;
use serde::Serialize;

mod encoding;
use encoding::{get_encoding, smart_detect_encoding};

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

/// File watcher manager — watches open files for external modifications.
struct FileWatcherManager {
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
    last_emitted: Arc<Mutex<HashMap<String, std::time::Instant>>>,
}

impl FileWatcherManager {
    fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
            last_emitted: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn watch(&self, app: tauri::AppHandle, path: String) -> Result<(), String> {
        let mut watchers = self.watchers.lock().map_err(|e| e.to_string())?;
        // Drop any existing watcher for this path
        watchers.remove(&path);

        let path_clone = path.clone();
        let app_clone = app.clone();
        let last_emitted = self.last_emitted.clone();

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<notify::Event, notify::Error>| {
                if let Ok(event) = res {
                    match event.kind {
                        notify::EventKind::Modify(_) | notify::EventKind::Create(_) => {
                            let now = std::time::Instant::now();
                            let mut map = last_emitted.lock().unwrap();
                            if let Some(last) = map.get(&path_clone) {
                                if now.duration_since(*last) < std::time::Duration::from_millis(500) {
                                    return;
                                }
                            }
                            map.insert(path_clone.clone(), now);
                            drop(map);
                            let _ = app_clone.emit("file-changed", path_clone.clone());
                        }
                        _ => {}
                    }
                }
            },
            Config::default(),
        )
        .map_err(|e| e.to_string())?;

        watcher
            .watch(std::path::Path::new(&path), RecursiveMode::NonRecursive)
            .map_err(|e| e.to_string())?;

        watchers.insert(path, watcher);
        Ok(())
    }

    fn unwatch(&self, path: &str) {
        let mut watchers = self.watchers.lock().unwrap();
        watchers.remove(path);
        let mut last = self.last_emitted.lock().unwrap();
        last.remove(path);
    }
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

    // Handle UTF-16 LE BOM
    if encoding.to_lowercase().starts_with("utf-16le") && bytes.starts_with(&[0xFF, 0xFE]) {
        let encoding_obj = get_encoding("utf-16le")?;
        let (cow, _, _) = encoding_obj.decode(&bytes[2..]);
        return Ok(cow.into_owned());
    }

    // Handle UTF-16 BE BOM
    if encoding.to_lowercase().starts_with("utf-16be") && bytes.starts_with(&[0xFE, 0xFF]) {
        let encoding_obj = get_encoding("utf-16be")?;
        let (cow, _, _) = encoding_obj.decode(&bytes[2..]);
        return Ok(cow.into_owned());
    }

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

    // Check UTF-16 LE BOM first (common for Chinese Excel exports)
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let (cow, _, _) = encoding_rs::UTF_16LE.decode(&bytes[2..]);
        return Ok(ReadFileResult {
            text: cow.into_owned(),
            encoding: "UTF-16LE".to_string(),
        });
    }

    // Check UTF-16 BE BOM
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let (cow, _, _) = encoding_rs::UTF_16BE.decode(&bytes[2..]);
        return Ok(ReadFileResult {
            text: cow.into_owned(),
            encoding: "UTF-16BE".to_string(),
        });
    }

    // Check UTF-8 BOM
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

    let (text, encoding) = if bytes.starts_with(&[0xFF, 0xFE]) {
        let (cow, _, _) = encoding_rs::UTF_16LE.decode(&bytes[2..]);
        (cow.into_owned(), "UTF-16LE".to_string())
    } else if bytes.starts_with(&[0xFE, 0xFF]) {
        let (cow, _, _) = encoding_rs::UTF_16BE.decode(&bytes[2..]);
        (cow.into_owned(), "UTF-16BE".to_string())
    } else if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
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

    let encoding_lower = encoding.to_lowercase();

    // Handle BOM for supported encodings
    if encoding_lower.starts_with("utf-8 bom") {
        bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    } else if encoding_lower.starts_with("utf-16le") {
        bytes.extend_from_slice(&[0xFF, 0xFE]);
    } else if encoding_lower.starts_with("utf-16be") {
        bytes.extend_from_slice(&[0xFE, 0xFF]);
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

    fs::write(&temp_path, bytes).map_err(|e| format!("写入临时文件失败: {}", e))?;

    if let Err(e) = fs::rename(&temp_path, &path) {
        let _ = fs::remove_file(&temp_path);
        let msg = match e.kind() {
            std::io::ErrorKind::PermissionDenied => {
                #[cfg(target_os = "windows")]
                {
                    if e.raw_os_error() == Some(32) {
                        format!("文件 \"{}\" 正被其他程序占用，无法保存。请关闭占用该文件的程序后重试。", path)
                    } else {
                        format!("保存失败：权限不足，无法写入文件 \"{}\"", path)
                    }
                }
                #[cfg(not(target_os = "windows"))]
                {
                    format!("保存失败：权限不足，无法写入文件 \"{}\"", path)
                }
            }
            std::io::ErrorKind::NotFound => format!("保存失败：文件 \"{}\" 不存在", path),
            _ => format!("保存失败：{}", e),
        };
        return Err(msg);
    }

    Ok(())
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

#[cfg(target_os = "windows")]
const SHCNE_ASSOCCHANGED: i32 = 0x08000000;
#[cfg(target_os = "windows")]
const SHCNF_FLUSHNOWAIT: u32 = 0x2000;

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
            // 1. Remove Windows UserChoice cache so our ProgID takes effect
            let user_choice_path = format!(
                "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\{}\\UserChoice",
                ext
            );
            // It's okay if the subkey doesn't exist — just means there's no prior user choice.
            let _ = hkcu.delete_subkey_all(&user_choice_path);

            // 2. Set ProgID for this extension
            let (ext_key, _) = classes
                .create_subkey(ext)
                .map_err(|e| format!("创建 {} 键失败: {}", ext, e))?;
            ext_key
                .set_value("", &"TextFile")
                .map_err(|e| format!("设置 {} 默认值失败: {}", ext, e))?;
            ext_key
                .set_value("PerceivedType", &"text")
                .map_err(|e| format!("设置 {} PerceivedType 失败: {}", ext, e))?;
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
            SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_FLUSHNOWAIT, std::ptr::null(), std::ptr::null());
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

#[tauri::command]
fn watch_file(app: tauri::AppHandle, state: tauri::State<'_, FileWatcherManager>, path: String) -> Result<(), String> {
    state.watch(app, path)
}

#[tauri::command]
fn unwatch_file(state: tauri::State<'_, FileWatcherManager>, path: String) {
    state.unwatch(&path);
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
        .manage(FileWatcherManager::new())
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
            watch_file,
            unwatch_file,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, _event| {
        // File open events on Windows are handled via single-instance plugin
        // and startup arguments in the setup hook above.
    });
}
