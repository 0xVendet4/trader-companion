// Everything that touches Win32 lives behind these names, so the rest of the
// app never calls the OS directly.

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use self::windows::*;

/// Wall-clock time in the user's time zone, for log lines.
pub struct LocalTime {
    pub year: u32,
    pub month: u32,
    pub day: u32,
    pub hour: u32,
    pub minute: u32,
    pub second: u32,
}
