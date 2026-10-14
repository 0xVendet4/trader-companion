// Windows: Win32 for the island window and the cursor, %APPDATA% for files.

use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{mpsc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, WebviewWindow};

use crate::music::{self, MusicListener, MusicUpdate, NowPlaying};
use ::windows::Foundation::TypedEventHandler;
use ::windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as Manager,
    GlobalSystemMediaTransportControlsSessionMediaProperties as MediaProperties,
    GlobalSystemMediaTransportControlsSessionPlaybackControls as Controls,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
};
use ::windows::Media::MediaPlaybackAutoRepeatMode;
use ::windows::Storage::Streams::DataReader;
use ::windows::Win32::Foundation::{HGLOBAL, HWND, POINT};
use ::windows::Win32::System::DataExchange::{
    CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
};
use ::windows::Win32::System::Memory::{GlobalLock, GlobalUnlock};
use ::windows::Win32::System::SystemInformation::GetLocalTime;
use ::windows::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, GetKeyboardLayoutList, MapVirtualKeyExW, ToUnicodeEx, HKL, MAPVK_VK_TO_VSC,
    VK_CONTROL, VK_LBUTTON, VK_MENU, VK_SHIFT,
};
use ::windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetForegroundWindow, GetWindowLongPtrW, GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow,
    SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, HWND_NOTOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSIZE,
    WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
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

/// Shows a folder of the app's own (the sounds folder) in Explorer.
pub fn reveal_folder(path: &str) {
    let _ = Command::new("explorer").arg(path).spawn();
}

// ── Clipboard ─────────────────────────────────────────────────────────────────

/// CF_UNICODETEXT: the clipboard's text, UTF-16.
const CF_UNICODETEXT: u32 = 13;
/// Longer than any token link: more is not what the paste shortcut is for.
const CLIPBOARD_MAX: usize = 2048;

/// The clipboard's text for the paste shortcut, read here because the page
/// never has focus (and never logged: it is whatever the user last copied).
/// None when it holds no text, or more than a token link's worth.
pub fn clipboard_text(_app: &AppHandle) -> Option<String> {
    // Another app may hold the clipboard for a moment: a few tries.
    let mut opened = false;
    for _ in 0..5 {
        if unsafe { OpenClipboard(None) }.is_ok() {
            opened = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    if !opened {
        return None;
    }
    let text = unsafe { read_clipboard_text() };
    unsafe {
        let _ = CloseClipboard();
    }
    text
}

/// With the clipboard open: its text up to CLIPBOARD_MAX UTF-16 units.
unsafe fn read_clipboard_text() -> Option<String> {
    IsClipboardFormatAvailable(CF_UNICODETEXT).ok()?;
    let handle = GetClipboardData(CF_UNICODETEXT).ok()?;
    let global = HGLOBAL(handle.0);
    let ptr = GlobalLock(global) as *const u16;
    if ptr.is_null() {
        return None;
    }
    let mut len = 0;
    while len <= CLIPBOARD_MAX && *ptr.add(len) != 0 {
        len += 1;
    }
    let text = (len <= CLIPBOARD_MAX)
        .then(|| String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len)));
    let _ = GlobalUnlock(global);
    text
}

// ── Desktop Candy window ──────────────────────────────────────────────────────

/// Windows places a window wherever it is asked, and the cursor poll is there.
pub fn desktop_mode() -> super::DesktopMode {
    super::DesktopMode::Poll
}

/// Same window styles as the island: never takes focus, never in Alt-Tab.
pub fn prepare_desktop_window(win: &WebviewWindow) -> bool {
    make_non_activating(win);
    true
}

/// The page drags him by screen position (the cursor poll does, here).
pub fn desktop_drags_by_delta() -> bool {
    false
}

/// The cursor poll toggles click-through from the body hit test instead.
pub fn set_desktop_shape(_win: &WebviewWindow, _shape: super::MouseShape) {}

// ── Music ─────────────────────────────────────────────────────────────────────

/// What woke the music worker: the list of sessions changed, or one session's
/// playback, track or timeline did.
enum Wake {
    Sessions,
    State,
}

/// The watch while it listens: the system's session manager and its event
/// tokens, each session with the tokens of its own events, the session the
/// card shows, and the worker's doorbell.
struct MediaWatch {
    manager: Manager,
    tokens: [i64; 2],
    sessions: Vec<(Session, [i64; 3])>,
    current: Option<Session>,
    wake: mpsc::Sender<Wake>,
}

static MEDIA: Mutex<Option<MediaWatch>> = Mutex::new(None);

/// Starts or stops watching the system's media sessions (a player, a browser
/// tab with a video…) for the music card and the dance. Nothing polls: Windows
/// raises an event when a session comes or goes, or its playback, track or
/// timeline changes; a worker thread reads the session in front then, and
/// `listener` hears only what changed. Blocks for a moment: call it off the
/// main thread.
pub fn media_watch(on: bool, listener: MusicListener) {
    if !on {
        let taken = MEDIA.lock().unwrap().take();
        if let Some(w) = taken {
            let _ = w.manager.RemoveSessionsChanged(w.tokens[0]);
            let _ = w.manager.RemoveCurrentSessionChanged(w.tokens[1]);
            unsubscribe(w.sessions);
        }
        return;
    }
    if MEDIA.lock().unwrap().is_some() {
        return;
    }
    let manager = match Manager::RequestAsync().and_then(|op| op.get()) {
        Ok(m) => m,
        Err(err) => {
            crate::log::line(format!("music: no session manager: {err}"));
            return;
        }
    };
    let (tx, rx) = mpsc::channel::<Wake>();
    let tx0 = tx.clone();
    let sessions_token = manager.SessionsChanged(&TypedEventHandler::new(move |_, _| {
        let _ = tx0.send(Wake::Sessions);
        Ok(())
    }));
    let tx1 = tx.clone();
    let current_token = manager.CurrentSessionChanged(&TypedEventHandler::new(move |_, _| {
        let _ = tx1.send(Wake::Sessions);
        Ok(())
    }));
    let (Ok(t0), Ok(t1)) = (sessions_token, current_token) else {
        crate::log::line("music: no session events");
        return;
    };
    *MEDIA.lock().unwrap() = Some(MediaWatch { manager, tokens: [t0, t1], sessions: Vec::new(), current: None, wake: tx.clone() });
    let _ = tx.send(Wake::Sessions);
    let spawned = std::thread::Builder::new().name("candy-music".into()).spawn(move || music_worker(rx, listener));
    if let Err(err) = spawned {
        crate::log::line(format!("music: no worker thread: {err}"));
    }
}

fn unsubscribe(sessions: Vec<(Session, [i64; 3])>) {
    for (s, t) in sessions {
        let _ = s.RemovePlaybackInfoChanged(t[0]);
        let _ = s.RemoveMediaPropertiesChanged(t[1]);
        let _ = s.RemoveTimelinePropertiesChanged(t[2]);
    }
}

/// Listens to one session's playback, track and timeline.
fn subscribe(s: &Session, wake: &mpsc::Sender<Wake>) -> Option<[i64; 3]> {
    let (a, b, c) = (wake.clone(), wake.clone(), wake.clone());
    let t0 = s.PlaybackInfoChanged(&TypedEventHandler::new(move |_, _| {
        let _ = a.send(Wake::State);
        Ok(())
    }));
    let t1 = s.MediaPropertiesChanged(&TypedEventHandler::new(move |_, _| {
        let _ = b.send(Wake::State);
        Ok(())
    }));
    let t2 = s.TimelinePropertiesChanged(&TypedEventHandler::new(move |_, _| {
        let _ = c.send(Wake::State);
        Ok(())
    }));
    Some([t0.ok()?, t1.ok()?, t2.ok()?])
}

fn music_worker(rx: mpsc::Receiver<Wake>, listener: MusicListener) {
    let mut last: Option<NowPlaying> = None;
    let mut last_art = String::new();
    while let Ok(first) = rx.recv() {
        // Events come in bursts: read once, after they settle.
        std::thread::sleep(Duration::from_millis(80));
        let mut sessions = matches!(first, Wake::Sessions);
        while let Ok(more) = rx.try_recv() {
            sessions |= matches!(more, Wake::Sessions);
        }
        let current = {
            let mut slot = MEDIA.lock().unwrap();
            let Some(w) = slot.as_mut() else { return };
            if sessions {
                unsubscribe(std::mem::take(&mut w.sessions));
                if let Ok(list) = w.manager.GetSessions() {
                    for i in 0..list.Size().unwrap_or(0) {
                        let Ok(s) = list.GetAt(i) else { continue };
                        if let Some(tokens) = subscribe(&s, &w.wake) {
                            w.sessions.push((s, tokens));
                        }
                    }
                }
            }
            // The one playing, else the one Windows calls current.
            w.current = w.sessions.iter().map(|(s, _)| s.clone()).find(is_playing).or_else(|| w.manager.GetCurrentSession().ok());
            w.current.clone()
        };
        let read = current.as_ref().and_then(read_session);
        let now = read.as_ref().map(|(np, _)| np.clone());
        if music::differs(last.as_ref(), now.as_ref(), music::now_ms()) {
            listener(MusicUpdate::Playing(now.clone()));
        }
        if let Some((np, props)) = read {
            if np.art_key != last_art {
                last_art = np.art_key.clone();
                if let Some(url) = read_thumbnail(&props) {
                    listener(MusicUpdate::Art { key: np.art_key.clone(), url });
                }
            }
        }
        last = now;
    }
}

fn is_playing(s: &Session) -> bool {
    s.GetPlaybackInfo()
        .and_then(|info| info.PlaybackStatus())
        .map(|status| status == Status::Playing)
        .unwrap_or(false)
}

/// What a session plays, with its media properties (for the cover); None when
/// it has nothing loaded.
fn read_session(s: &Session) -> Option<(NowPlaying, MediaProperties)> {
    let props = s.TryGetMediaPropertiesAsync().ok()?.get().ok()?;
    let title = props.Title().ok()?.to_string();
    if title.is_empty() {
        return None;
    }
    let info = s.GetPlaybackInfo().ok()?;
    let status = info.PlaybackStatus().ok()?;
    if status != Status::Playing && status != Status::Paused && status != Status::Changing {
        return None;
    }
    let controls = info.Controls().ok();
    let can = |f: fn(&Controls) -> ::windows::core::Result<bool>| controls.as_ref().and_then(|c| f(c).ok()).unwrap_or(false);
    let (mut duration, mut position, mut position_at) = (0.0, 0.0, music::now_ms());
    if let Ok(t) = s.GetTimelineProperties() {
        let start = t.StartTime().map(|d| d.Duration).unwrap_or(0);
        let end = t.EndTime().map(|d| d.Duration).unwrap_or(0);
        let pos = t.Position().map(|d| d.Duration).unwrap_or(0);
        duration = (end - start).max(0) as f64 / 1e7;
        position = (pos - start).max(0) as f64 / 1e7;
        if let Ok(updated) = t.LastUpdatedTime() {
            if updated.UniversalTime > 0 {
                position_at = music::filetime_to_unix_ms(updated.UniversalTime);
            }
        }
    }
    let shuffle = if can(Controls::IsShuffleEnabled) { info.IsShuffleActive().ok().and_then(|r| r.Value().ok()) } else { None };
    let repeat = if can(Controls::IsRepeatEnabled) {
        info.AutoRepeatMode().ok().and_then(|r| r.Value().ok()).map(|m| m != MediaPlaybackAutoRepeatMode::None)
    } else {
        None
    };
    let mut np = NowPlaying {
        app: music::app_name(&s.SourceAppUserModelId().map(|h| h.to_string()).unwrap_or_default()),
        title,
        artist: props.Artist().map(|h| h.to_string()).unwrap_or_default(),
        album: props.AlbumTitle().map(|h| h.to_string()).unwrap_or_default(),
        duration,
        position,
        position_at,
        playing: status == Status::Playing,
        shuffle,
        repeat,
        volume: None,
        can_seek: can(Controls::IsPlaybackPositionEnabled) && duration > 0.0,
        can_next: can(Controls::IsNextEnabled),
        can_previous: can(Controls::IsPreviousEnabled),
        art_key: String::new(),
        track_path: String::new(),
    };
    np.art_key = music::art_key(&np);
    Some((np, props))
}

/// The track's cover, as a data URL.
fn read_thumbnail(props: &MediaProperties) -> Option<String> {
    let stream = props.Thumbnail().ok()?.OpenReadAsync().ok()?.get().ok()?;
    let mime = stream.ContentType().ok()?.to_string();
    let size = stream.Size().ok()? as usize;
    if size == 0 || size > music::ART_MAX {
        return None;
    }
    let reader = DataReader::CreateDataReader(&stream).ok()?;
    reader.LoadAsync(size as u32).ok()?.get().ok()?;
    let mut buf = vec![0u8; size];
    reader.ReadBytes(&mut buf).ok()?;
    music::image_data_url(&mime, &buf)
}

/// A button on the music card: play/pause, next, previous, seek (seconds),
/// shuffle and repeat (1 on, 0 off). Windows has no player volume to set.
pub fn media_control(action: &str, value: Option<f64>) -> bool {
    let current = MEDIA.lock().unwrap().as_ref().and_then(|w| w.current.clone());
    let Some(s) = current else { return false };
    let v = value.unwrap_or(0.0);
    let op = match action {
        "playPause" => s.TryTogglePlayPauseAsync(),
        "next" => s.TrySkipNextAsync(),
        "previous" => s.TrySkipPreviousAsync(),
        "seek" => {
            let start = s.GetTimelineProperties().and_then(|t| t.StartTime()).map(|d| d.Duration).unwrap_or(0);
            s.TryChangePlaybackPositionAsync(start + (v.max(0.0) * 1e7) as i64)
        }
        "shuffle" => s.TryChangeShuffleActiveAsync(v != 0.0),
        "repeat" => s.TryChangeAutoRepeatModeAsync(if v != 0.0 { MediaPlaybackAutoRepeatMode::List } else { MediaPlaybackAutoRepeatMode::None }),
        _ => return false,
    };
    op.and_then(|o| o.get()).unwrap_or(false)
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

// ── Keyboard and account ──────────────────────────────────────────────────────

/// The character Ctrl+Alt(+Shift)+`vk` types on one of the installed keyboard
/// layouts, if any. Windows reads Ctrl+Alt as AltGr, so registering such a
/// combination as a global shortcut would stop the user typing that character.
/// From Coucou's platform/windows.rs (MIT, © Louis Raillé).
pub fn ctrl_alt_types(vk: u16, shift: bool) -> Option<String> {
    let mut layouts = [HKL::default(); 32];
    let count = unsafe { GetKeyboardLayoutList(Some(&mut layouts[..])) };
    let count = usize::try_from(count).unwrap_or(0).min(layouts.len());

    let mut state = [0u8; 256];
    state[VK_CONTROL.0 as usize] = 0x80;
    state[VK_MENU.0 as usize] = 0x80;
    if shift {
        state[VK_SHIFT.0 as usize] = 0x80;
    }
    for &layout in &layouts[..count] {
        let scan = unsafe { MapVirtualKeyExW(u32::from(vk), MAPVK_VK_TO_VSC, Some(layout)) };
        let mut buf = [0u16; 8];
        // Flag 0x4: leave the keyboard state alone, so a dead key met here
        // doesn't change what the user types next (Windows 10 1607 and later).
        let n = unsafe { ToUnicodeEx(u32::from(vk), scan, &state, &mut buf, 0x4, Some(layout)) };
        let typed = match n {
            // A dead key (´ ^ ¨…) is still something the user types with it.
            n if n < 0 => String::from_utf16_lossy(&buf[..1]),
            0 => continue,
            n => String::from_utf16_lossy(&buf[..(n as usize).min(buf.len())]),
        };
        if typed.chars().any(|c| !c.is_control()) {
            return Some(typed);
        }
    }
    None
}

#[link(name = "shell32")]
extern "system" {
    fn SHQueryUserNotificationState(state: *mut i32) -> i32;
}

/// Something fills the screen and asks not to be disturbed: a fullscreen app
/// or game (QUNS_BUSY, QUNS_RUNNING_D3D_FULL_SCREEN) or a presentation
/// (QUNS_PRESENTATION_MODE). Alert cards and their sounds wait then.
pub fn fullscreen_busy() -> bool {
    let mut state = 0i32;
    let hr = unsafe { SHQueryUserNotificationState(&mut state) };
    hr >= 0 && matches!(state, 2..=4)
}

/// An alert as a Windows notification with two buttons, Open and Mute 1 h
/// (`buttons`: their words in the trader's language). `on_action` hears
/// "open", "mute", or "show" (the notification itself was clicked), while
/// Candy runs. False if it couldn't be shown.
pub fn alert_toast(identifier: &str, title: &str, body: &str, buttons: (&str, &str), on_action: impl Fn(&str) + Send + 'static) -> bool {
    use tauri_winrt_notification::Toast;
    // As the notification plugin does: the installed app's own id, which its
    // Start menu shortcut carries; a dev build has none and borrows PowerShell's.
    let dev = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|d| d.ends_with("target\\debug") || d.ends_with("target\\release")))
        .unwrap_or(false);
    let app_id = if dev { Toast::POWERSHELL_APP_ID } else { identifier };
    // Plain text: the toolkit escapes it into the notification's XML.
    Toast::new(app_id)
        .title(title)
        .text1(body)
        .add_button(buttons.0, "open")
        .add_button(buttons.1, "mute")
        .on_activated(move |action| {
            on_action(action.as_deref().unwrap_or("show"));
            Ok(())
        })
        .show()
        .is_ok()
}

// The display name only feeds Candy's greeting (identity.rs). The calls are
// declared by hand with their documented C signatures, so they need no extra
// `windows` crate features. From Coucou's platform/windows.rs (MIT, © Louis Raillé).
#[link(name = "secur32")]
extern "system" {
    fn GetUserNameExW(name_format: i32, name_buffer: *mut u16, size: *mut u32) -> u8;
}

#[link(name = "netapi32")]
extern "system" {
    fn NetUserGetInfo(server: *const u16, user: *const u16, level: u32, buffer: *mut *mut u8) -> u32;
    fn NetApiBufferFree(buffer: *mut core::ffi::c_void) -> u32;
}

/// EXTENDED_NAME_FORMAT::NameDisplay.
const NAME_DISPLAY: i32 = 3;

/// The account's display name ("Ana Souza"): the directory's for a domain or
/// Microsoft/Entra account, else the local account's "Full name", else nothing.
pub fn user_full_name() -> Option<String> {
    directory_display_name().or_else(local_full_name).filter(|n| !n.trim().is_empty())
}

fn directory_display_name() -> Option<String> {
    let mut buf = [0u16; 256];
    let mut size = buf.len() as u32;
    // On success `size` is the length copied, without the terminating null.
    let ok = unsafe { GetUserNameExW(NAME_DISPLAY, buf.as_mut_ptr(), &mut size) } != 0;
    if !ok || size as usize > buf.len() {
        return None;
    }
    String::from_utf16(&buf[..size as usize]).ok()
}

fn local_full_name() -> Option<String> {
    let user = std::env::var("USERNAME").ok().filter(|u| !u.is_empty())?;
    let wide: Vec<u16> = user.encode_utf16().chain(std::iter::once(0)).collect();
    let mut info: *mut u8 = std::ptr::null_mut();
    // Level 10 is USER_INFO_10 { name, comment, usr_comment, full_name }, four
    // wide-string pointers; any user may read it about themselves.
    let status = unsafe { NetUserGetInfo(std::ptr::null(), wide.as_ptr(), 10, &mut info) };
    if status != 0 || info.is_null() {
        return None;
    }
    unsafe {
        let full = *(info as *const *const u16).add(3);
        let text = if full.is_null() {
            None
        } else {
            let mut len = 0usize;
            while len < 256 && *full.add(len) != 0 {
                len += 1;
            }
            String::from_utf16(std::slice::from_raw_parts(full, len)).ok()
        };
        NetApiBufferFree(info.cast());
        text
    }
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

/// The island can go anywhere.
pub fn can_place() -> bool {
    true
}

/// Moves a window (the island, the desktop Candy) so its top-left corner is at (x, y), physical px.
pub fn move_window(win: &WebviewWindow, x: i32, y: i32, _screen: (i32, i32), _scale: f64) {
    let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
}

/// The island stays over everything.
pub fn keep_on_top(win: &WebviewWindow) {
    let _ = win.set_always_on_top(true);
}

/// No notch: the top island sits on the work area's top edge.
pub fn notch_height(_m: &tauri::Monitor) -> f64 {
    0.0
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

/// The window that was in front before a panel took the keyboard (as a raw
/// handle; 0: none), given the keyboard back when the panel closes.
static BEFORE_PANEL: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);

/// A window of another app that can be seen: one worth giving the keyboard
/// back to. Not one of Candy's own (the tray menu's hidden window is in front
/// while its menu is open), nor an invisible one.
fn foreign_and_visible(h: HWND) -> bool {
    if h.0.is_null() {
        return false;
    }
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(h, Some(&mut pid)) };
    pid != 0 && pid != std::process::id() && unsafe { IsWindowVisible(h) }.as_bool()
}

/// A panel opens in the island (Settings, the Closet): remembers the window
/// in front, the trader's browser or terminal, to give the keyboard back to.
pub fn remember_foreground(_win: &WebviewWindow) {
    let front = unsafe { GetForegroundWindow() };
    if foreign_and_visible(front) {
        BEFORE_PANEL.store(front.0 as isize, std::sync::atomic::Ordering::Relaxed);
    }
}

/// The island lost the keyboard while a panel is open: the window the trader
/// went to is the one the keyboard goes back to on close.
pub fn note_foreground(win: &WebviewWindow) {
    remember_foreground(win);
}

/// The panel closed: the keyboard goes back to the last app the trader was
/// in, if the island still has it (a click elsewhere already gave it away).
pub fn restore_foreground(win: &WebviewWindow) {
    let before = BEFORE_PANEL.swap(0, std::sync::atomic::Ordering::Relaxed);
    let Some(own) = hwnd_of(win) else { return };
    let before = HWND(before as *mut _);
    if !foreign_and_visible(before) || unsafe { GetForegroundWindow() } != own {
        return;
    }
    // Allowed: the island is the foreground window, and it gives the focus away.
    let _ = unsafe { SetForegroundWindow(before) };
}

/// A panel steps behind the app the trader went to: no longer topmost, and
/// under the window in front. Leaving topmost alone (HWND_NOTOPMOST) puts the
/// island above every normal window, the browser a link just opened included,
/// so it is then slid just under the foreground window. On the main thread,
/// after tao's own change of the flag, so that one can't undo it.
pub fn lower_island(win: &WebviewWindow) -> bool {
    let _ = win.set_always_on_top(false);
    let Some(own) = hwnd_of(win) else { return true };
    let own = own.0 as isize;
    let _ = win.run_on_main_thread(move || behind_foreground(own));
    true
}

fn behind_foreground(raw: isize) {
    let own = HWND(raw as *mut _);
    let flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER;
    unsafe {
        let _ = SetWindowPos(own, Some(HWND_NOTOPMOST), 0, 0, 0, 0, flags);
        let front = GetForegroundWindow();
        if foreign_and_visible(front) {
            let _ = SetWindowPos(own, Some(front), 0, 0, 0, 0, flags);
        }
    }
}

/// Whether the island can step behind another window (lower_island).
pub fn can_lower() -> bool {
    true
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
    // In its own window, through cmd /c: `start` on the script itself would run
    // it with cmd /k, and the window would stay open after the update.
    Command::new("cmd.exe")
        .args(["/c", "start", "Updating Candy", "cmd.exe", "/c"])
        .arg(&script)
        .arg("--update")
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
