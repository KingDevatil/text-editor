use tauri::Manager;
use std::fs;
use std::path::Path;
use encoding_rs::{Encoding, UTF_8, GBK, BIG5, SHIFT_JIS, EUC_KR, WINDOWS_1252, ISO_8859_1};

fn get_encoding(name: &str) -> Result<&'static Encoding, String> {
    match name.to_lowercase().as_str() {
        "utf-8" | "utf8" => Ok(UTF_8),
        "gbk" | "gb2312" | "gb18030" => Ok(GBK),
        "big5" => Ok(BIG5),
        "shift-jis" | "shift_jis" | "sjis" => Ok(SHIFT_JIS),
        "euc-kr" | "euc_kr" => Ok(EUC_KR),
        "windows-1252" | "cp1252" => Ok(WINDOWS_1252),
        "iso-8859-1" | "latin1" => Ok(ISO_8859_1),
        _ => Err(format!("Unsupported encoding: {}", name)),
    }
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
            write_file_with_encoding,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
