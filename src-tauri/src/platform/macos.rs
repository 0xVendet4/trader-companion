// macOS: CoreGraphics for the cursor, ~/Library for files, `open` for links.
//
// It works like Windows — the cursor can be read anywhere, so the island polls
// it for hover, click-through, Ctrl, clicks elsewhere and dragging — with less
// around it (and, on a MacBook with a notch, the top island around the notch):
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
    fn objc_getClass(name: *const c_char) -> *mut c_void;
    fn objc_msgSend();
    fn object_getClass(obj: *mut c_void) -> *mut c_void;
    fn class_getInstanceMethod(cls: *mut c_void, name: *const c_void) -> *mut c_void;
    fn method_getImplementation(method: *mut c_void) -> *const c_void;
    fn method_getTypeEncoding(method: *mut c_void) -> *const c_char;
    fn class_replaceMethod(cls: *mut c_void, name: *const c_void, imp: *const c_void, types: *const c_char) -> *const c_void;
}

/// libdispatch's main queue (dispatch_get_main_queue() is a macro for it).
#[repr(C)]
struct DispatchQueue {
    _private: [u8; 0],
}

extern "C" {
    static _dispatch_main_q: DispatchQueue;
    fn dispatch_async_f(queue: *const DispatchQueue, context: *mut c_void, work: extern "C" fn(*mut c_void));
}

fn sel(name: &CStr) -> *const c_void {
    unsafe { sel_registerName(name.as_ptr()) }
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

/// NSMainMenuWindowLevel (24) + 3: over the menu bar and its icons, under the
/// menus that open from it (101), as the apps that live in the notch do.
const OVER_MENU_BAR: isize = 27;

extern "C" fn set_island_level(ns: *mut c_void) {
    unsafe {
        let send: unsafe extern "C" fn(*mut c_void, *const c_void, isize) = std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
        send(ns, sel(c"setLevel:"), OVER_MENU_BAR);
    }
}

/// The island stays over everything, the menu bar included: `[window
/// setLevel:]` on the main queue, where the window toolkit queues its own moves
/// and resizes (so it lands after them). Not tao's always-on-top, whose level
/// is under the menu bar. And AppKit may not push the island below the menu bar.
pub fn keep_on_top(win: &WebviewWindow) {
    let Ok(ns) = win.ns_window() else { return };
    #[cfg(target_arch = "aarch64")]
    let_island_cover_the_menu_bar(ns);
    unsafe { dispatch_async_f(&_dispatch_main_q, ns, set_island_level) };
}

/// The island's NSWindow, and AppKit's own constrainFrameRect:toScreen: for every other window.
static ISLAND_WINDOW: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
static APPKIT_CONSTRAIN: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

#[cfg(target_arch = "aarch64")]
type Constrain = extern "C" fn(*mut c_void, *const c_void, NSRect, *mut c_void) -> NSRect;

/// AppKit keeps a window's top under the menu bar: not the island's, which
/// covers it around the notch. Every other window keeps AppKit's rule.
#[cfg(target_arch = "aarch64")]
extern "C" fn constrain_frame(this: *mut c_void, cmd: *const c_void, frame: NSRect, screen: *mut c_void) -> NSRect {
    use std::sync::atomic::Ordering;
    let appkit = APPKIT_CONSTRAIN.load(Ordering::Relaxed);
    if this as usize == ISLAND_WINDOW.load(Ordering::Relaxed) || appkit == 0 {
        return frame;
    }
    let appkit: Constrain = unsafe { std::mem::transmute(appkit) };
    appkit(this, cmd, frame, screen)
}

/// Puts constrain_frame in place of constrainFrameRect:toScreen: on the
/// island's window class, once.
#[cfg(target_arch = "aarch64")]
fn let_island_cover_the_menu_bar(ns: *mut c_void) {
    use std::sync::atomic::Ordering;
    if ISLAND_WINDOW.swap(ns as usize, Ordering::Relaxed) == ns as usize {
        return;
    }
    unsafe {
        let class = object_getClass(ns);
        if class.is_null() {
            return;
        }
        let name = sel(c"constrainFrameRect:toScreen:");
        let method = class_getInstanceMethod(class, name);
        if method.is_null() {
            return;
        }
        let ours: Constrain = constrain_frame;
        let current = method_getImplementation(method);
        if current as usize == ours as usize {
            return;
        }
        APPKIT_CONSTRAIN.store(current as usize, Ordering::Relaxed);
        class_replaceMethod(class, name, ours as *const c_void, method_getTypeEncoding(method));
    }
}

// AppKit's layouts, field for field (not all of them are read).
#[cfg(target_arch = "aarch64")]
#[allow(dead_code)]
#[repr(C)]
#[derive(Clone, Copy, Default)]
struct NSRect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[cfg(target_arch = "aarch64")]
#[allow(dead_code)]
#[repr(C)]
#[derive(Clone, Copy, Default)]
struct NSEdgeInsets {
    top: f64,
    left: f64,
    bottom: f64,
    right: f64,
}

/// Each screen's left edge, width and height, and its notch's height (points).
/// AppKit is read on the main thread only; other threads get the last reading.
static NOTCHES: std::sync::Mutex<Vec<[f64; 4]>> = std::sync::Mutex::new(Vec::new());

fn on_main_thread() -> bool {
    unsafe {
        let class = objc_getClass(c"NSThread".as_ptr());
        if class.is_null() {
            return false;
        }
        let send: unsafe extern "C" fn(*mut c_void, *const c_void) -> bool = std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
        send(class, sel(c"isMainThread"))
    }
}

/// `[NSScreen screens]`, each with its frame and `safeAreaInsets.top`: the
/// notch's height on a MacBook that has one (macOS 12 and later), 0 elsewhere.
#[cfg(target_arch = "aarch64")]
fn read_notches() -> Vec<[f64; 4]> {
    type Id = *mut c_void;
    type Sel = *const c_void;
    unsafe {
        let msg = objc_msgSend as unsafe extern "C" fn();
        let send_id: unsafe extern "C" fn(Id, Sel) -> Id = std::mem::transmute(msg);
        let send_count: unsafe extern "C" fn(Id, Sel) -> usize = std::mem::transmute(msg);
        let send_at: unsafe extern "C" fn(Id, Sel, usize) -> Id = std::mem::transmute(msg);
        let send_responds: unsafe extern "C" fn(Id, Sel, Sel) -> bool = std::mem::transmute(msg);
        // Four doubles come back in registers on Apple silicon: plain objc_msgSend.
        let send_rect: unsafe extern "C" fn(Id, Sel) -> NSRect = std::mem::transmute(msg);
        let send_insets: unsafe extern "C" fn(Id, Sel) -> NSEdgeInsets = std::mem::transmute(msg);

        let class = objc_getClass(c"NSScreen".as_ptr());
        if class.is_null() {
            return Vec::new();
        }
        let screens = send_id(class, sel(c"screens"));
        if screens.is_null() {
            return Vec::new();
        }
        let insets = sel(c"safeAreaInsets");
        let mut found = Vec::new();
        for i in 0..send_count(screens, sel(c"count")) {
            let screen = send_at(screens, sel(c"objectAtIndex:"), i);
            if screen.is_null() {
                continue;
            }
            let f = send_rect(screen, sel(c"frame"));
            // safeAreaInsets came with macOS 12: on 11 the screen has no notch.
            let top = if send_responds(screen, sel(c"respondsToSelector:"), insets) { send_insets(screen, insets).top } else { 0.0 };
            found.push([f.x, f.w, f.h, top]);
        }
        found
    }
}

/// No Mac with an Intel chip has a notch.
#[cfg(not(target_arch = "aarch64"))]
fn read_notches() -> Vec<[f64; 4]> {
    Vec::new()
}

/// The notch's height (logical px) on this display, 0 without one. There the
/// top island starts at the screen's very top, around the notch.
/// `CANDY_NOTCH=32` pretends a display has one (CI's Macs have none).
pub fn notch_height(m: &tauri::Monitor) -> f64 {
    if let Some(n) = std::env::var("CANDY_NOTCH").ok().and_then(|v| v.parse::<f64>().ok()) {
        return n.clamp(0.0, 64.0);
    }
    let mut known = NOTCHES.lock().unwrap();
    if on_main_thread() {
        *known = read_notches();
    }
    let scale = m.scale_factor();
    let (x, w, h) = (m.position().x as f64 / scale, m.size().width as f64 / scale, m.size().height as f64 / scale);
    known
        .iter()
        .find(|s| (s[0] - x).abs() < 1.0 && (s[1] - w).abs() < 1.0 && (s[2] - h).abs() < 1.0)
        .map_or(0.0, |s| s[3].clamp(0.0, 64.0))
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
