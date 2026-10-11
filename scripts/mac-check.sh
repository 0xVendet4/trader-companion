#!/bin/bash
# CI on macOS (.github/workflows/build.yml): opens the Candy.app just built,
# walks through what a trader does first — the folded ticker, a hover, a
# click that opens the island, a click outside that folds it, dragging Candy
# out onto the desktop and double-clicking him home — and takes a screenshot
# of each step into <shots dir>. Then checks he is still running, and prints
# his log.
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

# The visible area (no menu bar, no Dock), top-left origin: x y w h.
read -r vx vy vw vh < <(osascript -l JavaScript -e '
  ObjC.import("AppKit");
  const s = $.NSScreen.mainScreen;
  const f = s.frame, v = s.visibleFrame;
  [v.origin.x, f.size.height - v.origin.y - v.size.height, v.size.width, v.size.height].map(Math.round).join(" ");
')
cx=$(( vx + vw / 2 ))
cy=$(( vy + vh * 12 / 100 ))
mx=$(( cx - 153 ))
echo "visible area: $vx,$vy ${vw}x$vh — ticker at $cx,$cy, Candy at $mx,$cy"

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

cliclick c:$cx,$(( cy + 420 ))
sleep 2
shot 04-folded

# Candy dragged out of the ticker, a little at a time, and let go.
cliclick dd:$mx,$cy w:150 dm:$mx,$(( cy + 12 )) w:100 dm:$(( mx + 60 )),$(( cy + 120 )) w:100 dm:$(( mx + 140 )),$(( cy + 260 )) w:150 du:$(( mx + 140 )),$(( cy + 260 ))
sleep 3
shot 05-on-the-desktop

# A double-click sends him home.
cliclick dc:$(( mx + 140 )),$(( cy + 260 ))
sleep 3
shot 06-home-again

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
