// Windows: Win32 for the island window and the cursor, %APPDATA% for files.

use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

use tauri::WebviewWindow;

use ::windows::Win32::Foundation::{HWND, POINT};
use ::windows::Win32::System::SystemInformation::GetLocalTime;
use ::windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_LBUTTON};
use ::windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE,
    WS_EX_TOOLWINDOW,
};

use super::{LocalTime, Region};

/// Folder name under %APPDATA% and %LOCALAPPDATA%.
const APP_DIR: &str = "TraderCompanion";

/// Keeps spawned helpers from flashing a console window.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

// ── Files ─────────────────────────────────────────────────────────────────────

/// %APPDATA%\TraderCompanion — preferences, watchlist, alerts.
pub fn config_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join(APP_DIR)
}

/// %LOCALAPPDATA%\TraderCompanion — the log.
pub fn local_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join(APP_DIR)
}

/// Nothing to set before the app starts.
pub fn prepare_environment() {}

/// %APPDATA% and %LOCALAPPDATA% are already private to the user.
pub fn ensure_private_dir(dir: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)
}

pub fn local_time() -> LocalTime {
    let t = unsafe { GetLocalTime() };
    LocalTime {
        year: t.wYear.into(),
        month: t.wMonth.into(),
        day: t.wDay.into(),
        hour: t.wHour.into(),
        minute: t.wMinute.into(),
        second: t.wSecond.into(),
    }
}

// ── Processes ─────────────────────────────────────────────────────────────────

/// Hands an http(s) URL to the default browser. No shell is involved.
pub fn open_url(url: &str) {
    let _ = Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", url])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}

// ── Cursor ────────────────────────────────────────────────────────────────────

/// The cursor can be read anywhere on screen: the island polls it for hover,
/// click-through, Ctrl, clicks elsewhere and dragging (island::spawn_cursor_poll).
pub const CURSOR_POLL: bool = true;

/// Cursor position in physical screen pixels.
pub fn cursor_physical() -> Option<(f64, f64)> {
    let mut p = POINT::default();
    unsafe { GetCursorPos(&mut p).ok()? };
    Some((p.x as f64, p.y as f64))
}

/// True while the left mouse button is held, wherever the cursor is. Clicks
/// outside the island never reach the window (it lets them through), so this
/// is how a click elsewhere is noticed.
pub fn left_button_down() -> bool {
    unsafe { (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 & 0x8000) != 0 }
}

/// True while Ctrl is held. Over the island it lets the mouse through to
/// whatever is behind (a browser tab, a title bar).
pub fn ctrl_down() -> bool {
    unsafe { (GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0 }
}

// ── Island window ─────────────────────────────────────────────────────────────

fn hwnd_of(win: &WebviewWindow) -> Option<HWND> {
    let raw = win.hwnd().ok()?.0 as isize;
    if raw == 0 {
        return None;
    }
    Some(HWND(raw as *mut _))
}

/// WS_EX_NOACTIVATE keeps clicks from stealing focus; WS_EX_TOOLWINDOW keeps the
/// island out of Alt-Tab.
pub fn make_non_activating(win: &WebviewWindow) {
    let Some(hwnd) = hwnd_of(win) else { return };
    unsafe {
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let want = ex | WS_EX_NOACTIVATE.0 as isize | WS_EX_TOOLWINDOW.0 as isize;
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, want);
    }
}

/// Temporarily allow activation so a text field inside the island can be typed in.
pub fn set_activating(win: &WebviewWindow, activating: bool) {
    let Some(hwnd) = hwnd_of(win) else { return };
    unsafe {
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let want = if activating {
            ex & !(WS_EX_NOACTIVATE.0 as isize)
        } else {
            ex | WS_EX_NOACTIVATE.0 as isize
        };
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, want);
    }
}

/// Click-through comes from the cursor poll here (set_ignore_cursor_events),
/// not from an input region.
pub fn set_input_region(_win: &WebviewWindow, _rect: Region) {}

// ── Updates ───────────────────────────────────────────────────────────────────

/// Where an update's code is unpacked: next to the build cache (scripts/setup.mjs).
pub fn update_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("Candy-build").join("source")
}

/// Unpacks the update with Windows' own tar and starts its `Install Candy.cmd`
/// in update mode, in a window of its own: it shows its three steps, installs
/// silently (closing this Candy) and starts the new one.
pub fn unpack_and_install(dir: &std::path::Path, archive: &std::path::Path, root: &std::path::Path) -> Result<(), String> {
    let unpacked = Command::new("tar")
        .arg("-xzf")
        .arg(archive)
        .arg("-C")
        .arg(dir)
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| e.to_string())?;
    if !unpacked.success() {
        return Err("couldn't unpack the update".into());
    }
    let script = dir.join(root).join("Install Candy.cmd");
    if !script.is_file() {
        return Err(format!("no installer in the update ({})", script.display()));
    }
    Command::new("cmd.exe")
        .args(["/c", "start", "Updating Candy"])
        .arg(&script)
        .arg("--update")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
