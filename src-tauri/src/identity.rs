// The trader's first name, for Candy's greeting. Adapted from Coucou's
// identity.rs (MIT, © Louis Raillé). The full name comes from the OS account
// (platform::user_full_name); this file only decides whether it is something
// you would greet someone by. It never leaves the PC.

use std::sync::OnceLock;

const MAX_FULL_NAME_CHARS: usize = 32;

/// Resolved once: the account name cannot change while the app runs.
pub fn first_name() -> Option<&'static str> {
    static NAME: OnceLock<Option<String>> = OnceLock::new();
    NAME.get_or_init(|| crate::platform::user_full_name().as_deref().and_then(first_name_from))
        .as_deref()
}

/// "Ana Souza" gives "Ana"; a login handle such as "anasouza" or
/// "a.souza2" gives nothing, because "Hey anasouza!" reads worse than a
/// greeting with no name at all.
pub fn first_name_from(full_name: &str) -> Option<String> {
    let full = full_name.trim();
    if full.is_empty() || full.chars().count() > MAX_FULL_NAME_CHARS || looks_like_login_handle(full) {
        return None;
    }
    let first = full.split(' ').find(|p| !p.is_empty())?;
    first.chars().all(is_name_part).then(|| capitalized(first))
}

/// "mariana" (an account named all in lowercase) is greeted as "Mariana".
fn capitalized(word: &str) -> String {
    let mut chars = word.chars();
    chars.next().map(|c| c.to_uppercase().chain(chars).collect()).unwrap_or_default()
}

/// Where no full name is set the OS hands back the account name, so a single
/// lowercase word, or one carrying digits or separators, is taken as a handle.
fn looks_like_login_handle(name: &str) -> bool {
    if name.contains(' ') {
        return false;
    }
    name.to_lowercase() == name || name.chars().any(|c| c.is_numeric() || "._-@".contains(c))
}

fn is_name_part(c: char) -> bool {
    c.is_alphabetic() || c == '\'' || c == '-'
}

#[cfg(test)]
mod tests {
    use super::first_name_from;

    #[test]
    fn a_real_full_name_gives_its_first_word() {
        assert_eq!(first_name_from("Théodore Riant").as_deref(), Some("Théodore"));
        assert_eq!(first_name_from("  Ana Souza ").as_deref(), Some("Ana"));
        assert_eq!(first_name_from("Jean-Luc Picard").as_deref(), Some("Jean-Luc"));
        assert_eq!(first_name_from("O'Brien Miles").as_deref(), Some("O'Brien"));
        assert_eq!(first_name_from("João").as_deref(), Some("João"));
        // Typed all in lowercase in the account: the greeting still capitalizes it.
        assert_eq!(first_name_from("mariana souza").as_deref(), Some("Mariana"));
        assert_eq!(first_name_from("élodie martin").as_deref(), Some("Élodie"));
    }

    #[test]
    fn login_handles_and_odd_names_give_nothing() {
        for name in ["", "   ", "anasouza", "a.souza2", "Ana2", "ana_s", "me@example", "Admin_01"] {
            assert_eq!(first_name_from(name), None, "{name}");
        }
        assert_eq!(first_name_from("R2-D2 Unit"), None);
        assert_eq!(first_name_from("Dr. Who"), None);
        assert_eq!(first_name_from(&format!("Ana {}", "a".repeat(40))), None);
    }
}
