use tauri::Manager;
use std::fs;
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
        "gbk" | "gb2312" | "gb18030" => Ok(GBK),
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

#[derive(Serialize)]
struct ReadFileResult {
    text: String,
    encoding: String,
}

#[derive(Serialize, Clone)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command]
fn read_file_with_encoding(path: String, encoding: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;

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
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;

    // Check UTF-8 BOM first
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        let (cow, _, _) = UTF_8.decode(&bytes[3..]);
        return Ok(ReadFileResult {
            text: cow.into_owned(),
            encoding: "UTF-8 BOM".to_string(),
        });
    }

    let detected = detect_file_encoding(&bytes);
    let name = encoding_name_for_frontend(detected);
    let (cow, _, had_errors) = detected.decode(&bytes);
    if had_errors {
        // Some bytes could not be decoded, but return anyway
    }
    Ok(ReadFileResult {
        text: cow.into_owned(),
        encoding: name,
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
    fs::write(&path, bytes).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                let window = app.get_webview_window("main").unwrap();
                let _ = window.set_title("Text Editor");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_file_with_encoding,
            read_file_auto_detect,
            list_directory,
            write_file_with_encoding,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
