// The economic calendar (src/market/calendar.ts): Forex Factory's public weekly
// export, no key. It sends no CORS headers, so the page cannot read it itself.
// The address is fixed here: the page asks for "the calendar", never for a URL,
// and gets back JSON it checks line by line.

use std::sync::Mutex;
use std::time::{Duration, Instant};

const URL: &str = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
/// The week's file is about 10 KB: anything this big is not it.
const MAX_BYTES: usize = 512 * 1024;
/// Forex Factory updates the file hourly and blocks those who ask more: the
/// app keeps what it read for three hours, whatever the page asks (a page
/// reload forgets, Rust doesn't), and after a refusal waits half an hour.
const KEEP: Duration = Duration::from_secs(3 * 3600);
const AFTER_FAILURE: Duration = Duration::from_secs(30 * 60);

enum Last {
    Read(Instant, serde_json::Value),
    Failed(Instant, String),
}

static LAST: Mutex<Option<Last>> = Mutex::new(None);

/// This week's calendar: the copy read less than three hours ago, or a new one.
pub async fn this_week() -> Result<serde_json::Value, String> {
    match &*LAST.lock().unwrap() {
        Some(Last::Read(at, value)) if at.elapsed() < KEEP => return Ok(value.clone()),
        Some(Last::Failed(at, why)) if at.elapsed() < AFTER_FAILURE => return Err(format!("{why} (not asked again yet)")),
        _ => {}
    }
    let result = fetch().await;
    *LAST.lock().unwrap() = Some(match &result {
        Ok(value) => Last::Read(Instant::now(), value.clone()),
        Err(why) => Last::Failed(Instant::now(), why.clone()),
    });
    result
}

async fn fetch() -> Result<serde_json::Value, String> {
    let err = |e: reqwest::Error| if e.is_timeout() { "the calendar timed out".to_owned() } else { e.to_string() };
    let res = crate::update::client()
        .get(URL)
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?;
    if res.content_length().is_some_and(|n| n as usize > MAX_BYTES) {
        return Err("the calendar is too large".into());
    }
    let bytes = res.bytes().await.map_err(err)?;
    parse(&bytes)
}

fn parse(bytes: &[u8]) -> Result<serde_json::Value, String> {
    if bytes.len() > MAX_BYTES {
        return Err("the calendar is too large".into());
    }
    let value: serde_json::Value = serde_json::from_slice(bytes).map_err(|e| format!("the calendar isn't JSON: {e}"))?;
    if value.is_array() { Ok(value) } else { Err("the calendar isn't a list".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn takes_only_a_list_of_reasonable_size() {
        assert!(parse(br#"[{"title":"CPI m/m","country":"USD"}]"#).is_ok());
        assert!(parse(br#"{"title":"CPI m/m"}"#).is_err());
        assert!(parse(b"<html>").is_err());
        assert!(parse(&vec![b' '; MAX_BYTES + 1]).is_err());
    }
}
