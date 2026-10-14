// The chart that opens when the pointer rests on a token's row (watchlist, My
// wallet): candles of the size the trader last picked (1m … 24h), the open →
// close change and the high and low, in a popover anchored to the row inside
// the island. It closes when the pointer leaves the row and the popover; while
// it is open the island does not fold away. One popover serves every row.
// Candles come from GeckoTerminal through src/market/charts.ts; the geometry
// of what is drawn is worked out in src/market/chart.ts (pure, tested).

import { h } from "./dom";
import type { ViewActions } from "./shared";
import { Companion } from "../companion";
import { formatPct, formatPrice, pctClass } from "../core/format";
import { t } from "../core/i18n";
import { State, type IslandViewName } from "../core/state";
import { CHART_INTERVALS, chartDrawing, chartStats, chartTtl, type Candle, type ChartInterval } from "../market/chart";
import { loadChart, type ChartLoad } from "../market/charts";
import type { ChainId } from "../market/chains";

/** What a row shows a chart of. */
export interface ChartSubject {
  symbol: string;
  chainId: ChainId;
  /** The token's pool on its DEX; "" when the market has not quoted it yet. */
  pairAddress: string;
}

/** How long the pointer rests on a row before its chart opens. */
export const CHART_HOVER_MS = 450;
/** Leaving the row for the popover (or back): this long to get there. */
const LEAVE_GRACE_MS = 90;
/** A held token without a pool yet: looked at again this often, until the market quotes it. */
const NOPOOL_RETRY_MS = 5_000;
export const POP_W = 300;
export const POP_H = 150;
/** Room kept between the popover and the island's edge. */
const EDGE = 6;
/** What the chart calls itself when it holds the island open (ViewActions.holdOpen). */
const HOLDER = "chart";

interface Open {
  /** The token, as the view names it (its key or mint): finds its row again when the list is rebuilt. */
  id: string;
  row: HTMLElement;
  /** The view the row is in: a rebuilt list is looked through there. */
  view: HTMLElement;
  host: HTMLElement;
  /** The tab the row is on (State.view): another tab coming up closes the chart. */
  tab: IslandViewName;
  /** Read every time the chart is shown: a held token's pool may arrive after it opened. */
  subject: () => ChartSubject;
  actions: ViewActions;
  /** Counts up on every open and interval change: an answer for an older one is ignored. */
  gen: number;
}

let el: HTMLElement | null = null;
let sym: HTMLElement;
let change: HTMLElement;
let range: HTMLElement;
let canvas: HTMLCanvasElement;
let note: HTMLElement;
let seg: HTMLElement;
let open: Open | null = null;
let gen = 0;
/** The candle size drawn on the canvas now; null while it is blank (a note, or nothing yet). */
let drawn: ChartInterval | null = null;
/** The row the pointer is on (by the token it names), if any. */
let overRow: string | null = null;
let openTimer: number | null = null;
let closeTimer: number | null = null;
let refreshTimer: number | null = null;
/** Watches the view while a chart is open: a list rebuilt under it moves the chart to the token's new row. */
let rebuilt: MutationObserver | null = null;

function build(): HTMLElement {
  sym = h("span", { class: "sym" });
  change = h("span", { class: "chg" });
  range = h("span", { class: "hl" });
  canvas = h("canvas", { class: "chart-canvas" });
  note = h("div", { class: "chart-note" });
  seg = h("div", { class: "seg chart-seg" });
  for (const iv of CHART_INTERVALS) {
    const b = h("button", { class: "seg-btn", type: "button", text: iv });
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      if (State.companion.chartInterval === iv) return;
      State.companion.chartInterval = iv;
      Companion.save();
      open?.actions.blip();
      if (open) void show(open);
    });
    seg.append(b);
  }
  const pop = h("div", { class: "chart-pop" }, h("div", { class: "chart-head" }, sym, change, range), h("div", { class: "chart-body" }, canvas, note), seg);
  pop.addEventListener("mouseenter", clearClose);
  pop.addEventListener("mouseleave", scheduleClose);
  // A click in the popover is not a click on the row under it.
  pop.addEventListener("click", (e) => e.stopPropagation());
  // The island folded, another tab came up (a shortcut), or the views were
  // built anew in another language (Island.relabel): the chart goes with it.
  State.subscribe(() => {
    if (open && (State.mode !== "expanded" || State.view !== open.tab || !open.view.isConnected)) close();
  });
  rebuilt = new MutationObserver(() => {
    if (open && !open.row.isConnected) reanchor();
  });
  return pop;
}

/** The token's row in the list as it is now. */
function findRow(o: Open): HTMLElement | null {
  return o.view.querySelector<HTMLElement>(`.row[data-chart="${CSS.escape(o.id)}"]`);
}

/** The list was built again: the chart moves to the token's new row, or goes when the token left the list. */
function reanchor() {
  if (!open) return;
  const row = findRow(open);
  if (!row) return close();
  open.row = row;
  place(open.host, row);
}

/** The rows scrolled under the chart (a wheel over the list): its row moved away, so it closes, as when the pointer leaves. */
function onScroll() {
  close();
}

function clearOpen() {
  if (openTimer != null) window.clearTimeout(openTimer);
  openTimer = null;
}

function clearClose() {
  if (closeTimer != null) window.clearTimeout(closeTimer);
  closeTimer = null;
}

function scheduleClose() {
  clearClose();
  closeTimer = window.setTimeout(() => {
    closeTimer = null;
    // What the pointer is really on decides (a row rebuilt under it sends no mouseleave).
    if (!open || (!el?.matches(":hover") && !open.row.matches(":hover"))) close();
  }, LEAVE_GRACE_MS);
}

/** Closes the popover, if open. An answer still on its way is then ignored. */
export function closeChart() {
  clearOpen();
  close();
}

function close() {
  clearClose();
  later(null);
  if (!open) return;
  gen++;
  const was = open;
  open = null;
  drawn = null;
  rebuilt?.disconnect();
  was.view.removeEventListener("scroll", onScroll, { capture: true });
  el?.remove();
  was.actions.holdOpen(false, HOLDER);
}

/**
 * Wires a row: resting the pointer on it opens its chart. `id` names the
 * token (its key or mint) so the chart finds the row again when the list is
 * rebuilt; `subject` is read whenever the chart is shown, so a row whose pool
 * arrives later still gets its chart.
 */
export function wireChartHover(row: HTMLElement, id: string, subject: () => ChartSubject, actions: ViewActions) {
  row.dataset.chart = id;
  row.addEventListener("mouseenter", () => {
    overRow = id;
    clearOpen();
    if (open?.id === id) {
      // Back on its row (or on the row built anew under the pointer): the chart stays.
      open.row = row;
      clearClose();
      return;
    }
    // The view and the island are found now, while the row is on screen: a
    // list rebuilt before the pointer has rested leaves this row detached, and
    // the chart then opens on the token's new row in the same view.
    const view = row.closest<HTMLElement>(".view");
    const host = row.closest<HTMLElement>("#island-clip") ?? view;
    if (!view || !host) return;
    openTimer = window.setTimeout(() => {
      openTimer = null;
      // The island folded meanwhile (a hidden island never asks for a chart), or the pointer moved on.
      if (State.mode !== "expanded" || overRow !== id) return;
      openFor(row, id, subject, actions, view, host);
    }, CHART_HOVER_MS);
  });
  row.addEventListener("mouseleave", () => {
    if (overRow === id) overRow = null;
    clearOpen();
    if (open?.id === id) scheduleClose();
  });
}

function openFor(row: HTMLElement, id: string, subject: () => ChartSubject, actions: ViewActions, view: HTMLElement, host: HTMLElement) {
  if (!el) el = build();
  if (open) close();
  open = { id, row, view, host, tab: State.view, subject, actions, gen: ++gen };
  // The list may have been built again since the pointer came to rest.
  if (!row.isConnected) {
    const now = findRow(open);
    if (!now) return close();
    open.row = now;
  }
  actions.holdOpen(true, HOLDER);
  place(host, open.row);
  host.append(el);
  rebuilt?.observe(view, { childList: true, subtree: true });
  // Scroll events do not bubble: caught on their way down to the rows.
  view.addEventListener("scroll", onScroll, { capture: true, passive: true });
  void show(open);
}

/** Under the row when there is room, else over it; never past the island's edges. */
function place(host: HTMLElement, row: HTMLElement) {
  const c = host.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  // The page may draw the island scaled (the demo's stage): work in its own pixels.
  const scale = c.width / (host.offsetWidth || c.width) || 1;
  const hostW = c.width / scale;
  const hostH = c.height / scale;
  const rowTop = (r.top - c.top) / scale;
  const rowBottom = (r.bottom - c.top) / scale;
  const rowLeft = (r.left - c.left) / scale;
  // Under the row, or over it when there is no room under; when neither fits
  // (a short island), as low as it allows, over the rows under this one.
  let top = rowBottom;
  if (top + POP_H > hostH - EDGE) top = rowTop - POP_H >= EDGE ? rowTop - POP_H : hostH - POP_H - EDGE;
  top = Math.max(EDGE, Math.min(hostH - POP_H - EDGE, top));
  const left = Math.max(EDGE, Math.min(hostW - POP_W - EDGE, rowLeft + 36));
  el!.style.left = `${Math.round(left)}px`;
  el!.style.top = `${Math.round(top)}px`;
}

/**
 * Loads and draws the chart for the size picked now. A `refresh` (the candle
 * is over, or an answer is due again) keeps what is drawn on screen until the
 * new candles come; a first open or another size starts from a blank canvas.
 */
async function show(o: Open, refresh = false) {
  const my = ++gen;
  o.gen = my;
  const interval = State.companion.chartInterval;
  // Read now, not when the chart opened: a held token's pool may have arrived since.
  const subject = o.subject();
  seg.title = t("Candle size");
  sym.textContent = subject.symbol;
  for (const b of seg.children) b.classList.toggle("on", b.textContent === interval);
  const keep = refresh && drawn === interval;
  if (!keep) {
    blank();
    setNote(t("Loading the chart…"), false);
  }
  const load = await loadChart(subject.chainId, subject.pairAddress, interval);
  if (my !== gen || open !== o) return;
  showLoad(load, interval, keep);
}

/** The header and the canvas emptied. */
function blank() {
  change.textContent = "";
  change.className = "chg";
  change.title = "";
  range.textContent = "";
  paint(null);
  drawn = null;
}

function showLoad(load: ChartLoad, interval: ChartInterval, keep: boolean) {
  if (load.kind !== "ok" || load.candles.length === 0) {
    // Nothing new to draw. A chart already on screen stays (a refresh that
    // came back empty-handed); otherwise the popover says why there is none.
    if (!keep) {
      blank();
      setNote(
        load.kind === "nochain"
          ? t("No chart for this chain")
          : load.kind === "busy"
            ? t("Chart busy, try again in a minute")
            : load.kind === "nopool"
              ? t("No chart yet")
              : load.kind === "error"
                ? t("Couldn't load the chart")
                : t("No candles yet"),
        load.kind === "busy" || load.kind === "error",
      );
    }
    later(retryAfter(load, interval));
    return;
  }
  setNote("", false);
  const s = chartStats(load.candles)!;
  change.textContent = formatPct(s.changePct);
  change.className = `chg ${pctClass(s.changePct)}`;
  change.title = t("Open to close over these {interval} candles", { interval });
  range.textContent = t("H {high} · L {low}", { high: formatPrice(s.high), low: formatPrice(s.low) });
  paint(load.candles);
  drawn = interval;
  // Still open when this chart's candle is over: drawn again from fresh candles.
  later(chartTtl(interval));
}

/**
 * How long until the chart is asked for again after an answer: a candle's
 * length (never over a few minutes) for a chart, sooner for a pool still to
 * come, once the busy minute is over after a 429; never for a chain without
 * charts.
 */
function retryAfter(load: ChartLoad, interval: ChartInterval): number | null {
  switch (load.kind) {
    case "nochain":
      return null;
    case "nopool":
      return NOPOOL_RETRY_MS;
    case "busy":
      return Math.max(1000, State.chartBusyUntil - Date.now());
    default:
      return chartTtl(interval);
  }
}

/** Shows the chart again in `ms` (null: not again), while it is still open. */
function later(ms: number | null) {
  if (refreshTimer != null) window.clearTimeout(refreshTimer);
  refreshTimer = null;
  if (ms == null) return;
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    if (open) void show(open, true);
  }, ms);
}

function setNote(text: string, warn: boolean) {
  note.textContent = text;
  note.className = `chart-note ${warn ? "warn" : ""}`;
  note.style.display = text ? "" : "none";
}

/** The candles on the canvas, in the theme's up and down colours, the last close as a dotted line. */
function paint(candles: Candle[] | null) {
  const w = canvas.clientWidth || POP_W - 12;
  const hh = canvas.clientHeight || 88;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hh * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hh * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, hh);
  const d = candles ? chartDrawing(candles, w, hh) : null;
  if (!d) return;
  // The theme's tones and face (src/core/themes.ts): the candles in its up
  // and down, the last close in its dim grey over its base colour.
  const style = getComputedStyle(el!);
  const up = style.getPropertyValue("--up").trim() || "#34d399";
  const down = style.getPropertyValue("--down").trim() || "#f4505e";
  const dim = style.getPropertyValue("--dim").trim() || "#9398a1";
  const base = style.getPropertyValue("--base").trim() || "#000";
  const font = style.fontFamily || "system-ui, sans-serif";
  for (const c of d.candles) {
    const colour = c.up ? up : down;
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = 1;
    const x = Math.round(c.x) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, c.wickTop);
    ctx.lineTo(x, c.wickBottom);
    ctx.stroke();
    ctx.fillRect(Math.round(c.x - c.w / 2), Math.round(c.bodyTop), Math.max(1, Math.round(c.w)), Math.max(1, Math.round(c.bodyH)));
  }
  // The last close, dotted across the chart, its price at the right end.
  const y = Math.round(d.lastY) + 0.5;
  ctx.strokeStyle = dim;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `600 9px ${font}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  const label = formatPrice(d.lastPrice);
  const tw = ctx.measureText(label).width;
  const ly = y - 2 < 10 ? y + 11 : y - 2;
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = base;
  ctx.fillRect(w - tw - 6, ly - 10, tw + 6, 11);
  ctx.globalAlpha = 1;
  ctx.fillStyle = dim;
  ctx.fillText(label, w - 3, ly);
}

/** Test hook: the popover's element, when open. */
export function chartPopoverEl(): HTMLElement | null {
  return open ? el : null;
}
