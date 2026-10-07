// App state: what is saved (settings + the companion config) and what only
// lives while the app runs (quotes, price history, queued events).

import type { Manifest, MascotState } from "../mascot/mascot";
import { ALL_CHAINS, isChain, tokenKey, type ChainId } from "../market/chains";
import { COINGECKO_ID } from "../market/coingecko";
import { DEFAULT_CUSTOM_SKIN, normalizeCustomSkin } from "../mascot/skins";
import { normalizeBook, normalizeLevels } from "../positions/positions";
import type { FearGreed } from "../market/sentiment";
import { DEFAULT_FOLDERS, normalizeFolders } from "../market/folders";

// ── Saved ─────────────────────────────────────────────────────────────────────

export interface WatchToken {
  /** Where quotes, history, safety and alerts are stored: see tokenKey(). */
  key: string;
  chainId: ChainId;
  /** The token's contract / mint address on its chain. */
  address: string;
  symbol: string;
  name: string;
  /** The most liquid pair when the token was added; refreshed on every poll. */
  pairAddress: string;
  dexId: string;
  imageUrl: string | null;
  /** The watchlist folder it sits in ("Runners"…); none: under All only. */
  folder?: string;
  /** A major coin (src/market/majors.ts): its CoinGecko id; this token only tracks its price. */
  coingecko?: string;
}

export type AlertKind =
  | "priceAbove"
  | "priceBelow"
  | "mcapAbove"
  | "mcapBelow"
  | "pctUp"
  | "pctDown"
  | "liqDrop";

export interface AlertRule {
  id: string;
  /** The token's key (its address on Solana). */
  address: string;
  kind: AlertKind;
  /** USD for price/mcap, percent for pctUp, pctDown and liqDrop. */
  value: number;
  /** Window in minutes for pctUp, pctDown and liqDrop. */
  windowMin: number;
  enabled: boolean;
}

export type Terminal = "gmgn" | "axiom" | "dexscreener";

export interface DisciplineRules {
  /** Break reminder every N minutes of screen time; 0 = off. */
  breakEveryMin: number;
  /** Stop for the day once today's PnL reaches −limit; 0 = off. */
  dailyLossLimit: number;
  /** Nudge when today's trade count reaches this; 0 = off. */
  maxTradesPerDay: number;
  /** Cool-down after logging a loss, minutes; 0 = off. */
  cooldownMin: number;
  unit: "SOL" | "USD";
}

export interface TradeEntry {
  t: number;
  /** What it took, in the journal's unit: counted in the day's total. */
  pnl: number;
  /** Part of a position sold: its profit counts, but it is not a trade of its own. */
  partial?: boolean;
  /** On a closed position: what the whole position took (decides win or loss). */
  tradePnl?: number;
  /** Counted from the trader's own wallet, not typed in. */
  auto?: boolean;
  /** Wallet entries, so that none is counted twice. */
  id?: string;
}

export interface TradeLog {
  /** Local date, YYYY-MM-DD. Entries from another day are dropped. */
  day: string;
  entries: TradeEntry[];
}

/** One trade in the long-term journal (today's log only feeds the discipline rules). */
export interface JournalEntry {
  id: string;
  t: number;
  pnl: number;
  note: string;
}

/** A wallet followed by its public address. Never a private key. */
export interface TrackedWallet {
  address: string;
  label: string;
  /** The trader's own wallet: no buy/sell alerts, value change shown as PnL. */
  mine: boolean;
  /** USD value when it was added, for "since added". */
  baselineUsd: number | null;
  addedAt: number;
  /** Own wallets: when its recent trades were read from its history (see positions/trades.ts). */
  historyAt?: number;
  /** Own wallets: the newest transaction read live (ms), where the next check starts. */
  tradesAt?: number;
}

/**
 * A token held in the trader's own wallets, with the cost of what is held.
 * Built from balance changes seen between checks (see src/positions).
 */
export interface Position {
  /** The Solana mint. */
  mint: string;
  symbol: string;
  /** Amount per own wallet, UI units. */
  amounts: Record<string, number>;
  /** What the held amount cost, average-cost basis, USD. */
  costUsd: number;
  /** Profit or loss taken on sells since tracking began, USD. */
  realizedUsd: number;
  openedAt: number;
  /** Held before tracking began: the entry is the price at that moment. */
  fromTracking: boolean;
  /** Alert levels already reported ("x2", "-30"). */
  alerted: string[];
  /** The wallet's history was read for its real entry (found or not). */
  historyChecked?: boolean;
  /** The entry comes from the wallet's own transactions. */
  fromHistory?: boolean;
}

export interface PositionBook {
  /** Own wallets whose balances are already counted. */
  wallets: string[];
  positions: Record<string, Position>;
  /** Local date (YYYY-MM-DD) of `realizedToday`. */
  day: string;
  realizedToday: number;
  /** The wallet's buys and sells as they were seen, newest last. */
  activity: ActivityItem[];
}

/** One buy or sell seen in the trader's own wallet. */
export interface ActivityItem {
  t: number;
  mint: string;
  symbol: string;
  /** "tracked": already held when tracking began. */
  side: "tracked" | "opened" | "bought" | "sold" | "closed";
  /** USD value of what moved. */
  usd: number;
  /** Profit or loss a sell took, USD (on "closed": the whole position's). */
  realizedUsd: number;
  /** The transaction's signature, for entries read from the wallet's history. */
  id?: string;
  /** Read from the wallet's history when it was added (see positions/trades.ts). */
  history?: boolean;
  /** Held before the history began: what the sale took is unknown. */
  costUnknown?: boolean;
}

/** When to report a position's move: multiples up, % down from the entry. */
export interface PositionAlerts {
  enabled: boolean;
  ups: number[];
  downs: number[];
}

/** The island's background (see src/core/themes.ts). */
export type Theme =
  | "classic"
  | "midnight"
  | "neon"
  | "gold"
  | "glass"
  | "carbon"
  | "solana"
  | "ocean"
  | "sunset"
  | "bubblegum"
  | "matrix"
  | "bull"
  | "bear"
  | "moon";
export const THEME_IDS: readonly Theme[] = [
  "classic", "midnight", "neon", "gold", "glass", "carbon", "solana",
  "ocean", "sunset", "bubblegum", "matrix", "bull", "bear", "moon",
];
/** What the mascot wears on its head (the saved field is still `outfit`). */
export type Outfit =
  | "none"
  | "cap"
  | "crown"
  | "party"
  | "headphones"
  | "tophat"
  | "cowboy"
  | "beanie"
  | "halo"
  | "horns"
  | "wizard"
  | "viking"
  | "bow"
  | "chef"
  | "pirate"
  | "santa"
  | "grad"
  | "beret"
  | "propeller"
  | "flowers"
  | "bunny"
  | "pumpkin"
  | "catears"
  | "rocket";
export const OUTFIT_IDS: readonly Outfit[] = [
  "none", "cap", "crown", "party", "headphones", "tophat", "cowboy", "beanie",
  "halo", "horns", "wizard", "viking", "bow", "chef", "pirate",
  "santa", "grad", "beret", "propeller", "flowers", "bunny", "pumpkin",
  "catears", "rocket",
];
/** What the mascot wears on its face, worn together with the hat. */
export type Face =
  | "none"
  | "shades"
  | "laser"
  | "glasses"
  | "monocle"
  | "mustache"
  | "starglasses"
  | "threed"
  | "eyepatch"
  | "heartglasses"
  | "clownnose"
  | "beard"
  | "domino"
  | "vr"
  | "pixel"
  | "goggles"
  | "whiskers"
  | "freckles"
  | "bandaid"
  | "lollipop"
  | "bubblegum"
  | "warpaint"
  | "dollareyes"
  | "facemask";
export const FACE_IDS: readonly Face[] = [
  "none", "shades", "laser", "glasses", "monocle", "mustache", "starglasses",
  "threed", "eyepatch", "heartglasses", "clownnose", "beard", "domino", "vr",
  "pixel", "goggles", "whiskers", "freckles", "bandaid", "lollipop", "bubblegum",
  "warpaint", "dollareyes", "facemask",
];
/** A colour treatment over the whole sprite (see src/mascot/skins.ts). */
export type Skin =
  | "mint"
  | "neon"
  | "forest"
  | "lime"
  | "lemon"
  | "gold"
  | "sunset"
  | "peach"
  | "cherry"
  | "ruby"
  | "rose"
  | "magenta"
  | "grape"
  | "lavender"
  | "violet"
  | "teal"
  | "sky"
  | "ice"
  | "ocean"
  | "navy"
  | "ghost"
  | "slate"
  | "charcoal"
  | "custom";
/** In picker order: greens, yellows, oranges, reds and pinks, purples, blues, greys; Custom last. */
export const SKIN_IDS: readonly Skin[] = [
  "mint", "neon", "forest", "lime", "lemon", "gold", "sunset", "peach", "cherry", "ruby", "rose", "magenta",
  "grape", "lavender", "violet", "teal", "sky", "ice", "ocean", "navy", "ghost", "slate", "charcoal", "custom",
];
/**
 * A costume: the whole body redrawn, every mood included (mascot.json →
 * costumes). Hats and faces still go on top; the colour does not apply.
 * "edition" is a friend's exclusive costume: only their build has it.
 */
export type Costume = "none" | "gengar" | "spiderman" | "shadow" | "v" | "edition";
export const COSTUME_IDS: readonly Costume[] = ["none", "gengar", "spiderman", "shadow", "v", "edition"];
/** Costumes that changed id, by their old one. */
const RENAMED_COSTUMES: Record<string, Costume> = { yovich: "gengar", spidermax: "spiderman", mrshadow: "shadow" };

/**
 * A friend's build (`npm run pack:edition -- <id>` sets VITE_EXCLUSIVE_COSTUME):
 * the id of the costume made for them. Its name and art live in editions/<id>/,
 * kept out of the repository, and join the build as the "edition" costume
 * (vite.config.ts), worn from the first launch. Null in regular builds.
 */
export const EDITION_ID: string | null = import.meta.env.VITE_EXCLUSIVE_COSTUME || null;
export const EDITION_NAME: string = import.meta.env.VITE_EDITION_NAME || "Edition";

/** The costumes a build offers: the regular ones, plus "edition" in a friend's build. */
export function offeredCostumes(edition: boolean): Costume[] {
  return COSTUME_IDS.filter((id) => id !== "edition" || edition);
}
export const OFFERED_COSTUMES: readonly Costume[] = offeredCostumes(EDITION_ID !== null);
/** The free colour: hue shift in degrees, saturation and brightness in %. */
export interface CustomSkin {
  hue: number;
  sat: number;
  light: number;
}

export type TrendingSort = "volume" | "mcap" | "liquidity" | "newest";
export type Timeframe = "m5" | "h1" | "h6" | "h24";

/** What the watchlist's value column shows: the price of major coins and the market cap of the rest ("auto"), or one of them for all. */
export type ValueColumn = "auto" | "price" | "mcap";

export interface Companion {
  watchlist: WatchToken[];
  /** Watchlist folders, by name (see src/market/folders.ts). */
  folders: string[];
  /** The folder the watchlist shows; "" for All. */
  activeFolder: string;
  alerts: AlertRule[];
  discipline: DisciplineRules;
  log: TradeLog;
  journal: JournalEntry[];
  wallets: TrackedWallet[];
  /**
   * The Following tab: other people's wallets, checked once a minute on the
   * shared public RPC. Off unless the trader turns it on.
   */
  following: boolean;
  /** Positions in the trader's own wallets (`mine`), built automatically. */
  book: PositionBook;
  positionAlerts: PositionAlerts;
  /** A closed position logs itself as a trade (journal and today's rules). */
  autoJournal: boolean;
  terminal: Terminal;
  pollSeconds: number;
  /** Keep the compact ticker on screen instead of hiding after a minute. */
  keepTickerVisible: boolean;
  /** Also show alerts as system notifications (Windows / the browser). */
  notifications: boolean;
  /** Global shortcut that opens and closes the island. */
  hotkey: string;
  theme: Theme;
  outfit: Outfit;
  face: Face;
  skin: Skin;
  customSkin: CustomSkin;
  costume: Costume;
  /** Chains used by search, trending and the header prices. */
  chains: ChainId[];
  trendingSort: TrendingSort;
  /** The window for volume and % change in trending. */
  trendingFrame: Timeframe;
  /** The window for volume and buys/sells in the watchlist. */
  volumeFrame: Timeframe;
  /** The watchlist's value column (see valueCell in format.ts). */
  valueColumn: ValueColumn;
  /** The mascot dozes off late at night unless something big happens. */
  nightSleep: boolean;
  /** Seasonal looks: a Santa hat in December, a pumpkin at Halloween… */
  seasonal: boolean;
  /** A season the trader dressed over themselves (see seasons.ts). */
  seasonOff: string;
  /** The mascot's eyes follow the mouse; it fidgets now and then. */
  lively: boolean;
  /** The daily recap card shows signs and % only, no amounts. */
  recapHideMoney: boolean;
  /** BTC and the Fear & Greed index in the island's header. */
  headerMarket: boolean;
  /** The mascot reacts to SOL's 1-hour move. */
  reactToSol: boolean;
}

/**
 * Where the island lives: glued to the top edge (centred), to the left or the
 * right edge (vertically centred), or floating where the trader drags it.
 */
export type Placement = "top" | "left" | "right" | "float";
export const PLACEMENTS: readonly Placement[] = ["top", "left", "right", "float"];

export interface Settings {
  soundEnabled: boolean;
  soundVolume: number;
  autoCloseInterval: number;
  screen: "primary" | "cursor";
  autostart: boolean;
  placement: Placement;
  /** The floating island's centre, as fractions (0–1) of the display. */
  floatX: number;
  floatY: number;
  /** The display the floating island was dropped on (set by the app; "" = the `screen` rule). */
  floatScreen: string;
  /** The trader's own Solana RPC (https URL, key included); "" = the public one. App only. */
  rpcUrl: string;
  companion: Companion;
}

export const MAX_WATCHLIST = 30; // one DexScreener request covers 30 tokens
export const MAX_WALLETS = 10;
export const MAX_JOURNAL = 2000;

export const DEFAULT_HOTKEY = "CommandOrControl+Shift+Space";

export const DEFAULT_COMPANION: Companion = {
  watchlist: [],
  folders: [...DEFAULT_FOLDERS],
  activeFolder: "",
  alerts: [],
  discipline: {
    breakEveryMin: 90,
    dailyLossLimit: 0,
    maxTradesPerDay: 0,
    cooldownMin: 10,
    unit: "SOL",
  },
  log: { day: "", entries: [] },
  journal: [],
  wallets: [],
  following: false,
  book: { wallets: [], positions: {}, day: "", realizedToday: 0, activity: [] },
  positionAlerts: { enabled: true, ups: [2, 3, 5, 10], downs: [-30, -50] },
  autoJournal: true,
  terminal: "gmgn",
  pollSeconds: 20,
  keepTickerVisible: true,
  notifications: false,
  hotkey: DEFAULT_HOTKEY,
  theme: "classic",
  outfit: "none",
  face: "none",
  skin: "mint",
  customSkin: { ...DEFAULT_CUSTOM_SKIN },
  costume: EDITION_ID ? "edition" : "none",
  chains: ["solana"],
  trendingSort: "volume",
  trendingFrame: "h1",
  volumeFrame: "h1",
  valueColumn: "auto",
  nightSleep: true,
  lively: true,
  seasonal: true,
  seasonOff: "",
  headerMarket: true,
  recapHideMoney: false,
  reactToSol: true,
};

export const DEFAULT_SETTINGS: Settings = {
  soundEnabled: true,
  soundVolume: 0.12,
  autoCloseInterval: 15,
  screen: "primary",
  autostart: false,
  placement: "top",
  floatX: 0.5,
  floatY: 0.12,
  floatScreen: "",
  rpcUrl: "",
  companion: DEFAULT_COMPANION,
};

/**
 * Fills in whatever a saved file is missing — an older build, a hand edit or a
 * fresh install all end up with a complete, valid config.
 */
export function normalizeSettings(raw: Partial<Settings> | null | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) } as Settings;
  if (!PLACEMENTS.includes(s.placement)) s.placement = "top";
  const fraction = (v: unknown, dflt: number) =>
    v != null && v !== "" && Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : dflt;
  s.floatX = fraction(s.floatX, DEFAULT_SETTINGS.floatX);
  s.floatY = fraction(s.floatY, DEFAULT_SETTINGS.floatY);
  if (typeof s.floatScreen !== "string") s.floatScreen = "";
  s.rpcUrl = typeof s.rpcUrl === "string" ? s.rpcUrl.trim() : "";
  const c = (raw?.companion ?? {}) as Partial<Companion>;
  s.companion = {
    ...DEFAULT_COMPANION,
    ...c,
    discipline: { ...DEFAULT_COMPANION.discipline, ...(c.discipline ?? {}) },
    log: c.log && Array.isArray(c.log.entries) ? c.log : { day: "", entries: [] },
    // Tokens saved before multichain have no chain or key: they are Solana.
    watchlist: Array.isArray(c.watchlist)
      ? c.watchlist.slice(0, MAX_WATCHLIST).map((t) => {
          const chainId = isChain(t.chainId) ? t.chainId : "solana";
          // A CoinGecko id goes into its URLs: only the shape it has.
          const coingecko = typeof t.coingecko === "string" && COINGECKO_ID.test(t.coingecko) ? t.coingecko : undefined;
          return { ...t, chainId, key: tokenKey(chainId, t.address), coingecko };
        })
      : [],
    chains: Array.isArray(c.chains) && c.chains.filter(isChain).length ? ALL_CHAINS.filter((x) => c.chains!.includes(x)) : ["solana"],
    alerts: Array.isArray(c.alerts) ? c.alerts : [],
    journal: Array.isArray(c.journal) ? c.journal.slice(-MAX_JOURNAL) : [],
    wallets: Array.isArray(c.wallets) ? c.wallets.slice(0, MAX_WALLETS) : [],
  };
  s.companion.pollSeconds = Math.min(120, Math.max(10, Number(s.companion.pollSeconds) || 20));
  // Shades and laser eyes were outfits before the face slot: move them over.
  const oldOutfit = c.outfit as string | undefined;
  if ((oldOutfit === "shades" || oldOutfit === "laser") && c.face == null) s.companion.face = oldOutfit;
  if (!OUTFIT_IDS.includes(s.companion.outfit)) s.companion.outfit = "none";
  if (!FACE_IDS.includes(s.companion.face)) s.companion.face = "none";
  if (!SKIN_IDS.includes(s.companion.skin)) s.companion.skin = "mint";
  if (!THEME_IDS.includes(s.companion.theme)) s.companion.theme = "classic";
  // A renamed costume stays on; one this build does not offer comes off. A
  // friend's build also knows its costume by its own id, from before "edition".
  const renamed = EDITION_ID && c.costume === EDITION_ID ? "edition" : RENAMED_COSTUMES[c.costume as string];
  const costume = renamed ?? s.companion.costume;
  s.companion.costume = OFFERED_COSTUMES.includes(costume) ? costume : "none";
  s.companion.customSkin = normalizeCustomSkin(c.customSkin);
  s.companion.book = normalizeBook(c.book);
  // Files from before the switch keep following whoever they followed.
  if (typeof c.following !== "boolean") s.companion.following = s.companion.wallets.some((w) => !w.mine);
  const f = normalizeFolders(c.folders, s.companion.watchlist, c.activeFolder);
  s.companion.folders = f.folders;
  s.companion.watchlist = f.tokens;
  s.companion.activeFolder = f.active;
  if (!["m5", "h1", "h6", "h24"].includes(s.companion.volumeFrame)) s.companion.volumeFrame = "h1";
  if (!["auto", "price", "mcap"].includes(s.companion.valueColumn)) s.companion.valueColumn = "auto";
  s.companion.positionAlerts = normalizeLevels(c.positionAlerts);
  return s;
}

// ── Runtime ───────────────────────────────────────────────────────────────────

export interface Quote {
  /** The token's key (see tokenKey), not necessarily its bare address. */
  address: string;
  pairAddress: string;
  priceUsd: number;
  marketCap: number | null;
  /** Liquidity backed by the quote side (see backedLiquidity), in USD. */
  liquidityUsd: number | null;
  /** The pool reports far more liquidity than backs it: likely fake. */
  suspectLiquidity?: boolean;
  change: { m5: number; h1: number; h6: number; h24: number };
  volume: { m5: number; h1: number; h6: number; h24: number };
  txnsM5: { buys: number; sells: number };
  /** Buys and sells per window (older saved quotes may lack it). */
  txns?: Record<Timeframe, { buys: number; sells: number }>;
  updatedAt: number;
  /**
   * A major coin (src/market/majors.ts): market cap and 24 h volume are the
   * coin's own, from CoinGecko; there is no liquidity, trade count or
   * short-frame volume to show.
   */
  major?: boolean;
  /** A major's rank by market cap right now (CoinGecko); null until it answers. */
  rank?: number | null;
}

/** One poll's worth of the numbers alerts look back on. */
export interface Sample {
  t: number;
  price: number;
  mcap: number | null;
  liq: number | null;
}

export type EventTone = "up" | "down" | "warn" | "calm";

export type CompanionEvent =
  | {
      kind: "alert";
      id: string;
      ruleId: string;
      address: string;
      title: string;
      detail: string;
      tone: EventTone;
      /** For tokens outside the watchlist (a tracked wallet's buy), to open its page. */
      token?: WatchToken;
    }
  | { kind: "break"; id: string; minutes: number }
  | { kind: "lossLimit"; id: string; total: number; limit: number; unit: string }
  | { kind: "maxTrades"; id: string; count: number }
  | { kind: "cooldown"; id: string; minutes: number }
  /** Back at the screen after a while: what changed (see src/away). */
  | { kind: "away"; id: string; away: string; lines: string[] }
  /** A newer Candy on GitHub: update now, with the user's go-ahead (see src/core/update.ts). */
  | { kind: "update"; id: string; version: string };

export type MarketStatus = "idle" | "loading" | "ok" | "error";

export type IslandViewName =
  | "watchlist"
  | "trending"
  | "alerts"
  | "wallets"
  | "positions"
  | "discipline"
  | "wardrobe"
  | "event"
  | "greeting";

/** RugCheck's read of a token. `level` is ours, derived from its risks. */
export interface SafetyReport {
  level: "low" | "medium" | "high";
  /** RugCheck's normalised score, 0 (clean) to 100 (worst). */
  score: number;
  lpLockedPct: number | null;
  risks: { name: string; value: string; level: "danger" | "warn" | "info" }[];
  fetchedAt: number;
}

/** A token from DexScreener's boosted / new-profile lists. */
export interface TrendingItem {
  token: WatchToken;
  quote: Quote | null;
  /** Boost total for the hot list, 0 for new profiles. */
  boost: number;
  pairCreatedAt: number | null;
}

/** What a tracked wallet held at its last check. */
export interface WalletSnapshot {
  sol: number;
  /** Mint → amount (UI units). */
  holdings: Record<string, number>;
  /** Mint → USD value, for the priced ones. */
  values: Record<string, number>;
  totalUsd: number;
  /** The biggest positions, for display. */
  top: { address: string; symbol: string; usd: number }[];
  checkedAt: number;
  error: string | null;
}

export type IslandMode = "hidden" | "compact" | "expanded";

type Listener = () => void;

class AppState {
  mode: IslandMode = "hidden";
  /** Minimized from the header: stays hidden, the mouse doesn't bring it back (see Island.minimize). */
  minimized = false;
  /** The OS the app runs on ("windows", "linux"…), or "browser" outside it. */
  os = "browser";
  /**
   * False where the app can't read the cursor across the screen (Linux): the
   * page follows the mouse over the island itself, and the island stays at the
   * top (no side or floating placement, no Ctrl pass-through, no screen "where
   * the mouse is"). See src-tauri/src/platform/linux.rs.
   */
  cursorPoll = true;
  view: IslandViewName = "watchlist";

  settings: Settings = normalizeSettings(null);
  version = "dev";

  quotes: Record<string, Quote> = {};
  history: Record<string, Sample[]> = {};
  marketStatus: MarketStatus = "idle";
  marketError: string | null = null;
  lastUpdate = 0;

  /** Fired alerts and discipline reminders waiting to be seen, oldest first. */
  events: CompanionEvent[] = [];
  /** The last alert, kept on the compact ticker until the island is opened. */
  unseen: CompanionEvent | null = null;

  /** What the market (and the trade log) say the mascot should feel. */
  mood: { state: MascotState; text: string } = { state: "idle", text: "" };
  /** The mascot's art (mascot.json), once loaded. */
  art: Manifest | null = null;
  /** A lasting mood that settled into neutral: its face, for a peek now and then. */
  moodFace: MascotState | null = null;

  /** Prefills the alert form when the bell on a watchlist row is clicked. */
  alertDraftAddress: string | null = null;

  /** RugCheck reports by mint; "loading" while one is being fetched. */
  safety: Record<string, SafetyReport | "loading" | "error"> = {};
  trending: { hot: TrendingItem[]; fresh: TrendingItem[]; updatedAt: number; error: string | null } = {
    hot: [],
    fresh: [],
    updatedAt: 0,
    error: null,
  };
  wallets: Record<string, WalletSnapshot> = {};
  /** SOL itself, for the mascot (and its header chip). */
  sol: Quote | null = null;
  /** Native coins of the chosen chains, for the header chips. */
  natives: Partial<Record<"SOL" | "BNB" | "ETH", Quote>> = {};
  btc: Quote | null = null;
  fearGreed: FearGreed | null = null;
  /** A followed wallet's last buy or sell seen, by address. */
  walletMoves: Record<string, { side: string; symbol: string; t: number }> = {};
  /** The last tab shown, for the wardrobe's way back. */
  lastTab: IslandViewName = "watchlist";
  /** The My wallet tab shows holdings, or the activity log. */
  walletActivity = false;
  /** Quotes for held tokens, by mint (watchlist tokens included). */
  positionQuotes: Record<string, Quote> = {};
  /** Reading an own wallet's recent trades: how far along, or why it stopped. */
  historyRead: { address: string; done: number; total: number; error: string | null; found: number | null } | null = null;

  /** Results of a name search in the watchlist's field; null when closed. */
  search: { query: string; results: TrendingItem[]; loading: boolean; error: string | null } | null = null;

  /** Which trending list is showing. */
  trendingList: "hot" | "fresh" = "hot";
  /** The discipline tab shows the journal (week chart, recent trades) instead of today. */
  journalOpen = false;

  sessionStart = Date.now();
  lastBreakAt = Date.now();
  cooldownUntil = 0;

  paused = false;
  mouse = { x: 0, y: 0 };
  lastActivity = performance.now();

  private listeners = new Set<Listener>();

  get companion(): Companion {
    return this.settings.companion;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Marks the UI dirty; the island re-renders on the next frame. */
  notify() {
    for (const fn of this.listeners) fn();
  }

  /** A watchlist token by its key. */
  token(key: string): WatchToken | undefined {
    return this.companion.watchlist.find((t) => t.key === key);
  }
}

export const State = new AppState();

/** Short random id for rules and events. */
export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Whether a typed Solana RPC URL can be used: https, a host, no user or
 * password in it (the app checks the same before using it; see rpc_endpoint
 * in src-tauri/src/lib.rs). "" means the public RPC and is fine.
 */
export function validRpcUrl(raw: string): boolean {
  const v = raw.trim();
  if (v === "") return true;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname !== "" && u.username === "" && u.password === "";
  } catch {
    return false;
  }
}
