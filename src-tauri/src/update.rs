// Updates, with the user's go-ahead (the island asks first).
//
// The newest version is the latest release on GitHub: the build workflow
// (.github/workflows/build.yml) publishes one for every version pushed to
// main, with the Windows installer and the Mac app it built from that code.
// On "Update", the file for this computer is downloaded next to the build
// cache and installed: on Windows the installer runs silently and starts
// Candy again; on a Mac the app bundle is swapped for the new one and
// reopened. Where the release has nothing prebuilt for this computer (Linux,
// or a file missing from a release), its code is downloaded, unpacked and
// built as the user would by hand: on Windows its own `Install Candy.cmd`
// builds and installs it in update mode; on a Mac and on Linux `npm ci` and
// `npm run setup` run in the background while Candy waits, with the tools a
// source install already has. A Mac's setup closes Candy and opens the new
// one; on Linux Candy starts the new one itself.

use std::path::{Path, PathBuf};

/// Where Candy's code lives. If the project moves, change it here: installs
/// built before the change keep asking the old place.
pub const REPO: &str = "0xVendet4/trader-companion";

/// Candy's own client, named in its user agent (also for the calendar, see calendar.rs).
pub(crate) fn client() -> &'static reqwest::Client {
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

/// The latest release's version on GitHub ("v0.1.16" → "0.1.16").
pub async fn latest_version() -> Result<String, String> {
    let url = format!("https://api.github.com/repos/{REPO}/releases/latest");
    let body: serde_json::Value = client()
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?
        .json()
        .await
        .map_err(err)?;
    parse_release(&body).ok_or_else(|| "no version in the latest release".into())
}

/// The version a release is tagged with: "v0.1.16" (the release job's tag), or bare.
fn parse_release(release: &serde_json::Value) -> Option<String> {
    let tag = release.get("tag_name")?.as_str()?;
    plain_version(tag.strip_prefix('v').unwrap_or(tag))
}

/// Digits and dots only: it ends up in a URL, in messages and a comparison, nothing else.
fn plain_version(v: &str) -> Option<String> {
    (!v.is_empty() && v.len() <= 20 && v.chars().all(|c| c.is_ascii_digit() || c == '.')).then(|| v.to_owned())
}

/// The file the release job builds for this computer (its names are in
/// build.yml), or None where it builds nothing and the code is built here.
fn asset_name(version: &str) -> Option<String> {
    if cfg!(windows) {
        Some(format!("Candy-Windows-{version}-setup.exe"))
    } else if cfg!(target_os = "macos") {
        Some(format!("Candy-macOS-{version}.zip"))
    } else {
        None
    }
}

fn asset_url(version: &str, name: &str) -> String {
    format!("https://github.com/{REPO}/releases/download/v{version}/{name}")
}

/// A download: its bytes, None when there is no such file (a 404), or what went wrong.
async fn fetch(url: &str) -> Result<Option<Vec<u8>>, String> {
    let res = client().get(url).send().await.map_err(err)?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    res.error_for_status().map_err(err)?.bytes().await.map(|b| Some(b.to_vec())).map_err(err)
}

/// The one folder a GitHub archive unpacks to (named after the repository and
/// the tag), found rather than guessed: the folder with the package.json.
fn find_root(dir: &Path) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::fs::read_dir(dir).ok()?.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.join("package.json").is_file()).collect();
    dirs.sort();
    dirs.into_iter().next()
}

/// Downloads the release and installs it. Returns how it went under way:
/// "installer" (the release's installer or app, this Candy closes by itself)
/// or "build" (its code, built here: on Windows the installer window is up;
/// elsewhere the build is done). Or what went wrong: the Candy that runs
/// stays as it is.
pub async fn start(app: tauri::AppHandle, version: &str) -> Result<&'static str, String> {
    let version = plain_version(version).ok_or("not a version")?;
    let dir = crate::platform::update_dir();
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(err)?;

    if let Some(name) = asset_name(&version) {
        match fetch(&asset_url(&version, &name)).await? {
            Some(bytes) => {
                let file = dir.join(&name);
                std::fs::write(&file, &bytes).map_err(err)?;
                crate::log::line(format!("update: installing {}", file.display()));
                install_prebuilt(app, file).await?;
                return Ok("installer");
            }
            None => crate::log::line(format!("update: release v{version} has no {name}: building from its code")),
        }
    }

    let url = format!("https://codeload.github.com/{REPO}/tar.gz/refs/tags/v{version}");
    let bytes = fetch(&url).await?.ok_or_else(|| format!("release v{version} has no code to download"))?;
    let archive = dir.join("source.tar.gz");
    std::fs::write(&archive, &bytes).map_err(err)?;
    #[cfg(windows)]
    {
        let _ = app;
        crate::platform::unpack(&dir, &archive)?;
        let root = find_root(&dir).ok_or_else(|| format!("no code in the update ({})", dir.display()))?;
        crate::platform::install_from_source(&root)
    }
    #[cfg(not(windows))]
    {
        tauri::async_runtime::spawn_blocking(move || {
            unix::unpack(&dir, &archive)?;
            let root = find_root(&dir).ok_or_else(|| format!("no code in the update ({})", dir.display()))?;
            unix::build(&dir, &root)
        })
        .await
        .map_err(err)??;
        #[cfg(target_os = "linux")]
        unix::restart(&app);
        #[cfg(not(target_os = "linux"))]
        let _ = app;
        Ok("build")
    }
}

/// The release's file, installed the way scripts/setup.mjs installs a build.
#[cfg(windows)]
async fn install_prebuilt(_app: tauri::AppHandle, file: PathBuf) -> Result<(), String> {
    crate::platform::run_installer(&file)
}

#[cfg(target_os = "macos")]
async fn install_prebuilt(app: tauri::AppHandle, file: PathBuf) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || crate::platform::install_app(&file)).await.map_err(err)??;
    crate::platform::reopen(&app);
    Ok(())
}

#[cfg(not(any(windows, target_os = "macos")))]
async fn install_prebuilt(_app: tauri::AppHandle, _file: PathBuf) -> Result<(), String> {
    Err("nothing prebuilt for this system".into())
}

/// The Mac and Linux build: no installer window, the build runs in the
/// background and its output goes to update.log beside the code.
#[cfg(not(windows))]
mod unix {
    use std::os::unix::process::CommandExt;
    use std::path::Path;
    use std::process::{Command, Stdio};

    use super::err;

    /// What runs in the unpacked folder. Where rustup, nodejs.org's installer
    /// and Homebrew put their tools are added, as Install Candy.command does:
    /// an app opened from the Dock or the app menu gets a short PATH.
    const BUILD: &str = r#"export PATH="$PATH:$HOME/.cargo/bin:/usr/local/bin:/opt/homebrew/bin"; npm ci && npm run setup"#;

    pub fn unpack(dir: &Path, archive: &Path) -> Result<(), String> {
        let unpacked = Command::new("tar").arg("-xzf").arg(archive).arg("-C").arg(dir).status().map_err(err)?;
        if !unpacked.success() {
            return Err("couldn't unpack the update".into());
        }
        Ok(())
    }

    /// Builds and installs the unpacked code, as the user would by hand.
    pub fn build(dir: &Path, src: &Path) -> Result<(), String> {
        let log_path = dir.join("update.log");
        let log = std::fs::File::create(&log_path).map_err(err)?;
        crate::log::line(format!("update: building in {} (log: {})", src.display(), log_path.display()));
        // A login shell reads the profile, where rustup and nvm add their tools.
        // Its own process group: a Mac's setup closes Candy before it opens
        // the new one, and the build must outlive that.
        let status = Command::new(login_shell())
            .arg("-lc")
            .arg(BUILD)
            .current_dir(src)
            .stdin(Stdio::null())
            .stdout(log.try_clone().map_err(err)?)
            .stderr(log)
            .process_group(0)
            .status()
            .map_err(err)?;
        if status.success() {
            return Ok(());
        }
        Err(reason(&std::fs::read_to_string(&log_path).unwrap_or_default(), &log_path))
    }

    /// The user's shell when it is one that reads `export` and `&&` (bash, zsh), else bash.
    fn login_shell() -> String {
        std::env::var("SHELL")
            .ok()
            .filter(|s| s.starts_with('/') && (s.ends_with("/bash") || s.ends_with("/zsh")))
            .unwrap_or_else(|| "/bin/bash".into())
    }

    /// What went wrong, in a sentence: a full disk, the reasons setup.mjs
    /// gives (its lines that start with "Candy:"), or where the log is.
    pub(super) fn reason(log: &str, path: &Path) -> String {
        if log.contains("ENOSPC") || log.contains("os error 28") {
            return "the disk is full. Free a few GB, then try again".into();
        }
        let said: Vec<&str> = log.lines().filter_map(|l| l.strip_prefix("Candy:")).map(str::trim).filter(|l| !l.is_empty()).collect();
        if !said.is_empty() {
            return said.join(" ");
        }
        if log.contains("npm ERR!") || log.contains("npm error") {
            return "couldn't download the packages the build needs. Is the internet on?".into();
        }
        format!("the build didn't finish. The details are in {}", path.display())
    }

    /// Starts the Candy just installed (~/.local/bin/candy, see
    /// scripts/setup.mjs) once this one has quit: a second Candy would only
    /// hand over to the running one.
    #[cfg(target_os = "linux")]
    pub fn restart(app: &tauri::AppHandle) {
        let home = std::env::var_os("HOME").map(std::path::PathBuf::from).unwrap_or_default();
        let exe = home.join(".local").join("bin").join("candy");
        let started = Command::new("/bin/sh")
            .arg("-c")
            .arg(r#"sleep 2; exec "$0""#)
            .arg(&exe)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .process_group(0)
            .spawn();
        match started {
            Ok(_) => {
                crate::log::line("update: installed, starting again");
                app.exit(0);
            }
            Err(e) => crate::log::line(format!("update: installed, but couldn't start {}: {e}", exe.display())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{asset_name, asset_url, find_root, parse_release, plain_version};
    use serde_json::json;

    #[cfg(not(windows))]
    #[test]
    fn says_why_a_build_failed() {
        use super::unix::reason;
        let path = std::path::Path::new("/tmp/update.log");
        assert_eq!(reason("…\nCandy: Rust is missing.\n", path), "Rust is missing.");
        assert!(reason("Error: ENOSPC: no space left", path).starts_with("the disk is full"));
        assert!(reason("npm error network", path).starts_with("couldn't download"));
        assert!(reason("something else", path).ends_with("/tmp/update.log"));
    }

    #[test]
    fn reads_only_a_plain_version() {
        assert_eq!(plain_version("0.1.2"), Some("0.1.2".into()));
        assert_eq!(plain_version("0.1.2\"; rm"), None);
        assert_eq!(plain_version(""), None);
        assert_eq!(parse_release(&json!({ "tag_name": "v0.1.16" })), Some("0.1.16".into()));
        assert_eq!(parse_release(&json!({ "tag_name": "0.1.16" })), Some("0.1.16".into()));
        assert_eq!(parse_release(&json!({ "tag_name": "v0.1.16-rc" })), None);
        assert_eq!(parse_release(&json!({ "name": "x" })), None);
    }

    #[test]
    fn names_the_release_file_as_the_build_workflow_does() {
        let name = asset_name("0.1.16");
        if cfg!(windows) {
            assert_eq!(name.as_deref(), Some("Candy-Windows-0.1.16-setup.exe"));
        } else if cfg!(target_os = "macos") {
            assert_eq!(name.as_deref(), Some("Candy-macOS-0.1.16.zip"));
        } else {
            assert_eq!(name, None);
        }
        assert_eq!(
            asset_url("0.1.16", "Candy-Windows-0.1.16-setup.exe"),
            "https://github.com/0xVendet4/trader-companion/releases/download/v0.1.16/Candy-Windows-0.1.16-setup.exe"
        );
    }

    #[test]
    fn finds_the_unpacked_code_by_its_package_json() {
        let dir = std::env::temp_dir().join(format!("candy-update-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("trader-companion-0.1.16")).unwrap();
        std::fs::create_dir_all(dir.join("pax_global_header")).unwrap();
        assert_eq!(find_root(&dir), None);
        std::fs::write(dir.join("trader-companion-0.1.16").join("package.json"), "{}").unwrap();
        assert_eq!(find_root(&dir), Some(dir.join("trader-companion-0.1.16")));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
