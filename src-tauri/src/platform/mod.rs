// Everything that differs between operating systems, behind one set of names:
// the rest of the app calls `platform::…` and never touches Win32, a Linux or
// a macOS API directly. Each OS file exposes the same functions; the compiler
// picks one.

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use self::windows::*;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use self::linux::*;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use self::macos::*;

/// Wall-clock time in the user's time zone, for log lines.
pub struct LocalTime {
    pub year: u32,
    pub month: u32,
    pub day: u32,
    pub hour: u32,
    pub minute: u32,
    pub second: u32,
}

/// The island's input region, window-logical px (x, y, width, height); `None`:
/// the whole window takes the mouse.
pub type Region = Option<(f64, f64, f64, f64)>;

/// How the desktop Candy's window can be placed and clicked on this system
/// (see desktop.rs).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum DesktopMode {
    /// Windows: placed anywhere, and a cursor poll drives click-through, the
    /// eyes and the drag, exactly like the island.
    Poll,
    /// Linux on X11 (GNOME through XWayland): an ordinary window the window
    /// manager lets us place; the input region is the click-through and the
    /// page drives the drag.
    Window,
    /// Native Wayland: no way to put a window where the user dropped it, so
    /// Candy stays in the island.
    Off,
}

impl DesktopMode {
    pub fn as_str(self) -> &'static str {
        match self {
            DesktopMode::Poll => "poll",
            DesktopMode::Window => "window",
            DesktopMode::Off => "off",
        }
    }
}

/// Which part of the desktop Candy's window takes the mouse.
#[derive(Clone, Copy, PartialEq, Debug)]
#[cfg_attr(any(windows, target_os = "macos"), allow(dead_code))]
pub enum MouseShape {
    /// Nothing: every click goes to what is underneath (during a flight).
    Empty,
    /// The whole window (while he is being dragged across the screen).
    Whole,
    /// A box, in window-logical pixels: Candy's body.
    Rect { x: f64, y: f64, w: f64, h: f64 },
}
