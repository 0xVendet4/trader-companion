// What Settings needs to know about a global shortcut before the page registers
// it: does it type a character on this PC's keyboards? Adapted from Coucou's
// shortcuts.rs (MIT, © Louis Raillé).
//
// On Windows Ctrl+Alt *is* AltGr on most European and the Brazilian layouts,
// so a global Ctrl+Alt+E would swallow every € typed on them (Polish puts ą on
// AltGr+A, ś on AltGr+S). The defaults in src/core/shortcuts.ts avoid the
// usual ones; every Ctrl+Alt combination is also checked against the layouts
// actually installed (platform::ctrl_alt_types) and left unregistered, flagged
// in Settings, when it types something.

use std::str::FromStr;

use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

/// True when Windows reads the combination as AltGr: Ctrl and Alt held, no
/// Windows key.
pub fn is_altgr_like(shortcut: &Shortcut) -> bool {
    shortcut.mods.contains(Modifiers::CONTROL | Modifiers::ALT)
        && !shortcut.mods.intersects(Modifiers::SUPER | Modifiers::META)
}

/// The Windows virtual-key code for `code`, for the keys that can type a
/// character. Others (arrows, F-keys…) never do: `None`.
pub fn character_vk(code: Code) -> Option<u16> {
    use Code::*;
    let letters = [
        KeyA, KeyB, KeyC, KeyD, KeyE, KeyF, KeyG, KeyH, KeyI, KeyJ, KeyK, KeyL, KeyM, KeyN,
        KeyO, KeyP, KeyQ, KeyR, KeyS, KeyT, KeyU, KeyV, KeyW, KeyX, KeyY, KeyZ,
    ];
    if let Some(i) = letters.iter().position(|c| *c == code) {
        return Some(0x41 + i as u16);
    }
    let digits = [Digit0, Digit1, Digit2, Digit3, Digit4, Digit5, Digit6, Digit7, Digit8, Digit9];
    if let Some(i) = digits.iter().position(|c| *c == code) {
        return Some(0x30 + i as u16);
    }
    Some(match code {
        Space => 0x20,
        Semicolon => 0xBA,
        Equal => 0xBB,
        Comma => 0xBC,
        Minus => 0xBD,
        Period => 0xBE,
        Slash => 0xBF,
        Backquote => 0xC0,
        BracketLeft => 0xDB,
        Backslash => 0xDC,
        BracketRight => 0xDD,
        Quote => 0xDE,
        IntlBackslash => 0xE2,
        _ => return None,
    })
}

/// The character `keys` (an accelerator such as "CommandOrControl+Alt+V")
/// types on one of the installed keyboard layouts, if any.
pub fn types_with(keys: &str, types: impl Fn(u16, bool) -> Option<String>) -> Option<String> {
    let shortcut = Shortcut::from_str(keys).ok()?;
    if !is_altgr_like(&shortcut) {
        return None;
    }
    let vk = character_vk(shortcut.key)?;
    types(vk, shortcut.mods.contains(Modifiers::SHIFT))
}

/// For Settings: what each of `keys` types on this PC ("" for nothing), in order.
#[tauri::command]
pub fn shortcut_types(keys: Vec<String>) -> Vec<String> {
    keys.iter()
        .take(32)
        .map(|k| types_with(k, crate::platform::ctrl_alt_types).unwrap_or_default())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_ctrl_alt_without_the_windows_key_reads_as_altgr() {
        let p = |s: &str| Shortcut::from_str(s).unwrap();
        assert!(is_altgr_like(&p("CommandOrControl+Alt+E")));
        assert!(is_altgr_like(&p("Ctrl+Alt+Shift+E")));
        assert!(!is_altgr_like(&p("CommandOrControl+Shift+Space")));
        assert!(!is_altgr_like(&p("Ctrl+Alt+Super+E")));
    }

    #[test]
    fn virtual_keys_match_the_ones_registered() {
        assert_eq!(character_vk(Code::KeyA), Some(0x41));
        assert_eq!(character_vk(Code::KeyZ), Some(0x5A));
        assert_eq!(character_vk(Code::Digit9), Some(0x39));
        assert_eq!(character_vk(Code::BracketRight), Some(0xDD));
        assert_eq!(character_vk(Code::ArrowLeft), None);
        assert_eq!(character_vk(Code::F5), None);
    }

    #[test]
    fn only_a_ctrl_alt_key_that_types_is_flagged() {
        let polish = |vk: u16, _shift: bool| (vk == 0x41).then(|| "ą".to_string());
        assert_eq!(types_with("CommandOrControl+Alt+A", polish).as_deref(), Some("ą"));
        assert_eq!(types_with("CommandOrControl+Alt+V", polish), None);
        assert_eq!(types_with("CommandOrControl+Shift+A", polish), None);
        assert_eq!(types_with("CommandOrControl+Alt+Right", |_, _| Some("x".into())), None);
        assert_eq!(types_with("not a shortcut", polish), None);
    }

    #[test]
    fn the_page_spelling_of_every_default_parses() {
        for keys in [
            "CommandOrControl+Shift+Space",
            "CommandOrControl+Alt+V",
            "CommandOrControl+Alt+A",
            "CommandOrControl+Alt+Right",
            "CommandOrControl+Alt+Left",
            "CommandOrControl+Alt+S",
            "CommandOrControl+Alt+G",
            "CommandOrControl+Alt+D",
        ] {
            assert!(Shortcut::from_str(keys).is_ok(), "{keys}");
        }
    }
}
