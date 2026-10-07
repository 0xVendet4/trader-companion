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
//     there is no Ctrl pass-through, side or floating placement.

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use gtk::glib::translate::ToGlibPtr;
use gtk::prelude::*;
use tauri::WebviewWindow;

use super::{LocalTime, Region};

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

// ── Island window ─────────────────────────────────────────────────────────────

/// The few gtk-layer-shell calls we need, straight from the C library.
mod layer {
    use gtk::ffi::GtkWindow;
    use std::os::raw::{c_char, c_int};

    pub const LAYER_OVERLAY: c_int = 3;
    pub const EDGE_TOP: c_int = 2;
    pub const KEYBOARD_NONE: c_int = 0;
    pub const KEYBOARD_ON_DEMAND: c_int = 2;

    #[link(name = "gtk-layer-shell")]
    extern "C" {
        pub fn gtk_layer_is_supported() -> c_int;
        pub fn gtk_layer_init_for_window(window: *mut GtkWindow);
        pub fn gtk_layer_set_namespace(window: *mut GtkWindow, name_space: *const c_char);
        pub fn gtk_layer_set_layer(window: *mut GtkWindow, layer: c_int);
        pub fn gtk_layer_set_anchor(window: *mut GtkWindow, edge: c_int, anchor: c_int);
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
    // tao gives undecorated Wayland windows an empty titlebar to force
    // client-side decorations. A layer surface has none, and a client-decorated
    // GtkWindow recomputes its own input region (shadow margins included) on
    // every map, over ours.
    gw.set_titlebar(None::<&gtk::Widget>);
    let ptr = gtk_window_ptr(&gw);
    unsafe {
        layer::gtk_layer_init_for_window(ptr);
        layer::gtk_layer_set_namespace(ptr, c"candy".as_ptr());
        layer::gtk_layer_set_layer(ptr, layer::LAYER_OVERLAY);
        // Top edge only: the compositor centres the surface horizontally.
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
        apply_input_region(w, *INPUT_REGION.lock().unwrap());
        if !remapped.replace(true) {
            let w = w.clone();
            gtk::glib::idle_add_local_once(move || {
                w.hide();
                w.show_all();
                apply_input_region(&w, *INPUT_REGION.lock().unwrap());
            });
        }
        gtk::glib::Propagation::Proceed
    });
    LAYER_SURFACE.store(true, Ordering::Relaxed);
    crate::log::line("island is a layer-shell overlay");
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
