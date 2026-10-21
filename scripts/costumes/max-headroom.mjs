// Max Headroom: Silvio's costume, drawn by hand. Its frames are the SVGs in
// public/mascot/costumes/max-headroom/ (the eyes drawn into each, no eye
// layers), so nothing is written here: this is only its look, a frame for
// every mood, so `npm run mascot` keeps it in mascot.json like every costume.

const MOODS = {
  idle: ["idle.svg"],
  happy: ["happy.svg"],
  celebrate: ["celebrate-1.svg", "celebrate-2.svg"],
  worried: ["worried.svg"],
  shocked: ["shocked.svg"],
  sleepy: ["sleepy.svg"],
  alert: ["shocked.svg"],
  tired: ["tired.svg"],
  stop: ["stop.svg"],
  confused: ["confused.svg"],
  love: ["love.svg"],
  wave: ["wave-1.svg", "wave-2.svg"],
  proud: ["proud.svg"],
  sad: ["sad.svg"],
  bored: ["bored.svg"],
  focused: ["focused.svg"],
  nervous: ["worried.svg"],
  curious: ["curious.svg"],
  angry: ["angry.svg"],
  excited: ["celebrate-1.svg", "celebrate-2.svg"],
  relieved: ["relieved.svg"],
  dizzy: ["dizzy.svg"],
  cool: ["cool.svg"],
  sick: ["sick.svg"],
};

export default function maxHeadroom() {
  const look = {};
  for (const [state, frames] of Object.entries(MOODS)) look[state] = { frames };
  look.celebrate.fps = 4;
  look.wave.fps = 3;
  return { name: "Max Headroom", frames: {}, look };
}
