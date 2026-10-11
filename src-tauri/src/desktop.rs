// Candy on the desktop: his own small window, wherever the trader dropped him.
// Adapted from Coucou's desktop.rs (MIT, © Louis Raillé).
//
// The island page runs his life cycle (src/island/desktop.ts): fly out, back
// to the island for an alert card, home. This file owns the window — where it
// is, which part of it takes the mouse, the flights, the drag, the saved spot.
//
// How the window is placed depends on the system (platform::DesktopMode):
//   * Windows: anywhere, in physical desktop pixels. A cursor poll — running
//     only while he is awake on the desktop — makes the window click-through
//     except over his body, feeds his eyes, and carries him during a drag.
//   * Linux on X11 (GNOME runs Candy through XWayland): the same coordinates;
//     the input region is his body, and the page drives the drag.
//   * Native Wayland: no way to put a window where the user dropped it, so
//     nothing is created and he stays in the island.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::island::{self, PollGate};
use crate::platform::{self, DesktopMode, MouseShape};
use crate::settings::{self, DesktopSpot};

pub const LABEL: &str = "candy";

/// Side of the square window, logical pixels: the mascot's box (112 px) with
/// its canvases' overhang (150 %) around it, so a hop or a hat is never cut.
pub const SIZE: f64 = 168.0;
/// Kept between him and the edges of the work area.
const MARGIN: f64 = 24.0;
/// To and from the island (0.45 s, ease in-out).
const FLIGHT_MS: u64 = 450;
/// Settling into his spot after a drop (0.25 s, with a little overshoot).
const SNAP_MS: u64 = 250;
const TICK_MS: u64 = 16;
/// Where the compact island's mascot sits inside the island's shape (logical
/// px from its top-left corner): flights start and end there.
const ISLAND_MASCOT: (f64, f64) = (24.0, 16.0);

/// Windows never hides his window: it parks it off-screen. tao shows a hidden
/// window again with SW_SHOW, which may take the keyboard focus from whatever
/// the user is typing in each time he flies out; a window created visible
/// (shown without activation) and only ever moved never does. Same as the
/// island, which is never re-shown either.
const PARK: bool = cfg!(windows);
const PARKED: (f64, f64) = (-32000.0, -32000.0);

// ── Pure geometry ─────────────────────────────────────────────────────────────

pub mod logic {
    /// A rectangle, y down, in whatever space the caller works in.
    #[derive(Clone, Copy, Debug, PartialEq)]
    pub struct Rect {
        pub x: f64,
        pub y: f64,
        pub w: f64,
        pub h: f64,
    }

    impl Rect {
        pub fn contains(&self, p: (f64, f64)) -> bool {
            p.0 >= self.x && p.0 < self.x + self.w && p.1 >= self.y && p.1 < self.y + self.h
        }

        pub fn center(&self) -> (f64, f64) {
            (self.x + self.w / 2.0, self.y + self.h / 2.0)
        }
    }

    /// A connected display: its whole area, the part windows may use (no
    /// taskbar), and how many of the space's units make one logical pixel.
    #[derive(Clone, Copy, Debug, PartialEq)]
    pub struct Display {
        pub frame: Rect,
        pub work: Rect,
        pub scale: f64,
    }

    /// Radius of the clickable body, as a fraction of the window side: the
    /// candle's body with a little room around it.
    pub const BODY_RADIUS_FRACTION: f64 = 0.22;

    /// Hit test of the body inside the square window (window-local).
    pub fn is_over_body(local: (f64, f64), size: f64) -> bool {
        let c = size / 2.0;
        let r = size * BODY_RADIUS_FRACTION;
        let (dx, dy) = (local.0 - c, local.1 - c);
        dx * dx + dy * dy <= r * r
    }

    /// Keeps a window of side `size` inside `work`, `margin` from each edge.
    pub fn clamp_origin(origin: (f64, f64), size: f64, work: Rect, margin: f64) -> (f64, f64) {
        (
            origin.0.max(work.x + margin).min(work.x + work.w - size - margin),
            origin.1.max(work.y + margin).min(work.y + work.h - size - margin),
        )
    }

    /// The display whose frame holds `p`, or else the one whose centre is closest.
    pub fn display_near(p: (f64, f64), displays: &[Display]) -> Option<Display> {
        displays.iter().copied().find(|d| d.frame.contains(p)).or_else(|| {
            displays.iter().copied().min_by(|a, b| {
                let da = dist2(p, a.work.center());
                let db = dist2(p, b.work.center());
                da.total_cmp(&db)
            })
        })
    }

    fn dist2(a: (f64, f64), b: (f64, f64)) -> f64 {
        (a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)
    }

    /// Where a window dropped with its top-left at `origin` settles: inside the
    /// work area of the display under its centre (or the nearest one).
    pub fn settle(origin: (f64, f64), displays: &[Display], size: f64, margin: f64) -> (f64, f64) {
        let Some(first) = displays.first() else { return origin };
        let half = size * first.scale / 2.0;
        let Some(d) = display_near((origin.0 + half, origin.1 + half), displays) else {
            return origin;
        };
        clamp_origin(origin, size * d.scale, d.work, margin * d.scale)
    }

    /// A spot saved at an earlier launch, checked against the displays
    /// connected now: `None` when none of them holds its centre any more (the
    /// monitor was unplugged) — he then stays in the island. A spot that is
    /// still on a display is pulled back inside its work area.
    pub fn restore_spot(spot: (f64, f64), displays: &[Display], size: f64, margin: f64) -> Option<(f64, f64)> {
        displays.iter().find_map(|d| {
            let s = size * d.scale;
            let center = (spot.0 + s / 2.0, spot.1 + s / 2.0);
            d.frame.contains(center).then(|| clamp_origin(spot, s, d.work, margin * d.scale))
        })
    }

    /// First visit: the bottom-right corner of the work area.
    pub fn default_spot(d: &Display, size: f64, margin: f64) -> (f64, f64) {
        let s = size * d.scale;
        let m = margin * d.scale;
        (d.work.x + d.work.w - s - m, d.work.y + d.work.h - s - m)
    }

    pub fn ease_in_out(t: f64) -> f64 {
        if t < 0.5 {
            4.0 * t * t * t
        } else {
            1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
        }
    }

    /// Ease-out with a small overshoot: the landing.
    pub fn ease_out_back(t: f64) -> f64 {
        let c1 = 1.3;
        let c3 = c1 + 1.0;
        1.0 + c3 * (t - 1.0).powi(3) + c1 * (t - 1.0).powi(2)
    }

    pub fn lerp(a: (f64, f64), b: (f64, f64), t: f64) -> (f64, f64) {
        (a.0 + (b.0 - a.0) * t, a.1 + (b.1 - a.1) * t)
    }
}

use logic::{Display, Rect};

// ── State ─────────────────────────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    /// Dragged out of the island.
    Island,
    /// Picked up where he sat on the desktop.
    Desktop,
}

#[derive(Clone, Copy)]
struct Carry {
    /// Cursor minus the window's top-left at pick-up, physical (Poll mode).
    grab: (f64, f64),
    from: Source,
}

#[derive(Default)]
struct Inner {
    /// The window is on screen.
    shown: bool,
    /// Sitting on the desktop, taking pokes (not flying, not carried).
    landed: bool,
    asleep: bool,
    carry: Option<Carry>,
    /// Top-left corner, physical pixels.
    pos: (f64, f64),
    /// Poll mode: the click-through state last applied.
    ignoring: Option<bool>,
}

pub struct Desktop {
    pub mode: DesktopMode,
    gate: PollGate,
    inner: Mutex<Inner>,
    /// Bumped by every flight: an older one still running stops moving him.
    flight: AtomicU64,
}

impl Desktop {
    fn new(mode: DesktopMode) -> Self {
        Self { mode, gate: PollGate::new(), inner: Mutex::new(Inner::default()), flight: AtomicU64::new(0) }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Dropped {
    from: Source,
    home: bool,
}

#[derive(Serialize, Clone)]
struct Cursor {
    x: f64,
    y: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopInfo {
    /// "poll" | "window" | "off".
    mode: &'static str,
    /// He was on the desktop when the app last quit.
    on_desktop: bool,
    /// His window is on screen now: a page that loaded after it was shown
    /// never heard "desktop-visible" and asks here instead.
    shown: bool,
    /// The page drags him by how far the mouse goes, not by screen position
    /// (a layer surface on Wayland: KDE, Sway…).
    drags_by_delta: bool,
}

pub fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

fn body_shape() -> MouseShape {
    let r = SIZE * logic::BODY_RADIUS_FRACTION;
    MouseShape::Rect { x: SIZE / 2.0 - r, y: SIZE / 2.0 - r, w: 2.0 * r, h: 2.0 * r }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

/// Same reasoning as the settings window: created at launch, before the
/// island's webview, then only moved (or shown and hidden). Nothing is created
/// where the feature is off.
pub fn setup(app: &AppHandle) {
    let mut mode = platform::desktop_mode();
    if mode != DesktopMode::Off {
        match create_window(app) {
            Some(win) if platform::prepare_desktop_window(&win) => {}
            Some(win) => {
                let _ = win.destroy();
                mode = DesktopMode::Off;
            }
            None => mode = DesktopMode::Off,
        }
    }
    crate::log::line(format!("desktop Candy: {}", mode.as_str()));
    let desktop = Arc::new(Desktop::new(mode));
    app.manage(desktop.clone());
    // Nothing takes the mouse until he is out.
    refresh(app, &desktop);
    if mode == DesktopMode::Poll {
        spawn_poll(app.clone(), desktop);
    }
}

fn page_url(app: &AppHandle) -> WebviewUrl {
    #[cfg(dev)]
    if let Some(mut base) = app.config().build.dev_url.clone() {
        base.set_path("/desktop.html");
        return WebviewUrl::External(base);
    }
    let _ = app;
    WebviewUrl::App("desktop.html".into())
}

fn create_window(app: &AppHandle) -> Option<WebviewWindow> {
    let mut builder = WebviewWindowBuilder::new(app, LABEL, page_url(app))
        .additional_browser_args(crate::BROWSER_ARGS)
        .title("Candy")
        .inner_size(SIZE, SIZE)
        // GTK won't size a non-resizable window below its natural size (see
        // island::apply_geometry). Windows would grow resize borders instead.
        .resizable(cfg!(target_os = "linux"))
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        .focused(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .disable_drag_drop_handler()
        .focusable(false)
        .visible(PARK);
    if PARK {
        builder = builder.position(PARKED.0, PARKED.1);
    }
    match builder.build() {
        Ok(win) => {
            // The builder's position doesn't always stick on Windows: he was
            // seen sitting in the corner where Windows cascades new windows,
            // next to the island's own Candy. Park him for sure.
            if PARK {
                let _ = win.set_position(PhysicalPosition::new(PARKED.0 as i32, PARKED.1 as i32));
            }
            Some(win)
        }
        Err(err) => {
            crate::log::line(format!("desktop Candy window failed: {err}"));
            None
        }
    }
}

// ── Coordinates ───────────────────────────────────────────────────────────────

/// Connected displays, physical pixels.
fn displays(app: &AppHandle) -> Vec<Display> {
    let Ok(monitors) = app.available_monitors() else { return Vec::new() };
    monitors
        .iter()
        .map(|m| {
            let (p, s, wa) = (m.position(), m.size(), m.work_area());
            Display {
                frame: Rect { x: p.x as f64, y: p.y as f64, w: s.width as f64, h: s.height as f64 },
                work: Rect {
                    x: wa.position.x as f64,
                    y: wa.position.y as f64,
                    w: wa.size.width as f64,
                    h: wa.size.height as f64,
                },
                scale: m.scale_factor(),
            }
        })
        .collect()
}

/// The island's shape on screen (physical pixels) and the scale there. The
/// shape is what the page last pushed (the poll's hit rect); with none yet,
/// the whole island window.
fn island_rect(app: &AppHandle) -> Option<(Rect, f64)> {
    let win = island::window(app)?;
    let (pos, size) = island::frame_now(app)?;
    let scale = win.scale_factor().unwrap_or(1.0);
    let shape = app.try_state::<crate::Shared>().map(|s| *s.gate.rect.lock().unwrap());
    Some(match shape {
        Some(r) if r.w > 0.0 => (
            Rect { x: pos.x as f64 + r.x * scale, y: pos.y as f64 + r.y * scale, w: r.w * scale, h: r.h * scale },
            scale,
        ),
        _ => (Rect { x: pos.x as f64, y: pos.y as f64, w: size.width as f64, h: size.height as f64 }, scale),
    })
}

/// Top-left corner of his window when he sits in the island's ticker: where
/// the flights start and end.
fn island_spot(app: &AppHandle) -> Option<(f64, f64)> {
    let (r, scale) = island_rect(app)?;
    let s = SIZE * scale;
    // Under the band over a notch, if the island has one.
    let band = app.try_state::<crate::Shared>().map_or(0.0, |sh| *sh.gate.band.lock().unwrap());
    Some((r.x + ISLAND_MASCOT.0 * scale - s / 2.0, r.y + (band + ISLAND_MASCOT.1) * scale - s / 2.0))
}

/// The window side in physical pixels.
fn side(app: &AppHandle) -> f64 {
    SIZE * window(app).and_then(|w| w.scale_factor().ok()).unwrap_or(1.0)
}

/// Island-window client coordinates (logical) → physical desktop pixels.
fn from_island_client(app: &AppHandle, x: f64, y: f64) -> Option<(f64, f64)> {
    let island = island::window(app)?;
    let (pos, _) = island::frame_now(app)?;
    let scale = island.scale_factor().unwrap_or(1.0);
    Some((pos.x as f64 + x * scale, pos.y as f64 + y * scale))
}

// ── Window operations ─────────────────────────────────────────────────────────

fn place(app: &AppHandle, d: &Desktop, pos: (f64, f64)) {
    d.inner.lock().unwrap().pos = pos;
    let Some(win) = window(app) else { return };
    // The display his centre is on (a layer surface is placed within one).
    let s = side(app);
    let centre = (pos.0 + s / 2.0, pos.1 + s / 2.0);
    let all = displays(app);
    let (screen, scale) = all
        .iter()
        .find(|d| d.frame.contains(centre))
        .or(all.first())
        .map_or(((0, 0), 1.0), |d| ((d.frame.x as i32, d.frame.y as i32), d.scale));
    platform::move_window(&win, pos.0.round() as i32, pos.1.round() as i32, screen, scale);
}

fn show(app: &AppHandle, d: &Desktop, at: (f64, f64)) {
    place(app, d, at);
    d.inner.lock().unwrap().shown = true;
    if let Some(win) = window(app) {
        if !PARK {
            let _ = win.show();
        }
        let _ = win.set_always_on_top(true);
    }
    refresh(app, d);
    // The page draws only while he is on screen.
    let _ = app.emit_to(LABEL, "desktop-visible", true);
}

fn hide(app: &AppHandle, d: &Desktop) {
    {
        let mut i = d.inner.lock().unwrap();
        i.shown = false;
        i.landed = false;
        i.carry = None;
        i.asleep = false;
    }
    refresh(app, d);
    if PARK {
        place(app, d, PARKED);
    } else if let Some(win) = window(app) {
        let _ = win.hide();
    }
    let _ = app.emit_to(LABEL, "desktop-visible", false);
}

/// Re-derives the poll gate and what takes the mouse from the current state.
fn refresh(app: &AppHandle, d: &Desktop) {
    let (active, ignore, shape) = {
        let mut i = d.inner.lock().unwrap();
        let active = i.shown && (i.carry.is_some() || (i.landed && !i.asleep));
        // Poll mode: Some(flag) is decided here; None leaves it to the poll.
        let ignore = if !i.shown || (!i.landed && i.carry.is_none()) {
            Some(true)
        } else if let Some(c) = i.carry {
            Some(c.from == Source::Island)
        } else if i.asleep {
            // Asleep, nothing polls: the whole little window takes the mouse
            // and acts as his own wake area — the first move over it wakes
            // him, and the poll gives the rest back right away.
            Some(false)
        } else {
            None
        };
        if ignore.is_none() {
            i.ignoring = None;
        }
        let shape = if !i.shown || (!i.landed && i.carry.is_none()) {
            MouseShape::Empty
        } else if matches!(i.carry, Some(Carry { from: Source::Island, .. })) {
            MouseShape::Empty
        } else if i.carry.is_some() {
            MouseShape::Whole
        } else {
            body_shape()
        };
        (active, ignore, shape)
    };
    let Some(win) = window(app) else { return };
    match d.mode {
        DesktopMode::Poll => {
            if let Some(flag) = ignore {
                d.inner.lock().unwrap().ignoring = Some(flag);
                let _ = win.set_ignore_cursor_events(flag);
            }
            d.gate.set_active(active);
        }
        DesktopMode::Window => {
            let _ = app.run_on_main_thread(move || platform::set_desktop_shape(&win, shape));
        }
        DesktopMode::Off => {}
    }
}

/// Moves him from where he is to `to` over `ms`, then lands him. False when
/// another flight took over before the end. Blocks: called off the main thread.
fn fly(app: &AppHandle, d: &Desktop, to: (f64, f64), ms: u64, ease: fn(f64) -> f64) -> bool {
    let token = d.flight.fetch_add(1, Ordering::SeqCst) + 1;
    let from = d.inner.lock().unwrap().pos;
    let steps = (ms / TICK_MS).max(1);
    for k in 1..=steps {
        if d.flight.load(Ordering::SeqCst) != token {
            return false;
        }
        let t = k as f64 / steps as f64;
        place(app, d, logic::lerp(from, to, ease(t)));
        std::thread::sleep(Duration::from_millis(TICK_MS));
    }
    d.flight.load(Ordering::SeqCst) == token
}

/// Saves what changed about him in the preferences.
fn remember(app: &AppHandle, change: impl FnOnce(&mut settings::DesktopPref)) {
    let Some(shared) = app.try_state::<crate::Shared>() else { return };
    let snapshot = {
        let mut s = shared.settings.lock().unwrap();
        change(&mut s.desktop);
        s.clone()
    };
    if let Err(err) = settings::save(&snapshot) {
        crate::log::line(format!("could not save settings: {err}"));
    }
}

fn remember_spot(app: &AppHandle, pos: (f64, f64), on_desktop: bool) {
    remember(app, |p| {
        p.on_desktop = on_desktop;
        p.spot = Some(DesktopSpot { x: pos.0, y: pos.1 });
    });
}

/// Where he lands when he flies out, or `None` when his spot is on a display
/// that is no longer connected — unless `anywhere`: then the first-visit corner.
fn target_spot(app: &AppHandle, anywhere: bool) -> Option<(f64, f64)> {
    let all = displays(app);
    let saved = app.try_state::<crate::Shared>().and_then(|s| s.settings.lock().unwrap().desktop.spot.clone());
    // A fresh start in the corner of the island's display.
    let corner = || {
        let (r, _) = island_rect(app)?;
        let home = logic::display_near(r.center(), &all)?;
        Some(logic::default_spot(&home, SIZE, MARGIN))
    };
    match saved {
        Some(spot) => {
            let restored = logic::restore_spot((spot.x, spot.y), &all, SIZE, MARGIN);
            if anywhere {
                restored.or_else(corner)
            } else {
                restored
            }
        }
        None => corner(),
    }
}

/// The drop, wherever it came from: home if his centre is over the island's
/// shape, otherwise his new spot.
fn finish_drop(app: &AppHandle, d: &Desktop, pos: (f64, f64), from: Source) {
    let s = side(app);
    let center = (pos.0 + s / 2.0, pos.1 + s / 2.0);
    let home = island_rect(app).map(|(r, _)| r.contains(center)).unwrap_or(false);
    {
        let mut i = d.inner.lock().unwrap();
        i.carry = None;
        i.landed = !home;
    }
    if home {
        if from == Source::Island {
            // Back where he came from: he simply reappears in the island.
            hide(app, d);
        } else {
            // The island page flies him home (and forgets the spot).
            refresh(app, d);
        }
    } else {
        let spot = logic::settle(pos, &displays(app), SIZE, MARGIN);
        refresh(app, d);
        if spot != pos {
            fly(app, d, spot, SNAP_MS, logic::ease_out_back);
        }
        remember_spot(app, spot, true);
    }
    let _ = app.emit_to(island::WINDOW_LABEL, "desktop-dropped", Dropped { from, home });
}

// ── Poll (Windows) ────────────────────────────────────────────────────────────

/// Runs only while he is awake on the desktop or being carried: click-through
/// from the body hit test, the cursor for his eyes, and the drag.
fn spawn_poll(app: AppHandle, d: Arc<Desktop>) {
    std::thread::spawn(move || loop {
        d.gate.wait_until_active();
        let mut last = (f64::MIN, f64::MIN);
        while d.gate.is_active() {
            std::thread::sleep(Duration::from_millis(TICK_MS));
            let Some(win) = window(&app) else { continue };
            let Some((cx, cy)) = platform::cursor_physical() else { continue };
            let carry = d.inner.lock().unwrap().carry;

            if let Some(c) = carry {
                let pos = (cx - c.grab.0, cy - c.grab.1);
                if platform::left_button_down() {
                    if pos != d.inner.lock().unwrap().pos {
                        place(&app, &d, pos);
                    }
                } else {
                    // Released: the drop may snap him into place, which waits.
                    d.inner.lock().unwrap().carry = None;
                    let app2 = app.clone();
                    let d2 = d.clone();
                    std::thread::spawn(move || finish_drop(&app2, &d2, pos, c.from));
                }
                continue;
            }
            // Between a release and the drop being settled, nothing to decide.
            if !d.inner.lock().unwrap().landed {
                continue;
            }

            let Ok(origin) = win.outer_position() else { continue };
            let scale = win.scale_factor().unwrap_or(1.0);
            let local = ((cx - origin.x as f64) / scale, (cy - origin.y as f64) / scale);
            let accept = logic::is_over_body(local, SIZE);
            {
                let mut i = d.inner.lock().unwrap();
                if i.ignoring != Some(!accept) {
                    i.ignoring = Some(!accept);
                    let _ = win.set_ignore_cursor_events(!accept);
                }
            }
            if (local.0 - last.0).abs() >= 1.0 || (local.1 - last.1).abs() >= 1.0 {
                last = local;
                let _ = app.emit_to(LABEL, "desktop-cursor", Cursor { x: local.0, y: local.1 });
            }
        }
    });
}

// ── Commands ──────────────────────────────────────────────────────────────────

fn desktop(app: &AppHandle) -> Arc<Desktop> {
    app.state::<Arc<Desktop>>().inner().clone()
}

#[tauri::command]
pub fn desktop_info(app: AppHandle, desktop: State<Arc<Desktop>>) -> DesktopInfo {
    let on_desktop = app
        .try_state::<crate::Shared>()
        .map(|s| s.settings.lock().unwrap().desktop.on_desktop)
        .unwrap_or(false);
    let shown = desktop.inner.lock().unwrap().shown;
    DesktopInfo {
        mode: desktop.mode.as_str(),
        on_desktop: on_desktop && desktop.mode != DesktopMode::Off,
        shown,
        drags_by_delta: platform::desktop_drags_by_delta(),
    }
}

/// Dragging Candy out of the island: the window appears under the pointer
/// (`x`, `y`: island-window client coordinates) and follows it — the cursor
/// poll carries it on Windows, `desktop_carry` elsewhere.
#[tauri::command]
pub async fn desktop_pick_up(app: AppHandle, x: f64, y: f64) -> bool {
    let d = desktop(&app);
    if d.mode == DesktopMode::Off || window(&app).is_none() || d.inner.lock().unwrap().shown {
        return false;
    }
    let s = side(&app);
    let center = match d.mode {
        DesktopMode::Poll => platform::cursor_physical(),
        _ => from_island_client(&app, x, y),
    };
    let Some(center) = center else { return false };
    d.flight.fetch_add(1, Ordering::SeqCst);
    d.inner.lock().unwrap().carry = Some(Carry { grab: (s / 2.0, s / 2.0), from: Source::Island });
    show(&app, &d, (center.0 - s / 2.0, center.1 - s / 2.0));
    true
}

/// Linux: the pointer moved while Candy is being dragged out of the island.
#[tauri::command]
pub async fn desktop_carry(app: AppHandle, x: f64, y: f64) {
    let d = desktop(&app);
    if d.mode == DesktopMode::Poll || d.inner.lock().unwrap().carry.is_none() {
        return;
    }
    let s = side(&app);
    if let Some(c) = from_island_client(&app, x, y) {
        place(&app, &d, (c.0 - s / 2.0, c.1 - s / 2.0));
    }
}

/// Linux: the button went up while Candy was being dragged out of the island.
#[tauri::command]
pub async fn desktop_carry_end(app: AppHandle, x: f64, y: f64) {
    let d = desktop(&app);
    if d.mode == DesktopMode::Poll || d.inner.lock().unwrap().carry.is_none() {
        return;
    }
    let s = side(&app);
    let pos = from_island_client(&app, x, y)
        .map(|c| (c.0 - s / 2.0, c.1 - s / 2.0))
        .unwrap_or_else(|| d.inner.lock().unwrap().pos);
    let _ = tauri::async_runtime::spawn_blocking(move || finish_drop(&app, &d, pos, Source::Island)).await;
}

/// The page saw a drag start on Candy. Returns his top-left corner (physical
/// pixels), which the page needs to move him on X11.
#[tauri::command]
pub async fn desktop_drag_begin(app: AppHandle) -> Option<(f64, f64)> {
    let d = desktop(&app);
    let pos = {
        let i = d.inner.lock().unwrap();
        if !i.landed || i.carry.is_some() {
            return None;
        }
        i.pos
    };
    // A drag takes over from a snap still settling him.
    d.flight.fetch_add(1, Ordering::SeqCst);
    if d.mode == DesktopMode::Poll {
        let win = window(&app)?;
        let (cx, cy) = platform::cursor_physical()?;
        let origin = win.outer_position().ok()?;
        let grab = (cx - origin.x as f64, cy - origin.y as f64);
        d.inner.lock().unwrap().carry = Some(Carry { grab, from: Source::Desktop });
        refresh(&app, &d);
    }
    Some(pos)
}

/// X11: the page moves the window during its drag (top-left, physical pixels).
#[tauri::command]
pub async fn desktop_drag_move(app: AppHandle, x: f64, y: f64) {
    let d = desktop(&app);
    if d.mode == DesktopMode::Window && d.inner.lock().unwrap().landed {
        place(&app, &d, (x, y));
    }
}

/// Linux: the page's drag ended with the top-left corner at (`x`, `y`). On
/// Windows the poll sees the release itself.
#[tauri::command]
pub async fn desktop_drag_end(app: AppHandle, x: f64, y: f64) {
    let d = desktop(&app);
    if d.mode == DesktopMode::Poll || !d.inner.lock().unwrap().landed {
        return;
    }
    place(&app, &d, (x, y));
    let _ = tauri::async_runtime::spawn_blocking(move || finish_drop(&app, &d, (x, y), Source::Desktop)).await;
}

/// Launch or the end of an alert: from the island to his spot. False when the
/// spot is on a display that is gone — he then stays home, and is forgotten
/// there so the next launch doesn't try again. `anywhere` lands him in the
/// first-visit corner instead.
#[tauri::command]
pub async fn desktop_fly_out(app: AppHandle, anywhere: Option<bool>) -> bool {
    let d = desktop(&app);
    if d.mode == DesktopMode::Off || window(&app).is_none() {
        return false;
    }
    let Some(target) = target_spot(&app, anywhere.unwrap_or(false)) else {
        crate::log::line("desktop Candy: his spot is on a display that is gone — he stays home");
        remember(&app, |p| p.on_desktop = false);
        return false;
    };
    let Some(start) = island_spot(&app) else { return false };
    {
        let mut i = d.inner.lock().unwrap();
        i.landed = false;
        i.carry = None;
        i.asleep = false;
    }
    show(&app, &d, start);
    let _ = app.emit_to(LABEL, "desktop-flight", "out");
    let flown = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        let d = d.clone();
        move || fly(&app, &d, target, FLIGHT_MS, logic::ease_in_out)
    })
    .await
    .unwrap_or(false);
    if !flown {
        return false;
    }
    d.inner.lock().unwrap().landed = true;
    refresh(&app, &d);
    remember_spot(&app, target, true);
    true
}

/// To the island, then hidden. `forget` is the user bringing him home (double
/// click, drop on the island); without it he is only away for an alert and
/// flies back out once it is dismissed.
#[tauri::command]
pub async fn desktop_fly_home(app: AppHandle, forget: bool) -> bool {
    let d = desktop(&app);
    if !d.inner.lock().unwrap().shown {
        if forget {
            remember(&app, |p| p.on_desktop = false);
        }
        return true;
    }
    {
        let mut i = d.inner.lock().unwrap();
        i.landed = false;
        i.carry = None;
        i.asleep = false;
    }
    refresh(&app, &d);
    let _ = app.emit_to(LABEL, "desktop-flight", "home");
    let done = match island_spot(&app) {
        Some(to) => tauri::async_runtime::spawn_blocking({
            let app = app.clone();
            let d = d.clone();
            move || fly(&app, &d, to, FLIGHT_MS, logic::ease_in_out)
        })
        .await
        .unwrap_or(false),
        None => true,
    };
    if done {
        hide(&app, &d);
    }
    if forget {
        remember(&app, |p| p.on_desktop = false);
    }
    done
}

/// The page dozed off (or woke up). Asleep, nothing polls.
#[tauri::command]
pub fn desktop_set_asleep(app: AppHandle, desktop: State<Arc<Desktop>>, asleep: bool) {
    let changed = {
        let mut i = desktop.inner.lock().unwrap();
        let changed = i.asleep != asleep;
        i.asleep = asleep;
        changed
    };
    if changed {
        refresh(&app, &desktop);
    }
}

#[cfg(test)]
mod tests {
    use super::logic::*;

    fn display(x: f64, y: f64, w: f64, h: f64, taskbar: f64, scale: f64) -> Display {
        Display {
            frame: Rect { x, y, w, h },
            work: Rect { x, y, w, h: h - taskbar },
            scale,
        }
    }

    #[test]
    fn a_drop_settles_inside_the_work_area_of_its_display() {
        let one = display(0.0, 0.0, 1920.0, 1080.0, 48.0, 1.0);
        let two = display(1920.0, 0.0, 2560.0, 1440.0, 64.0, 2.0);
        let all = [one, two];
        // Off the bottom edge of the first display: pulled up over the taskbar.
        assert_eq!(settle((100.0, 1000.0), &all, 100.0, 10.0), (100.0, 1080.0 - 48.0 - 100.0 - 10.0));
        // Past the corner of the second display, whose scale doubles the window's size.
        let s = settle((4400.0, 1300.0), &all, 100.0, 10.0);
        assert_eq!(s, (1920.0 + 2560.0 - 200.0 - 20.0, 1440.0 - 64.0 - 200.0 - 20.0));
        // Inside it: left where it was dropped.
        assert_eq!(settle((4000.0, 500.0), &all, 100.0, 10.0), (4000.0, 500.0));
        // Nothing connected: left alone.
        assert_eq!(settle((5.0, 5.0), &[], 100.0, 10.0), (5.0, 5.0));
    }

    #[test]
    fn a_saved_spot_only_counts_on_a_display_that_is_still_there() {
        let one = display(0.0, 0.0, 1920.0, 1080.0, 48.0, 1.0);
        assert_eq!(restore_spot((500.0, 500.0), &[one], 100.0, 10.0), Some((500.0, 500.0)));
        assert_eq!(restore_spot((3000.0, 500.0), &[one], 100.0, 10.0), None);
        assert_eq!(default_spot(&one, 100.0, 24.0), (1920.0 - 124.0, 1080.0 - 48.0 - 124.0));
    }

    #[test]
    fn only_the_body_takes_the_mouse() {
        assert!(is_over_body((84.0, 84.0), 168.0));
        assert!(is_over_body((84.0 + 30.0, 84.0), 168.0));
        assert!(!is_over_body((10.0, 10.0), 168.0));
        assert!(!is_over_body((84.0, 84.0 + 60.0), 168.0));
    }
}
