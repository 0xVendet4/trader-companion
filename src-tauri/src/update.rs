// Updates from source, with the user's go-ahead (the island asks first).
//
// The version on GitHub is read from package.json on the main branch. On
// "Update", that branch's code is downloaded from GitHub, unpacked next to the
// build cache, and built and installed by its own `Install Candy.cmd` in update
// mode (the installer runs silently and Candy starts again): the same steps a
// user takes by hand, from the same public code.

use std::path::Path;

/// Where Candy's code lives. If the project moves, change it here: installs
/// built before the change keep asking the old place.
pub const REPO: &str = "0xVendet4/trader-companion";
const BRANCH: &str = "main";

fn client() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(concat!("Candy/", env!("CARGO_PKG_VERSION")))
            .build()
            .unwrap_or_default()
    })
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// The version in package.json on GitHub's main branch.
pub async fn latest_version() -> Result<String, String> {
    let url = format!("https://raw.githubusercontent.com/{REPO}/{BRANCH}/package.json");
    let body: serde_json::Value = client()
        .get(&url)
        .send()
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?
        .json()
        .await
        .map_err(err)?;
    parse_version(&body).ok_or_else(|| "no version in package.json".into())
}

fn parse_version(package: &serde_json::Value) -> Option<String> {
    let v = package.get("version")?.as_str()?;
    // Digits and dots only: it ends up in messages and a comparison, nothing else.
    (!v.is_empty() && v.len() <= 20 && v.chars().all(|c| c.is_ascii_digit() || c == '.')).then(|| v.to_owned())
}

/// Downloads the main branch's code, unpacks it and starts its installer in
/// update mode. Returns once the installer window is up.
pub async fn start() -> Result<(), String> {
    let dir = crate::platform::update_dir();
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(err)?;
    let url = format!("https://codeload.github.com/{REPO}/tar.gz/refs/heads/{BRANCH}");
    let bytes = client()
        .get(&url)
        .send()
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?
        .bytes()
        .await
        .map_err(err)?;
    let archive = dir.join("source.tar.gz");
    std::fs::write(&archive, &bytes).map_err(err)?;
    // GitHub's archive holds one folder, named after the repository and branch.
    let name = REPO.rsplit('/').next().unwrap_or("trader-companion");
    let root = format!("{name}-{BRANCH}");
    crate::platform::unpack_and_install(&dir, &archive, Path::new(&root))
}

#[cfg(test)]
mod tests {
    use super::parse_version;
    use serde_json::json;

    #[test]
    fn reads_only_a_plain_version() {
        assert_eq!(parse_version(&json!({ "version": "0.1.2" })), Some("0.1.2".into()));
        assert_eq!(parse_version(&json!({ "version": "0.1.2\"; rm" })), None);
        assert_eq!(parse_version(&json!({ "name": "x" })), None);
        assert_eq!(parse_version(&json!({ "version": "" })), None);
    }
}
