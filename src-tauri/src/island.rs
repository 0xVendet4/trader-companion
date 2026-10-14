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
use std::time::{Duration, Instant};

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

/// Settings or the Closet open in the island (src/core/panel.ts): room around
/// the panel on the sides away from its screen edge (its ring and shadow),
/// logical px. PANEL_PAD there.
const PANEL_PAD: f64 = 20.0;
/// The largest panel a page may ask for, logical px (the screen caps it too).
const PANEL_MAX: (f64, f64) = (1600.0, 1400.0);

/// How long the cursor rests on the hidden island's edge before it comes back.
/// The strip itself lets clicks through (a browser tab under it stays
/// clickable): resting there is what asks for the island, and a press
/// meanwhile means the click was for what is under it.
const EDGE_DWELL: Duration = Duration::from_millis(450);

/// How long the cursor rests on the ticker at a screen edge before it takes
/// the mouse. Until then the ticker lets clicks through (a browser tab under
/// it stays clickable) and fades so what is under it shows; a press first
/// was a click on that, and the ticker stays out of the way until the cursor
/// leaves it.
const TICKER_DWELL: Duration = Duration::from_millis(350);

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
    /// The notch's height (logical px) on a MacBook that has one, else 0.
    pub notch: f64,
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
    /// Minimized: the edge doesn't bring the island back, so the wake strip
    /// takes nothing at all.
    pub asleep: AtomicBool,
    /// The ticker sits on a screen edge: it lets clicks through until the
    /// cursor rests on it (TICKER_DWELL). Set by the page.
    pub guard: AtomicBool,
    pub rect: Mutex<IslandRect>,
    /// Mirrors the window flag so we only call into the OS when it changes.
    ignoring: AtomicBool,
    /// Set while the floating island is being dragged.
    drag: Mutex<Option<Drag>>,
    /// The band over a notch at the top of the island (logical px), else 0:
    /// the island's contents, and Candy's seat in the ticker, sit under it.
    pub band: Mutex<f64>,
    /// Where the ticker's mascot sits inside the island (logical px from its
    /// top-left corner, under the band), as the page draws it (layout.ts
    /// tickerSeat: the compact one is smaller and higher, the side tab's is
    /// upright): Candy's flights to the desktop start and end there
    /// (desktop.rs island_spot). None until the page has said.
    pub seat: Mutex<Option<(f64, f64)>>,
    /// Where the window was last put, and on which screen: what the page's
    /// drag moves on Linux, where a layer surface has no position to ask.
    placed: Mutex<Placed>,
    /// Settings or the Closet open in the island: the panel's size the page
    /// asked for (logical px). The window grows to hold it (panel_frame),
    /// takes the mouse over all of it and the keyboard; the island neither
    /// hides nor lets the mouse through meanwhile.
    pub panel: Mutex<Option<(f64, f64)>>,
    /// The panel is closing: the island shrinks back inside the window, which
    /// keeps the panel's frame until it has, but the mouse and the keyboard
    /// are already the trader's again (panel_holds).
    pub closing: AtomicBool,
    /// The panel stepped behind the app the trader went to (a key page or the
    /// sounds folder it opened, a click elsewhere): no longer on top until it
    /// is clicked again (panel_focus).
    pub lowered: AtomicBool,
    /// The display a panel opened on: it stays there while open, wherever the
    /// cursor goes (Settings → screen "cursor").
    pub panel_screen: Mutex<Option<String>>,
}

/// The island window's frame (physical px), its screen's top-left corner and scale.
#[derive(Clone, Copy, Default)]
struct Placed {
    x: i32,
    y: i32,
    w: u32,
    h: u32,
    screen: (i32, i32),
    scale: f64,
}

impl PollGate {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(false),
            cv: Condvar::new(),
            collapsed: AtomicBool::new(true),
            asleep: AtomicBool::new(false),
            guard: AtomicBool::new(false),
            rect: Mutex::new(IslandRect::default()),
            ignoring: AtomicBool::new(false),
            drag: Mutex::new(None),
            band: Mutex::new(0.0),
            seat: Mutex::new(None),
            placed: Mutex::new(Placed::default()),
            panel: Mutex::new(None),
            closing: AtomicBool::new(false),
            lowered: AtomicBool::new(false),
            panel_screen: Mutex::new(None),
        }
    }

    /// A panel holds the window: it takes the mouse over all of it and the
    /// keyboard. Not once it is closing.
    pub fn panel_holds(&self) -> bool {
        self.panel().is_some() && !self.closing.load(Ordering::Relaxed)
    }

    /// No panel any more (closed, or the page started again without one).
    pub fn forget_panel(&self) {
        *self.panel.lock().unwrap() = None;
        self.closing.store(false, Ordering::Relaxed);
        self.lowered.store(false, Ordering::Relaxed);
        *self.panel_screen.lock().unwrap() = None;
    }

    /// The panel's size while one is open.
    pub fn panel(&self) -> Option<(f64, f64)> {
        *self.panel.lock().unwrap()
    }

    /// The window's size as last placed, logical px.
    pub fn placed_size(&self) -> (f64, f64) {
        let p = *self.placed.lock().unwrap();
        let scale = if p.scale > 0.0 { p.scale } else { 1.0 };
        (p.w as f64 / scale, p.h as f64 / scale)
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

    pub fn set_seat(&self, seat: (f64, f64)) {
        *self.seat.lock().unwrap() = Some(seat);
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

    pub(crate) fn wait_until_active(&self) {
        let mut guard = self.active.lock().unwrap();
        while !*guard {
            guard = self.cv.wait(guard).unwrap();
        }
    }

    pub(crate) fn is_active(&self) -> bool {
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
    // An open panel stays on the display it opened on while that one is there.
    let pinned = app.try_state::<crate::Shared>().and_then(|sh| sh.gate.panel_screen.lock().unwrap().clone());
    if let Some(name) = pinned {
        let found = app.available_monitors().ok().and_then(|ms| ms.into_iter().find(|m| m.name().is_some_and(|n| *n == name)));
        if found.is_some() {
            return found;
        }
    }
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
                notch: platform::notch_height(&m),
            }
        }
        None => ScreenInfo { x: 0.0, y: 0.0, width: 1920.0, height: 1080.0, scale: 1.0, notch: 0.0 },
    }
}

/// A display's work area (physical px) and its scale; on a MacBook with a
/// notch, also the notch's height (logical px) and the whole screen's left
/// edge, top and width (physical px).
#[derive(Clone, Copy)]
pub struct Display {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
    pub scale: f64,
    pub notch: f64,
    pub screen: (i32, i32, i32),
}

impl Display {
    /// The display's work area: the screen without the taskbar. The taskbar is
    /// always on top too, and Windows brings it forward on any click outside,
    /// so an island over it would vanish behind it. (A Mac's menu bar is left
    /// out too, unless a notch is in it: see window_frame.)
    fn of(m: &Monitor) -> Self {
        let a = m.work_area();
        let (p, s) = (a.position, a.size);
        let (sp, ss) = (m.position(), m.size());
        Self {
            x: p.x,
            y: p.y,
            w: s.width as i32,
            h: s.height as i32,
            scale: m.scale_factor(),
            notch: platform::notch_height(m),
            screen: (sp.x, sp.y, ss.width as i32),
        }
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

/// The band the top island adds over a notch (logical px): the notch's height
/// at the top of a display that has one, else nothing.
fn notch_band(d: Display, s: &Settings) -> f64 {
    if s.placement == "top" {
        d.notch
    } else {
        0.0
    }
}

/// Where the window goes and how big it is (x, y, width, height; physical px)
/// for the placement. Collapsed, it is the wake strip on its edge; a floating
/// island never collapses. In the lower half of the display a floating island
/// hangs from the window's bottom (and opens upwards), as the page draws it.
/// At the top of a MacBook with a notch the window starts at the screen's top
/// edge, over the menu bar, centred on the notch, and is taller by the band the
/// page draws there (the island grows out of the notch).
pub fn window_frame(d: Display, s: &Settings, collapsed: bool) -> (i32, i32, u32, u32) {
    let side = s.placement == "left" || s.placement == "right";
    let band = notch_band(d, s);
    let (lw, lh) = match (collapsed && s.placement != "float", side) {
        (true, true) => (STRIP_H, STRIP_W),
        (true, false) => (STRIP_W, STRIP_H),
        (false, true) => (SIDE_PANEL_W, SIDE_PANEL_H),
        (false, false) => (PANEL_W, PANEL_H + band),
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
        _ if band > 0.0 => (d.screen.0 + (d.screen.2 - wi) / 2, d.screen.1),
        _ => (d.x + (d.w - wi) / 2, d.y),
    };
    (x, y, pw, ph)
}

/// Where the window goes while a panel is open, and how big it is (x, y,
/// width, height; physical px): the panel of `want` (logical px) plus room
/// for its ring on the sides away from the island's edge, never larger than
/// the work area. From the top it hangs centred under the work area's top
/// edge (on a MacBook, under the menu bar and the notch); on a side edge it
/// sits against it, centred vertically; a floating island's panel opens from
/// the ticker, downward in the upper half and upward in the lower half.
/// panelFrame in src/core/panel.ts does the same in logical px.
pub fn panel_frame(d: Display, s: &Settings, want: (f64, f64)) -> (i32, i32, u32, u32) {
    let side = s.placement == "left" || s.placement == "right";
    let pad_w = if side { PANEL_PAD } else { 2.0 * PANEL_PAD };
    let pad_h = if s.placement == "top" { PANEL_PAD } else { 2.0 * PANEL_PAD };
    let pw = ((want.0 + pad_w) * d.scale).round().min(d.w as f64).max(1.0) as u32;
    let ph = ((want.1 + pad_h) * d.scale).round().min(d.h as f64).max(1.0) as u32;
    let (wi, hi) = (pw as i32, ph as i32);
    let (x, y) = match s.placement.as_str() {
        "left" => (d.x, clamp_i(d.y + (d.h - hi) / 2, d.y, d.y + d.h - hi)),
        "right" => (d.x + d.w - wi, clamp_i(d.y + (d.h - hi) / 2, d.y, d.y + d.h - hi)),
        "float" => {
            let cx = d.x as f64 + s.float_x.clamp(0.0, 1.0) * d.w as f64;
            let cy = d.y as f64 + s.float_y.clamp(0.0, 1.0) * d.h as f64;
            // The panel's top where the ticker's top is (its bottom, opening upward).
            let reach = (COMPACT_H / 2.0 + PANEL_PAD) * d.scale;
            let top = if s.float_y > 0.5 { cy + reach - ph as f64 } else { cy - reach };
            (
                clamp_i((cx - pw as f64 / 2.0).round() as i32, d.x, d.x + d.w - wi),
                clamp_i(top.round() as i32, d.y, d.y + d.h - hi),
            )
        }
        _ => (d.x + (d.w - wi) / 2, d.y),
    };
    (x, y, pw, ph)
}

/// The window's frame now: an open panel's, else the island's (or the wake
/// strip, collapsed). A panel never collapses.
pub fn frame_for(d: Display, s: &Settings, collapsed: bool, panel: Option<(f64, f64)>) -> (i32, i32, u32, u32) {
    match panel {
        Some(want) => panel_frame(d, s, want),
        None => window_frame(d, s, collapsed),
    }
}

/// Where the island's own window sits from the panel's window (logical px):
/// the page moves the island by it when the window changes, so the island
/// grows out of the spot it was on and shrinks back into it.
pub fn panel_offset(d: Display, s: &Settings, want: (f64, f64)) -> (f64, f64) {
    let (ix, iy, _, _) = window_frame(d, s, false);
    let (px, py, _, _) = panel_frame(d, s, want);
    ((ix - px) as f64 / d.scale, (iy - py) as f64 / d.scale)
}

/// The display a window is on now: the one under its centre.
pub fn monitor_of_window(app: &AppHandle) -> Option<Monitor> {
    let (pos, size) = frame_now(app)?;
    let cx = pos.x as f64 + size.width as f64 / 2.0;
    let cy = pos.y as f64 + size.height as f64 / 2.0;
    app.available_monitors().ok()?.into_iter().find(|m| monitor_contains(m, cx, cy))
}

/// The display a panel opens on: the island's, else the one the settings name.
pub fn panel_display(app: &AppHandle, s: &Settings) -> Option<Display> {
    let s = effective(s);
    placement_monitor(app, &s).map(|m| Display::of(&m))
}

/// The panel inside its window (logical px, x, y, width, height): everything
/// but the room for its ring on the sides away from the screen edge
/// (panelInWindow in src/core/panel.ts).
pub fn panel_in_window(placement: &str, w: f64, h: f64) -> (f64, f64, f64, f64) {
    let p = PANEL_PAD;
    let (x, y, pw, ph) = match placement {
        "top" => (p, 0.0, w - 2.0 * p, h - p),
        "left" => (0.0, p, w - p, h - 2.0 * p),
        "right" => (p, p, w - p, h - 2.0 * p),
        _ => (p, p, w - 2.0 * p, h - 2.0 * p),
    };
    (x, y, pw.max(0.0), ph.max(0.0))
}

/// A panel size from the page, kept sane: at least something, at most PANEL_MAX.
pub fn clamp_panel(w: f64, h: f64) -> (f64, f64) {
    let ok = |v: f64, max: f64| if v.is_finite() { v.clamp(200.0, max) } else { max };
    (ok(w, PANEL_MAX.0), ok(h, PANEL_MAX.1))
}

/// Where the floating ticker is now: its centre as fractions of the display
/// it sits on, and that display's name. Takes no lock: the window calls wait
/// for the main thread.
pub fn float_fractions(app: &AppHandle, s: &Settings) -> Option<(f64, f64, String)> {
    let (pos, size) = frame_now(app)?;
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

/// The island window's position and size (physical px). With the cursor poll,
/// as the window toolkit says (the poll drags it); without (Linux), where it
/// was last put: a layer surface has no position to ask.
pub fn frame_now(app: &AppHandle) -> Option<(PhysicalPosition<i32>, PhysicalSize<u32>)> {
    if platform::CURSOR_POLL {
        let win = window(app)?;
        return Some((win.outer_position().ok()?, win.outer_size().ok()?));
    }
    let p = *app.try_state::<crate::Shared>()?.gate.placed.lock().unwrap();
    Some((PhysicalPosition::new(p.x, p.y), PhysicalSize::new(p.w, p.h)))
}

/// The placement the island can have here: only the top edge where the
/// window can't be placed (plain Wayland without layer-shell).
pub fn effective(s: &Settings) -> Settings {
    let mut s = s.clone();
    if !platform::can_place() {
        s.placement = "top".into();
    }
    s
}

/// The page drags the floating island (Linux, no cursor poll): the window
/// moves by (dx, dy), logical px.
pub fn drag_by(app: &AppHandle, gate: &PollGate, dx: f64, dy: f64) {
    let Some(win) = window(app) else { return };
    let mut p = gate.placed.lock().unwrap();
    p.x += (dx * p.scale).round() as i32;
    p.y += (dy * p.scale).round() as i32;
    platform::move_window(&win, p.x, p.y, p.screen, p.scale);
}

/// Places and sizes the window. `collapsed` picks the wake strip instead of
/// the island's window; an open panel (PollGate::panel) wins over both.
pub fn apply_geometry(app: &AppHandle, s: &Settings, collapsed: bool) {
    let Some(win) = window(app) else { return };
    let s = &effective(s);
    let Some(m) = placement_monitor(app, s) else { return };
    let d = Display::of(&m);
    let panel = app.try_state::<crate::Shared>().and_then(|shared| shared.gate.panel());
    let (x, y, pw, ph) = frame_for(d, s, collapsed, panel);
    // The page draws the band over the notch (State.notch).
    let _ = app.emit_to(WINDOW_LABEL, "notch", d.notch);
    let screen = (m.position().x, m.position().y);
    if let Some(shared) = app.try_state::<crate::Shared>() {
        // A panel opens under the notch: no band over it.
        *shared.gate.band.lock().unwrap() = if panel.is_some() { 0.0 } else { notch_band(d, s) };
        *shared.gate.placed.lock().unwrap() = Placed { x, y, w: pw, h: ph, screen, scale: d.scale };
    }

    // GTK never sizes a non-resizable window below its natural size (200 px),
    // so on Linux the 6 px wake strip would stay a 200 px block. tao re-applies
    // the config's `resizable: false` after the first configure, so this is
    // asked every time, just before the resize. (From Coucou, found by @YossiYad.)
    #[cfg(target_os = "linux")]
    let _ = win.set_resizable(true);
    let _ = win.set_size(PhysicalSize::new(pw, ph));
    platform::move_window(&win, x, y, screen, d.scale);
    // Moving across displays can rescale the window: re-assert the physical size.
    let _ = win.set_size(PhysicalSize::new(pw, ph));
    // A panel that stepped behind another app stays there until clicked.
    let lowered = app.try_state::<crate::Shared>().is_some_and(|sh| sh.gate.lowered.load(Ordering::Relaxed));
    if !lowered {
        platform::keep_on_top(&win);
    }
}

/// The island's window gained or lost the keyboard while a panel holds it.
/// Lost: the trader went to another app (a key page or the sounds folder the
/// panel opened, or a click elsewhere): the panel steps behind it, as a
/// window would, where the OS lets it (not a Linux layer surface: there the
/// panel closes before handing off, see handoff). Gained: on top again.
pub fn panel_focus(app: &AppHandle, focused: bool) {
    let Some(shared) = app.try_state::<crate::Shared>() else { return };
    let gate = &shared.gate;
    if !gate.panel_holds() {
        return;
    }
    let Some(win) = window(app) else { return };
    if focused {
        if gate.lowered.swap(false, Ordering::Relaxed) {
            platform::keep_on_top(&win);
            let _ = app.emit_to(WINDOW_LABEL, "panel-lowered", false);
        }
        return;
    }
    // The keyboard goes back there when the panel closes.
    platform::note_foreground(&win);
    if !gate.lowered.load(Ordering::Relaxed) && platform::lower_island(&win) {
        gate.lowered.store(true, Ordering::Relaxed);
        let _ = app.emit_to(WINDOW_LABEL, "panel-lowered", true);
    }
}

/// A panel is about to open another app over it (a link, a folder). Where the
/// island can't step behind that app (a Linux layer surface is over every
/// window), the panel closes first, or the app would open under it.
pub fn handoff(app: &AppHandle) {
    let Some(shared) = app.try_state::<crate::Shared>() else { return };
    if shared.gate.panel_holds() && !platform::can_lower() {
        let _ = app.emit_to(WINDOW_LABEL, "panel-handoff", ());
    }
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
            // The ticker guard: since when the cursor rests on it, and whether
            // a press already went through to what is under it.
            let mut rest_since: Option<Instant> = None;
            let mut rest_spoiled = false;
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
                // The ticker on a screen edge does the same until the cursor
                // rests on it.
                let rested = rest(over, left_button_down(), &mut rest_since, &mut rest_spoiled, Instant::now());
                let guarded = gate.guard.load(Ordering::Relaxed) && !rested;
                // Never through an open panel: it is a window to work in.
                let pass = over && !gate.panel_holds() && (ctrl_down() || guarded);
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
                // Collapsed (a last tick before the poll parks), the strip lets
                // everything through: see refresh_click_through.
                if !gate.collapsed.load(Ordering::Relaxed) && gate.ignoring.load(Ordering::Relaxed) == on_island {
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

/// Watches the hidden island's edge (Windows, macOS): the wake strip lets the
/// mouse through, so this reads the cursor instead, and emits `edge-wake` once
/// it has rested on the strip for EDGE_DWELL with no button pressed. A press
/// there was a click on what is under it (a browser tab): nothing until the
/// cursor leaves the strip. Twenty reads a second while collapsed; four while
/// the island is out or minimized, and those only look at two flags.
pub fn spawn_edge_watch(app: AppHandle, gate: Arc<PollGate>) {
    if !platform::CURSOR_POLL {
        return;
    }
    std::thread::spawn(move || {
        let mut since: Option<Instant> = None;
        let mut spoiled = false;
        loop {
            let watching = gate.collapsed.load(Ordering::Relaxed) && !gate.asleep.load(Ordering::Relaxed);
            if !watching {
                since = None;
                // A button held as the island folds away is no reason to wait for a leave.
                spoiled = false;
                std::thread::sleep(Duration::from_millis(250));
                continue;
            }
            std::thread::sleep(Duration::from_millis(50));
            let inside = match (window(&app), cursor_physical()) {
                (Some(win), Some((cx, cy))) => match (win.outer_position(), win.outer_size()) {
                    (Ok(p), Ok(s)) => on_strip((cx, cy), (p.x, p.y, s.width, s.height)),
                    _ => false,
                },
                _ => false,
            };
            if dwell(inside, left_button_down(), &mut since, &mut spoiled, Instant::now()) {
                let _ = app.emit_to(WINDOW_LABEL, "edge-wake", ());
            }
        }
    });
}

/// One read of the ticker guard: has the cursor rested on the ticker long
/// enough to use it? A press before that was for what is under it: no until
/// the cursor leaves.
fn rest(over: bool, down: bool, since: &mut Option<Instant>, spoiled: &mut bool, now: Instant) -> bool {
    if !over {
        *since = None;
        *spoiled = false;
        return false;
    }
    if *spoiled {
        return false;
    }
    let start = *since.get_or_insert(now);
    if now.duration_since(start) >= TICKER_DWELL {
        // Rested: a press now is a press on the ticker.
        return true;
    }
    if down {
        *spoiled = true;
    }
    false
}

/// Is the cursor (physical px) on the strip's frame (x, y, width, height)? One
/// pixel of slack around it: the screen's own edge is where a thrown cursor stops.
fn on_strip(c: (f64, f64), f: (i32, i32, u32, u32)) -> bool {
    let (x, y, w, h) = (f.0 as f64, f.1 as f64, f.2 as f64, f.3 as f64);
    c.0 >= x - 1.0 && c.0 <= x + w && c.1 >= y - 1.0 && c.1 <= y + h
}

/// One read of the edge watch: true when the island should come back now.
fn dwell(inside: bool, down: bool, since: &mut Option<Instant>, spoiled: &mut bool, now: Instant) -> bool {
    if !inside {
        *since = None;
        *spoiled = false;
        return false;
    }
    if down {
        *spoiled = true;
    }
    if *spoiled {
        return false;
    }
    let start = *since.get_or_insert(now);
    if now.duration_since(start) >= EDGE_DWELL {
        // Once: the island is on its way.
        *spoiled = true;
        return true;
    }
    false
}

/// Re-applies click-through after the window or the island changed shape.
///
/// With the cursor poll (Windows, macOS) the window takes the mouse again and
/// the next tick decides from the cursor; collapsed, it takes none (the edge
/// watch reads the cursor instead). Without it (Linux) the input region is set
/// to the island itself, or to the wake strip while collapsed.
pub fn refresh_click_through(app: &AppHandle, gate: &PollGate) {
    if platform::CURSOR_POLL {
        let collapsed = gate.collapsed.load(Ordering::Relaxed);
        set_ignore_cursor(app, collapsed);
        if collapsed {
            gate.ignoring.store(true, Ordering::Relaxed);
        } else {
            gate.forget_ignore_state();
        }
        return;
    }
    let Some(win) = window(app) else { return };
    let placement = app
        .try_state::<crate::Shared>()
        .map(|s| effective(&s.settings.lock().unwrap()).placement)
        .unwrap_or_default();
    let side = placement == "left" || placement == "right";
    let collapsed = gate.collapsed.load(Ordering::Relaxed);
    let asleep = gate.asleep.load(Ordering::Relaxed);
    // Closing, only the island (shrinking back) takes the mouse.
    let panel = gate.panel_holds().then(|| {
        let (w, h) = gate.placed_size();
        panel_in_window(&placement, w, h)
    });
    platform::set_input_region(&win, input_region(collapsed, asleep, side, *gate.rect.lock().unwrap(), panel));
}

/// The part of the window that takes the mouse without a cursor poll: the wake
/// strip while collapsed, upright on a side edge (never "the whole window": if
/// it ever fails to shrink, the rest must not swallow clicks meant for what
/// sits under that edge), nothing while minimized, else the island and its
/// margin, and nothing before it is drawn. An open panel takes the mouse
/// over all of it, from the moment its window grows (the island is still
/// growing into it then).
pub fn input_region(collapsed: bool, asleep: bool, side: bool, r: IslandRect, panel: Option<(f64, f64, f64, f64)>) -> platform::Region {
    if let Some(p) = panel {
        return Some(p);
    }
    if collapsed && asleep {
        return Some((0.0, 0.0, 0.0, 0.0));
    }
    if collapsed {
        return Some(if side { (0.0, 0.0, STRIP_H, STRIP_W) } else { (0.0, 0.0, STRIP_W, STRIP_H) });
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
    use super::{
        clamp_panel, dwell, frame_for, input_region, on_strip, panel_frame, panel_in_window, panel_offset, rest, window_frame, Display, IslandRect, PollGate,
        EDGE_DWELL, STRIP_H, STRIP_W, TICKER_DWELL,
    };
    use std::time::{Duration, Instant};
    use crate::settings::Settings;

    const D: Display = Display { x: 0, y: 0, w: 1920, h: 1080, scale: 1.0, notch: 0.0, screen: (0, 0, 1920) };

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
        let short = Display { x: 0, y: 0, w: 1280, h: 720, scale: 1.25, notch: 0.0, screen: (0, 0, 1280) };
        assert_eq!(window_frame(short, &with("left", 0.5, 0.1), false), (0, 0, 500, 800));
        assert_eq!(window_frame(short, &with("right", 0.5, 0.1), false), (780, 0, 500, 800));
    }

    #[test]
    fn grows_out_of_a_notch() {
        // A 1512 × 982 MacBook at 2×: a 37-point notch in the menu bar, the
        // Dock on the left (the work area starts 120 px in, under the menu bar).
        let mac = Display { x: 120, y: 74, w: 2904, h: 1890, scale: 2.0, notch: 37.0, screen: (0, 0, 3024) };
        // At the very top, centred on the notch, taller by the band.
        assert_eq!(window_frame(mac, &with("top", 0.5, 0.1), false), (792, 0, 1440, 754));
        assert_eq!(window_frame(mac, &with("top", 0.5, 0.1), true), (1272, 0, 480, 12));
        // Anywhere else, the work area as before.
        assert_eq!(window_frame(mac, &with("left", 0.5, 0.1), false).1, 74 + (1890 - 1280) / 2);
        assert_eq!(window_frame(mac, &with("float", 0.5, 0.0), false).1, 74);
        // Without a notch, under the menu bar.
        let plain = Display { notch: 0.0, ..mac };
        assert_eq!(window_frame(plain, &with("top", 0.5, 0.1), false), (120 + (2904 - 1440) / 2, 74, 1440, 680));
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
    fn a_panel_hangs_from_the_islands_edge() {
        // Settings, 680 × 740: from the top, centred, room for the ring on three sides.
        assert_eq!(panel_frame(D, &with("top", 0.5, 0.1), (680.0, 740.0)), (600, 0, 720, 760));
        // On a side edge: against it, centred vertically.
        assert_eq!(panel_frame(D, &with("left", 0.5, 0.1), (680.0, 740.0)), (0, 150, 700, 780));
        assert_eq!(panel_frame(D, &with("right", 0.5, 0.1), (680.0, 740.0)), (1220, 150, 700, 780));
        // Floating in the upper half: the panel's top where the ticker's top is (ticker centre 270).
        assert_eq!(panel_frame(D, &with("float", 0.5, 0.25), (680.0, 740.0)), (600, 234, 720, 780));
        // In the lower half it opens upward: its bottom where the ticker's bottom is (centre 810).
        assert_eq!(panel_frame(D, &with("float", 0.5, 0.75), (680.0, 740.0)), (600, 66, 720, 780));
        // Near the bottom it stays on the work area.
        assert_eq!(panel_frame(D, &with("float", 0.0, 0.45), (680.0, 740.0)), (0, 300, 720, 780));
    }

    #[test]
    fn a_panel_never_leaves_a_small_screen() {
        // 1366 × 768 with a 40 px taskbar: the closet (880 × 640) fits wide, not tall.
        let small = Display { x: 0, y: 0, w: 1366, h: 728, scale: 1.0, notch: 0.0, screen: (0, 0, 1366) };
        for placement in ["top", "left", "right", "float"] {
            for want in [(680.0, 740.0), (880.0, 640.0)] {
                for fy in [0.0, 0.3, 0.7, 1.0] {
                    let (x, y, w, h) = panel_frame(small, &with(placement, 0.9, fy), want);
                    assert!(x >= 0 && y >= 0 && x + w as i32 <= 1366 && y + h as i32 <= 728, "{placement} {want:?} {fy}");
                }
            }
        }
        assert_eq!(panel_frame(small, &with("top", 0.5, 0.1), (680.0, 740.0)), (323, 0, 720, 728));
        // At 125 %, physical px: 720 × 760 logical is 900 × 950.
        let hidpi = Display { x: 0, y: 0, w: 1920, h: 1020, scale: 1.25, notch: 0.0, screen: (0, 0, 1920) };
        assert_eq!(panel_frame(hidpi, &with("top", 0.5, 0.1), (680.0, 740.0)), (510, 0, 900, 950));
    }

    #[test]
    fn a_panel_opens_under_the_menu_bar_and_the_notch() {
        let mac = Display { x: 120, y: 74, w: 2904, h: 1890, scale: 2.0, notch: 37.0, screen: (0, 0, 3024) };
        // The work area's top, not the screen's: no band over the notch.
        assert_eq!(panel_frame(mac, &with("top", 0.5, 0.1), (680.0, 740.0)), (120 + (2904 - 1440) / 2, 74, 1440, 1520));
    }

    #[test]
    fn the_island_keeps_its_spot_on_screen_as_the_panel_window_comes() {
        // Top: both windows centred on the edge; the closet's is 200 px wider, so the island's sits 100 px in.
        assert_eq!(panel_offset(D, &with("top", 0.5, 0.1), (880.0, 640.0)), (100.0, 0.0));
        assert_eq!(panel_offset(D, &with("top", 0.5, 0.1), (680.0, 740.0)), (0.0, 0.0));
        // Right edge: both against it, both centred vertically.
        assert_eq!(panel_offset(D, &with("right", 0.5, 0.1), (680.0, 740.0)), (300.0, 70.0));
        assert_eq!(panel_offset(D, &with("left", 0.5, 0.1), (680.0, 740.0)), (0.0, 70.0));
        // Floating on a laptop, too low for the panel to open from it: the panel is clamped up, the island's window is where it was.
        let laptop = Display { x: 0, y: 0, w: 1366, h: 728, scale: 1.0, notch: 0.0, screen: (0, 0, 1366) };
        let float = with("float", 0.1, 0.3);
        let (ix, iy, _, _) = window_frame(laptop, &float, false);
        let (px, py, _, _) = panel_frame(laptop, &float, (680.0, 740.0));
        assert_eq!((px, py), (0, 0));
        assert_eq!(panel_offset(laptop, &float, (680.0, 740.0)), ((ix - px) as f64, (iy - py) as f64));
        assert!(iy > 150);
        // At 1.5x the offset is in logical px.
        let hidpi = Display { x: 0, y: 0, w: 2880, h: 1620, scale: 1.5, notch: 0.0, screen: (0, 0, 2880) };
        assert_eq!(panel_offset(hidpi, &with("top", 0.5, 0.1), (880.0, 640.0)), (100.0, 0.0));
    }

    #[test]
    fn a_closing_panel_lets_go_of_the_mouse_and_the_keyboard() {
        let gate = PollGate::new();
        assert!(!gate.panel_holds());
        *gate.panel.lock().unwrap() = Some((680.0, 740.0));
        *gate.panel_screen.lock().unwrap() = Some("DISPLAY1".into());
        assert!(gate.panel_holds());
        // Closing: the window keeps the panel's frame, but the panel holds nothing.
        gate.closing.store(true, std::sync::atomic::Ordering::Relaxed);
        assert!(gate.panel().is_some());
        assert!(!gate.panel_holds());
        // Gone (closed, or the page started again): nothing left of it.
        gate.lowered.store(true, std::sync::atomic::Ordering::Relaxed);
        gate.forget_panel();
        assert!(gate.panel().is_none());
        assert!(!gate.closing.load(std::sync::atomic::Ordering::Relaxed));
        assert!(!gate.lowered.load(std::sync::atomic::Ordering::Relaxed));
        assert!(gate.panel_screen.lock().unwrap().is_none());
    }

    #[test]
    fn an_open_panel_wins_over_the_islands_window() {
        let top = with("top", 0.5, 0.1);
        assert_eq!(frame_for(D, &top, false, None), window_frame(D, &top, false));
        assert_eq!(frame_for(D, &top, true, None), window_frame(D, &top, true));
        // Even "collapsed": a panel never folds into the wake strip.
        assert_eq!(frame_for(D, &top, true, Some((680.0, 740.0))), (600, 0, 720, 760));
    }

    #[test]
    fn the_panel_sits_in_its_window_away_from_the_edge() {
        assert_eq!(panel_in_window("top", 720.0, 760.0), (20.0, 0.0, 680.0, 740.0));
        assert_eq!(panel_in_window("left", 700.0, 780.0), (0.0, 20.0, 680.0, 740.0));
        assert_eq!(panel_in_window("right", 700.0, 780.0), (20.0, 20.0, 680.0, 740.0));
        assert_eq!(panel_in_window("float", 720.0, 780.0), (20.0, 20.0, 680.0, 740.0));
        assert_eq!(panel_in_window("float", 10.0, 10.0), (20.0, 20.0, 0.0, 0.0));
    }

    #[test]
    fn a_panel_size_from_the_page_is_kept_sane() {
        assert_eq!(clamp_panel(680.0, 740.0), (680.0, 740.0));
        assert_eq!(clamp_panel(0.0, -5.0), (200.0, 200.0));
        assert_eq!(clamp_panel(f64::NAN, f64::INFINITY), (1600.0, 1400.0));
        assert_eq!(clamp_panel(1e9, 1e9), (1600.0, 1400.0));
    }

    #[test]
    fn without_a_cursor_poll_only_the_island_takes_the_mouse() {
        // Collapsed: the wake strip, never the whole window.
        assert_eq!(input_region(true, false, false, IslandRect::default(), None), Some((0.0, 0.0, STRIP_W, STRIP_H)));
        // Upright on a side edge.
        assert_eq!(input_region(true, false, true, IslandRect::default(), None), Some((0.0, 0.0, STRIP_H, STRIP_W)));
        // Minimized: not even the strip.
        assert_eq!(input_region(true, true, false, IslandRect::default(), None), Some((0.0, 0.0, 0.0, 0.0)));
        // Nothing drawn yet: nothing.
        assert_eq!(input_region(false, false, false, IslandRect::default(), None), Some((0.0, 0.0, 0.0, 0.0)));
        // The island and its margin, kept inside the window.
        let r = IslandRect { x: 200.0, y: 0.0, w: 320.0, h: 32.0 };
        assert_eq!(input_region(false, false, false, r, None), Some((186.0, 0.0, 348.0, 46.0)));
        // A panel open: all of it, whatever the island's size as it grows.
        let p = (20.0, 0.0, 680.0, 740.0);
        assert_eq!(input_region(false, false, false, r, Some(p)), Some(p));
        assert_eq!(input_region(true, true, false, r, Some(p)), Some(p));
    }

    #[test]
    fn the_ticker_lets_clicks_through_until_the_cursor_rests_on_it() {
        let t0 = Instant::now();
        let at = |ms: u64| t0 + Duration::from_millis(ms);
        // Resting: usable after the dwell, and a press then is the ticker's.
        let (mut since, mut spoiled) = (None, false);
        assert!(!rest(true, false, &mut since, &mut spoiled, at(0)));
        assert!(!rest(true, false, &mut since, &mut spoiled, at(200)));
        assert!(rest(true, false, &mut since, &mut spoiled, t0 + TICKER_DWELL));
        assert!(rest(true, true, &mut since, &mut spoiled, at(900)));
        // A quick click on the tab under it: it stays out of the way while the cursor is there.
        let (mut since, mut spoiled) = (None, false);
        assert!(!rest(true, false, &mut since, &mut spoiled, at(0)));
        assert!(!rest(true, true, &mut since, &mut spoiled, at(80)));
        assert!(!rest(true, false, &mut since, &mut spoiled, at(2000)));
        // Leaving starts over.
        assert!(!rest(false, false, &mut since, &mut spoiled, at(2100)));
        assert!(!rest(true, false, &mut since, &mut spoiled, at(2200)));
        assert!(rest(true, false, &mut since, &mut spoiled, at(2200) + TICKER_DWELL));
    }

    #[test]
    fn the_edge_wakes_the_island_only_when_the_cursor_rests_there() {
        // The top strip of a 1920-wide display at 1x.
        let strip = (840, 0, 240, 6);
        assert!(on_strip((900.0, 0.0), strip));
        assert!(on_strip((900.0, -1.0), strip));
        assert!(!on_strip((900.0, 30.0), strip), "a browser tab below the strip");
        assert!(!on_strip((300.0, 0.0), strip), "the top edge away from the island");

        let t0 = Instant::now();
        let at = |ms: u64| t0 + Duration::from_millis(ms);
        let (mut since, mut spoiled) = (None, false);
        // Resting: back after the dwell, once.
        assert!(!dwell(true, false, &mut since, &mut spoiled, at(0)));
        assert!(!dwell(true, false, &mut since, &mut spoiled, at(200)));
        assert!(dwell(true, false, &mut since, &mut spoiled, t0 + EDGE_DWELL));
        assert!(!dwell(true, false, &mut since, &mut spoiled, at(2000)));

        // A click on the tab under the strip: nothing, however long it stays.
        let (mut since, mut spoiled) = (None, false);
        assert!(!dwell(true, false, &mut since, &mut spoiled, at(0)));
        assert!(!dwell(true, true, &mut since, &mut spoiled, at(100)));
        assert!(!dwell(true, false, &mut since, &mut spoiled, at(3000)));
        // Leaving and coming back starts over.
        assert!(!dwell(false, false, &mut since, &mut spoiled, at(3050)));
        assert!(!dwell(true, false, &mut since, &mut spoiled, at(3100)));
        assert!(dwell(true, false, &mut since, &mut spoiled, at(3100) + EDGE_DWELL));

        // Passing through: no.
        let (mut since, mut spoiled) = (None, false);
        assert!(!dwell(true, false, &mut since, &mut spoiled, at(0)));
        assert!(!dwell(false, false, &mut since, &mut spoiled, at(100)));
        assert!(!dwell(true, false, &mut since, &mut spoiled, at(400)));
    }
}
