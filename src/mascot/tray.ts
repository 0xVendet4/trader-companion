// What the notification-area icon shows: Candy as it is right now (its mood,
// its colour, its costume), small. Pure: src/island/tray-icon.ts draws it and
// Rust puts it up.

import { resolveState, type Manifest, type MascotState } from "./mascot";

export interface TrayLook {
  frame: string | null;
  eyes: string | null;
  /** A CSS filter over the frame: the trader's colour, or grey while paused. */
  filter: string;
  /** An alert the trader hasn't looked at yet: a dot in the corner. */
  dot: boolean;
}

/**
 * `colour` is the frame filter the island uses (lookFilter). A state that keeps
 * its own colours (the red ones) keeps them; paused, Candy waits with its eyes
 * shut, greyed out.
 */
export function trayLook(manifest: Manifest, mood: MascotState, colour: string, paused: boolean, unseen: boolean): TrayLook {
  const def = resolveState(manifest, paused ? "idle" : mood);
  const filter = paused ? "grayscale(1) brightness(0.8)" : def?.tint === false ? "none" : colour;
  return {
    frame: def?.frames[0] ?? null,
    eyes: (paused ? def?.eyesBlink : null) ?? def?.eyes ?? null,
    filter,
    dot: unseen,
  };
}

/** Same key, same picture: the icon is only redrawn when this changes. */
export function trayKey(look: TrayLook): string {
  return [look.frame, look.eyes, look.filter, look.dot].join("|");
}
