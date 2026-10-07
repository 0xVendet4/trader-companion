// Everything that differs between operating systems, behind one set of names:
// the rest of the app calls `platform::…` and never touches Win32 or a Linux
// API directly. Each OS file exposes the same functions; the compiler picks one.

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use self::windows::*;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use self::linux::*;

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
