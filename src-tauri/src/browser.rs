/// Gets the URL of the active tab in the frontmost browser window (macOS only).
/// Returns None on other platforms or when no supported browser is in front.
#[tauri::command]
pub fn get_active_tab_url() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let script = r#"
try
    set appName to name of (info for (path to frontmost application))
    if appName contains "Google Chrome" or appName contains "Chromium" or appName contains "Brave" then
        tell application "Google Chrome"
            return URL of active tab of front window
        end tell
    else if appName contains "Firefox" then
        tell application "Firefox"
            return URL of active tab of window 1
        end tell
    else
        tell application "Safari"
            return URL of current tab of window 1
        end tell
    end if
on error
    return ""
end try
"#;
        let output = std::process::Command::new("osascript")
            .args(["-e", script])
            .output()
            .ok()?;
        let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if url.is_empty() { None } else { Some(url) }
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}
