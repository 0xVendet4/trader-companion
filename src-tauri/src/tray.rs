// Notification-area icon: the version, Open, Settings, Pause, Quit; and Candy
// itself, in its mood and colour (set_icon).

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter};

use crate::island::WINDOW_LABEL;

const TRAY_ID: &str = "companion";

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    // Which Candy this is, on hover and greyed out at the top of the menu.
    let name = format!("Candy {}", app.package_info().version);
    let version = MenuItem::with_id(app, "version", &name, false, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pause / resume", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let sep0 = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(app, &[&version, &sep0, &open, &sep1, &settings, &pause, &sep2, &quit])?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip(&name)
        .menu(&menu)
        .on_menu_event(|app: &AppHandle, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "settings" => crate::show_settings_window(app),
            id => {
                let _ = app.emit_to(WINDOW_LABEL, "tray", id.to_string());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}

/// Puts up the page's drawing of Candy (src/island/tray-icon.ts): RGBA pixels,
/// 16 to 64 px a side. Anything else is ignored.
pub fn set_icon(app: &AppHandle, rgba: Vec<u8>, width: u32, height: u32) {
    if !fits(rgba.len(), width, height) {
        return;
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_icon(Some(Image::new_owned(rgba, width, height)));
    }
}

fn fits(len: usize, width: u32, height: u32) -> bool {
    (16..=64).contains(&width) && (16..=64).contains(&height) && len == (width * height * 4) as usize
}

#[cfg(test)]
mod tests {
    use super::fits;

    #[test]
    fn takes_only_a_small_whole_picture() {
        assert!(fits(32 * 32 * 4, 32, 32));
        assert!(!fits(32 * 32 * 4 - 1, 32, 32));
        assert!(!fits(8 * 8 * 4, 8, 8));
        assert!(!fits(512 * 512 * 4, 512, 512));
    }
}
