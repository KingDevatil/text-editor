use encoding_rs::{
    Encoding, UTF_8, GBK, BIG5, SHIFT_JIS, EUC_JP, EUC_KR, ISO_2022_JP,
    ISO_8859_2, ISO_8859_5, ISO_8859_7, KOI8_R, KOI8_U, MACINTOSH,
    WINDOWS_874, WINDOWS_1250, WINDOWS_1251, WINDOWS_1252, WINDOWS_1253,
    WINDOWS_1254, WINDOWS_1255, WINDOWS_1256, WINDOWS_1257, WINDOWS_1258,
    X_MAC_CYRILLIC, IBM866,
};
use chardetng::EncodingDetector;

pub fn get_encoding(name: &str) -> Result<&'static Encoding, String> {
    match name.to_lowercase().as_str() {
        "utf-8" | "utf8" | "utf-8 bom" => Ok(UTF_8),
        "utf-16" | "utf-16le" | "utf-16 le" => Ok(encoding_rs::UTF_16LE),
        "utf-16be" | "utf-16 be" => Ok(encoding_rs::UTF_16BE),
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
pub fn encoding_name_for_frontend(encoding: &'static Encoding) -> String {
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
pub fn detect_file_encoding(bytes: &[u8]) -> &'static Encoding {
    let mut detector = EncodingDetector::new(chardetng::Iso2022JpDetection::Allow);
    detector.feed(bytes, true);
    detector.guess(None, chardetng::Utf8Detection::Allow)
}

/// Try decoding with a candidate encoding and return whether it succeeded without errors.
pub fn try_decode(bytes: &[u8], encoding: &'static Encoding) -> Option<String> {
    let (cow, _, had_errors) = encoding.decode(bytes);
    if had_errors {
        None
    } else {
        Some(cow.into_owned())
    }
}

/// Smart encoding detection with fallback chain:
/// 1. UTF-16 LE BOM (common for Chinese Excel exports)
/// 2. UTF-16 BE BOM
/// 3. UTF-8 BOM
/// 4. UTF-8 (most common modern encoding)
/// 5. GB18030 (superset of GBK)
/// 6. GBK (Chinese Windows legacy)
/// 7. chardetng statistical detection (on safely-truncated sample)
/// 8. Final fallback: GBK with replacement chars
pub fn smart_detect_encoding(bytes: &[u8]) -> (String, String) {
    // 1. Check UTF-16 LE BOM first
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let (cow, _, _) = encoding_rs::UTF_16LE.decode(&bytes[2..]);
        return (cow.into_owned(), "UTF-16LE".to_string());
    }

    // 2. Check UTF-16 BE BOM
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let (cow, _, _) = encoding_rs::UTF_16BE.decode(&bytes[2..]);
        return (cow.into_owned(), "UTF-16BE".to_string());
    }

    // 3. Check UTF-8 BOM
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        let (cow, _, _) = UTF_8.decode(&bytes[3..]);
        return (cow.into_owned(), "UTF-8 BOM".to_string());
    }

    // 4. Try UTF-8 first (most common) - use full bytes, no sample truncation.
    if let Some(text) = try_decode(bytes, UTF_8) {
        return (text, "UTF-8".to_string());
    }

    // 5. Try GB18030 first (superset of GBK, avoids misidentifying GB18030 as GBK)
    let gb18030 = encoding_rs::GB18030;
    if let Some(text) = try_decode(bytes, gb18030) {
        return (text, "GB18030".to_string());
    }

    // 6. Try GBK (Chinese Windows legacy) - use full bytes
    if let Some(text) = try_decode(bytes, GBK) {
        return (text, "GBK".to_string());
    }

    // 7. Fallback to chardetng statistical detection (on a safely-truncated sample).
    const SAMPLE_SIZE: usize = 64 * 1024;
    let sample = if bytes.len() > SAMPLE_SIZE {
        let mut end = SAMPLE_SIZE;
        let min_end = SAMPLE_SIZE.saturating_sub(6);
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

    // 8. Final fallback: GBK with replacement chars
    let (cow, _, _) = GBK.decode(bytes);
    (cow.into_owned(), "GBK".to_string())
}
