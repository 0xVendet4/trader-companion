// The hover chart's candles (src/market/chart.ts): GeckoTerminal's public
// OHLCV API, no key. The page never passes a URL: it names a network from a
// short list, a pool address in the shape that network uses, and a candle
// size the API serves; the address is built here from those parts, and the
// answer's candle list is handed back as it came (the page checks each row).

use std::time::Duration;

const BASE: &str = "https://api.geckoterminal.com/api/v2/networks";
/// The networks Candy charts: GeckoTerminal's ids for Solana, BSC, Ethereum and Base.
const NETWORKS: &[&str] = &["solana", "bsc", "eth", "base"];
/// What the API serves per timeframe (the page folds 30 m and 8 h itself).
const AGGREGATES: &[(&str, &[u32])] = &[("day", &[1]), ("hour", &[1, 4, 12]), ("minute", &[1, 5, 15])];
const MAX_LIMIT: u32 = 1000;
/// A thousand candles are about 80 KB.
const MAX_BYTES: usize = 1024 * 1024;

/// The chart's address, from checked parts; None when a part is not what it must be.
fn url(network: &str, pool: &str, timeframe: &str, aggregate: u32, limit: u32) -> Option<String> {
    if !NETWORKS.contains(&network) || !pool_ok(network, pool) {
        return None;
    }
    let served = AGGREGATES.iter().find(|(tf, _)| *tf == timeframe)?.1;
    if !served.contains(&aggregate) || limit == 0 || limit > MAX_LIMIT {
        return None;
    }
    Some(format!("{BASE}/{network}/pools/{pool}/ohlcv/{timeframe}?aggregate={aggregate}&limit={limit}"))
}

/// A Solana pool is base58, 32 to 44 characters; an EVM one is 0x and 40 hex digits.
fn pool_ok(network: &str, pool: &str) -> bool {
    match network {
        "solana" => (32..=44).contains(&pool.len()) && pool.bytes().all(|b| b.is_ascii_alphanumeric() && !b"0OIl".contains(&b)),
        _ => pool.len() == 42 && pool.starts_with("0x") && pool[2..].bytes().all(|b| b.is_ascii_hexdigit()),
    }
}

/// The answer's candle list, or why there is none ("busy": the API said too many requests).
pub async fn candles(network: &str, pool: &str, timeframe: &str, aggregate: u32, limit: u32) -> Result<serde_json::Value, String> {
    let url = url(network, pool, timeframe, aggregate, limit).ok_or_else(|| "not a chart Candy can ask for".to_owned())?;
    let err = |e: reqwest::Error| if e.is_timeout() { "the chart timed out".to_owned() } else { e.to_string() };
    let res = crate::update::client()
        .get(&url)
        .header("Accept", "application/json")
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(err)?;
    if res.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("busy".into());
    }
    let res = res.error_for_status().map_err(err)?;
    if res.content_length().is_some_and(|n| n as usize > MAX_BYTES) {
        return Err("the chart is too large".into());
    }
    let bytes = res.bytes().await.map_err(err)?;
    parse(&bytes)
}

/// The candle list out of {"data":{"attributes":{"ohlcv_list":[…]}}}.
fn parse(bytes: &[u8]) -> Result<serde_json::Value, String> {
    if bytes.len() > MAX_BYTES {
        return Err("the chart is too large".into());
    }
    let value: serde_json::Value = serde_json::from_slice(bytes).map_err(|e| format!("the chart isn't JSON: {e}"))?;
    let list = value.pointer("/data/attributes/ohlcv_list").ok_or("the chart has no candles")?;
    if list.is_array() { Ok(list.clone()) } else { Err("the chart's candles aren't a list".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SOL_POOL: &str = "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj";
    const EVM_POOL: &str = "0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852";

    #[test]
    fn builds_the_address_only_from_parts_it_knows() {
        assert_eq!(
            url("solana", SOL_POOL, "minute", 15, 100).as_deref(),
            Some("https://api.geckoterminal.com/api/v2/networks/solana/pools/8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj/ohlcv/minute?aggregate=15&limit=100")
        );
        assert!(url("eth", EVM_POOL, "hour", 4, 200).is_some());
        assert!(url("bsc", EVM_POOL, "day", 1, 1000).is_some());
        assert!(url("base", EVM_POOL, "minute", 5, 100).is_some());
        assert!(url("base", SOL_POOL, "minute", 5, 100).is_none());
        // Not a network Candy charts, not a shape a pool has, not a size the API serves.
        assert!(url("polygon", EVM_POOL, "day", 1, 100).is_none());
        assert!(url("solana", EVM_POOL, "day", 1, 100).is_none());
        assert!(url("eth", SOL_POOL, "day", 1, 100).is_none());
        assert!(url("solana", "../../x", "day", 1, 100).is_none());
        assert!(url("solana", &SOL_POOL[..31], "day", 1, 100).is_none());
        assert!(url("solana", "So11111111111111111111111111111111111111112", "day", 1, 100).is_some());
        assert!(url("solana", SOL_POOL, "minute", 30, 100).is_none());
        assert!(url("solana", SOL_POOL, "hour", 8, 100).is_none());
        assert!(url("solana", SOL_POOL, "week", 1, 100).is_none());
        assert!(url("solana", SOL_POOL, "day", 1, 0).is_none());
        assert!(url("solana", SOL_POOL, "day", 1, 1001).is_none());
        assert!(url("eth", "0x0d4a11d5EEaaC28EC3F61d100daF4d40471f185g", "day", 1, 100).is_none());
    }

    #[test]
    fn hands_back_the_candle_list_and_nothing_else() {
        let list = parse(br#"{"data":{"id":"x","attributes":{"ohlcv_list":[[1760356800,0.0051,0.0053,0.005,0.0052,12345.6]]}}}"#).unwrap();
        assert_eq!(list.as_array().map(|l| l.len()), Some(1));
        assert!(parse(br#"{"data":{"attributes":{}}}"#).is_err());
        assert!(parse(br#"{"data":{"attributes":{"ohlcv_list":"no"}}}"#).is_err());
        assert!(parse(b"<html>").is_err());
        assert!(parse(&vec![b' '; MAX_BYTES + 1]).is_err());
    }
}
