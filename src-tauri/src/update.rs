// Updates from source, with the user's go-ahead (the island asks first).
//
// The version on GitHub is read from package.json on the main branch. On
// "Update", that branch's code is downloaded from GitHub and unpacked next to
// the build cache. On Windows its own `Install Candy.cmd` builds and installs
// it in update mode (the installer runs silently and Candy starts again). On a
// Mac and on Linux the same `npm ci` and `npm run setup` run in the
// background while Candy waits: the tools are already there, since Candy was
// built on this computer. A Mac's setup closes Candy and opens the new one;
// on Linux Candy starts the new one itself. The same steps a user takes by
// hand, from the same public code.

use std::path::Path;

/// Where Candy's code lives. If the project moves, change it here: installs
/// built before the change keep asking the old place.
pub const REPO: &str = "0xVendet4/trader-companion";
const BRANCH: &str = "main";

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

/// Downloads the main branch's code, unpacks it and builds it. On Windows,
/// returns once the installer window is up; elsewhere, once the build is done
/// (or with what went wrong: the Candy that runs stays as it is).
pub async fn start(app: tauri::AppHandle) -> Result<(), String> {
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
    #[cfg(windows)]
    {
        let _ = app;
        crate::platform::unpack_and_install(&dir, &archive, Path::new(&root))
    }
    #[cfg(not(windows))]
    {
        tauri::async_runtime::spawn_blocking(move || unix::build(&dir, &archive, Path::new(&root)))
            .await
            .map_err(err)??;
        #[cfg(target_os = "linux")]
        unix::restart(&app);
        #[cfg(not(target_os = "linux"))]
        let _ = app;
        Ok(())
    }
}

/// The Mac and Linux update: no installer window, the build runs in the
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

    /// Unpacks the code and builds and installs it, as the user would by hand.
    pub fn build(dir: &Path, archive: &Path, root: &Path) -> Result<(), String> {
        let unpacked = Command::new("tar").arg("-xzf").arg(archive).arg("-C").arg(dir).status().map_err(err)?;
        if !unpacked.success() {
            return Err("couldn't unpack the update".into());
        }
        let src = dir.join(root);
        if !src.join("package.json").is_file() {
            return Err(format!("no code in the update ({})", src.display()));
        }
        let log_path = dir.join("update.log");
        let log = std::fs::File::create(&log_path).map_err(err)?;
        crate::log::line(format!("update: building in {} (log: {})", src.display(), log_path.display()));
        // A login shell reads the profile, where rustup and nvm add their tools.
        // Its own process group: a Mac's setup closes Candy before it opens
        // the new one, and the build must outlive that.
        let status = Command::new(login_shell())
            .arg("-lc")
            .arg(BUILD)
            .current_dir(&src)
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
    use super::parse_version;
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
        assert_eq!(parse_version(&json!({ "version": "0.1.2" })), Some("0.1.2".into()));
        assert_eq!(parse_version(&json!({ "version": "0.1.2\"; rm" })), None);
        assert_eq!(parse_version(&json!({ "name": "x" })), None);
        assert_eq!(parse_version(&json!({ "version": "" })), None);
    }
}
