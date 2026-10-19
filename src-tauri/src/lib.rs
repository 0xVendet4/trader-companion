// Candy (Trader Companion) — app wiring and the commands the pages call.
//
// The window shell (island placement, click-through, wake strip) comes from
// Coucou for Windows (MIT, © Louis Raillé). Everything the mascot shows is
// computed in the page from public market data; Rust only places windows,
// stores preferences and opens links.

mod calendar;
mod chart;
mod desktop;
mod identity;
mod island;
mod log;
mod music;
mod platform;
mod settings;
mod shortcuts;
mod sounds;
mod tray;
mod update;

use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, Url};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

use island::{PollGate, ScreenInfo};
use settings::Settings;

pub struct Shared {
    pub settings: Mutex<Settings>,
    pub gate: Arc<PollGate>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootInfo {
    settings: Settings,
    screen: ScreenInfo,
    version: String,
    /// "windows", "linux"…: labels like "Start with Windows" follow it.
    os: &'static str,
    /// False where the cursor can't be read across the screen (Linux): the page
    /// follows the mouse over the island itself, and drags it itself.
    cursor_poll: bool,
    /// False where the island can't be placed (plain Wayland without
    /// layer-shell): it stays on the top edge.
    can_place: bool,
    /// The OS account's first name, for the greeting; it never leaves the PC.
    first_name: Option<&'static str>,
    /// True in the Microsoft Store's package: the Store updates it, so the
    /// page asks GitHub for no newer version (platform/windows.rs).
    packaged: bool,
}

#[tauri::command]
fn boot(app: AppHandle, window: tauri::WebviewWindow, shared: State<Shared>) -> BootInfo {
    // The island's page (re)starting has no panel open: one left from before a
    // reload (a WebView2 renderer recovering, a dev reload) is let go of, or the
    // window would stay panel-sized and taking the keyboard.
    if window.label() == island::WINDOW_LABEL && shared.gate.panel().is_some() {
        shared.gate.forget_panel();
        platform::set_activating(&window, false);
        let settings = shared.settings.lock().unwrap().clone();
        let collapsed = shared.gate.collapsed.load(Ordering::Relaxed);
        island::apply_geometry(&app, &settings, collapsed);
        island::refresh_click_through(&app, &shared.gate);
    }
    let settings = shared.settings.lock().unwrap().clone();
    let screen = island::screen_info(&app, &settings);
    BootInfo {
        settings,
        screen,
        version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS,
        cursor_poll: platform::CURSOR_POLL,
        can_place: platform::can_place(),
        first_name: identity::first_name(),
        packaged: platform::packaged(),
    }
}

/// "Start with Windows", "Start when you log in": the Store package's startup
/// task, else the autostart plugin's entry (a Run key, a LaunchAgent, a
/// .desktop file in autostart).
fn set_autostart(app: &AppHandle, on: bool) -> Result<(), String> {
    if platform::packaged() {
        return platform::startup_task(on);
    }
    let manager = app.autolaunch();
    if on { manager.enable() } else { manager.disable() }.map_err(|e| e.to_string())
}

#[tauri::command]
fn save_settings(app: AppHandle, shared: State<Shared>, settings: Settings) {
    // Where Candy sits on the desktop is desktop.rs's to say, not a webview's.
    let settings = {
        let current = shared.settings.lock().unwrap();
        Settings { desktop: current.desktop.clone(), ..settings }
    };
    let (place_changed, autostart_changed) = {
        let mut current = shared.settings.lock().unwrap();
        let place_changed = current.screen != settings.screen
            || current.placement != settings.placement
            || current.float_x != settings.float_x
            || current.float_y != settings.float_y
            || current.float_screen != settings.float_screen;
        let autostart_changed = current.autostart != settings.autostart;
        *current = settings.clone();
        (place_changed, autostart_changed)
    };
    if let Err(err) = settings::save(&settings) {
        log::line(format!("could not save settings: {err}"));
    }
    if autostart_changed {
        if let Err(err) = set_autostart(&app, settings.autostart) {
            log::line(format!("autostart: {err}"));
        }
    }
    if place_changed {
        let collapsed = shared.gate.collapsed.load(Ordering::Relaxed);
        island::apply_geometry(&app, &settings, collapsed);
        island::refresh_click_through(&app, &shared.gate);
    }
    // The island hears its own saves too (and Candy's desktop window).
    let _ = app.emit("settings-changed", settings);
}

/// Hidden island → shrink the window to the invisible wake strip and park the
/// cursor poll; anything else → full panel and 60 Hz polling. `asleep`: it was
/// minimized, and the edge doesn't bring it back.
#[tauri::command]
fn set_collapsed(app: AppHandle, shared: State<Shared>, collapsed: bool, asleep: Option<bool>) {
    let settings = shared.settings.lock().unwrap().clone();
    shared.gate.asleep.store(collapsed && asleep.unwrap_or(false), Ordering::Relaxed);
    shared.gate.collapsed.store(collapsed, Ordering::Relaxed);
    island::apply_geometry(&app, &settings, collapsed);
    // The wake strip lets clicks through to what is under it (the edge watch,
    // or on Linux its input region, wakes the island), and a resize
    // invalidates the flag.
    island::refresh_click_through(&app, &shared.gate);
    shared.gate.set_active(!collapsed);
}

/// The page says whether the ticker sits on a screen edge, where it lets
/// clicks through until the cursor rests on it (island.rs, TICKER_DWELL).
#[tauri::command]
fn set_click_guard(shared: State<Shared>, on: bool) {
    shared.gate.guard.store(on, Ordering::Relaxed);
}

/// The front end pushes the island shape; the cursor poll decides click-through
/// from it, or (Linux) it becomes the window's input region.
#[tauri::command]
fn set_island_rect(app: AppHandle, shared: State<Shared>, x: f64, y: f64, width: f64, height: f64) {
    shared.gate.set_rect(island::IslandRect { x, y, w: width, h: height });
    if !platform::CURSOR_POLL {
        island::refresh_click_through(&app, &shared.gate);
    }
}

/// The page says where the ticker's mascot sits (layout.ts tickerSeat, logical
/// px from the island's top-left corner): Candy's flights to and from the
/// desktop start and end there (desktop.rs island_spot).
#[tauri::command]
fn set_ticker_seat(shared: State<Shared>, x: f64, y: f64) {
    shared.gate.set_seat((x, y));
}

/// Lets a text field in the island take the keyboard (pasting a token address,
/// typing an alert price), and gives the focus back afterwards.
#[tauri::command]
fn focus_window(app: AppHandle, shared: State<Shared>, focused: bool) {
    // An open panel keeps the keyboard until it closes (set_panel).
    if !focused && shared.gate.panel_holds() {
        return;
    }
    let Some(win) = island::window(&app) else { return };
    platform::set_activating(&win, focused);
    if focused {
        let _ = win.set_focus();
    }
}

/// Settings or the Closet open in the island (src/core/panel.ts): the window
/// grows to hold a panel of width × height (logical px; less where the screen
/// is smaller), takes the mouse over all of it and the keyboard, and the
/// island stays out (no collapse, no sleep, no pass-through) until it closes.
/// It stays on the display it opened on. Closed, the window goes back to the
/// island's own and the keyboard to the app that had it. Returns the window's
/// size as placed and where the island's own window sits from it (logical
/// px): the page lays the panel out in it and keeps the island in its spot.
#[tauri::command]
fn set_panel(app: AppHandle, shared: State<Shared>, open: bool, width: f64, height: f64) -> PanelPlaced {
    let settings = shared.settings.lock().unwrap().clone();
    let gate = &shared.gate;
    let held = gate.panel_holds();
    if open && gate.panel().is_none() {
        // Pinned to the display the island is on now.
        *gate.panel_screen.lock().unwrap() = island::monitor_of_window(&app).and_then(|m| m.name().cloned());
    }
    let want = island::clamp_panel(width, height);
    if open {
        *gate.panel.lock().unwrap() = Some(want);
        gate.closing.store(false, Ordering::Relaxed);
        gate.lowered.store(false, Ordering::Relaxed);
        gate.asleep.store(false, Ordering::Relaxed);
        gate.collapsed.store(false, Ordering::Relaxed);
    }
    let offset = island::panel_display(&app, &settings).map_or((0.0, 0.0), |d| island::panel_offset(d, &island::effective(&settings), want));
    if !open {
        gate.forget_panel();
    }
    let collapsed = gate.collapsed.load(Ordering::Relaxed);
    island::apply_geometry(&app, &settings, collapsed);
    island::refresh_click_through(&app, gate);
    gate.set_active(!collapsed);
    if let Some(win) = island::window(&app) {
        if open {
            if !held {
                platform::remember_foreground(&win);
                platform::set_activating(&win, true);
            }
            // On top and in front again (opened, or asked for while behind another app).
            platform::keep_on_top(&win);
            let _ = win.set_focus();
        } else if held {
            platform::set_activating(&win, false);
            platform::restore_foreground(&win);
        }
    }
    let (w, h) = gate.placed_size();
    PanelPlaced { w, h, dx: offset.0, dy: offset.1 }
}

/// Where the window would go for a panel of width × height, without moving
/// it: a swap between Settings and the Closet morphs the island toward it.
#[tauri::command]
fn panel_place(app: AppHandle, shared: State<Shared>, width: f64, height: f64) -> PanelPlaced {
    let settings = island::effective(&shared.settings.lock().unwrap());
    let want = island::clamp_panel(width, height);
    let Some(d) = island::panel_display(&app, &settings) else {
        return PanelPlaced { w: want.0, h: want.1, dx: 0.0, dy: 0.0 };
    };
    let (_, _, pw, ph) = island::panel_frame(d, &settings, want);
    let (dx, dy) = island::panel_offset(d, &settings, want);
    PanelPlaced { w: pw as f64 / d.scale, h: ph as f64 / d.scale, dx, dy }
}

/// The panel's window as placed (logical px), and where the island's own
/// window sits from it.
#[derive(Serialize)]
struct PanelPlaced {
    w: f64,
    h: f64,
    dx: f64,
    dy: f64,
}

/// The panel is closing (×, Esc…): the island shrinks back inside the panel's
/// window, which set_panel(false) puts back once it has; meanwhile the mouse
/// and the keyboard are already the trader's again.
#[tauri::command]
fn panel_closing(app: AppHandle, shared: State<Shared>) {
    let gate = &shared.gate;
    if !gate.panel_holds() {
        return;
    }
    gate.closing.store(true, Ordering::Relaxed);
    island::refresh_click_through(&app, gate);
    if let Some(win) = island::window(&app) {
        if gate.lowered.swap(false, Ordering::Relaxed) {
            platform::keep_on_top(&win);
        }
        platform::set_activating(&win, false);
        platform::restore_foreground(&win);
    }
}

#[tauri::command]
fn reposition(app: AppHandle, shared: State<Shared>) {
    let settings = shared.settings.lock().unwrap().clone();
    let collapsed = shared.gate.collapsed.load(Ordering::Relaxed);
    island::apply_geometry(&app, &settings, collapsed);
}

/// The floating island was pressed: the cursor poll moves its window with the
/// mouse until the button is let go (see finish_float_drag).
#[tauri::command]
fn start_float_drag(app: AppHandle, shared: State<Shared>) {
    if shared.settings.lock().unwrap().placement != "float" {
        return;
    }
    let Some(win) = island::window(&app) else { return };
    let Ok(origin) = win.outer_position() else { return };
    let Some(cursor) = platform::cursor_physical() else { return };
    shared.gate.start_drag(cursor, (origin.x, origin.y));
}

/// Without a cursor poll (Linux) the page drags the floating island itself:
/// the window moves by (dx, dy), logical px, from where it is.
#[tauri::command]
fn float_drag_by(app: AppHandle, shared: State<Shared>, dx: f64, dy: f64) {
    if island::effective(&shared.settings.lock().unwrap()).placement != "float" {
        return;
    }
    island::drag_by(&app, &shared.gate, dx, dy);
}

/// The page let go of the floating island it was dragging (Linux).
#[tauri::command]
fn float_drag_done(app: AppHandle, moved: bool) {
    finish_float_drag(&app, moved);
}

#[derive(Serialize, Clone)]
struct FloatDragEnd {
    moved: bool,
    x: Option<f64>,
    y: Option<f64>,
}

/// The floating island was let go. Moved: keep where it is now (as fractions
/// of the display), settle the window by the placement rule and tell both
/// windows. Not moved: the page takes it as a click.
pub fn finish_float_drag(app: &AppHandle, moved: bool) {
    let Some(shared) = app.try_state::<Shared>() else { return };
    let mut at = None;
    if moved {
        // Measured with the lock released: the window calls wait for the main
        // thread, which may itself be waiting for this lock (save_settings).
        let snapshot = shared.settings.lock().unwrap().clone();
        let measured = island::float_fractions(app, &snapshot);
        let settings = {
            let mut s = shared.settings.lock().unwrap();
            if let Some((fx, fy, name)) = measured {
                s.float_x = fx;
                s.float_y = fy;
                s.float_screen = name;
                at = Some((fx, fy));
            }
            s.clone()
        };
        if let Err(err) = settings::save(&settings) {
            log::line(format!("could not save settings: {err}"));
        }
        island::apply_geometry(app, &settings, false);
        island::refresh_click_through(app, &shared.gate);
        let _ = app.emit("settings-changed", settings);
    }
    let _ = app.emit_to(
        island::WINDOW_LABEL,
        "float-drag-end",
        FloatDragEnd { moved, x: at.map(|a| a.0), y: at.map(|a| a.1) },
    );
}

/// Sites the app is allowed to open. Links are built by the app itself (token
/// pages on the user's trading terminal), never taken from token metadata, and
/// this list makes sure it stays that way: a scam token cannot get the app to
/// open its own "claim your airdrop" page.
const ALLOWED_HOSTS: &[&str] = &[
    "gmgn.ai",
    "axiom.trade",
    "basedbot.app",
    "dexscreener.com",
    "rugcheck.xyz",
    "solscan.io",
    "etherscan.io",
    "bscscan.com",
    "basescan.org",
    "github.com",
    // Where a trader gets a free Solana RPC key (Settings → General).
    "dashboard.helius.dev",
    "dashboard.alchemy.com",
];

fn is_allowed_url(raw: &str) -> bool {
    let Ok(url) = Url::parse(raw) else { return false };
    if url.scheme() != "https" {
        return false;
    }
    let Some(host) = url.host_str() else { return false };
    let host = host.strip_prefix("www.").unwrap_or(host);
    ALLOWED_HOSTS.contains(&host)
}

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> bool {
    if !is_allowed_url(&url) {
        log::line(format!("refused to open {url}"));
        return false;
    }
    // From a panel: where it can't step behind the browser, it closes first.
    island::handoff(&app);
    platform::open_url(&url);
    true
}

/// Opens the folder for the trader's own sounds (Settings → General → Your own
/// sounds), the panel
/// first stepping aside where it must (see open_url).
#[tauri::command]
fn reveal_sounds_folder(app: AppHandle) {
    island::handoff(&app);
    sounds::reveal_sounds_folder();
}

/// Whether a fullscreen game, video or presentation is up (Windows): alert
/// cards wait for it to end (Settings → Quiet in fullscreen).
#[tauri::command]
fn fullscreen_busy() -> bool {
    platform::fullscreen_busy()
}

#[derive(Serialize, Clone)]
struct ToastAction {
    /// "open", "mute" or "show".
    action: String,
    key: String,
}

/// An alert's system notification with Open and Mute 1 h (Windows; see
/// src/core/notify.ts). Its buttons come back to the island as "toast-action"
/// with the token's key. False where there is none: the page sends the plain one.
#[tauri::command]
fn notify_alert(app: AppHandle, title: String, body: String, key: String, buttons: Option<(String, String)>) -> bool {
    let cut = |s: &str, n: usize| s.chars().filter(|c| !c.is_control()).take(n).collect::<String>();
    let (title, body, key) = (cut(&title, 120), cut(&body, 240), cut(&key, 100));
    // The buttons' words in the trader's language, else English.
    let (open, mute) = buttons.map(|(o, m)| (cut(&o, 24), cut(&m, 24))).unwrap_or_default();
    let open = if open.is_empty() { "Open".to_owned() } else { open };
    let mute = if mute.is_empty() { "Mute 1 h".to_owned() } else { mute };
    let identifier = app.config().identifier.clone();
    platform::alert_toast(&identifier, &title, &body, (&open, &mute), move |action| {
        let _ = app.emit_to(island::WINDOW_LABEL, "toast-action", ToastAction { action: action.to_string(), key: key.clone() });
    })
}

/// A plain notification filed by the app under its own id (Windows: the Store
/// package's differs from the one the page's plugin uses). False where the
/// page's plugin does it.
#[tauri::command]
fn notify_plain(app: AppHandle, title: String, body: String) -> bool {
    let cut = |s: &str, n: usize| s.chars().filter(|c| !c.is_control()).take(n).collect::<String>();
    let identifier = app.config().identifier.clone();
    platform::plain_toast(&identifier, &cut(&title, 120), &cut(&body, 240))
}

/// The clipboard's text for the paste shortcut (src/core/hotkey.ts). Whatever
/// the user last copied: handed to the page as is, never logged.
#[tauri::command]
fn read_clipboard(app: AppHandle) -> Option<String> {
    platform::clipboard_text(&app)
}

/// Watches what plays on the PC for the music card and the dance (music.rs):
/// the island hears "now-playing" (the player in front, or null) as it
/// changes, and "now-playing-art" once per track with its cover.
#[tauri::command]
fn set_media_watch(app: AppHandle, on: bool) {
    let listener: music::MusicListener = Arc::new(move |update| match update {
        music::MusicUpdate::Playing(np) => {
            let _ = app.emit_to(island::WINDOW_LABEL, "now-playing", np);
        }
        music::MusicUpdate::Art { key, url } => {
            let _ = app.emit_to(island::WINDOW_LABEL, "now-playing-art", (key, url));
        }
    });
    // Asking the OS for its media sessions blocks for a moment.
    std::thread::spawn(move || platform::media_watch(on, listener));
}

/// A button on the music card (music.rs): play/pause, next, previous, seek,
/// shuffle, repeat, volume. Off the main thread: the player answers in its time.
#[tauri::command]
async fn media_control(action: String, value: Option<f64>) -> bool {
    tauri::async_runtime::spawn_blocking(move || platform::media_control(&action, value))
        .await
        .unwrap_or(false)
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Candy's look on the tray icon, drawn by the island page (see tray::set_icon).
#[tauri::command]
fn set_tray_icon(app: AppHandle, rgba: Vec<u8>, width: u32, height: u32) {
    tray::set_icon(&app, rgba, width, height);
}

/// The tray icon's hover text: today's result and the top mover (see tray::set_tooltip).
#[tauri::command]
fn set_tray_tooltip(app: AppHandle, text: String) {
    tray::set_tooltip(&app, &text);
}

/// The words Rust shows, in the trader's language (src/core/i18n.ts): the
/// tray menu's seven items (see tray::set_labels).
#[tauri::command]
fn set_ui_labels(app: AppHandle, tray: Vec<String>) {
    tray::set_labels(&app, &tray);
}

/// Lets the pages write to the same log as the Rust side.
#[tauri::command]
fn log_line(message: String) {
    log::line(format!("ui  {message}"));
}

/// The latest release's version on GitHub (see update.rs); the page compares it.
/// Nothing from the Store's package: the Store updates it.
#[tauri::command]
async fn check_update() -> Result<String, String> {
    if platform::packaged() {
        return Ok(String::new());
    }
    update::latest_version().await.map_err(|e| {
        log::line(format!("update check: {e}"));
        e
    })
}

/// This week's economic calendar (see calendar.rs); the page checks each line.
#[tauri::command]
async fn economic_calendar() -> Result<serde_json::Value, String> {
    calendar::this_week().await.map_err(|e| {
        // A refusal still being waited out was logged when it happened.
        if !e.ends_with("(not asked again yet)") {
            log::line(format!("calendar: {e}"));
        }
        e
    })
}

/// A pool's candles for the hover chart (see chart.rs): the URL is built there
/// from these checked parts; the page checks each candle. "busy": a 429.
#[tauri::command]
async fn ohlcv(network: String, pool: String, timeframe: String, aggregate: u32, limit: u32) -> Result<serde_json::Value, String> {
    chart::candles(&network, &pool, &timeframe, aggregate, limit).await.map_err(|e| {
        if e != "busy" {
            log::line(format!("chart: {e}"));
        }
        e
    })
}

/// The user said yes: download the release and install it (see update.rs).
/// Says how it went under way: "installer" (this Candy closes by itself) or
/// "build" (its code is being built).
#[tauri::command]
async fn start_update(app: AppHandle, version: String) -> Result<String, String> {
    if platform::packaged() {
        return Err("the Microsoft Store updates this Candy".into());
    }
    log::line(format!("update: starting {version}"));
    update::start(app, &version).await.map(str::to_owned).map_err(|e| {
        log::line(format!("update: {e}"));
        e
    })
}

// ── Wallets: read-only Solana RPC ─────────────────────────────────────────────

const SOLANA_RPC: &str = "https://api.mainnet-beta.solana.com";

/// The only calls the app may make, and the params it may send with them: a
/// balance, the token accounts, a token account's latest signatures and one
/// transaction (to find what a position cost). All read-only: nothing that
/// writes, signs or sends — the app holds no key.
const TOKEN_PROGRAMS: &[&str] = &[
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
];
const MAX_SIGNATURES: u64 = 50;

fn is_base58(s: &str, min: usize, max: usize) -> bool {
    (min..=max).contains(&s.len())
        && s.chars().all(|c| c.is_ascii_alphanumeric() && !matches!(c, '0' | 'O' | 'I' | 'l'))
}

/// The params to forward for an allowed call, rebuilt from scratch; None when
/// the call is refused.
fn rpc_params(method: &str, params: &serde_json::Value) -> Option<serde_json::Value> {
    use serde_json::json;
    let first = params.get(0)?.as_str()?;
    match method {
        "getBalance" if is_base58(first, 32, 44) => Some(json!([first])),
        "getTokenAccountsByOwner" if is_base58(first, 32, 44) => {
            let program = params.get(1)?.get("programId")?.as_str()?;
            TOKEN_PROGRAMS.contains(&program).then(|| json!([first, { "programId": program }, { "encoding": "jsonParsed" }]))
        }
        "getSignaturesForAddress" if is_base58(first, 32, 44) => {
            let limit = params
                .get(1)
                .and_then(|o| o.get("limit"))
                .and_then(|l| l.as_u64())
                .unwrap_or(20)
                .clamp(1, MAX_SIGNATURES);
            Some(json!([first, { "limit": limit }]))
        }
        "getTransaction" if is_base58(first, 64, 90) => {
            // Version 1 transactions exist: asking for less gets each of them refused.
            Some(json!([first, { "encoding": "jsonParsed", "maxSupportedTransactionVersion": 1 }]))
        }
        _ => None,
    }
}

/// Made from Rust because the public RPC refuses requests that carry a web
/// page's Origin, which every call from the webview does. The public RPC is
/// shared and says "busy" (429) or fails now and then: such a call goes to the
/// keyless spares that serve it (SPARE_RPCS), then once more to the public RPC
/// after a pause, and an error says what happened in words. The trader's own
/// RPC is simply tried twice.
#[tauri::command]
async fn solana_rpc(shared: State<'_, Shared>, method: String, params: serde_json::Value) -> Result<serde_json::Value, String> {
    let Some(params) = rpc_params(&method, &params) else {
        return Err(format!("{method} is not allowed"));
    };
    let custom = shared.settings.lock().unwrap().rpc_url.clone();
    let endpoint = rpc_endpoint(&custom);
    let body = serde_json::json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });

    if endpoint != SOLANA_RPC {
        let whose = "your Solana RPC";
        let mut last = format!("{whose} did not answer");
        for attempt in 0..2 {
            match ask(&endpoint, &body, whose).await {
                Answer::Result(v) => return Ok(v),
                Answer::Error(e) | Answer::Refused(e) => return Err(e),
                Answer::Busy(e, wait) => {
                    last = e;
                    if attempt == 0 {
                        pause(wait).await;
                    }
                }
            }
        }
        return Err(last);
    }

    let whose = "the public Solana RPC";
    turn(SOLANA_RPC, PUBLIC_SPACING).await;
    let (last, again) = match ask(SOLANA_RPC, &body, whose).await {
        Answer::Result(v) => return Ok(v),
        Answer::Error(e) => return Err(e),
        Answer::Refused(e) => (e, None),
        Answer::Busy(e, wait) => (e, Some(wait)),
    };
    for spare in spares_for(&method) {
        turn(spare.url, spare.spacing).await;
        if let Answer::Result(v) = ask(spare.url, &body, "a spare Solana RPC").await {
            if serves(&method, &v) {
                return Ok(v);
            }
        }
    }
    let Some(wait) = again else { return Err(last) };
    pause(wait).await;
    turn(SOLANA_RPC, PUBLIC_SPACING).await;
    match ask(SOLANA_RPC, &body, whose).await {
        Answer::Result(v) => Ok(v),
        Answer::Error(e) | Answer::Refused(e) | Answer::Busy(e, _) => Err(e),
    }
}

// ── EVM wallets (Ethereum, BSC, Base): read-only, public RPCs ────────────────

/// A chain an EVM wallet is followed on, and the keyless public RPCs asked in
/// turn when one is busy (README, Privacy). Each sees the wallet and token
/// addresses asked about.
struct EvmChain {
    id: &'static str,
    label: &'static str,
    rpcs: &'static [&'static str],
}

const EVM_CHAINS: &[EvmChain] = &[
    EvmChain { id: "ethereum", label: "Ethereum", rpcs: &["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"] },
    EvmChain { id: "bsc", label: "BSC", rpcs: &["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.binance.org"] },
    EvmChain { id: "base", label: "Base", rpcs: &["https://base-rpc.publicnode.com", "https://mainnet.base.org"] },
];

/// Transfer(address,address,uint256): the one event the app reads logs of.
const TRANSFER_TOPIC: &str = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/// balanceOf(address) and decimals(): the two calls made to a token contract.
const BALANCE_OF: &str = "0x70a08231";
const DECIMALS: &str = "0x313ce567";
/// The most blocks one eth_getLogs may span (mirrors LOG_SPAN in src/wallets/evm.ts).
const MAX_LOG_SPAN: u64 = 2000;

/// Only hex digits (so only ASCII: the checks below index bytes, and a
/// multibyte character in the page's string must never make them panic).
fn is_hex(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|c| c.is_ascii_hexdigit())
}

/// "0x" + `digits` hex digits, nothing else.
fn is_hex_of(s: &str, digits: usize) -> bool {
    s.len() == 2 + digits && s.starts_with("0x") && is_hex(&s[2..])
}

/// "0x" + 40 hex digits (checksum casing or not).
fn is_evm_address(s: &str) -> bool {
    is_hex_of(s, 40)
}

/// A 32-byte topic holding an address: 24 zero bytes, then the address.
fn is_address_topic(s: &str) -> bool {
    is_hex_of(s, 64) && s.as_bytes()[2..26].iter().all(|&c| c == b'0')
}

/// A block number as the RPC writes it: "0x" + up to 16 hex digits.
fn hex_quantity(s: &str) -> Option<u64> {
    let digits = s.strip_prefix("0x")?;
    if !is_hex(digits) || digits.len() > 16 {
        return None;
    }
    u64::from_str_radix(digits, 16).ok()
}

/// The params to forward for an allowed EVM call, rebuilt from scratch; None
/// when the call is refused. Four read-only calls: a native balance, a token
/// balance (eth_call with balanceOf(address), or decimals() to scale it), the
/// latest block, and the Transfer logs of one token contract with the wallet
/// as sender or receiver, over at most MAX_LOG_SPAN blocks. Nothing that
/// writes, signs or sends.
fn evm_params(method: &str, params: &serde_json::Value) -> Option<serde_json::Value> {
    use serde_json::json;
    match method {
        "eth_blockNumber" => Some(json!([])),
        "eth_getBalance" => {
            let who = params.get(0)?.as_str()?;
            is_evm_address(who).then(|| json!([who, "latest"]))
        }
        "eth_call" => {
            let call = params.get(0)?;
            let to = call.get("to")?.as_str()?;
            let data = call.get("data")?.as_str()?;
            if !is_evm_address(to) {
                return None;
            }
            // The selector, then one address as a 32-byte word: nothing else fits.
            let balance_of = is_hex_of(data, 8 + 64) && data.starts_with(BALANCE_OF) && data.as_bytes()[10..34].iter().all(|&c| c == b'0');
            let decimals = data == DECIMALS;
            (balance_of || decimals).then(|| json!([{ "to": to, "data": data.to_lowercase() }, "latest"]))
        }
        "eth_getLogs" => {
            let filter = params.get(0)?;
            let address = filter.get("address")?.as_str()?;
            let from = hex_quantity(filter.get("fromBlock")?.as_str()?)?;
            let to = hex_quantity(filter.get("toBlock")?.as_str()?)?;
            if !is_evm_address(address) || to < from || to - from >= MAX_LOG_SPAN {
                return None;
            }
            let topics = filter.get("topics")?.as_array()?;
            if topics.len() != 3 || topics[0].as_str() != Some(TRANSFER_TOPIC) {
                return None;
            }
            // The wallet as sender or as receiver: one of the two, the other open.
            let party = |t: &serde_json::Value| t.as_str().filter(|s| is_address_topic(s)).map(|s| s.to_lowercase());
            let rebuilt = match (topics[1].is_null(), topics[2].is_null()) {
                (false, true) => json!([TRANSFER_TOPIC, party(&topics[1])?, null]),
                (true, false) => json!([TRANSFER_TOPIC, null, party(&topics[2])?]),
                _ => return None,
            };
            Some(json!([{
                "address": address,
                "fromBlock": format!("0x{from:x}"),
                "toBlock": format!("0x{to:x}"),
                "topics": rebuilt,
            }]))
        }
        _ => None,
    }
}

/// A read-only call to one of the EVM chains' public RPCs, made from Rust
/// like solana_rpc: the chain and the method are allowlisted, the params
/// rebuilt from validated inputs (evm_params), and the chain's endpoints are
/// asked in turn when one is busy or refuses, each spaced like the public
/// Solana RPC. A JSON-RPC error is the call's own problem and comes back as is.
#[tauri::command]
async fn evm_rpc(chain: String, method: String, params: serde_json::Value) -> Result<serde_json::Value, String> {
    let Some(chain) = EVM_CHAINS.iter().find(|c| c.id == chain) else {
        return Err(format!("{chain} is not a chain the app reads"));
    };
    let Some(params) = evm_params(&method, &params) else {
        return Err(format!("{method} is not allowed"));
    };
    let body = serde_json::json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });
    let whose = format!("the public {} RPC", chain.label);
    let mut last = format!("{whose} did not answer");
    for &rpc in chain.rpcs {
        turn(rpc, PUBLIC_SPACING).await;
        match ask(rpc, &body, &whose).await {
            Answer::Result(v) => return Ok(v),
            Answer::Error(e) => return Err(e),
            Answer::Refused(e) | Answer::Busy(e, _) => last = e,
        }
    }
    Err(last)
}

/// What an RPC made of a call.
enum Answer {
    Result(serde_json::Value),
    /// A JSON-RPC error: the call itself is the problem, asking elsewhere won't help.
    Error(String),
    /// Refused (403…) or unreadable: this server won't serve it, another may.
    Refused(String),
    /// Busy (429, 5xx) or unreachable: this one may serve it after the pause.
    Busy(String, std::time::Duration),
}

async fn ask(url: &str, body: &serde_json::Value, whose: &str) -> Answer {
    let res = match rpc_client().post(url).json(body).timeout(std::time::Duration::from_secs(20)).send().await {
        Ok(res) => res,
        Err(e) => {
            let what = if e.is_timeout() { format!("{whose} timed out") } else { format!("couldn't reach {whose}") };
            return Answer::Busy(what, std::time::Duration::from_millis(1500));
        }
    };
    let status = res.status();
    if status.as_u16() == 429 || status.is_server_error() {
        let wait = retry_after(res.headers().get("retry-after").and_then(|v| v.to_str().ok()));
        return Answer::Busy(format!("{whose} is busy ({})", status.as_u16()), wait);
    }
    if !status.is_success() {
        return Answer::Refused(format!("{whose} refused the call ({})", status.as_u16()));
    }
    let Ok(value) = res.json::<serde_json::Value>().await else {
        return Answer::Refused(format!("{whose} sent an unreadable answer"));
    };
    if let Some(err) = value.get("error") {
        return Answer::Error(err.get("message").and_then(|m| m.as_str()).unwrap_or("RPC error").to_string());
    }
    Answer::Result(value.get("result").cloned().unwrap_or(serde_json::Value::Null))
}

/// A keyless public RPC asked when the Solana Foundation's is busy, for the
/// calls it serves, spaced as it allows. Each sees the addresses asked about,
/// like the public RPC (README, Privacy).
struct Spare {
    url: &'static str,
    spacing: std::time::Duration,
    methods: &'static [&'static str],
}

const SPARE_RPCS: &[Spare] = &[
    // PublicNode (Allnodes): refuses token accounts, keeps about a day of transactions.
    Spare {
        url: "https://solana-rpc.publicnode.com",
        spacing: std::time::Duration::from_millis(260),
        methods: &["getBalance", "getSignaturesForAddress", "getTransaction"],
    },
    // Solana Vibe Station: all four, with full history, about one call a second.
    Spare {
        url: "https://public.rpc.solanavibestation.com",
        spacing: std::time::Duration::from_millis(1100),
        methods: &["getBalance", "getTokenAccountsByOwner", "getSignaturesForAddress", "getTransaction"],
    },
];

fn spares_for(method: &str) -> impl Iterator<Item = &'static Spare> + '_ {
    SPARE_RPCS.iter().filter(move |s| s.methods.contains(&method))
}

/// Whether a spare's answer can stand in for the public RPC's. A spare that
/// keeps little history answers "none" for what it dropped: an older
/// transaction comes back null, a wallet's signatures empty. The public RPC
/// keeps it all, so from a spare those mean "ask someone else".
fn serves(method: &str, result: &serde_json::Value) -> bool {
    match method {
        "getTransaction" => !result.is_null(),
        "getSignaturesForAddress" => result.as_array().is_some_and(|a| !a.is_empty()),
        _ => !result.is_null(),
    }
}

/// Where RPC calls go: the trader's own endpoint when it is a plain https URL
/// (the key may sit in its path or query, as Alchemy, Helius and QuickNode
/// put it), the public RPC otherwise. Only the four read-only calls of
/// rpc_params ever go to either.
fn rpc_endpoint(custom: &str) -> String {
    let custom = custom.trim();
    match Url::parse(custom) {
        Ok(url) if url.scheme() == "https" && url.host_str().is_some_and(|h| !h.is_empty()) && url.username().is_empty() && url.password().is_none() => {
            url.to_string()
        }
        _ => SOLANA_RPC.to_string(),
    }
}

/// The public RPC takes 40 calls of one kind per 10 s from an IP (100 of all
/// kinds) and answers "busy" past that: reading a wallet's history (up to 50
/// transactions, one after the other) went over it. Calls to it are spaced
/// this far apart, so no burst does.
const PUBLIC_SPACING: std::time::Duration = std::time::Duration::from_millis(260);

/// Waits for this call's turn at an RPC: first come, first served, `spacing`
/// apart.
async fn turn(url: &'static str, spacing: std::time::Duration) {
    static NEXT: Mutex<Vec<(&str, std::time::Instant)>> = Mutex::new(Vec::new());
    let wait = {
        let mut all = NEXT.lock().unwrap();
        let slot = all.iter().position(|(u, _)| *u == url);
        let (wait, after) = next_turn(slot.map(|i| all[i].1), std::time::Instant::now(), spacing);
        match slot {
            Some(i) => all[i].1 = after,
            None => all.push((url, after)),
        }
        wait
    };
    if !wait.is_zero() {
        pause(wait).await;
    }
}

/// How long a call made at `now` waits, and when the one after it may go.
fn next_turn(next: Option<std::time::Instant>, now: std::time::Instant, spacing: std::time::Duration) -> (std::time::Duration, std::time::Instant) {
    let at = next.map_or(now, |n| n.max(now));
    (at - now, at + spacing)
}

/// The pause before trying a busy call again: what the RPC asks for in
/// Retry-After (in seconds), within 1–10 s, or 1.5 s.
fn retry_after(header: Option<&str>) -> std::time::Duration {
    header
        .and_then(|v| v.trim().parse::<u64>().ok())
        .map_or(std::time::Duration::from_millis(1500), |s| std::time::Duration::from_secs(s.clamp(1, 10)))
}

/// One HTTP client for every RPC call: its connections are kept and reused.
fn rpc_client() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}

/// Waits without holding up the async runtime.
async fn pause(d: std::time::Duration) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(d)).await;
}

#[cfg(test)]
mod rpc_tests {
    use super::{next_turn, retry_after, rpc_endpoint, rpc_params, serves, spares_for, SOLANA_RPC, SPARE_RPCS};
    use serde_json::json;

    const ADDR: &str = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

    #[test]
    fn uses_the_traders_own_rpc_only_when_it_is_plain_https() {
        let alchemy = "https://solana-mainnet.g.alchemy.com/v2/abc123";
        assert_eq!(rpc_endpoint(alchemy), alchemy);
        assert_eq!(rpc_endpoint(&format!("  {alchemy}  ")), alchemy);
        let helius = "https://mainnet.helius-rpc.com/?api-key=abc123";
        assert_eq!(rpc_endpoint(helius), helius);
        for bad in ["", "   ", "http://solana-mainnet.g.alchemy.com/v2/abc", "ftp://x.example", "https://user:pass@x.example/", "not a url", "javascript:alert(1)"] {
            assert_eq!(rpc_endpoint(bad), SOLANA_RPC, "{bad:?}");
        }
    }

    #[test]
    fn allows_only_read_calls_with_rebuilt_params() {
        assert_eq!(rpc_params("getBalance", &json!([ADDR, { "x": 1 }])), Some(json!([ADDR])));
        assert_eq!(
            rpc_params("getSignaturesForAddress", &json!([ADDR, { "limit": 5000, "before": "x" }])),
            Some(json!([ADDR, { "limit": 50 }]))
        );
        let sig = "5".repeat(88);
        assert_eq!(
            rpc_params("getTransaction", &json!([sig, {}])),
            Some(json!([sig, { "encoding": "jsonParsed", "maxSupportedTransactionVersion": 1 }]))
        );
    }

    #[test]
    fn refuses_everything_else() {
        assert_eq!(rpc_params("sendTransaction", &json!(["abc"])), None);
        assert_eq!(rpc_params("requestAirdrop", &json!([ADDR, 1])), None);
        assert_eq!(rpc_params("getBalance", &json!(["not an address!"])), None);
        assert_eq!(rpc_params("getTokenAccountsByOwner", &json!([ADDR, { "programId": "evil" }])), None);
        assert_eq!(rpc_params("getTransaction", &json!([ADDR])), None);
    }

    #[test]
    fn spaces_calls_to_the_public_rpc() {
        use std::time::{Duration, Instant};
        let gap = Duration::from_millis(260);
        let t0 = Instant::now();
        // Three calls at once: the second waits one gap, the third two.
        let (w1, n1) = next_turn(None, t0, gap);
        let (w2, n2) = next_turn(Some(n1), t0, gap);
        let (w3, _) = next_turn(Some(n2), t0, gap);
        assert_eq!((w1, w2, w3), (Duration::ZERO, gap, gap * 2));
        // A call long after the last one goes at once.
        let later = t0 + Duration::from_secs(5);
        assert_eq!(next_turn(Some(n2), later, gap), (Duration::ZERO, later + gap));
        // 40 calls of one kind per 10 s is the limit: spaced, 10 s hold fewer.
        assert!(Duration::from_secs(10).as_millis() / gap.as_millis() < 40);
    }

    #[test]
    fn asks_a_spare_only_for_what_it_serves() {
        let urls = |m: &str| spares_for(m).map(|s| s.url).collect::<Vec<_>>();
        // PublicNode refuses token accounts: only Solana Vibe Station is asked.
        assert_eq!(urls("getTokenAccountsByOwner"), ["https://public.rpc.solanavibestation.com"]);
        assert_eq!(urls("getTransaction").len(), 2);
        assert!(urls("sendTransaction").is_empty());
        for spare in SPARE_RPCS {
            assert!(spare.url.starts_with("https://"));
            // Only the four read-only calls, ever.
            for m in spare.methods {
                assert!(["getBalance", "getTokenAccountsByOwner", "getSignaturesForAddress", "getTransaction"].contains(m), "{m}");
            }
        }
    }

    #[test]
    fn takes_no_forgotten_history_from_a_spare() {
        // Pruned: a null transaction, no signatures. Ask the next one.
        assert!(!serves("getTransaction", &json!(null)));
        assert!(!serves("getSignaturesForAddress", &json!([])));
        assert!(serves("getTransaction", &json!({ "blockTime": 1 })));
        assert!(serves("getSignaturesForAddress", &json!([{ "signature": "x" }])));
        assert!(serves("getBalance", &json!({ "value": 0 })));
        assert!(serves("getTokenAccountsByOwner", &json!({ "value": [] })));
    }

    #[test]
    fn evm_allows_only_the_four_read_calls_with_rebuilt_params() {
        use super::{evm_params, EVM_CHAINS, TRANSFER_TOPIC};
        let wallet = "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B";
        let token = "0x4200000000000000000000000000000000000006";
        let padded = "0x000000000000000000000000ab5801a7d398351b8be11c439e05c5b3259aec9b";
        assert_eq!(evm_params("eth_blockNumber", &json!([1, 2])), Some(json!([])));
        assert_eq!(evm_params("eth_getBalance", &json!([wallet, "0x10"])), Some(json!([wallet, "latest"])));
        assert_eq!(evm_params("eth_getBalance", &json!(["0x1234"])), None);
        let data = format!("0x70a08231{}", &padded[2..]);
        assert_eq!(
            evm_params("eth_call", &json!([{ "to": token, "data": data, "gas": "0xffff" }, "0x1"])),
            Some(json!([{ "to": token, "data": data }, "latest"]))
        );
        assert_eq!(evm_params("eth_call", &json!([{ "to": token, "data": "0x313ce567" }])), Some(json!([{ "to": token, "data": "0x313ce567" }, "latest"])));
        // transfer(address,uint256), approve, anything else: refused.
        assert_eq!(evm_params("eth_call", &json!([{ "to": token, "data": format!("0xa9059cbb{}", &padded[2..]) }])), None);
        assert_eq!(evm_params("eth_call", &json!([{ "to": token, "data": format!("0x70a08231{}ff", &padded[2..]) }])), None);
        assert_eq!(evm_params("eth_call", &json!([{ "to": "not a contract", "data": data }])), None);
        let logs = |from: &str, to: &str, topics: serde_json::Value| json!([{ "address": token, "fromBlock": from, "toBlock": to, "topics": topics }]);
        assert_eq!(
            evm_params("eth_getLogs", &logs("0x1f41", "0x2710", json!([TRANSFER_TOPIC, null, padded]))),
            Some(json!([{ "address": token, "fromBlock": "0x1f41", "toBlock": "0x2710", "topics": [TRANSFER_TOPIC, null, padded] }]))
        );
        assert!(evm_params("eth_getLogs", &logs("0x1f41", "0x2710", json!([TRANSFER_TOPIC, padded, null]))).is_some());
        // Too wide, backwards, both parties open, another event, a wallet in both places.
        assert_eq!(evm_params("eth_getLogs", &logs("0x0", "0x7d0", json!([TRANSFER_TOPIC, null, padded]))), None);
        assert_eq!(evm_params("eth_getLogs", &logs("0x2710", "0x1f41", json!([TRANSFER_TOPIC, null, padded]))), None);
        assert_eq!(evm_params("eth_getLogs", &logs("0x1f41", "0x2710", json!([TRANSFER_TOPIC, null, null]))), None);
        assert_eq!(evm_params("eth_getLogs", &logs("0x1f41", "0x2710", json!([format!("0x{}", "1".repeat(64)), null, padded]))), None);
        assert_eq!(evm_params("eth_getLogs", &logs("0x1f41", "0x2710", json!([TRANSFER_TOPIC, padded, padded]))), None);
        assert_eq!(evm_params("eth_getLogs", &logs("latest", "0x2710", json!([TRANSFER_TOPIC, null, padded]))), None);
        for m in ["eth_sendTransaction", "eth_sendRawTransaction", "eth_sign", "personal_sign", "eth_accounts", "eth_getCode"] {
            assert_eq!(evm_params(m, &json!([wallet])), None, "{m}");
        }
        for chain in EVM_CHAINS {
            assert!(chain.rpcs.len() >= 2 && chain.rpcs.iter().all(|u| u.starts_with("https://")), "{}", chain.id);
        }
    }

    #[test]
    fn evm_refuses_odd_strings_without_panicking() {
        use super::{evm_params, TRANSFER_TOPIC};
        let token = "0x4200000000000000000000000000000000000006";
        // The right lengths in bytes, with multibyte characters where the
        // address digits go: refused, never a slice in the middle of one.
        let odd_topic = format!("0x{}é{}", "0".repeat(23), "a".repeat(39));
        assert_eq!(odd_topic.len(), 66);
        let odd_data = format!("0x70a08231{}", &odd_topic[2..]);
        assert_eq!(evm_params("eth_call", &json!([{ "to": token, "data": odd_data }])), None);
        assert_eq!(evm_params("eth_call", &json!([{ "to": format!("0x{}é", "a".repeat(38)), "data": "0x313ce567" }])), None);
        let logs = |topics: serde_json::Value| json!([{ "address": token, "fromBlock": "0x1f41", "toBlock": "0x2710", "topics": topics }]);
        assert_eq!(evm_params("eth_getLogs", &logs(json!([TRANSFER_TOPIC, null, odd_topic]))), None);
        assert_eq!(evm_params("eth_getLogs", &logs(json!([TRANSFER_TOPIC, "é", null]))), None);
        // A signed or padded block number, a topic that is not a string, a missing filter.
        assert_eq!(evm_params("eth_getLogs", &json!([{ "address": token, "fromBlock": "0x+1", "toBlock": "0x10", "topics": [TRANSFER_TOPIC, null, "0x".to_string() + &"0".repeat(64)] }])), None);
        assert_eq!(evm_params("eth_getLogs", &logs(json!([TRANSFER_TOPIC, 7, null]))), None);
        assert_eq!(evm_params("eth_getLogs", &json!(["0x1"])), None);
        assert_eq!(evm_params("eth_getBalance", &json!({ "0": token })), None);
        assert_eq!(evm_params("eth_getBalance", &json!([format!("0x{}é", "a".repeat(38))])), None);
        assert_eq!(evm_params("eth_call", &json!(["0x313ce567"])), None);
    }

    #[test]
    fn waits_as_long_as_a_busy_rpc_asks() {
        use std::time::Duration;
        assert_eq!(retry_after(Some("3")), Duration::from_secs(3));
        assert_eq!(retry_after(Some(" 0 ")), Duration::from_secs(1));
        assert_eq!(retry_after(Some("3600")), Duration::from_secs(10));
        assert_eq!(retry_after(Some("Wed, 21 Oct 2026 07:28:00 GMT")), Duration::from_millis(1500));
        assert_eq!(retry_after(None), Duration::from_millis(1500));
    }
}

// ── Windows ───────────────────────────────────────────────────────────────────

/// WebView2 allows exactly one browser environment per app, and its options are
/// fixed by whichever webview is created first. Every window (Candy's desktop
/// window, desktop.rs) must therefore ask for the *same* arguments as the island (see `additionalBrowserArgs` in
/// tauri.conf.json) — a mismatch makes the second window come up blank, with no
/// error anywhere.
pub(crate) const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";

pub fn run() {
    platform::prepare_environment();
    let loaded = settings::load();
    let gate = Arc::new(PollGate::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let _ = app.emit_to(island::WINDOW_LABEL, "tray", "open".to_string());
        }))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        // The global shortcuts, registered from the page (src/core/hotkey.ts).
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // Windows notifications for alerts (src/core/notify.ts).
        .plugin(tauri_plugin_notification::init())
        .manage(Shared {
            settings: Mutex::new(loaded.clone()),
            gate: gate.clone(),
        })
        .invoke_handler(tauri::generate_handler![
            boot,
            save_settings,
            set_collapsed,
            set_click_guard,
            set_island_rect,
            set_ticker_seat,
            focus_window,
            reposition,
            start_float_drag,
            float_drag_by,
            float_drag_done,
            open_url,
            read_clipboard,
            fullscreen_busy,
            notify_alert,
            notify_plain,
            set_media_watch,
            media_control,
            sounds::custom_sounds,
            sounds::custom_sound,
            reveal_sounds_folder,
            sounds::reload_sounds,
            desktop::desktop_info,
            desktop::desktop_pick_up,
            desktop::desktop_carry,
            desktop::desktop_carry_end,
            desktop::desktop_drag_begin,
            desktop::desktop_drag_move,
            desktop::desktop_drag_end,
            desktop::desktop_fly_out,
            desktop::desktop_fly_home,
            desktop::desktop_set_asleep,
            shortcuts::shortcut_types,
            quit_app,
            set_tray_icon,
            set_tray_tooltip,
            set_ui_labels,
            log_line,
            check_update,
            economic_calendar,
            ohlcv,
            start_update,
            solana_rpc,
            evm_rpc,
            set_panel,
            panel_place,
            panel_closing,
        ])
        .setup(move |app| {
            // A menu bar app on a Mac: no Dock icon, no menu bar of its own (Info.plist says so too).
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let handle = app.handle().clone();
            tray::build(&handle)?;
            // Candy's desktop window before the island's is shown: a WebView2
            // window created later silently comes up blank (see BROWSER_ARGS).
            desktop::setup(&handle);

            if let Some(win) = island::window(&handle) {
                platform::make_non_activating(&win);
                // A panel steps behind the app the trader goes to, and comes back on top when clicked.
                let app = handle.clone();
                win.on_window_event(move |e| {
                    if let tauri::WindowEvent::Focused(focused) = e {
                        island::panel_focus(&app, *focused);
                    }
                });
                island::apply_geometry(&handle, &loaded, false);
                let _ = win.show();
            }
            gate.collapsed.store(false, Ordering::Relaxed);
            gate.set_active(true);
            island::spawn_cursor_poll(handle.clone(), gate.clone());
            island::spawn_edge_watch(handle.clone(), gate.clone());

            // "Start with Windows" is registered under the app's name and path:
            // registered again on every start, so it survives a rename or a move
            // (Trader Companion became Candy in 0.1.1). The Store package's
            // startup task is Windows' to keep.
            if loaded.autostart && !platform::packaged() {
                if let Err(err) = handle.autolaunch().enable() {
                    log::line(format!("autostart: {err}"));
                }
            }

            log::line(format!("--- Candy {} started ---", env!("CARGO_PKG_VERSION")));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Candy");
}

#[cfg(test)]
mod tests {
    use super::is_allowed_url;

    #[test]
    fn opens_only_known_https_sites() {
        assert!(is_allowed_url("https://gmgn.ai/sol/token/So11111111111111111111111111111111111111112"));
        assert!(is_allowed_url("https://dexscreener.com/solana/abc"));
        assert!(is_allowed_url("https://www.dexscreener.com/solana/abc"));
        assert!(!is_allowed_url("http://gmgn.ai/sol/token/x"));
        assert!(!is_allowed_url("https://gmgn.ai.evil.example/sol"));
        assert!(!is_allowed_url("https://evil.example/?u=https://gmgn.ai"));
        assert!(!is_allowed_url("file:///C:/Windows/System32/calc.exe"));
        assert!(!is_allowed_url("not a url"));
        assert!(is_allowed_url("https://dashboard.helius.dev/"));
        assert!(is_allowed_url("https://basedbot.app/r/GuyFawk3s/token/sol/So11111111111111111111111111111111111111112"));
        assert!(!is_allowed_url("https://evil.helius.dev/"));
    }
}
