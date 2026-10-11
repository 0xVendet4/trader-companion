#!/bin/bash
# Candy - Trader Companion: double-click to remove Candy from this Mac: the
# app, its settings, its log and what its build left behind. Then, only if you
# say so, the tools Install Candy installed to build it (Rust, Node.js from
# nodejs.org, Apple's Command Line Tools). It asks before each part.

echo
echo "  Remove Candy"
echo
read -r -p "  Remove Candy, its settings (watchlist, alerts) and its build files? (y/n) " answer
if [[ ! "$answer" =~ ^[YySs] ]]; then
  echo "  Nothing was removed."
  echo
  exit 0
fi

# [C]: the pattern doesn't match the shell running it.
pkill -f '[C]andy.app/Contents/MacOS/'
# "Start with the Mac", if it was on (tauri-plugin-autostart's LaunchAgent).
agent="$HOME/Library/LaunchAgents/Candy.plist"
grep -q "Candy.app" "$agent" 2>/dev/null && rm -f "$agent"
rm -rf "$HOME/Applications/Candy.app" \
  "$HOME/Library/Application Support/Candy" \
  "$HOME/Library/Logs/Candy" \
  "$HOME/Library/Caches/Candy" \
  "$HOME/Library/Caches/com.tradercompanion.app" \
  "$HOME/Library/WebKit/com.tradercompanion.app" \
  "$HOME/Library/HTTPStorages/com.tradercompanion.app" \
  "$HOME/Library/Saved Application State/com.tradercompanion.app.savedState" \
  "$HOME/Library/Preferences/com.tradercompanion.app.plist"
# Install Candy made ~/Applications for Candy: gone too if nothing else is in it.
rmdir "$HOME/Applications" 2>/dev/null
echo "  Candy was removed."
echo

rust=""; node=""; clt=""
[ -x "$HOME/.cargo/bin/rustup" ] && rust=1
# Node.js only if it came from nodejs.org's installer (Homebrew's is left alone).
pkgutil --pkgs 2>/dev/null | grep -q '^org\.nodejs\.' && node=1
[ "$(xcode-select -p 2>/dev/null)" = "/Library/Developer/CommandLineTools" ] && clt=1
if [ -z "$rust$node$clt" ]; then
  echo "  Done. Last, drag this folder (trader-companion-main) and its ZIP"
  echo "  from Downloads to the Trash."
  echo
  exit 0
fi

echo "  Install Candy may also have installed these tools:"
[ -n "$rust" ] && echo "    - Rust"
[ -n "$node" ] && echo "    - Node.js"
[ -n "$clt" ] && echo "    - Apple's Command Line Tools"
echo "  Remove them only if nobody else on this Mac uses them."
read -r -p "  Remove them too? (y/n) " answer
if [[ "$answer" =~ ^[YySs] ]]; then
  if [ -n "$node$clt" ]; then
    sudo -p "  Your Mac's password (nothing shows as you type it), then Return: " -v || {
      echo "  Without the password, Node.js and Apple's tools stay."
      node=""; clt=""
    }
  fi
  if [ -n "$node$clt" ]; then
    echo "  Password accepted: nothing more to type."
    # Keys typed from here on aren't shown: a password typed again by mistake
    # would stay on the screen.
    stty -echo 2>/dev/null
    trap 'stty echo 2>/dev/null' EXIT
  fi
  if [ -n "$rust" ]; then
    # rustup's own uninstall: ~/.rustup, ~/.cargo and the PATH line it added.
    "$HOME/.cargo/bin/rustup" self uninstall -y >/dev/null 2>&1
    echo "  Rust was removed."
  fi
  if [ -n "$node" ]; then
    # What nodejs.org's installer puts in /usr/local, and its receipts.
    sudo rm -rf /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/include/node /usr/local/share/doc/node /usr/local/share/man/man1/node.1 \
      /usr/local/share/systemtap/tapset/node.stp
    pkgutil --pkgs | grep '^org\.nodejs\.' | while read -r pkg; do
      sudo pkgutil --forget "$pkg" >/dev/null
    done
    rm -rf "$HOME/.npm"
    echo "  Node.js was removed."
  fi
  if [ -n "$clt" ]; then
    sudo rm -rf /Library/Developer/CommandLineTools
    echo "  Apple's Command Line Tools were removed."
  fi
else
  echo "  The tools stay."
fi
echo
echo "  Done. Last, drag this folder (trader-companion-main) and its ZIP"
echo "  from Downloads to the Trash."
echo
