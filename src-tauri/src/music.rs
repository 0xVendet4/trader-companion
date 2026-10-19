// What plays on the PC, for the island's music card and Candy's dance. The
// system says what plays (platform::media_watch: Windows' media sessions,
// Linux's MPRIS players) and this file holds what both report, the same way.
// The card and the dance come from Coucou's Spotify pill (MIT, © Louis
// Raillé); here they follow any player the system knows about.

// The MPRIS half is only reached on Linux, and by the tests everywhere.
#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use std::sync::Arc;

use serde::Serialize;

/// The player in front: what it plays and how far along it is.
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    /// The app playing it ("Spotify", "Chrome"…).
    pub app: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    /// Seconds; 0 when the player doesn't say.
    pub duration: f64,
    /// Seconds at `position_at` (Unix ms); while playing it runs on from there.
    pub position: f64,
    pub position_at: f64,
    pub playing: bool,
    /// None: the player has no such switch.
    pub shuffle: Option<bool>,
    pub repeat: Option<bool>,
    /// 0–1; None where the player's volume can't be read (Windows).
    pub volume: Option<f64>,
    pub can_seek: bool,
    pub can_next: bool,
    pub can_previous: bool,
    /// Names the cover sent apart (`MusicUpdate::Art`): a new key, a new cover.
    pub art_key: String,
    /// The track's object path, for MPRIS's SetPosition. Not for the page.
    #[serde(skip)]
    pub track_path: String,
}

/// What the watch tells the island.
pub enum MusicUpdate {
    /// The player in front changed (None: nothing loaded anywhere).
    Playing(Option<NowPlaying>),
    /// A track's cover, as a data URL, sent once per track.
    Art { key: String, url: String },
}

pub type MusicListener = Arc<dyn Fn(MusicUpdate) + Send + Sync>;

/// Whether the page needs to hear about `now`: the player, the track or a
/// control changed, or the position jumped (a seek) rather than ran on.
pub fn differs(last: Option<&NowPlaying>, now: Option<&NowPlaying>, at: f64) -> bool {
    let (Some(a), Some(b)) = (last, now) else { return last.is_some() != now.is_some() };
    let same = a.app == b.app
        && a.title == b.title
        && a.artist == b.artist
        && a.album == b.album
        && a.playing == b.playing
        && a.shuffle == b.shuffle
        && a.repeat == b.repeat
        && a.can_seek == b.can_seek
        && a.can_next == b.can_next
        && a.can_previous == b.can_previous
        && (a.duration - b.duration).abs() < 1.0
        && a.volume.zip(b.volume).map(|(x, y)| (x - y).abs() < 0.01).unwrap_or(a.volume.is_none() == b.volume.is_none());
    if !same {
        return true;
    }
    // Where each says it is now: more than two seconds apart is a seek.
    let run = |n: &NowPlaying| n.position + if n.playing { (at - n.position_at).max(0.0) / 1000.0 } else { 0.0 };
    (run(a) - run(b)).abs() > 2.0
}

/// The cover's key: the same track keeps its cover.
pub fn art_key(np: &NowPlaying) -> String {
    format!("{}|{}|{}|{}", np.app, np.title, np.artist, np.album)
}

/// A cover bigger than this is left out (they are a few hundred KB at most).
pub const ART_MAX: usize = 2 * 1024 * 1024;

/// The app's own name from a Windows media session's id (Windows' media
/// sessions, platform/windows.rs, and the tests call these two): "Spotify.exe" →
/// "Spotify", "Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic" → "ZuneMusic".
#[cfg(any(windows, test))]
pub fn app_name(id: &str) -> String {
    let last = id.rsplit(['\\', '/', '!']).next().unwrap_or(id);
    let last = last.strip_suffix(".exe").or_else(|| last.strip_suffix(".EXE")).unwrap_or(last);
    let last = last.split('_').next().unwrap_or(last);
    let name = last.rsplit('.').next().unwrap_or(last);
    if name.is_empty() {
        "Music".into()
    } else {
        name.to_string()
    }
}

/// Windows' 100 ns ticks since 1601 → Unix milliseconds.
#[cfg(any(windows, test))]
pub fn filetime_to_unix_ms(ticks: i64) -> f64 {
    (ticks - 116_444_736_000_000_000) as f64 / 10_000.0
}

pub fn now_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

/// Bytes as standard base64.
pub fn base64(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

/// An image as a data URL; only image types (the page's CSP allows data: images).
pub fn image_data_url(mime: &str, bytes: &[u8]) -> Option<String> {
    let mime = mime.trim().to_ascii_lowercase();
    let ok = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/bmp"];
    if bytes.is_empty() || bytes.len() > ART_MAX || !ok.contains(&mime.as_str()) {
        return None;
    }
    Some(format!("data:{mime};base64,{}", base64(bytes)))
}

/// A file's image type from its extension (MPRIS covers are file:// paths).
pub fn image_mime(path: &str) -> Option<&'static str> {
    let ext = path.rsplit('.').next()?.to_ascii_lowercase();
    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        _ => None,
    }
}

// ── MPRIS (Linux), read without D-Bus types so it is tested everywhere ────────

/// A D-Bus value as MPRIS uses it.
#[derive(Clone, Debug, PartialEq)]
pub enum MprisValue {
    Str(String),
    Strs(Vec<String>),
    Int(i64),
    Float(f64),
    Bool(bool),
    Map(Vec<(String, MprisValue)>),
    Other,
}

impl MprisValue {
    fn text(&self) -> Option<String> {
        match self {
            MprisValue::Str(s) => Some(s.clone()),
            MprisValue::Strs(v) => Some(v.join(", ")),
            _ => None,
        }
    }
    fn int(&self) -> Option<i64> {
        match self {
            MprisValue::Int(n) => Some(*n),
            MprisValue::Float(f) => Some(*f as i64),
            _ => None,
        }
    }
}

fn find<'a>(props: &'a [(String, MprisValue)], key: &str) -> Option<&'a MprisValue> {
    props.iter().find(|(k, _)| k == key).map(|(_, v)| v)
}

/// "org.mpris.MediaPlayer2.spotify" or ".chromium.instance123" → "Spotify", "Chromium".
pub fn mpris_app(bus: &str) -> String {
    let rest = bus.strip_prefix("org.mpris.MediaPlayer2.").unwrap_or(bus);
    let first = rest.split('.').next().unwrap_or(rest);
    let mut c = first.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => "Music".into(),
    }
}

/// A player's Player properties (GetAll) → what it plays; None when nothing is loaded.
pub fn from_mpris(bus: &str, props: &[(String, MprisValue)], now: f64) -> Option<NowPlaying> {
    let meta = match find(props, "Metadata") {
        Some(MprisValue::Map(m)) => m.as_slice(),
        _ => &[],
    };
    let track_path = find(meta, "mpris:trackid").and_then(MprisValue::text).unwrap_or_default();
    let title = find(meta, "xesam:title").and_then(MprisValue::text).unwrap_or_default();
    // An unloaded player says /org/mpris/MediaPlayer2/TrackList/NoTrack.
    if title.is_empty() || track_path.ends_with("/NoTrack") {
        return None;
    }
    let status = find(props, "PlaybackStatus").and_then(MprisValue::text).unwrap_or_default();
    if status == "Stopped" {
        return None;
    }
    let us = |v: Option<&MprisValue>| v.and_then(MprisValue::int).map(|n| n.max(0) as f64 / 1_000_000.0);
    let flag = |k: &str| match find(props, k) {
        Some(MprisValue::Bool(b)) => Some(*b),
        _ => None,
    };
    let mut np = NowPlaying {
        app: mpris_app(bus),
        title,
        artist: find(meta, "xesam:artist").and_then(MprisValue::text).unwrap_or_default(),
        album: find(meta, "xesam:album").and_then(MprisValue::text).unwrap_or_default(),
        duration: us(find(meta, "mpris:length")).unwrap_or(0.0),
        position: us(find(props, "Position")).unwrap_or(0.0),
        position_at: now,
        playing: status == "Playing",
        shuffle: flag("Shuffle"),
        repeat: find(props, "LoopStatus").and_then(MprisValue::text).map(|s| s != "None"),
        volume: match find(props, "Volume") {
            Some(MprisValue::Float(v)) => Some(v.clamp(0.0, 1.0)),
            _ => None,
        },
        can_seek: flag("CanSeek").unwrap_or(false),
        can_next: flag("CanGoNext").unwrap_or(true),
        can_previous: flag("CanGoPrevious").unwrap_or(true),
        art_key: String::new(),
        track_path,
    };
    np.art_key = art_key(&np);
    Some(np)
}

/// The cover's file, when a player gives one as a local file:// URL. Covers
/// on the web are left out: the app fetches nothing it wasn't asked to.
pub fn mpris_art_path(props: &[(String, MprisValue)]) -> Option<String> {
    let meta = match find(props, "Metadata") {
        Some(MprisValue::Map(m)) => m.as_slice(),
        _ => return None,
    };
    let url = find(meta, "mpris:artUrl").and_then(MprisValue::text)?;
    let path = url.strip_prefix("file://")?;
    // Percent-encoded spaces and the like.
    let mut out = Vec::with_capacity(path.len());
    let b = path.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&path[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8(out).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_app_playing() {
        assert_eq!(app_name("Spotify.exe"), "Spotify");
        assert_eq!(app_name("Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic"), "ZuneMusic");
        assert_eq!(app_name("Chrome"), "Chrome");
        assert_eq!(app_name("C:\\Program Files\\VLC\\vlc.exe"), "vlc");
        assert_eq!(mpris_app("org.mpris.MediaPlayer2.spotify"), "Spotify");
        assert_eq!(mpris_app("org.mpris.MediaPlayer2.chromium.instance42"), "Chromium");
    }

    #[test]
    fn encodes_a_cover() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
        assert_eq!(image_data_url("image/png", b"foo").as_deref(), Some("data:image/png;base64,Zm9v"));
        assert_eq!(image_data_url("text/html", b"foo"), None);
        assert_eq!(image_data_url("image/png", b""), None);
        assert_eq!(image_mime("/tmp/cover.JPG"), Some("image/jpeg"));
        assert_eq!(image_mime("/tmp/cover"), None);
    }

    #[test]
    fn converts_windows_time() {
        // 2026-01-01T00:00:00Z
        assert_eq!(filetime_to_unix_ms(134_116_992_000_000_000), 1_767_225_600_000.0);
    }

    fn player(status: &str) -> Vec<(String, MprisValue)> {
        let meta = vec![
            ("mpris:trackid".into(), MprisValue::Str("/com/spotify/track/abc".into())),
            ("xesam:title".into(), MprisValue::Str("Night Drive".into())),
            ("xesam:artist".into(), MprisValue::Strs(vec!["Lo-fi Market".into(), "Candles".into()])),
            ("xesam:album".into(), MprisValue::Str("Charts".into())),
            ("mpris:length".into(), MprisValue::Int(200_000_000)),
            ("mpris:artUrl".into(), MprisValue::Str("file:///home/me/My%20Covers/a.png".into())),
        ];
        vec![
            ("Metadata".into(), MprisValue::Map(meta)),
            ("PlaybackStatus".into(), MprisValue::Str(status.into())),
            ("Position".into(), MprisValue::Int(12_500_000)),
            ("Shuffle".into(), MprisValue::Bool(true)),
            ("LoopStatus".into(), MprisValue::Str("Playlist".into())),
            ("Volume".into(), MprisValue::Float(0.42)),
            ("CanSeek".into(), MprisValue::Bool(true)),
        ]
    }

    #[test]
    fn reads_an_mpris_player() {
        let np = from_mpris("org.mpris.MediaPlayer2.spotify", &player("Playing"), 1000.0).unwrap();
        assert_eq!(np.app, "Spotify");
        assert_eq!(np.title, "Night Drive");
        assert_eq!(np.artist, "Lo-fi Market, Candles");
        assert_eq!(np.duration, 200.0);
        assert_eq!(np.position, 12.5);
        assert!(np.playing && np.can_seek && np.can_next);
        assert_eq!((np.shuffle, np.repeat, np.volume), (Some(true), Some(true), Some(0.42)));
        assert_eq!(np.track_path, "/com/spotify/track/abc");
        assert_eq!(np.art_key, "Spotify|Night Drive|Lo-fi Market, Candles|Charts");
        assert!(!from_mpris("x", &player("Paused"), 0.0).unwrap().playing);
        assert_eq!(from_mpris("x", &player("Stopped"), 0.0), None);
        assert_eq!(mpris_art_path(&player("Playing")).as_deref(), Some("/home/me/My Covers/a.png"));
    }

    #[test]
    fn tells_the_page_only_what_changed() {
        let a = from_mpris("x", &player("Playing"), 1000.0).unwrap();
        // The same track, ten seconds on, where it should be: nothing to say.
        let later = NowPlaying { position: 22.5, position_at: 11_000.0, ..a.clone() };
        assert!(!differs(Some(&a), Some(&later), 11_000.0));
        // Sought back to the start.
        let sought = NowPlaying { position: 0.0, position_at: 11_000.0, ..a.clone() };
        assert!(differs(Some(&a), Some(&sought), 11_000.0));
        let paused = NowPlaying { playing: false, ..a.clone() };
        assert!(differs(Some(&a), Some(&paused), 1000.0));
        assert!(differs(None, Some(&a), 0.0));
        assert!(differs(Some(&a), None, 0.0));
        assert!(!differs(None, None, 0.0));
    }

    #[test]
    fn nothing_loaded_is_nothing_playing() {
        let empty = vec![("PlaybackStatus".into(), MprisValue::Str("Playing".into()))];
        assert_eq!(from_mpris("x", &empty, 0.0), None);
        let no_track = vec![(
            "Metadata".into(),
            MprisValue::Map(vec![
                ("mpris:trackid".into(), MprisValue::Str("/org/mpris/MediaPlayer2/TrackList/NoTrack".into())),
                ("xesam:title".into(), MprisValue::Str("x".into())),
            ]),
        )];
        assert_eq!(from_mpris("x", &no_track, 0.0), None);
    }
}
