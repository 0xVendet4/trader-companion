#!/bin/bash
# CI on macOS (.github/workflows/build.yml): opens the Candy.app just built,
# walks through what a trader does first — the folded ticker, a hover, a
# click that opens the island, Esc that folds it, dragging Candy out onto the
# desktop and double-clicking him home, then the same at the top of a screen
# with a notch — and takes a screenshot of each step into <shots dir>. Then
# checks he is still running, and prints his log.
#
#   scripts/mac-check.sh <Candy.app> <shots dir>
#
# The mouse is driven with cliclick (Homebrew). Coordinates are in points:
# a new install floats its ticker centred at 50 % across and 12 % down the
# screen's visible area (Settings floatX / floatY), Candy 153 points left of
# its centre (src/core/layout.ts: a 350-point ticker, Candy at its left end).

set -u
app="$1"
shots="$2"
mkdir -p "$shots"
log="$HOME/Library/Logs/Candy/companion.log"

shot() {
  screencapture -x -C "$shots/$1.png" || echo "screenshot $1 failed"
  echo "shot: $1"
}

# The visible area (no menu bar, no Dock), top-left origin: x y w h; then the
# whole screen's width.
read -r vx vy vw vh fw < <(osascript -l JavaScript -e '
  ObjC.import("AppKit");
  const s = $.NSScreen.mainScreen;
  const f = s.frame, v = s.visibleFrame;
  [v.origin.x, f.size.height - v.origin.y - v.size.height, v.size.width, v.size.height, f.size.width].map(Math.round).join(" ");
')
cx=$(( vx + vw / 2 ))
cy=$(( vy + vh * 12 / 100 ))
mx=$(( cx - 153 ))
echo "visible area: $vx,$vy ${vw}x$vh — ticker at $cx,$cy, Candy at $mx,$cy"

# A click on the wallpaper would make macOS slide every window aside and put
# a tip balloon over the ticker (Sonoma's "click wallpaper to show desktop").
defaults write com.apple.WindowManager EnableStandardClickToShowDesktop -bool false

cliclick m:$(( vx + vw - 40 )),$(( vy + vh - 40 ))
open "$app"
sleep 12
shot 01-started

cliclick m:$cx,$cy
sleep 1.5
shot 02-hover

cliclick c:$cx,$cy
sleep 2
shot 03-open

# Esc folds it (the island has the keyboard since the click); the mouse goes away.
cliclick kp:esc
cliclick m:$(( vx + vw - 40 )),$(( vy + vh / 2 ))
sleep 2
shot 04-folded

# Candy dragged out of the ticker, a little at a time: one picture while he is
# held, one after he is let go.
cliclick dd:$mx,$cy w:150 dm:$mx,$(( cy + 12 )) w:100 dm:$(( mx + 60 )),$(( cy + 120 )) w:100 dm:$(( mx + 140 )),$(( cy + 260 )) w:300
shot 05-held
cliclick du:$(( mx + 140 )),$(( cy + 260 ))
sleep 3
shot 06-on-the-desktop

# A double-click sends him home.
cliclick dc:$(( mx + 140 )),$(( cy + 260 ))
sleep 3
shot 07-home-again

# The same Candy at the top of a MacBook with a notch (CANDY_NOTCH pretends
# this screen has a 32-point one): the island starts at the screen's top edge,
# over the menu bar, and grows out of the notch.
pkill -f '[C]andy.app/Contents/MacOS/'
sleep 2
node -e '
  const fs = require("fs"), f = process.argv[1];
  let s = {};
  try { s = JSON.parse(fs.readFileSync(f, "utf8")); } catch {}
  s.placement = "top";
  fs.mkdirSync(require("path").dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(s));
' "$HOME/Library/Application Support/Candy/settings.json"
cliclick m:$(( vx + vw - 40 )),$(( vy + vh / 2 ))
open --env CANDY_NOTCH=32 "$app"
sleep 10
shot 08-notch-folded
# Where macOS put Candy's windows, and on which level (the island: 27, over
# the menu bar's 24 and its icons' 25).
osascript -l JavaScript -e '
  ObjC.import("CoreGraphics");
  const all = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1, 0))) || [];
  all.filter((w) => /candy|trader/i.test(w.kCGWindowOwnerName || ""))
    .map((w) => `window: layer ${w.kCGWindowLayer}, at ${w.kCGWindowBounds.X},${w.kCGWindowBounds.Y}, ${w.kCGWindowBounds.Width}x${w.kCGWindowBounds.Height}`)
    .join("\n") || "window: none found";
'
# A click on the ticker under the notch opens the island.
cliclick c:$(( fw / 2 )),48
sleep 2
shot 09-notch-open
cliclick kp:esc
cliclick m:$(( vx + vw - 40 )),$(( vy + vh / 2 ))
sleep 2
shot 10-notch-folded-again

echo "--- Candy's log ---"
cat "$log" || echo "(no log)"
echo "-------------------"
# [C]: the pattern doesn't match the shell running it.
if ! pgrep -f '[C]andy.app/Contents/MacOS/' > /dev/null; then
  echo "Candy is not running"
  exit 1
fi
grep -q -- "--- Candy .* started ---" "$log" || { echo "Candy never logged its start"; exit 1; }
echo "Candy started and is still running"
pkill -f '[C]andy.app/Contents/MacOS/' || true
