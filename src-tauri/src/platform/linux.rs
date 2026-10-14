// Linux: XDG directories for files, xdg-open for links, and gtk-layer-shell for
// the island window. Adapted from Coucou's platform/linux.rs (MIT, © Louis
// Raillé).
//
// Wayland gives an app no global cursor position and no say over where its
// window goes, so the island works differently from Windows:
//   * it is a layer-shell surface anchored to the top edge, above everything,
//     on compositors that support it (KDE, COSMIC, Hyprland, Sway…);
//   * on GNOME, which has no layer-shell, it runs through XWayland instead
//     (prepare_environment), where a window can still be placed and kept on top;
//   * click-through is the window's input region, set to the island shape, so
//     the compositor itself sends every other click to whatever is underneath;
//   * the cursor comes from the page's own mouse events, which only fire over
//     the island: the eyes follow the pointer there, not across the screen, and
//     there is no Ctrl pass-through. A side or floating island is placed by
//     margins on a layer surface (move_window) and dragged by the page.

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use dbus::arg::{ArgType, RefArg};
use dbus::blocking::stdintf::org_freedesktop_dbus::Properties;
use dbus::blocking::Connection;
use dbus::message::MessageType;
use gtk::glib::translate::ToGlibPtr;
use gtk::prelude::*;
use tauri::{AppHandle, WebviewWindow};

use super::{LocalTime, Region};
use crate::music::{self, MprisValue, MusicListener, MusicUpdate, NowPlaying};

// ── Files ─────────────────────────────────────────────────────────────────────

fn home_dir() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."))
}

/// An XDG base directory (`$XDG_CONFIG_HOME` …), or its fallback under the home
/// directory when it is unset or not absolute.
fn xdg(var: &str, fallback: &str) -> PathBuf {
    std::env::var_os(var)
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .unwrap_or_else(|| home_dir().join(fallback))
}

/// ~/.config/candy — preferences, watchlist, alerts.
pub fn config_dir() -> PathBuf {
    xdg("XDG_CONFIG_HOME", ".config").join("candy")
}

/// ~/.local/share/candy — the log.
pub fn local_dir() -> PathBuf {
    xdg("XDG_DATA_HOME", ".local/share").join("candy")
}

/// Creates `dir` and closes it to other users: with the default umask it would
/// come out 0755, and the settings hold the wallets followed.
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

/// Environment the window toolkit must see, set before it starts.
///
/// GNOME's compositor has no layer-shell: a Wayland window there can neither
/// be placed nor kept on top, so the island would land in the middle of the
/// screen under everything. Through XWayland it can be both. CANDY_BACKEND=
/// wayland keeps native Wayland; a GDK_BACKEND set by the user is respected.
pub fn prepare_environment() {
    let wayland = std::env::var("XDG_SESSION_TYPE").map(|v| v == "wayland").unwrap_or(false);
    let gnome = std::env::var("XDG_CURRENT_DESKTOP")
        .map(|v| v.to_ascii_lowercase().split(':').any(|d| d == "gnome"))
        .unwrap_or(false);
    let keep = std::env::var("CANDY_BACKEND").map(|v| v == "wayland").unwrap_or(false);
    if wayland && gnome && !keep && std::env::var_os("GDK_BACKEND").is_none() {
        std::env::set_var("GDK_BACKEND", "x11");
    }
}

// ── Processes ─────────────────────────────────────────────────────────────────

/// Hands an http(s) URL to the default browser. No shell is involved.
pub fn open_url(url: &str) {
    let _ = Command::new("xdg-open").arg(url).spawn();
}

/// Shows a folder of the app's own (the sounds folder) in the file manager.
pub fn reveal_folder(path: &str) {
    let _ = Command::new("xdg-open").arg(path).spawn();
}

// ── Clipboard ─────────────────────────────────────────────────────────────────

/// Longer than any token link: more is not what the paste shortcut is for.
const CLIPBOARD_MAX: usize = 2048;

/// The clipboard's text for the paste shortcut, asked of GTK on its own thread
/// (never logged: it is whatever the user last copied). Under native Wayland
/// an unfocused surface is given nothing, so it is None there; XWayland and
/// X11 answer.
pub fn clipboard_text(app: &AppHandle) -> Option<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let text = gtk::Clipboard::get(&gtk::gdk::SELECTION_CLIPBOARD)
            .wait_for_text()
            .map(|t| t.to_string());
        let _ = tx.send(text);
    })
    .ok()?;
    rx.recv_timeout(Duration::from_millis(1500))
        .ok()
        .flatten()
        .filter(|t| t.len() <= CLIPBOARD_MAX)
}

// ── Desktop Candy window ──────────────────────────────────────────────────────

/// X11, or GNOME through XWayland (prepare_environment): a window can be
/// placed anywhere there.
fn x11() -> bool {
    std::env::var("GDK_BACKEND").map(|v| v == "x11").unwrap_or(false)
        || std::env::var("XDG_SESSION_TYPE").map(|v| v == "x11").unwrap_or(false)
}

/// The compositor has layer-shell (KDE, COSMIC, Hyprland, Sway…), and it
/// wasn't turned off with CANDY_LAYER_SHELL=0. Never under X11 or XWayland.
fn layer_shell() -> bool {
    std::env::var("CANDY_LAYER_SHELL").map(|v| v != "0").unwrap_or(true) && unsafe { layer::gtk_layer_is_supported() } != 0
}

/// On X11 (GNOME through XWayland too) a window can be placed anywhere, and
/// on a compositor with layer-shell a layer surface can, by its margins. On
/// plain Wayland without it nothing can, so Candy stays in the island there.
pub fn desktop_mode() -> super::DesktopMode {
    if x11() || layer_shell() {
        super::DesktopMode::Window
    } else {
        super::DesktopMode::Off
    }
}

/// True once the desktop Candy's window is a layer surface: it is moved by
/// margins, and the page drags it by how far the mouse goes (no screen
/// coordinates on Wayland).
static DESKTOP_LAYER: AtomicBool = AtomicBool::new(false);

/// The desktop window's input region, re-applied on every map (see INPUT_REGION).
static DESKTOP_REGION: Mutex<Region> = Mutex::new(Some((0.0, 0.0, 0.0, 0.0)));

/// An always-on-top window that refuses focus; without X11, a layer surface
/// over everything, like the island.
pub fn prepare_desktop_window(win: &WebviewWindow) -> bool {
    let Ok(gw) = win.gtk_window() else { return false };
    gw.set_accept_focus(false);
    if x11() {
        return true;
    }
    if gw.is_realized() {
        crate::log::line("desktop Candy: window already shown, can't be a layer surface");
        return false;
    }
    make_layer_surface(&gw, c"candy-desktop", &DESKTOP_REGION);
    DESKTOP_LAYER.store(true, Ordering::Relaxed);
    true
}

/// The page drags the desktop Candy by how far the mouse goes, not by screen
/// coordinates (a layer surface on Wayland has none).
pub fn desktop_drags_by_delta() -> bool {
    DESKTOP_LAYER.load(Ordering::Relaxed)
}

/// Which part of the desktop window takes the mouse: nothing, all of it, or
/// Candy's body (window-logical px). Runs on the main thread.
pub fn set_desktop_shape(win: &WebviewWindow, shape: super::MouseShape) {
    let Ok(gw) = win.gtk_window() else { return };
    let region: Region = match shape {
        super::MouseShape::Empty => Some((0.0, 0.0, 0.0, 0.0)),
        super::MouseShape::Whole => None,
        super::MouseShape::Rect { x, y, w, h } => Some((x, y, w, h)),
    };
    *DESKTOP_REGION.lock().unwrap() = region;
    apply_input_region(&gw, region);
}

// ── Music ─────────────────────────────────────────────────────────────────────

/// Bumped on every start and stop: a listener from an older one quits.
static MEDIA_GENERATION: AtomicU64 = AtomicU64::new(0);
static MEDIA_ON: AtomicBool = AtomicBool::new(false);
/// The player the card shows (its bus name) and what it plays, for the buttons.
static MEDIA_CURRENT: Mutex<Option<(String, NowPlaying)>> = Mutex::new(None);

const MPRIS_PREFIX: &str = "org.mpris.MediaPlayer2.";
const MPRIS_PATH: &str = "/org/mpris/MediaPlayer2";
const MPRIS_PLAYER: &str = "org.mpris.MediaPlayer2.Player";
/// A call to a player never holds anything up for longer.
const BUS_CALL: Duration = Duration::from_millis(1500);
/// The listener sleeps on the bus; it wakes this often only to notice it was turned off.
const BUS_NAP: Duration = Duration::from_secs(60);
/// Players coming and going, any player's playback or track changing, and seeks.
const MPRIS_RULES: [&str; 3] = [
    "type='signal',sender='org.freedesktop.DBus',interface='org.freedesktop.DBus',member='NameOwnerChanged',arg0namespace='org.mpris.MediaPlayer2'",
    "type='signal',path='/org/mpris/MediaPlayer2',interface='org.freedesktop.DBus.Properties',member='PropertiesChanged',arg0='org.mpris.MediaPlayer2.Player'",
    "type='signal',path='/org/mpris/MediaPlayer2',interface='org.mpris.MediaPlayer2.Player',member='Seeked'",
];

/// Starts or stops watching the media players on the session bus (MPRIS: any
/// player, a browser with a video…) for the music card and the dance. Nothing
/// polls: one thread sleeps on the bus and wakes for the players' own signals;
/// `listener` hears only what changed. Adapted from Coucou's spotify.rs (MIT,
/// © Louis Raillé), for any player instead of Spotify alone.
pub fn media_watch(on: bool, listener: MusicListener) {
    let generation = MEDIA_GENERATION.fetch_add(1, Ordering::Relaxed) + 1;
    MEDIA_ON.store(on, Ordering::Relaxed);
    if !on {
        *MEDIA_CURRENT.lock().unwrap() = None;
        return;
    }
    let spawned = std::thread::Builder::new()
        .name("candy-music".into())
        .spawn(move || listen(generation, listener));
    if let Err(err) = spawned {
        crate::log::line(format!("music: no listener thread: {err}"));
    }
}

fn listen(generation: u64, listener: MusicListener) {
    let conn = match Connection::new_session() {
        Ok(c) => c,
        Err(err) => {
            crate::log::line(format!("music: no session bus: {err}"));
            return;
        }
    };
    for rule in MPRIS_RULES {
        if let Err(err) = conn.add_match_no_cb(rule) {
            crate::log::line(format!("music: match refused: {err}"));
        }
    }
    let current = || MEDIA_ON.load(Ordering::Relaxed) && MEDIA_GENERATION.load(Ordering::Relaxed) == generation;
    let mut last: Option<NowPlaying> = None;
    let mut last_art = String::new();
    report(&conn, &listener, &mut last, &mut last_art);
    while current() {
        match conn.channel().blocking_pop_message(BUS_NAP) {
            Ok(Some(msg)) => {
                if msg.msg_type() == MessageType::Signal && current() {
                    report(&conn, &listener, &mut last, &mut last_art);
                }
            }
            Ok(None) => {}
            Err(err) => {
                crate::log::line(format!("music: bus lost: {err}"));
                break;
            }
        }
    }
}

/// Reads the player in front and tells the page what changed.
fn report(conn: &Connection, listener: &MusicListener, last: &mut Option<NowPlaying>, last_art: &mut String) {
    let found = front_player(conn);
    *MEDIA_CURRENT.lock().unwrap() = found.as_ref().map(|(bus, np, _)| (bus.clone(), np.clone()));
    let now = found.as_ref().map(|(_, np, _)| np.clone());
    if music::differs(last.as_ref(), now.as_ref(), music::now_ms()) {
        listener(MusicUpdate::Playing(now.clone()));
    }
    if let Some((_, np, art)) = &found {
        if &np.art_key != last_art {
            *last_art = np.art_key.clone();
            if let Some(url) = art.as_deref().and_then(read_art) {
                listener(MusicUpdate::Art { key: np.art_key.clone(), url });
            }
        }
    }
    *last = now;
}

/// The player playing, else the first one paused: its bus name, what it
/// plays, and its cover's file when it has one on disk.
fn front_player(conn: &Connection) -> Option<(String, NowPlaying, Option<String>)> {
    let bus = conn.with_proxy("org.freedesktop.DBus", "/org/freedesktop/DBus", BUS_CALL);
    let (names,): (Vec<String>,) = bus.method_call("org.freedesktop.DBus", "ListNames", ()).ok()?;
    let now = music::now_ms();
    let mut paused = None;
    for name in names.iter().filter(|n| n.starts_with(MPRIS_PREFIX)) {
        let player = conn.with_proxy(name.as_str(), MPRIS_PATH, BUS_CALL);
        let Ok(map) = player.get_all(MPRIS_PLAYER) else { continue };
        let props: Vec<(String, MprisValue)> = map.iter().map(|(k, v)| (k.clone(), mpris_value(&v.0))).collect();
        let Some(np) = music::from_mpris(name, &props, now) else { continue };
        let art = music::mpris_art_path(&props);
        if np.playing {
            return Some((name.clone(), np, art));
        }
        if paused.is_none() {
            paused = Some((name.clone(), np, art));
        }
    }
    paused
}

/// A D-Bus value as MPRIS uses it (Coucou's value_of).
fn mpris_value(arg: &dyn RefArg) -> MprisValue {
    match arg.arg_type() {
        ArgType::Variant => arg.as_iter().and_then(|mut it| it.next().map(mpris_value)).unwrap_or(MprisValue::Other),
        ArgType::String | ArgType::ObjectPath | ArgType::Signature => {
            arg.as_str().map(|s| MprisValue::Str(s.to_string())).unwrap_or(MprisValue::Other)
        }
        ArgType::Boolean => arg.as_i64().map(|n| MprisValue::Bool(n != 0)).unwrap_or(MprisValue::Other),
        ArgType::Double => arg.as_f64().map(MprisValue::Float).unwrap_or(MprisValue::Other),
        ArgType::UInt64 => arg.as_u64().map(|n| MprisValue::Int(n.min(i64::MAX as u64) as i64)).unwrap_or(MprisValue::Other),
        ArgType::Byte | ArgType::Int16 | ArgType::UInt16 | ArgType::Int32 | ArgType::UInt32 | ArgType::Int64 => {
            arg.as_i64().map(MprisValue::Int).unwrap_or(MprisValue::Other)
        }
        ArgType::Array => {
            let Some(mut items) = arg.as_iter() else { return MprisValue::Other };
            if arg.signature().starts_with("a{") {
                let mut map = Vec::new();
                while let (Some(k), Some(v)) = (items.next(), items.next()) {
                    if let Some(key) = k.as_str() {
                        map.push((key.to_string(), mpris_value(v)));
                    }
                }
                MprisValue::Map(map)
            } else {
                MprisValue::Strs(
                    items
                        .filter_map(|v| match mpris_value(v) {
                            MprisValue::Str(s) => Some(s),
                            _ => None,
                        })
                        .collect(),
                )
            }
        }
        _ => MprisValue::Other,
    }
}

/// A cover from disk, as a data URL.
fn read_art(path: &str) -> Option<String> {
    let mime = music::image_mime(path)?;
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() || meta.len() as usize > music::ART_MAX {
        return None;
    }
    music::image_data_url(mime, &std::fs::read(path).ok()?)
}

/// A button on the music card: play/pause, next, previous, seek (seconds),
/// shuffle and repeat (1 on, 0 off), volume (0–1).
pub fn media_control(action: &str, value: Option<f64>) -> bool {
    let Some((bus, np)) = MEDIA_CURRENT.lock().unwrap().clone() else { return false };
    let Ok(conn) = Connection::new_session() else { return false };
    let p = conn.with_proxy(bus.as_str(), MPRIS_PATH, BUS_CALL);
    let v = value.unwrap_or(0.0);
    let done: Result<(), dbus::Error> = match action {
        "playPause" => p.method_call(MPRIS_PLAYER, "PlayPause", ()),
        "next" => p.method_call(MPRIS_PLAYER, "Next", ()),
        "previous" => p.method_call(MPRIS_PLAYER, "Previous", ()),
        "seek" => {
            let target = (v.max(0.0) * 1_000_000.0) as i64;
            match dbus::Path::new(np.track_path.clone()) {
                Ok(path) => p.method_call(MPRIS_PLAYER, "SetPosition", (path, target)),
                // No track id: seek by the difference from where it is now.
                Err(_) => {
                    let ran = if np.playing { (music::now_ms() - np.position_at).max(0.0) / 1000.0 } else { 0.0 };
                    let from = ((np.position + ran) * 1_000_000.0) as i64;
                    p.method_call(MPRIS_PLAYER, "Seek", (target - from,))
                }
            }
        }
        "shuffle" => p.set(MPRIS_PLAYER, "Shuffle", v != 0.0),
        "repeat" => p.set(MPRIS_PLAYER, "LoopStatus", if v != 0.0 { "Playlist" } else { "None" }),
        "volume" => p.set(MPRIS_PLAYER, "Volume", v.clamp(0.0, 1.0)),
        _ => return false,
    };
    done.is_ok()
}

// ── Cursor ────────────────────────────────────────────────────────────────────

/// Nothing polls the cursor here: the page reports it over the island, and the
/// input region decides click-through (see the top of this file).
pub const CURSOR_POLL: bool = false;

pub fn cursor_physical() -> Option<(f64, f64)> {
    None
}

pub fn left_button_down() -> bool {
    false
}

pub fn ctrl_down() -> bool {
    false
}

// ── Keyboard and account ──────────────────────────────────────────────────────

/// No portable way to ask: alerts never wait for a fullscreen app here.
pub fn fullscreen_busy() -> bool {
    false
}

/// No buttons on Linux notifications here: the page sends the plain one.
pub fn alert_toast(_identifier: &str, _title: &str, _body: &str, _buttons: (&str, &str), _on_action: impl Fn(&str) + Send + 'static) -> bool {
    false
}

/// Ctrl+Alt is not AltGr on Linux: a Ctrl+Alt shortcut types nothing.
pub fn ctrl_alt_types(_vk: u16, _shift: bool) -> Option<String> {
    None
}

/// The account's full name: the first field of the passwd GECOS entry
/// ("Ana Souza,,,"), or nothing when it is unset. From Coucou's
/// platform/linux.rs.
pub fn user_full_name() -> Option<String> {
    unsafe {
        let mut pwd: libc::passwd = std::mem::zeroed();
        let mut result: *mut libc::passwd = std::ptr::null_mut();
        let mut buf = vec![0 as libc::c_char; 16 * 1024];
        let rc = libc::getpwuid_r(libc::getuid(), &mut pwd, buf.as_mut_ptr(), buf.len(), &mut result);
        if rc != 0 || result.is_null() || pwd.pw_gecos.is_null() {
            return None;
        }
        let gecos = std::ffi::CStr::from_ptr(pwd.pw_gecos).to_string_lossy().into_owned();
        let name = gecos.split(',').next().unwrap_or("").trim().to_string();
        (!name.is_empty()).then_some(name)
    }
}

// ── Island window ─────────────────────────────────────────────────────────────

/// The few gtk-layer-shell calls we need, straight from the C library.
mod layer {
    use gtk::ffi::GtkWindow;
    use std::os::raw::{c_char, c_int};

    pub const LAYER_OVERLAY: c_int = 3;
    pub const EDGE_LEFT: c_int = 0;
    pub const EDGE_TOP: c_int = 2;
    pub const KEYBOARD_NONE: c_int = 0;
    pub const KEYBOARD_ON_DEMAND: c_int = 2;

    #[link(name = "gtk-layer-shell")]
    extern "C" {
        pub fn gtk_layer_is_supported() -> c_int;
        pub fn gtk_layer_init_for_window(window: *mut GtkWindow);
        pub fn gtk_layer_is_layer_window(window: *mut GtkWindow) -> c_int;
        pub fn gtk_layer_set_namespace(window: *mut GtkWindow, name_space: *const c_char);
        pub fn gtk_layer_set_layer(window: *mut GtkWindow, layer: c_int);
        pub fn gtk_layer_set_anchor(window: *mut GtkWindow, edge: c_int, anchor: c_int);
        pub fn gtk_layer_set_margin(window: *mut GtkWindow, edge: c_int, margin: c_int);
        pub fn gtk_layer_set_exclusive_zone(window: *mut GtkWindow, zone: c_int);
        pub fn gtk_layer_set_keyboard_mode(window: *mut GtkWindow, mode: c_int);
    }
}

/// True once the island window is a layer-shell surface.
static LAYER_SURFACE: AtomicBool = AtomicBool::new(false);

/// The input region last asked for, re-applied whenever the window is mapped:
/// GTK resets it to the whole window on map. Until the page reports the island
/// shape it is empty, so nothing takes the mouse.
static INPUT_REGION: Mutex<Region> = Mutex::new(Some((0.0, 0.0, 0.0, 0.0)));

fn gtk_window_ptr(win: &gtk::ApplicationWindow) -> *mut gtk::ffi::GtkWindow {
    let w: &gtk::Window = win.upcast_ref();
    w.to_glib_none().0
}

/// Turns the island into an overlay surface on the top edge that never takes
/// the keyboard. Must run before the window is first shown: a layer surface
/// cannot be made out of a window the compositor already knows.
///
/// Without layer-shell (GNOME through XWayland, X11, or CANDY_LAYER_SHELL=0)
/// the window stays an ordinary always-on-top window that refuses focus,
/// placed by the island's own geometry.
pub fn make_non_activating(win: &WebviewWindow) {
    let Ok(gw) = win.gtk_window() else { return };
    let wanted = std::env::var("CANDY_LAYER_SHELL").map(|v| v != "0").unwrap_or(true);
    let supported = unsafe { layer::gtk_layer_is_supported() } != 0;
    if !wanted || !supported || gw.is_realized() {
        let why = if !wanted {
            "CANDY_LAYER_SHELL=0"
        } else if supported {
            "window already shown"
        } else {
            "no layer-shell here"
        };
        crate::log::line(format!("island is a regular window ({why})"));
        gw.set_accept_focus(false);
        // GTK resets the input region on map: put the island's back.
        gw.connect_map_event(|w, _| {
            apply_input_region(w, *INPUT_REGION.lock().unwrap());
            gtk::glib::Propagation::Proceed
        });
        return;
    }
    make_layer_surface(&gw, c"candy", &INPUT_REGION);
    LAYER_SURFACE.store(true, Ordering::Relaxed);
    crate::log::line("island is a layer-shell overlay");
}

/// Makes a window an overlay layer surface on the top edge (over any panel)
/// that never takes the keyboard, whose input region `region` is put back on
/// every map. Before the window is first shown only.
fn make_layer_surface(gw: &gtk::ApplicationWindow, namespace: &'static std::ffi::CStr, region: &'static Mutex<Region>) {
    // tao gives undecorated Wayland windows an empty titlebar to force
    // client-side decorations. A layer surface has none, and a client-decorated
    // GtkWindow recomputes its own input region (shadow margins included) on
    // every map, over ours.
    gw.set_titlebar(None::<&gtk::Widget>);
    let ptr = gtk_window_ptr(gw);
    unsafe {
        layer::gtk_layer_init_for_window(ptr);
        layer::gtk_layer_set_namespace(ptr, namespace.as_ptr());
        layer::gtk_layer_set_layer(ptr, layer::LAYER_OVERLAY);
        // Top edge only: the compositor centres the surface horizontally, until
        // move_window pins it to the left edge too.
        layer::gtk_layer_set_anchor(ptr, layer::EDGE_TOP, 1);
        // -1: right against the screen edge, over any top panel.
        layer::gtk_layer_set_exclusive_zone(ptr, -1);
        layer::gtk_layer_set_keyboard_mode(ptr, layer::KEYBOARD_NONE);
    }
    // WebKitGTK in a freshly mapped layer surface never paints its first frame
    // (seen on COSMIC; reproduced with a bare GTK window + WebKitGTK): the
    // surface stays empty. Unmapping and mapping it once, right after the first
    // map, gets it drawing for good.
    let remapped = std::cell::Cell::new(false);
    gw.connect_map_event(move |w, _| {
        apply_input_region(w, *region.lock().unwrap());
        if !remapped.replace(true) {
            let w = w.clone();
            gtk::glib::idle_add_local_once(move || {
                w.hide();
                w.show_all();
                apply_input_region(&w, *region.lock().unwrap());
            });
        }
        gtk::glib::Propagation::Proceed
    });
}

/// Where the island can go: anywhere on a layer-shell overlay (KDE, COSMIC,
/// Hyprland, Sway…) and on X11 or XWayland (GNOME); on plain Wayland only
/// where the compositor puts it, so there it stays on the top edge.
pub fn can_place() -> bool {
    LAYER_SURFACE.load(Ordering::Relaxed) || x11()
}

/// Moves a window (the island, the desktop Candy) so its top-left corner is at
/// (x, y), physical px. A layer surface can't be moved: it is pinned to the
/// top-left corner of the screen whose top-left is `screen`, that far in
/// (margins, logical px).
pub fn move_window(win: &WebviewWindow, x: i32, y: i32, screen: (i32, i32), scale: f64) {
    // GTK only on its own thread: the desktop Candy's moves come from async commands.
    let w = win.clone();
    let _ = win.run_on_main_thread(move || {
        let Ok(gw) = w.gtk_window() else { return };
        let ptr = gtk_window_ptr(&gw);
        if unsafe { layer::gtk_layer_is_layer_window(ptr) } == 0 {
            let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
            return;
        }
        let left = ((x - screen.0) as f64 / scale).round() as i32;
        let top = ((y - screen.1) as f64 / scale).round() as i32;
        unsafe {
            layer::gtk_layer_set_anchor(ptr, layer::EDGE_LEFT, 1);
            layer::gtk_layer_set_margin(ptr, layer::EDGE_LEFT, left.max(0));
            layer::gtk_layer_set_margin(ptr, layer::EDGE_TOP, top.max(0));
        }
    });
}

/// The island stays over everything (a layer-shell overlay already does).
pub fn keep_on_top(win: &WebviewWindow) {
    let _ = win.set_always_on_top(true);
}

/// No notch: the top island sits on the work area's top edge.
pub fn notch_height(_m: &tauri::Monitor) -> f64 {
    0.0
}

/// Temporarily allow keyboard focus so a text field inside the island can be
/// typed in.
pub fn set_activating(win: &WebviewWindow, activating: bool) {
    let Ok(gw) = win.gtk_window() else { return };
    // The island is created `focusable: false` (tauri.linux.conf.json), so GTK
    // refuses focus until told otherwise — on a layer surface too.
    gw.set_accept_focus(activating);
    if LAYER_SURFACE.load(Ordering::Relaxed) {
        let mode = if activating { layer::KEYBOARD_ON_DEMAND } else { layer::KEYBOARD_NONE };
        unsafe { layer::gtk_layer_set_keyboard_mode(gtk_window_ptr(&gw), mode) };
    }
}

/// The compositor gives the keyboard back when the island stops taking it
/// (set_activating): nothing to remember.
pub fn remember_foreground(_win: &WebviewWindow) {}

pub fn restore_foreground(_win: &WebviewWindow) {}

pub fn note_foreground(_win: &WebviewWindow) {}

/// A panel steps behind the app the trader went to: an X11 window can; a
/// layer surface sits over every window and can't (island::handoff closes
/// the panel instead).
pub fn lower_island(win: &WebviewWindow) -> bool {
    if !can_lower() {
        return false;
    }
    let _ = win.set_always_on_top(false);
    true
}

/// Whether the island can step behind another window: not a layer surface.
pub fn can_lower() -> bool {
    !LAYER_SURFACE.load(Ordering::Relaxed)
}

/// Only this rectangle (window-logical px) takes the mouse; `None`: the whole
/// window does. Everything outside goes to the window underneath.
pub fn set_input_region(win: &WebviewWindow, rect: Region) {
    *INPUT_REGION.lock().unwrap() = rect;
    let Ok(gw) = win.gtk_window() else { return };
    apply_input_region(&gw, rect);
}

fn apply_input_region(gw: &impl IsA<gtk::Widget>, rect: Region) {
    match rect {
        None => gw.input_shape_combine_region(None),
        Some((x, y, w, h)) => {
            let Some(gdk_window) = gw.window() else { return };
            let region = gtk::cairo::Region::create_rectangle(&gtk::cairo::RectangleInt::new(
                x.floor() as i32,
                y.floor() as i32,
                w.ceil().max(0.0) as i32,
                h.ceil().max(0.0) as i32,
            ));
            gdk_window.input_shape_combine_region(&region, 0, 0);
        }
    }
}

// ── Updates ───────────────────────────────────────────────────────────────────

/// Where an update's code would be unpacked: next to the build cache.
pub fn update_dir() -> PathBuf {
    xdg("XDG_CACHE_HOME", ".cache").join("candy").join("source")
}


#[cfg(test)]
mod tests {
    use super::*;

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
    fn config_lives_under_xdg_config_home() {
        assert!(config_dir().ends_with("candy"));
        assert!(local_dir().ends_with("candy"));
    }
}
