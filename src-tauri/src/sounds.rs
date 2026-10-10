// The trader's own sounds: a file named like one of Candy's sounds in the
// sounds folder plays instead of the synthesised one (open.wav, alert-up.mp3,
// greet.ogg…). The folder is platform::config_dir()/sounds: %APPDATA%\
// TraderCompanion\sounds on Windows, ~/.config/candy/sounds on Linux.
// Adapted from Coucou's sounds.rs (MIT, © Louis Raillé).
//
// The page decodes the bytes itself (src/core/sound.ts); a file it can't
// decode leaves the built-in sound in place.

use crate::platform;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

/// Formats a webview can usually decode, looked for in this order.
const EXTENSIONS: [&str; 10] = ["wav", "mp3", "ogg", "oga", "m4a", "aac", "flac", "aiff", "aif", "caf"];
/// A sound effect, not an album: anything bigger is left alone.
const MAX_BYTES: u64 = 8 * 1024 * 1024;

pub fn folder() -> PathBuf {
    platform::config_dir().join("sounds")
}

/// A sound's file name is a bare lowercase word with dashes ("alert-up"):
/// nothing that could leave the folder.
fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 32
        && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// The user's file for `name` in `dir`, if there is a usable one.
fn custom_file(dir: &Path, name: &str) -> Option<PathBuf> {
    if !valid_name(name) {
        return None;
    }
    EXTENSIONS.iter().map(|ext| dir.join(format!("{name}.{ext}"))).find(|p| {
        std::fs::metadata(p)
            .map(|m| m.is_file() && m.len() > 0 && m.len() <= MAX_BYTES)
            .unwrap_or(false)
    })
}

/// Which of `names` have a file of the user's own.
#[tauri::command]
pub fn custom_sounds(names: Vec<String>) -> Vec<String> {
    let dir = folder();
    names.into_iter().filter(|n| custom_file(&dir, n).is_some()).collect()
}

/// The bytes of the user's file for `name`, sent as they are.
#[tauri::command]
pub fn custom_sound(name: String) -> Result<tauri::ipc::Response, String> {
    let path = custom_file(&folder(), &name).ok_or_else(|| format!("no custom sound for {name}"))?;
    std::fs::read(&path).map(tauri::ipc::Response::new).map_err(|e| e.to_string())
}

/// Settings → Open sounds folder: creates it if needed and shows it.
#[tauri::command]
pub fn reveal_sounds_folder() {
    let dir = folder();
    let _ = std::fs::create_dir_all(&dir);
    platform::reveal_folder(&dir.to_string_lossy());
}

/// Settings → Reload: the island reads the folder again.
#[tauri::command]
pub fn reload_sounds(app: AppHandle) {
    let _ = app.emit("sounds-changed", ());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("candy-sounds-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_file_named_like_a_sound_replaces_it_in_the_first_format_found() {
        let dir = scratch("pick");
        std::fs::write(dir.join("alert-up.mp3"), b"mp3").unwrap();
        std::fs::write(dir.join("alert-up.wav"), b"wav").unwrap();
        assert_eq!(custom_file(&dir, "alert-up"), Some(dir.join("alert-up.wav")));
        std::fs::write(dir.join("greet.m4a"), b"m4a").unwrap();
        assert_eq!(custom_file(&dir, "greet"), Some(dir.join("greet.m4a")));
        assert_eq!(custom_file(&dir, "tada"), None);
    }

    #[test]
    fn nothing_outside_the_folder_or_unusable_is_read() {
        let dir = scratch("guard");
        std::fs::write(dir.join("empty.wav"), b"").unwrap();
        std::fs::create_dir_all(dir.join("folder.wav")).unwrap();
        std::fs::write(dir.join("notes.txt"), b"x").unwrap();
        assert_eq!(custom_file(&dir, "empty"), None);
        assert_eq!(custom_file(&dir, "folder"), None);
        assert_eq!(custom_file(&dir, "notes"), None);
        for bad in ["../open", "Open", "al ert", "", "a/b", "open.wav", "alertUp"] {
            assert!(!valid_name(bad), "{bad}");
        }
        assert!(valid_name("alert-up"));
    }
}
