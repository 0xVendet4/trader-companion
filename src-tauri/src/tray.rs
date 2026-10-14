// Notification-area icon: the version, Open, Wardrobe, Closet, Try the demo,
// Settings, Pause, Quit (in the trader's language: set_labels); and Candy
// itself, in its mood and colour (set_icon).

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};

use crate::island::WINDOW_LABEL;

const TRAY_ID: &str = "companion";

/// The menu's items, in order: Open, Wardrobe, Closet, Try the demo, Settings, Pause, Quit.
struct TrayItems(Vec<MenuItem<tauri::Wry>>);

/// The menu in the trader's language (src/core/i18n.ts): one label per item,
/// in the order above; plain text, short. Anything else is ignored.
pub fn set_labels(app: &AppHandle, labels: &[String]) {
    let Some(items) = app.try_state::<TrayItems>() else { return };
    if labels.len() != items.0.len() {
        return;
    }
    for (item, label) in items.0.iter().zip(labels) {
        let text = menu_label(label);
        if !text.is_empty() {
            let _ = item.set_text(text);
        }
    }
}

/// No control characters, 40 characters at most.
fn menu_label(text: &str) -> String {
    text.chars().filter(|c| !c.is_control()).take(40).collect()
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    // Which Candy this is, on hover and greyed out at the top of the menu.
    let name = format!("Candy {}", app.package_info().version);
    let version = MenuItem::with_id(app, "version", &name, false, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
    let wardrobe = MenuItem::with_id(app, "wardrobe", "Wardrobe…", true, None::<&str>)?;
    let closet = MenuItem::with_id(app, "closet", "Closet…", true, None::<&str>)?;
    let demo = MenuItem::with_id(app, "demo", "Try the demo", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Pause / resume", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let sep0 = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(app, &[&version, &sep0, &open, &wardrobe, &closet, &demo, &sep1, &settings, &pause, &sep2, &quit])?;
    // Kept to be relabelled in the trader's language (set_labels).
    app.manage(TrayItems(vec![open, wardrobe, closet, demo, settings, pause, quit]));

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip(&name)
        .menu(&menu)
        .on_menu_event(|app: &AppHandle, event| match event.id.as_ref() {
            "quit" => app.exit(0),
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

/// The page's summary on hover (src/mascot/tray.ts trayTooltip): which Candy,
/// today's result, the top mover. Plain text, kept to what Windows shows.
pub fn set_tooltip(app: &AppHandle, text: &str) {
    let clean = tooltip_text(text);
    if clean.is_empty() {
        return;
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(clean));
    }
}

/// Line breaks kept, every other control character dropped, 127 characters at most.
fn tooltip_text(text: &str) -> String {
    text.chars().filter(|c| *c == '\n' || !c.is_control()).take(127).collect()
}

#[cfg(test)]
mod tests {
    use super::{fits, menu_label, tooltip_text};

    #[test]
    fn a_menu_label_is_short_plain_text() {
        assert_eq!(menu_label("Configurações…"), "Configurações…");
        assert_eq!(menu_label("Quit\n\u{7}"), "Quit");
        assert_eq!(menu_label(&"x".repeat(90)).chars().count(), 40);
    }

    #[test]
    fn takes_only_a_small_whole_picture() {
        assert!(fits(32 * 32 * 4, 32, 32));
        assert!(!fits(32 * 32 * 4 - 1, 32, 32));
        assert!(!fits(8 * 8 * 4, 8, 8));
        assert!(!fits(512 * 512 * 4, 512, 512));
    }

    #[test]
    fn a_tooltip_is_short_plain_text() {
        assert_eq!(tooltip_text("Candy 0.1.13\nToday: +0.42 SOL"), "Candy 0.1.13\nToday: +0.42 SOL");
        assert_eq!(tooltip_text("BONK\u{7}\r\t!"), "BONK!");
        assert_eq!(tooltip_text(&"x".repeat(300)).chars().count(), 127);
    }
}
