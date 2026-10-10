// What the notification-area icon shows: Candy as it is right now (its mood,
// its colour, its costume), small. Pure: src/island/tray-icon.ts draws it and
// Rust puts it up.

import { formatPnl } from "../core/format";
import { t, tn } from "../core/i18n";
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

/** Windows cuts a tray tooltip at 127 characters. */
export const TOOLTIP_MAX = 127;

/**
 * The tray icon's tooltip: which Candy, today's result, the watchlist's top
 * mover. `day` null: no trades today; `mover` null: nothing moved enough.
 */
export function trayTooltip(
  version: string,
  day: { total: number; count: number; unit: string } | null,
  mover: string | null,
  paused: boolean,
): string {
  const lines = [paused ? t("Candy {version} (paused)", { version }) : `Candy ${version}`];
  if (day) lines.push(tn(day.count, "Today: {pnl} ({n} trade)", "Today: {pnl} ({n} trades)", { pnl: formatPnl(day.total, day.unit) }));
  else lines.push(t("Today: no trades yet"));
  if (mover) lines.push(t("Top mover: {mover}", { mover }));
  const text = lines.join("\n");
  return text.length > TOOLTIP_MAX ? `${text.slice(0, TOOLTIP_MAX - 1)}…` : text;
}
