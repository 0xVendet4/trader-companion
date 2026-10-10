// Candy (Trader Companion) for Windows — app wiring and the commands the pages call.
//
// The window shell (island placement, click-through, wake strip, settings
// window) comes from Coucou for Windows (MIT, © Louis Raillé). Everything the
// mascot shows is computed in the page from public market data; Rust only
// places windows, stores preferences and opens links.

mod calendar;
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
use tauri::{AppHandle, Emitter, Manager, State, Url, WebviewUrl, WebviewWindowBuilder};
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
    /// follows the mouse over the island itself, and the island stays on top.
    cursor_poll: bool,
    /// The OS account's first name, for the greeting; it never leaves the PC.
    first_name: Option<&'static str>,
}

#[tauri::command]
fn boot(app: AppHandle, shared: State<Shared>) -> BootInfo {
    let settings = shared.settings.lock().unwrap().clone();
    let screen = island::screen_info(&app, &settings);
    BootInfo {
        settings,
        screen,
        version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS,
        cursor_poll: platform::CURSOR_POLL,
        first_name: identity::first_name(),
    }
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
        let manager = app.autolaunch();
        let result = if settings.autostart { manager.enable() } else { manager.disable() };
        if let Err(err) = result {
            log::line(format!("autostart: {err}"));
        }
    }
    if place_changed {
        let collapsed = shared.gate.collapsed.load(Ordering::Relaxed);
        island::apply_geometry(&app, &settings, collapsed);
        island::refresh_click_through(&app, &shared.gate);
    }
    // Keep the other window in step (island ⇄ settings window).
    let _ = app.emit("settings-changed", settings);
}

/// Hidden island → shrink the window to the invisible wake strip and park the
/// cursor poll; anything else → full panel and 60 Hz polling.
#[tauri::command]
fn set_collapsed(app: AppHandle, shared: State<Shared>, collapsed: bool) {
    let settings = shared.settings.lock().unwrap().clone();
    shared.gate.collapsed.store(collapsed, Ordering::Relaxed);
    island::apply_geometry(&app, &settings, collapsed);
    // The wake strip must always take the mouse, and a resize invalidates the flag.
    island::refresh_click_through(&app, &shared.gate);
    shared.gate.set_active(!collapsed);
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

/// Lets a text field in the island take the keyboard (pasting a token address,
/// typing an alert price), and gives the focus back afterwards.
#[tauri::command]
fn focus_window(app: AppHandle, focused: bool) {
    let Some(win) = island::window(&app) else { return };
    platform::set_activating(&win, focused);
    if focused {
        let _ = win.set_focus();
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
fn open_url(url: String) -> bool {
    if !is_allowed_url(&url) {
        log::line(format!("refused to open {url}"));
        return false;
    }
    platform::open_url(&url);
    true
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
/// tray menu's six items (see tray::set_labels) and the settings window's title.
#[tauri::command]
fn set_ui_labels(app: AppHandle, tray: Vec<String>, settings_title: String) {
    tray::set_labels(&app, &tray);
    let title: String = settings_title.chars().filter(|c| !c.is_control()).take(60).collect();
    if let (false, Some(win)) = (title.is_empty(), app.get_webview_window("settings")) {
        let _ = win.set_title(&title);
    }
}

/// Lets the pages write to the same log as the Rust side.
#[tauri::command]
fn log_line(message: String) {
    log::line(format!("ui  {message}"));
}

/// The newest version on GitHub (see update.rs); the page compares it.
#[tauri::command]
async fn check_update() -> Result<String, String> {
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

/// The user said yes: download the new code, unpack it and start its installer.
#[tauri::command]
async fn start_update() -> Result<(), String> {
    log::line("update: starting");
    update::start().await.map_err(|e| {
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
    fn waits_as_long_as_a_busy_rpc_asks() {
        use std::time::Duration;
        assert_eq!(retry_after(Some("3")), Duration::from_secs(3));
        assert_eq!(retry_after(Some(" 0 ")), Duration::from_secs(1));
        assert_eq!(retry_after(Some("3600")), Duration::from_secs(10));
        assert_eq!(retry_after(Some("Wed, 21 Oct 2026 07:28:00 GMT")), Duration::from_millis(1500));
        assert_eq!(retry_after(None), Duration::from_millis(1500));
    }
}

// ── Settings window ───────────────────────────────────────────────────────────

/// WebView2 allows exactly one browser environment per app, and its options are
/// fixed by whichever webview is created first. Every window must therefore ask
/// for the *same* arguments as the island (see `additionalBrowserArgs` in
/// tauri.conf.json) — a mismatch makes the second window come up blank, with no
/// error anywhere.
pub(crate) const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";

/// In a dev build the pages are served by Vite, so the second window needs the
/// absolute dev URL; a bundled build resolves it inside the app bundle.
fn settings_page_url(app: &AppHandle) -> WebviewUrl {
    #[cfg(dev)]
    if let Some(mut base) = app.config().build.dev_url.clone() {
        base.set_path("/settings.html");
        return WebviewUrl::External(base);
    }
    let _ = app;
    WebviewUrl::App("settings.html".into())
}

/// The settings window is created hidden at launch and only ever shown and
/// hidden afterwards. A WebView2 window created later silently comes up blank,
/// so the window that works is the one that exists before the island's does.
fn create_settings_window(app: &AppHandle) {
    let url = settings_page_url(app);
    match WebviewWindowBuilder::new(app, "settings", url)
        .additional_browser_args(BROWSER_ARGS)
        .title("Settings — Candy")
        .inner_size(600.0, 720.0)
        .min_inner_size(480.0, 500.0)
        .resizable(true)
        .visible(false)
        .center()
        .build()
    {
        Ok(win) => {
            // Closing it must only hide it, or it could never be reopened.
            let hidden = win.clone();
            win.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = hidden.hide();
                }
            });
        }
        Err(err) => log::line(format!("settings window failed: {err}")),
    }
}

pub fn show_settings_window(app: &AppHandle) {
    let Some(win) = app.get_webview_window("settings") else {
        log::line("settings window missing");
        return;
    };
    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_focus();
}

#[tauri::command]
fn open_settings_window(app: AppHandle) {
    show_settings_window(&app);
}

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
            set_island_rect,
            focus_window,
            reposition,
            start_float_drag,
            open_url,
            read_clipboard,
            fullscreen_busy,
            notify_alert,
            set_media_watch,
            media_control,
            sounds::custom_sounds,
            sounds::custom_sound,
            sounds::reveal_sounds_folder,
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
            start_update,
            solana_rpc,
            open_settings_window,
        ])
        .setup(move |app| {
            // A menu bar app on a Mac: no Dock icon, no menu bar of its own (Info.plist says so too).
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let handle = app.handle().clone();
            tray::build(&handle)?;
            // Before the island: see create_settings_window. Candy's desktop
            // window too, for the same reason.
            create_settings_window(&handle);
            desktop::setup(&handle);

            if let Some(win) = island::window(&handle) {
                platform::make_non_activating(&win);
                island::apply_geometry(&handle, &loaded, false);
                let _ = win.show();
            }
            gate.collapsed.store(false, Ordering::Relaxed);
            gate.set_active(true);
            island::spawn_cursor_poll(handle.clone(), gate.clone());

            // "Start with Windows" is registered under the app's name and path:
            // registered again on every start, so it survives a rename or a move
            // (Trader Companion became Candy in 0.1.1).
            if loaded.autostart {
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
