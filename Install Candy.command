#!/bin/bash
# Candy - Trader Companion: double-click to build Candy from the code in this
# folder and install it on this Mac. Nothing prebuilt is downloaded: it
# compiles here.
#
# It asks before installing the tools a build needs, each from its own
# official source: Apple's Command Line Tools (Apple's update server), Rust
# (rustup.rs) and Node.js (nodejs.org's installer, its checksum checked). The
# build itself is "npm run setup" (scripts/setup.mjs), which you can read too.
# The details of each step go to a log; if something goes wrong, this window
# says what, in a sentence.

cd "$(dirname "$0")" || exit 1
# Where rustup, nodejs.org's installer and Homebrew put their tools, for this
# window too.
export PATH="$PATH:$HOME/.cargo/bin:/usr/local/bin:/opt/homebrew/bin"
LOGDIR="$HOME/Library/Caches/Candy"
LOG="$LOGDIR/install.log"
mkdir -p "$LOGDIR"
echo "Install Candy, $(date)" > "$LOG"
# CI passes --build-only: build, don't install, ask nothing.
MODE=""
[[ " $* " == *" --build-only "* ]] && MODE="--build-only"

failed() {
  echo
  if [ "$MODE" = "--build-only" ]; then
    cat "$LOG"
    exit 1
  fi
  echo "  Something went wrong."
  [ -n "${1:-}" ] && echo "  $1"
  # What went wrong, in a sentence: a full disk, or the reasons setup.mjs
  # gives (its lines that start with "Candy:"). The log has the rest.
  if grep -q -e "ENOSPC" -e "os error 28" "$LOG"; then
    echo "  The disk is full. Free a few GB, then double-click Install Candy again."
  fi
  grep "^Candy:" "$LOG" | sed 's/^Candy:/ /'
  echo
  echo "  If you ask for help, send this file:"
  echo "  $LOG"
  echo
  exit 1
}

echo
echo "  Candy - Trader Companion"
echo
if [ ! -f package.json ]; then
  echo "  Candy's code isn't next to this file. Double-click the ZIP to unzip it,"
  echo "  then double-click Install Candy in the folder that comes out."
  echo
  exit 1
fi

have_clt() { xcode-select -p >/dev/null 2>&1; }
have_rust() { command -v cargo >/dev/null 2>&1; }
have_node() { command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; }

if ! have_clt || ! have_rust || ! have_node; then
  echo "  To build Candy, this Mac needs:"
  have_clt || echo "    - Apple's Command Line Tools (from Apple; it asks for your Mac's password)"
  have_rust || echo "    - Rust"
  have_node || echo "    - Node.js (its installer asks for your Mac's password)"
  echo
  [ "$MODE" = "--build-only" ] && exit 1
  read -r -p "  Install them now? (y/n) " answer
  if [[ ! "$answer" =~ ^[YySs] ]]; then
    echo "  Nothing was installed. Install the tools, then double-click this again."
    echo
    exit 0
  fi
  echo

  if ! have_clt; then
    # From Apple's update server, the way Homebrew's installer gets them:
    # softwareupdate lists them while this file exists. (xcode-select
    # --install's window doesn't open on every macOS: not on 26.2.)
    echo "  Installing Apple's Command Line Tools, 5 to 15 minutes. When your Mac's"
    echo "  password is asked, type it (nothing shows as you type) and press Return."
    marker=/tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress
    touch "$marker"
    clt=$(softwareupdate -l 2>> "$LOG" | grep -B 1 -E 'Command Line Tools' | awk -F'*' '/^ *\*/ {print $2}' |
      sed -e 's/^ *Label: //' -e 's/^ *//' | sort -V | tail -n1)
    echo "softwareupdate: '$clt'" >> "$LOG"
    [ -n "$clt" ] && sudo softwareupdate -i "$clt" --verbose 2>&1 | tee -a "$LOG"
    rm -f "$marker"
    if ! have_clt; then
      # Apple's window, then: wait for it, an hour at most.
      echo "  Click Install in Apple's window..."
      xcode-select --install >> "$LOG" 2>&1
      for _ in $(seq 720); do
        have_clt && break
        sleep 5
      done
    fi
    have_clt || failed "Apple's Command Line Tools didn't install. Double-click Install Candy again to retry."
  fi

  if ! have_rust; then
    echo "  Installing Rust (rustup.rs)..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal >> "$LOG" 2>&1 ||
      failed "Couldn't install Rust. Is the internet on?"
  fi

  if ! have_node; then
    echo "  Downloading Node.js (nodejs.org)..."
    # The newest long-term-support release, from nodejs.org's own list (its
    # tenth column says which are LTS).
    version=$(curl -fsSL https://nodejs.org/dist/index.tab 2>> "$LOG" | awk -F'\t' 'NR > 1 && $10 != "-" && !v { v = $1 } END { print v }')
    [[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || failed "Couldn't reach nodejs.org. Is the internet on?"
    pkg="node-$version.pkg"
    tmp=$(mktemp -d)
    curl -fsSL -o "$tmp/$pkg" "https://nodejs.org/dist/$version/$pkg" >> "$LOG" 2>&1 ||
      failed "Couldn't download Node.js. Is the internet on?"
    want=$(curl -fsSL "https://nodejs.org/dist/$version/SHASUMS256.txt" 2>> "$LOG" | grep " $pkg\$" | cut -d' ' -f1)
    got=$(shasum -a 256 "$tmp/$pkg" | cut -d' ' -f1)
    if [ -z "$want" ] || [ "$want" != "$got" ]; then
      failed "Node.js's download didn't match nodejs.org's checksum, so it wasn't installed."
    fi
    echo "  Installing Node.js $version: click through its installer, then Close..."
    open -W "$tmp/$pkg"
    rm -rf "$tmp"
    have_node || failed "Node.js didn't install. Double-click Install Candy again to retry."
  fi
fi
echo "  [1/3] Tools ................ ok"

echo "  [2/3] Building Candy: 10 to 20 minutes the first time, a few after..."
npm ci >> "$LOG" 2>&1 || failed "Couldn't download the packages the build needs. Is the internet on?"
npm run setup -- $MODE >> "$LOG" 2>&1 || failed
if [ "$MODE" = "--build-only" ]; then
  echo "  Built."
  exit 0
fi

echo "  [3/3] Installed. Candy starts: it lives in the menu bar, and it's in"
echo "        the Applications folder of your home folder."
echo
echo "  Done. You can close this window."
echo
