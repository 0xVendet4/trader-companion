// Island window: placement on the chosen display, the two window sizes
// (full panel / invisible wake strip), click-through, the cursor poll and
// dragging the floating island.
//
// The island is a black shape drawn at the top centre of the display (or a
// side edge, or floating) inside a borderless, transparent, always-on-top
// window that never takes focus. Adapted from Coucou's island.rs (MIT, ©
// Louis Raillé).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow};

use crate::platform::{self, ctrl_down, cursor_physical, left_button_down};
use crate::settings::Settings;

/// Logical size of the full window — room for the largest island view.
pub const PANEL_W: f64 = 720.0;
pub const PANEL_H: f64 = 340.0;
/// On a side edge the window is tall and narrow: the island opens as a sidebar
/// (SIDE_PANEL_W / SIDE_PANEL_H in src/core/layout.ts).
pub const SIDE_PANEL_W: f64 = 400.0;
pub const SIDE_PANEL_H: f64 = 640.0;
/// Logical size of the invisible strip that wakes the island when it is hidden.
pub const STRIP_W: f64 = 240.0;
pub const STRIP_H: f64 = 6.0;

pub const WINDOW_LABEL: &str = "island";

/// Margin around the island that still counts as "on the island", in logical px.
const HIT_MARGIN: f64 = 14.0;

/// A floating island hangs this far from the window edge, and its ticker is
/// this tall (FLOAT_MARGIN and COMPACT_H in src/core/layout.ts).
const FLOAT_MARGIN: f64 = 10.0;
const COMPACT_H: f64 = 32.0;

/// A press that moves less than this (logical px) is a click, not a drag.
const DRAG_SLOP: f64 = 4.0;

/// The floating island being dragged: where the cursor grabbed the window and
/// where the press started, physical px.
#[derive(Clone, Copy)]
pub struct Drag {
    grab_x: f64,
    grab_y: f64,
    from_x: f64,
    from_y: f64,
    moved: bool,
}

#[derive(Serialize, Clone)]
pub struct CursorPayload {
    pub x: f64,
    pub y: f64,
}

#[derive(Serialize, Clone)]
pub struct ScreenInfo {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scale: f64,
}

/// The island shape in window-logical coordinates, pushed by the front end.
/// The poll thread owns the click-through decision so it lands in the same 16 ms
/// tick as the cursor read — an IPC round trip here loses clicks.
#[derive(Clone, Copy, Default)]
pub struct IslandRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Wakes / parks the cursor poll thread so a hidden island costs nothing.
pub struct PollGate {
    active: Mutex<bool>,
    cv: Condvar,
    pub collapsed: AtomicBool,
    pub rect: Mutex<IslandRect>,
    /// Mirrors the window flag so we only call into the OS when it changes.
    ignoring: AtomicBool,
    /// Set while the floating island is being dragged.
    drag: Mutex<Option<Drag>>,
}

impl PollGate {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(false),
            cv: Condvar::new(),
            collapsed: AtomicBool::new(true),
            rect: Mutex::new(IslandRect::default()),
            ignoring: AtomicBool::new(false),
            drag: Mutex::new(None),
        }
    }

    /// Starts a drag: the cursor poll moves the window until the button is let go.
    pub fn start_drag(&self, cursor: (f64, f64), origin: (i32, i32)) {
        *self.drag.lock().unwrap() = Some(Drag {
            grab_x: cursor.0 - origin.0 as f64,
            grab_y: cursor.1 - origin.1 as f64,
            from_x: cursor.0,
            from_y: cursor.1,
            moved: false,
        });
    }

    pub fn set_rect(&self, rect: IslandRect) {
        *self.rect.lock().unwrap() = rect;
    }

    /// Forces the next poll tick to re-apply the flag (after a window resize).
    pub fn forget_ignore_state(&self) {
        self.ignoring.store(false, Ordering::Relaxed);
    }

    pub fn set_active(&self, on: bool) {
        let mut guard = self.active.lock().unwrap();
        *guard = on;
        self.cv.notify_all();
    }

    fn wait_until_active(&self) {
        let mut guard = self.active.lock().unwrap();
        while !*guard {
            guard = self.cv.wait(guard).unwrap();
        }
    }

    fn is_active(&self) -> bool {
        *self.active.lock().unwrap()
    }
}

pub fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(WINDOW_LABEL)
}

fn monitor_contains(m: &Monitor, x: f64, y: f64) -> bool {
    let p = m.position();
    let s = m.size();
    x >= p.x as f64
        && x < (p.x + s.width as i32) as f64
        && y >= p.y as f64
        && y < (p.y + s.height as i32) as f64
}

/// The display the island lives on: the primary one, or the one under the cursor.
fn target_monitor(app: &AppHandle, pref: &str) -> Option<Monitor> {
    let monitors = app.available_monitors().ok()?;
    if pref == "cursor" {
        if let Some((cx, cy)) = cursor_physical() {
            if let Some(m) = monitors.iter().find(|m| monitor_contains(m, cx, cy)) {
                return Some(m.clone());
            }
        }
    }
    app.primary_monitor()
        .ok()
        .flatten()
        .or_else(|| monitors.into_iter().next())
}

/// The display the island is placed on: for a floating island, the one it was
/// dropped on while that display is still there; otherwise the `screen` rule.
fn placement_monitor(app: &AppHandle, s: &Settings) -> Option<Monitor> {
    if s.placement == "float" && !s.float_screen.is_empty() {
        let monitors = app.available_monitors().ok()?;
        if let Some(m) = monitors.into_iter().find(|m| m.name().is_some_and(|n| *n == s.float_screen)) {
            return Some(m);
        }
    }
    target_monitor(app, &s.screen)
}

pub fn screen_info(app: &AppHandle, s: &Settings) -> ScreenInfo {
    match placement_monitor(app, s) {
        Some(m) => {
            let scale = m.scale_factor();
            let p = m.position();
            let s = m.size();
            ScreenInfo {
                x: p.x as f64 / scale,
                y: p.y as f64 / scale,
                width: s.width as f64 / scale,
                height: s.height as f64 / scale,
                scale,
            }
        }
        None => ScreenInfo { x: 0.0, y: 0.0, width: 1920.0, height: 1080.0, scale: 1.0 },
    }
}

/// A display's work area (physical px) and its scale.
#[derive(Clone, Copy)]
pub struct Display {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
    pub scale: f64,
}

impl Display {
    /// The display's work area: the screen without the taskbar. The taskbar is
    /// always on top too, and Windows brings it forward on any click outside,
    /// so an island over it would vanish behind it.
    fn of(m: &Monitor) -> Self {
        let a = m.work_area();
        let (p, s) = (a.position, a.size);
        Self { x: p.x, y: p.y, w: s.width as i32, h: s.height as i32, scale: m.scale_factor() }
    }
}

/// `v` kept within lo..=hi (lo wins when the range is empty).
fn clamp_i(v: i32, lo: i32, hi: i32) -> i32 {
    if hi < lo {
        lo
    } else {
        v.max(lo).min(hi)
    }
}

/// How far the floating ticker's centre sits from the window edge it hangs from, physical px.
fn float_pill(scale: f64) -> f64 {
    (FLOAT_MARGIN + COMPACT_H / 2.0) * scale
}

/// Where the window goes and how big it is (x, y, width, height; physical px)
/// for the placement. Collapsed, it is the wake strip on its edge; a floating
/// island never collapses. In the lower half of the display a floating island
/// hangs from the window's bottom (and opens upwards), as the page draws it.
pub fn window_frame(d: Display, s: &Settings, collapsed: bool) -> (i32, i32, u32, u32) {
    let side = s.placement == "left" || s.placement == "right";
    let (lw, lh) = match (collapsed && s.placement != "float", side) {
        (true, true) => (STRIP_H, STRIP_W),
        (true, false) => (STRIP_W, STRIP_H),
        (false, true) => (SIDE_PANEL_W, SIDE_PANEL_H),
        (false, false) => (PANEL_W, PANEL_H),
    };
    let pw = (lw * d.scale).round().max(1.0) as u32;
    let ph = (lh * d.scale).round().max(1.0) as u32;
    let (wi, hi) = (pw as i32, ph as i32);
    let (x, y) = match s.placement.as_str() {
        // On a display shorter than the sidebar, its top (the tabs) stays on screen.
        "left" => (d.x, clamp_i(d.y + (d.h - hi) / 2, d.y, d.y + d.h - hi)),
        "right" => (d.x + d.w - wi, clamp_i(d.y + (d.h - hi) / 2, d.y, d.y + d.h - hi)),
        "float" => {
            let cx = d.x as f64 + s.float_x.clamp(0.0, 1.0) * d.w as f64;
            let cy = d.y as f64 + s.float_y.clamp(0.0, 1.0) * d.h as f64;
            let pill = float_pill(d.scale);
            let top = if s.float_y > 0.5 { cy + pill - ph as f64 } else { cy - pill };
            (
                clamp_i((cx - pw as f64 / 2.0).round() as i32, d.x, d.x + d.w - wi),
                clamp_i(top.round() as i32, d.y, d.y + d.h - hi),
            )
        }
        _ => (d.x + (d.w - wi) / 2, d.y),
    };
    (x, y, pw, ph)
}

/// Where the floating ticker is now: its centre as fractions of the display
/// it sits on, and that display's name. Takes no lock: the window calls wait
/// for the main thread.
pub fn float_fractions(app: &AppHandle, s: &Settings) -> Option<(f64, f64, String)> {
    let win = window(app)?;
    let pos = win.outer_position().ok()?;
    let size = win.outer_size().ok()?;
    let wx = pos.x as f64 + size.width as f64 / 2.0;
    let wy = pos.y as f64 + size.height as f64 / 2.0;
    // The display under the window's centre, wherever it was dropped.
    let m = app
        .available_monitors()
        .ok()
        .and_then(|ms| ms.into_iter().find(|m| monitor_contains(m, wx, wy)))
        .or_else(|| placement_monitor(app, s))?;
    let d = Display::of(&m);
    let pill = float_pill(d.scale);
    let cy = if s.float_y > 0.5 { pos.y as f64 + size.height as f64 - pill } else { pos.y as f64 + pill };
    Some((
        ((wx - d.x as f64) / d.w as f64).clamp(0.0, 1.0),
        ((cy - d.y as f64) / d.h as f64).clamp(0.0, 1.0),
        m.name().cloned().unwrap_or_default(),
    ))
}

/// The placement the island can have here: without a cursor to read (Linux)
/// only the top edge — a side or floating island needs the cursor poll to hover,
/// drag and pass clicks through.
pub fn effective(s: &Settings) -> Settings {
    let mut s = s.clone();
    if !platform::CURSOR_POLL {
        s.placement = "top".into();
    }
    s
}

/// Places and sizes the window. `collapsed` picks the wake strip instead of the panel.
pub fn apply_geometry(app: &AppHandle, s: &Settings, collapsed: bool) {
    let Some(win) = window(app) else { return };
    let s = &effective(s);
    let Some(m) = placement_monitor(app, s) else { return };
    let (x, y, pw, ph) = window_frame(Display::of(&m), s, collapsed);

    // GTK never sizes a non-resizable window below its natural size (200 px),
    // so on Linux the 6 px wake strip would stay a 200 px block. tao re-applies
    // the config's `resizable: false` after the first configure, so this is
    // asked every time, just before the resize. (From Coucou, found by @YossiYad.)
    #[cfg(target_os = "linux")]
    let _ = win.set_resizable(true);
    let _ = win.set_size(PhysicalSize::new(pw, ph));
    let _ = win.set_position(PhysicalPosition::new(x, y));
    // Moving across displays can rescale the window: re-assert the physical size.
    let _ = win.set_size(PhysicalSize::new(pw, ph));
    let _ = win.set_always_on_top(true);
}

/// Position, size and scale of the monitor the island lives on. Any change here
/// means the island has to be placed again.
fn current_screen_key(app: &AppHandle) -> Option<(i32, i32, u32, u32, u64)> {
    let settings = app
        .try_state::<crate::Shared>()
        .map(|s| s.settings.lock().unwrap().clone())
        .unwrap_or_default();
    let m = placement_monitor(app, &settings)?;
    // The work area: a taskbar moved or resized moves the island too.
    let a = m.work_area();
    Some((a.position.x, a.position.y, a.size.width, a.size.height, m.scale_factor().to_bits()))
}

/// Emits `cursor` (window-logical coordinates) at ~60 Hz while the island is
/// visible. Parked on a condvar the rest of the time.
pub fn spawn_cursor_poll(app: AppHandle, gate: Arc<PollGate>) {
    std::thread::spawn(move || {
        // Remembered across wakes so a display change while hidden is noticed the
        // moment the island comes back.
        let mut last_screen: Option<(i32, i32, u32, u32, u64)> = None;
        // Without a cursor to read (Linux) the loop only watches the display
        // layout, and twice a second is plenty for that.
        let (period, screen_every) = if platform::CURSOR_POLL { (16, 30) } else { (500, 1) };
        loop {
            gate.wait_until_active();
            let mut last = (f64::MIN, f64::MIN);
            let mut ticks: u32 = 0;
            let mut passing = false;
            // A button already held when the island wakes is not a new click.
            let mut was_down = left_button_down();
            while gate.is_active() {
                std::thread::sleep(Duration::from_millis(period));

                // Monitors get plugged in, unplugged, rearranged and rescaled, and
                // an island pinned to coordinates that no longer exist is an island
                // nobody can reach. Checked about twice a second.
                ticks = ticks.wrapping_add(1);
                if ticks % screen_every == 0 {
                    let now = current_screen_key(&app);
                    if now.is_some() && now != last_screen {
                        let first = last_screen.is_none();
                        last_screen = now;
                        if !first {
                            crate::log::line("display layout changed — repositioning");
                            let _ = app.emit_to(WINDOW_LABEL, "screen-changed", ());
                        }
                    }
                }

                let Some(win) = window(&app) else { continue };
                let Ok(origin) = win.outer_position() else { continue };
                let scale = win.scale_factor().unwrap_or(1.0);
                let Some((cx, cy)) = cursor_physical() else { continue };

                // Dragging the floating island: the window follows the cursor
                // until the button is let go. A press that never moved is a click.
                let drag = *gate.drag.lock().unwrap();
                if let Some(mut d) = drag {
                    let down = left_button_down();
                    if down {
                        let slop = DRAG_SLOP * scale;
                        if !d.moved && ((cx - d.from_x).abs() > slop || (cy - d.from_y).abs() > slop) {
                            d.moved = true;
                        }
                        if d.moved {
                            let _ = win.set_position(PhysicalPosition::new(
                                (cx - d.grab_x).round() as i32,
                                (cy - d.grab_y).round() as i32,
                            ));
                        }
                        *gate.drag.lock().unwrap() = Some(d);
                    } else {
                        *gate.drag.lock().unwrap() = None;
                        crate::finish_float_drag(&app, d.moved);
                    }
                    was_down = down;
                    continue;
                }

                let x = (cx - origin.x as f64) / scale;
                let y = (cy - origin.y as f64) / scale;

                // Click-through: the window only takes the mouse over the island
                // shape. A small entry margin means the flag is already off by the
                // time a moving cursor reaches a button.
                let r = *gate.rect.lock().unwrap();
                let over = r.w > 0.0
                    && x >= r.x - HIT_MARGIN
                    && x <= r.x + r.w + HIT_MARGIN
                    && y >= r.y - HIT_MARGIN
                    && y <= r.y + r.h + HIT_MARGIN;
                // Ctrl held over the island: it lets the mouse through to what is
                // behind it (a browser tab's close button…) and the page fades it.
                let pass = over && ctrl_down();
                if pass != passing {
                    passing = pass;
                    let _ = win.emit("pass-through", pass);
                }
                let on_island = over && !pass;

                // A press anywhere else folds the island away (the page decides
                // whether it is open). Checked before the "has the cursor moved"
                // shortcut below: a click needs no movement.
                let down = left_button_down();
                if down && !was_down && !on_island {
                    let _ = win.emit("click-outside", ());
                }
                was_down = down;

                // Before the "has the cursor moved" shortcut: Ctrl changes it
                // without a move.
                if gate.ignoring.load(Ordering::Relaxed) == on_island {
                    gate.ignoring.store(!on_island, Ordering::Relaxed);
                    let _ = win.set_ignore_cursor_events(!on_island);
                }

                if (x - last.0).abs() < 1.0 && (y - last.1).abs() < 1.0 {
                    continue;
                }
                last = (x, y);

                let _ = win.emit("cursor", CursorPayload { x, y });
            }
            // Parked while Ctrl was held over the island: no longer faded.
            if passing {
                let _ = app.emit_to(WINDOW_LABEL, "pass-through", false);
            }
        }
    });
}

/// Re-applies click-through after the window or the island changed shape.
///
/// With the cursor poll (Windows) the window takes the mouse again and the next
/// tick decides from the cursor. Without it (Linux) the input region is set to
/// the island itself, or to the wake strip while collapsed.
pub fn refresh_click_through(app: &AppHandle, gate: &PollGate) {
    if platform::CURSOR_POLL {
        set_ignore_cursor(app, false);
        gate.forget_ignore_state();
        return;
    }
    let Some(win) = window(app) else { return };
    platform::set_input_region(&win, input_region(gate.collapsed.load(Ordering::Relaxed), *gate.rect.lock().unwrap()));
}

/// The part of the window that takes the mouse without a cursor poll: the wake
/// strip while collapsed (never "the whole window": if it ever fails to shrink,
/// the rest must not swallow clicks meant for what sits under the top of the
/// screen), else the island and its margin, and nothing before it is drawn.
pub fn input_region(collapsed: bool, r: IslandRect) -> platform::Region {
    if collapsed {
        return Some((0.0, 0.0, STRIP_W, STRIP_H));
    }
    if r.w <= 0.0 {
        return Some((0.0, 0.0, 0.0, 0.0));
    }
    let x0 = (r.x - HIT_MARGIN).max(0.0);
    let y0 = (r.y - HIT_MARGIN).max(0.0);
    Some((x0, y0, r.x + r.w + HIT_MARGIN - x0, r.y + r.h + HIT_MARGIN - y0))
}

pub fn set_ignore_cursor(app: &AppHandle, ignore: bool) {
    if let Some(win) = window(app) {
        let _ = win.set_ignore_cursor_events(ignore);
    }
}

#[cfg(test)]
mod tests {
    use super::{input_region, window_frame, Display, IslandRect, STRIP_H, STRIP_W};
    use crate::settings::Settings;

    const D: Display = Display { x: 0, y: 0, w: 1920, h: 1080, scale: 1.0 };

    fn with(placement: &str, fx: f64, fy: f64) -> Settings {
        Settings { placement: placement.into(), float_x: fx, float_y: fy, ..Settings::default() }
    }

    #[test]
    fn places_the_window_on_its_edge() {
        assert_eq!(window_frame(D, &with("top", 0.5, 0.1), false), (600, 0, 720, 340));
        assert_eq!(window_frame(D, &with("top", 0.5, 0.1), true), (840, 0, 240, 6));
        assert_eq!(window_frame(D, &with("left", 0.5, 0.1), false), (0, 220, 400, 640));
        assert_eq!(window_frame(D, &with("right", 0.5, 0.1), false), (1520, 220, 400, 640));
        assert_eq!(window_frame(D, &with("left", 0.5, 0.1), true), (0, 420, 6, 240));
        assert_eq!(window_frame(D, &with("right", 0.5, 0.1), true), (1914, 420, 6, 240));
    }

    #[test]
    fn keeps_the_sidebar_top_on_a_short_display() {
        // 1280×720 at 125%: the 640-logical sidebar (800 px) is taller than the display.
        let short = Display { x: 0, y: 0, w: 1280, h: 720, scale: 1.25 };
        assert_eq!(window_frame(short, &with("left", 0.5, 0.1), false), (0, 0, 500, 800));
        assert_eq!(window_frame(short, &with("right", 0.5, 0.1), false), (780, 0, 500, 800));
    }

    #[test]
    fn floats_where_dragged_and_stays_on_the_display() {
        // Upper half: the ticker's centre is 26 px below the window's top.
        assert_eq!(window_frame(D, &with("float", 0.5, 0.25), false), (600, 244, 720, 340));
        // Lower half: it hangs from the window's bottom.
        assert_eq!(window_frame(D, &with("float", 0.5, 0.75), false), (600, 496, 720, 340));
        // Never collapses, and never leaves the display.
        assert_eq!(window_frame(D, &with("float", 0.0, 0.0), true), (0, 0, 720, 340));
        assert_eq!(window_frame(D, &with("float", 1.0, 1.0), false), (1200, 740, 720, 340));
    }

    #[test]
    fn without_a_cursor_poll_only_the_island_takes_the_mouse() {
        // Collapsed: the wake strip, never the whole window.
        assert_eq!(input_region(true, IslandRect::default()), Some((0.0, 0.0, STRIP_W, STRIP_H)));
        // Nothing drawn yet: nothing.
        assert_eq!(input_region(false, IslandRect::default()), Some((0.0, 0.0, 0.0, 0.0)));
        // The island and its margin, kept inside the window.
        let r = IslandRect { x: 200.0, y: 0.0, w: 320.0, h: 32.0 };
        assert_eq!(input_region(false, r), Some((186.0, 0.0, 348.0, 46.0)));
    }
}
