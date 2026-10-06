// Preferences, stored as plain JSON in settings.json under platform::config_dir().
//
// Rust only reads the fields it needs to place the window and start with
// Windows. Everything trading-related (watchlist, alerts, discipline rules,
// today's trade log) is owned by the page and kept here as an opaque blob, so
// the front end can grow without a Rust change.
//
// No secret ever lands here: the app holds no wallet, no private key and no
// exchange key — it only reads public market data.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub sound_enabled: bool,
    pub sound_volume: f64,
    pub auto_close_interval: f64,
    /// "primary" = the main display, "cursor" = whichever display the mouse is on.
    pub screen: String,
    pub autostart: bool,
    /// "top" (centred on the top edge), "left", "right" (vertically centred on
    /// that edge) or "float" (where the trader dragged it).
    pub placement: String,
    /// The floating island's centre, as fractions (0–1) of the display.
    pub float_x: f64,
    pub float_y: f64,
    /// The display the floating island was dropped on (its name). Empty, or a
    /// display no longer there: the `screen` rule picks it.
    pub float_screen: String,
    /// The trader's own Solana RPC (an https URL from Alchemy, Helius,
    /// QuickNode…); empty: the public one. See rpc_endpoint in lib.rs.
    pub rpc_url: String,
    /// Watchlist, alerts, discipline rules and the trade log — see src/core/state.ts.
    pub companion: serde_json::Value,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            sound_enabled: true,
            sound_volume: 0.12,
            auto_close_interval: 15.0,
            screen: "primary".into(),
            autostart: false,
            placement: "top".into(),
            float_x: 0.5,
            float_y: 0.12,
            float_screen: String::new(),
            rpc_url: String::new(),
            companion: serde_json::Value::Null,
        }
    }
}

pub use crate::platform::{config_dir, local_dir};

fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

pub fn load() -> Settings {
    match std::fs::read(settings_path()) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => Settings::default(),
    }
}

/// Written to a temporary file first, then renamed over the old one, so a crash
/// mid-write can never leave a half-written watchlist behind.
pub fn save(settings: &Settings) -> std::io::Result<()> {
    let dir = config_dir();
    crate::platform::ensure_private_dir(&dir)?;
    let json = serde_json::to_vec_pretty(settings)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    let tmp = dir.join("settings.json.tmp");
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, settings_path())
}
