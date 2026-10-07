#!/usr/bin/env bash
# Candy - Trader Companion on Linux: builds the app from this folder's source
# and installs it for you. Nothing prebuilt is downloaded from this project:
# what you install is compiled on your PC from the code you can read here.
#
#   bash install.sh           check, install what is missing (asking first),
#                             build, install
#   bash install.sh --check   only say what is there and what is missing
#
# 1. Checks for the system libraries a build needs (WebKitGTK, gtk-layer-shell,
#    AppIndicator…) and offers to install them with your package manager
#    (apt, dnf, pacman or zypper; it asks for your password), then Node.js 20+
#    (offered through nvm) and Rust (offered through rustup).
# 2. Builds Candy: npm ci, then tauri build (10-20 minutes the first time).
# 3. Installs it for your user only: ~/.local/bin/candy, plus its menu entry and
#    icon in ~/.local/share. Your settings live in ~/.config/candy.

set -euo pipefail
cd "$(dirname "$0")"

CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1
MISSING=0

say()  { printf '  %s\n' "$*"; }
step() { printf '\n\033[36m== %s\033[0m\n' "$*"; }
good() { printf '  \033[32mOK\033[0m  %s\n' "$*"; }
miss() { printf '  MISSING  %s\n' "$*"; MISSING=1; }
fail() { printf '\n  \033[31m%s\033[0m\n' "$*"; exit 1; }
ask()  { local a; read -r -p "  $1 [Y/n] " a; [[ -z "$a" || "$a" =~ ^[yYsS] ]]; }
has()  { command -v "$1" >/dev/null 2>&1; }

[ "$(uname -s)" = "Linux" ] || fail "This script is for Linux. On Windows, run install.cmd."

printf '\n  \033[1mCandy - Trader Companion: build from source and install\033[0m\n'

# ── System libraries ──────────────────────────────────────────────────────────

step "System libraries"
if has apt-get; then
  PM="apt"
  PKGS="build-essential curl wget file pkg-config libssl-dev libwebkit2gtk-4.1-dev libxdo-dev libayatana-appindicator3-dev librsvg2-dev libgtk-layer-shell-dev"
  INSTALL="sudo apt-get update && sudo apt-get install -y $PKGS"
elif has dnf; then
  PM="dnf"
  PKGS="gcc gcc-c++ make curl wget file pkgconf-pkg-config openssl-devel webkit2gtk4.1-devel libxdo-devel libappindicator-gtk3-devel librsvg2-devel gtk-layer-shell-devel"
  INSTALL="sudo dnf install -y $PKGS"
elif has pacman; then
  PM="pacman"
  PKGS="base-devel curl wget file openssl webkit2gtk-4.1 xdotool libappindicator-gtk3 librsvg gtk-layer-shell"
  INSTALL="sudo pacman -S --needed --noconfirm $PKGS"
elif has zypper; then
  PM="zypper"
  PKGS="gcc gcc-c++ make curl wget file pkg-config libopenssl-devel webkit2gtk-4_1-devel libappindicator3-devel librsvg-devel gtk-layer-shell-devel"
  INSTALL="sudo zypper install -y $PKGS"
else
  PM=""
fi

libs_ok() {
  has cc && has pkg-config &&
    pkg-config --exists webkit2gtk-4.1 gtk-layer-shell-0 librsvg-2.0 openssl &&
    { pkg-config --exists ayatana-appindicator3-0.1 || pkg-config --exists appindicator3-0.1; }
}

if libs_ok; then
  good "WebKitGTK 4.1, gtk-layer-shell, AppIndicator, librsvg, OpenSSL, a C compiler"
elif [ "$CHECK" = 1 ]; then
  miss "build libraries (WebKitGTK 4.1, gtk-layer-shell…)${PM:+, installed with $PM}"
elif [ -z "$PM" ]; then
  fail "No apt, dnf, pacman or zypper here. Install Tauri's prerequisites (https://tauri.app/start/prerequisites/#linux) and gtk-layer-shell's development files, then run this again."
else
  say "Needed to build: $PKGS"
  ask "Install them now with $PM (asks for your password)?" || fail "Install them, then run this again."
  bash -c "$INSTALL"
  libs_ok || fail "Some libraries are still missing: see the messages above."
fi

# ── Node.js ───────────────────────────────────────────────────────────────────

step "Node.js 20 or newer"
# A Node installed by nvm earlier is only on the PATH of shells that load nvm.
# (nvm doesn't run under `set -u`.)
load_nvm() { [ -s "$HOME/.nvm/nvm.sh" ] || return 0; set +u; . "$HOME/.nvm/nvm.sh"; set -u; }
load_nvm >/dev/null 2>&1 || true
node_ok() { has node && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; }
if node_ok; then
  good "Node.js $(node --version)"
elif [ "$CHECK" = 1 ]; then
  miss "Node.js 20+"
else
  say "Many distributions ship an older Node.js; nvm installs the current LTS for your user only."
  ask "Install Node.js LTS with nvm (https://github.com/nvm-sh/nvm)?" || fail "Install Node.js 20 or newer, then run this again."
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  load_nvm
  set +u; nvm install --lts; set -u
  node_ok || fail "Node.js still isn't found. Open a new terminal and run this again."
fi

# ── Rust ──────────────────────────────────────────────────────────────────────

step "Rust"
[ -s "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
if has cargo; then
  good "$(cargo --version)"
elif [ "$CHECK" = 1 ]; then
  miss "Rust (cargo)"
else
  ask "Rust is missing. Install it with rustup (https://rustup.rs)?" || fail "Install Rust, then run this again."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  . "$HOME/.cargo/env"
  has cargo || fail "cargo still isn't found. Open a new terminal and run this again."
fi

if [ "$CHECK" = 1 ]; then
  echo
  if [ "$MISSING" = 1 ]; then say "Something is missing: run 'bash install.sh' to install it and build Candy."
  else say "Everything is here: 'bash install.sh' builds and installs Candy."; fi
  exit 0
fi

# ── Build ─────────────────────────────────────────────────────────────────────

step "Building Candy from this source (10-20 minutes the first time)"
npm ci
npx tauri build --no-bundle
BIN="target/release/trader-companion"
[ -x "$BIN" ] || fail "No app at $BIN: the messages above say why."

# ── Install ───────────────────────────────────────────────────────────────────

step "Installing for $(id -un)"
install -Dm755 "$BIN" "$HOME/.local/bin/candy"
install -Dm644 src-tauri/icons/128x128.png "$HOME/.local/share/icons/hicolor/128x128/apps/candy.png"
mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/candy.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Candy
GenericName=Trader Companion
Comment=A mascot at the top of your screen that watches your memecoins
Exec=$HOME/.local/bin/candy
Icon=candy
Terminal=false
Categories=Finance;Utility;
EOF
update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true

echo
good "Done. Open Candy from your app menu, or run: $HOME/.local/bin/candy"
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) say "(~/.local/bin isn't on your PATH: the app menu entry works anyway.)" ;;
esac
