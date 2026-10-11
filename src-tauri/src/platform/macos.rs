// macOS: CoreGraphics for the cursor, ~/Library for files, `open` for links.
//
// It works like Windows — the cursor can be read anywhere, so the island polls
// it for hover, click-through, Ctrl, clicks elsewhere and dragging — with less
// around it:
//   * no music card or dance (no public API says what plays);
//   * no buttons on notifications, no fullscreen quiet, no in-app update;
//   * the island takes focus when clicked (an NSWindow, not a panel).
// The system calls are declared by hand with their documented C signatures,
// so they need no extra crate.

use std::ffi::{c_char, c_void, CStr};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::{AppHandle, WebviewWindow};

use super::{LocalTime, Region};
use crate::music::MusicListener;

// ── Files ─────────────────────────────────────────────────────────────────────

/// Folder name under ~/Library/Application Support and ~/Library/Caches.
const APP_DIR: &str = "Candy";

fn home_dir() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."))
}

/// ~/Library/Application Support/Candy — preferences, watchlist, alerts.
pub fn config_dir() -> PathBuf {
    home_dir().join("Library").join("Application Support").join(APP_DIR)
}

/// ~/Library/Logs/Candy — the log.
pub fn local_dir() -> PathBuf {
    home_dir().join("Library").join("Logs").join(APP_DIR)
}

/// Creates `dir` and closes it to other users (the settings hold the wallets followed).
pub fn ensure_private_dir(dir: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700))
}

pub fn local_time() -> LocalTime {
    let mut tm: libc::tm = unsafe { std::mem::zeroed() };
    unsafe {
        let now = libc::time(std::ptr::null_mut());
        libc::localtime_r(&now, &mut tm);
    }
    LocalTime {
        year: (tm.tm_year + 1900) as u32,
        month: (tm.tm_mon + 1) as u32,
        day: tm.tm_mday as u32,
        hour: tm.tm_hour as u32,
        minute: tm.tm_min as u32,
        second: tm.tm_sec as u32,
    }
}

/// Nothing to set before the app starts.
pub fn prepare_environment() {}

// ── Processes ─────────────────────────────────────────────────────────────────

/// Hands an http(s) URL to the default browser. No shell is involved.
pub fn open_url(url: &str) {
    let _ = Command::new("open").arg(url).spawn();
}

/// Shows a folder of the app's own (the sounds folder) in Finder.
pub fn reveal_folder(path: &str) {
    let _ = Command::new("open").arg(path).spawn();
}

// ── Clipboard ─────────────────────────────────────────────────────────────────

/// Longer than any token link: more is not what the paste shortcut is for.
const CLIPBOARD_MAX: usize = 2048;

/// The clipboard's text for the paste shortcut (never logged: it is whatever
/// the user last copied), from the system's own pbpaste.
pub fn clipboard_text(_app: &AppHandle) -> Option<String> {
    let out = Command::new("pbpaste").output().ok()?;
    if !out.status.success() || out.stdout.len() > CLIPBOARD_MAX {
        return None;
    }
    String::from_utf8(out.stdout).ok()
}

// ── Desktop Candy window ──────────────────────────────────────────────────────

/// A window can be placed anywhere, and the cursor poll is there.
pub fn desktop_mode() -> super::DesktopMode {
    super::DesktopMode::Poll
}

/// Same as the island: on every Space, over fullscreen apps, out of the window cycle.
pub fn prepare_desktop_window(win: &WebviewWindow) -> bool {
    make_non_activating(win);
    true
}

/// The cursor poll toggles click-through from the body hit test instead.
pub fn set_desktop_shape(_win: &WebviewWindow, _shape: super::MouseShape) {}

// ── Music ─────────────────────────────────────────────────────────────────────

/// No public API tells what plays on a Mac: no music card, no dance.
pub fn media_watch(on: bool, _listener: MusicListener) {
    if on {
        crate::log::line("music: not on macOS");
    }
}

pub fn media_control(_action: &str, _value: Option<f64>) -> bool {
    false
}

// ── Cursor ────────────────────────────────────────────────────────────────────

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct CGPoint {
    x: f64,
    y: f64,
}

/// kCGEventSourceStateCombinedSessionState: what every input device does together.
const COMBINED_SESSION: i32 = 0;
/// kCGMouseButtonLeft.
const LEFT_BUTTON: u32 = 0;
/// kCGEventFlagMaskControl.
const CONTROL_FLAG: u64 = 0x0004_0000;

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventCreate(source: *const c_void) -> *mut c_void;
    fn CGEventGetLocation(event: *const c_void) -> CGPoint;
    fn CGEventSourceButtonState(state: i32, button: u32) -> bool;
    fn CGEventSourceFlagsState(state: i32) -> u64;
    fn CGGetDisplaysWithPoint(point: CGPoint, max: u32, displays: *mut u32, count: *mut u32) -> i32;
    fn CGDisplayCopyDisplayMode(display: u32) -> *mut c_void;
    fn CGDisplayModeGetWidth(mode: *const c_void) -> usize;
    fn CGDisplayModeGetPixelWidth(mode: *const c_void) -> usize;
    fn CGDisplayModeRelease(mode: *mut c_void);
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(cf: *const c_void);
}

/// The cursor can be read anywhere on screen: the island polls it.
pub const CURSOR_POLL: bool = true;

/// The display's pixels per point (2 on a Retina screen), as the window toolkit counts them.
fn scale_at(p: CGPoint) -> f64 {
    let mut display = 0u32;
    let mut count = 0u32;
    if unsafe { CGGetDisplaysWithPoint(p, 1, &mut display, &mut count) } != 0 || count == 0 {
        return 1.0;
    }
    let mode = unsafe { CGDisplayCopyDisplayMode(display) };
    if mode.is_null() {
        return 1.0;
    }
    let (points, pixels) = unsafe { (CGDisplayModeGetWidth(mode), CGDisplayModeGetPixelWidth(mode)) };
    unsafe { CGDisplayModeRelease(mode) };
    if points == 0 {
        1.0
    } else {
        pixels as f64 / points as f64
    }
}

/// Cursor position in physical pixels, the way the window toolkit places
/// windows: the global position in points (top-left origin) times the scale of
/// the display it is on.
pub fn cursor_physical() -> Option<(f64, f64)> {
    let event = unsafe { CGEventCreate(std::ptr::null()) };
    if event.is_null() {
        return None;
    }
    let p = unsafe { CGEventGetLocation(event) };
    unsafe { CFRelease(event) };
    let scale = scale_at(p);
    Some((p.x * scale, p.y * scale))
}

/// True while the left mouse button is held, wherever the cursor is. Clicks
/// outside the island never reach the window (it lets them through), so this
/// is how a click elsewhere is noticed.
pub fn left_button_down() -> bool {
    unsafe { CGEventSourceButtonState(COMBINED_SESSION, LEFT_BUTTON) }
}

/// True while Control is held. Over the island it lets the mouse through to
/// whatever is behind.
pub fn ctrl_down() -> bool {
    unsafe { CGEventSourceFlagsState(COMBINED_SESSION) & CONTROL_FLAG != 0 }
}

// ── Keyboard and account ──────────────────────────────────────────────────────

/// Not asked here: alerts never wait for a fullscreen app on a Mac.
pub fn fullscreen_busy() -> bool {
    false
}

/// No buttons on notifications here: the page sends the plain one.
pub fn alert_toast(_identifier: &str, _title: &str, _body: &str, _buttons: (&str, &str), _on_action: impl Fn(&str) + Send + 'static) -> bool {
    false
}

/// Ctrl+Alt is not AltGr on a Mac: a Ctrl+Alt shortcut types nothing.
pub fn ctrl_alt_types(_vk: u16, _shift: bool) -> Option<String> {
    None
}

/// The account's full name ("Ana Souza"), which macOS keeps in the passwd
/// entry's GECOS field; nothing when it is unset.
pub fn user_full_name() -> Option<String> {
    unsafe {
        let mut pwd: libc::passwd = std::mem::zeroed();
        let mut result: *mut libc::passwd = std::ptr::null_mut();
        let mut buf = vec![0 as libc::c_char; 16 * 1024];
        let rc = libc::getpwuid_r(libc::getuid(), &mut pwd, buf.as_mut_ptr(), buf.len(), &mut result);
        if rc != 0 || result.is_null() || pwd.pw_gecos.is_null() {
            return None;
        }
        let gecos = CStr::from_ptr(pwd.pw_gecos).to_string_lossy().into_owned();
        let name = gecos.split(',').next().unwrap_or("").trim().to_string();
        (!name.is_empty()).then_some(name)
    }
}

// ── Island window ─────────────────────────────────────────────────────────────

#[link(name = "objc")]
extern "C" {
    fn sel_registerName(name: *const c_char) -> *const c_void;
    fn objc_msgSend();
}

/// NSWindowCollectionBehavior: on every Space, stays put when Spaces switch,
/// left out of the window cycle (⌘`), shown over a fullscreen app.
const CAN_JOIN_ALL_SPACES: usize = 1 << 0;
const STATIONARY: usize = 1 << 4;
const IGNORES_CYCLE: usize = 1 << 6;
const FULL_SCREEN_AUXILIARY: usize = 1 << 8;

/// `[window setCollectionBehavior:…]`, on the main thread (AppKit's rule).
pub fn make_non_activating(win: &WebviewWindow) {
    let Ok(ns) = win.ns_window() else { return };
    let ns = ns as usize;
    let _ = win.run_on_main_thread(move || unsafe {
        let send: unsafe extern "C" fn(*mut c_void, *const c_void, usize) = std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
        let behaviour = CAN_JOIN_ALL_SPACES | STATIONARY | IGNORES_CYCLE | FULL_SCREEN_AUXILIARY;
        send(ns as *mut c_void, sel_registerName(c"setCollectionBehavior:".as_ptr()), behaviour);
    });
}

/// The window takes the keyboard whenever it is clicked: nothing to switch.
pub fn set_activating(_win: &WebviewWindow, _activating: bool) {}

/// Click-through comes from the cursor poll here (set_ignore_cursor_events),
/// not from an input region.
pub fn set_input_region(_win: &WebviewWindow, _rect: Region) {}

// ── Updates ───────────────────────────────────────────────────────────────────

/// Where an update's code would be unpacked: next to the build cache.
pub fn update_dir() -> PathBuf {
    home_dir().join("Library").join("Caches").join(APP_DIR).join("source")
}

/// Not yet: on a Mac the island says how to update by hand (README → Install).
pub fn unpack_and_install(_dir: &Path, _archive: &Path, _root: &Path) -> Result<(), String> {
    Err("on a Mac, update from the Candy folder: git pull (or a new ZIP), then npm ci and npm run setup".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn files_live_in_the_library() {
        assert!(config_dir().ends_with("Library/Application Support/Candy"));
        assert!(local_dir().ends_with("Library/Logs/Candy"));
    }

    #[test]
    fn private_dirs_are_closed_to_everyone_else() {
        use std::os::unix::fs::MetadataExt;
        let dir = std::env::temp_dir().join(format!("candy-priv-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();
        ensure_private_dir(&dir).unwrap();
        assert_eq!(std::fs::metadata(&dir).unwrap().mode() & 0o777, 0o700);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reads_the_cursor_and_the_buttons_without_crashing() {
        // On a CI runner there may be no display: only that it answers.
        let _ = cursor_physical();
        let _ = left_button_down();
        let _ = ctrl_down();
    }
}
