// App state: what is saved (settings + the companion config) and what only
// lives while the app runs (quotes, price history, queued events).

import type { Manifest, MascotState } from "../mascot/mascot";
import type { NowPlaying } from "./music";
import { SHORTCUTS, shortcutDefault, type ShortcutId } from "./shortcuts";
import { ALL_CHAINS, EVM_CHAINS, isChain, tokenKey, walletFamily, type ChainId, type EvmChain, type WalletFamily } from "../market/chains";
import { COINGECKO_ID } from "../market/coingecko";
import { DEFAULT_CUSTOM_SKIN, normalizeCustomSkin } from "../mascot/skins";
import { normalizeBook, normalizeLevels } from "../positions/positions";
import { POSITION_SORTS, type PositionSort } from "../positions/board";
import type { FearGreed } from "../market/sentiment";
import { CALENDAR_LEADS, type Calendar } from "../market/calendar";
import { LANG_SETTINGS, N_, t, type LangSetting } from "./i18n";
import type { AwayMove } from "../away/away";
import { DEFAULT_FOLDERS, normalizeFolders } from "../market/folders";
import { DEFAULT_CHART_INTERVAL, isChartInterval, type Candle, type ChartInterval } from "../market/chart";
import { DAY_END_DEFAULT, dayEndMinutes, type DayEndReason } from "../share/dayend";

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
  /** The trader's own note: why they are in, the exit plan (shown on hover in the list). */
  note?: string;
  /** Kept at the top of the list, whatever the sort. */
  pinned?: boolean;
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

export type Terminal = "gmgn" | "axiom" | "basedbot" | "dexscreener";

export interface DisciplineRules {
  /** Break reminder every N minutes of screen time; 0 = off. */
  breakEveryMin: number;
  /** Stop for the day once today's PnL reaches −limit; 0 = off. */
  dailyLossLimit: number;
  /** Nudge when today's trade count reaches this; 0 = off. */
  maxTradesPerDay: number;
  /** Cool-down after logging a loss, minutes; 0 = off. */
  cooldownMin: number;
  /** This many losing trades in a row asks for a longer break (tilt); 0 = off. */
  tiltLosses: number;
  /** That longer break, minutes. */
  tiltBreakMin: number;
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
  /** The token, when the trade came from the wallet (the end-of-day board names the best and the worst). */
  symbol?: string;
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
  /** The check-in after the trade: did it follow the plan? */
  plan?: TradePlan;
}

export type TradePlan = "yes" | "partly" | "no";

/** A wallet followed by its public address. Never a private key. */
export interface TrackedWallet {
  address: string;
  label: string;
  /** A Solana address, or one 0x address followed on the EVM chains (files from before EVM wallets are Solana). */
  family: WalletFamily;
  /** EVM wallets: the chains it is followed on (all three unless the trader unticks some). */
  chains?: EvmChain[];
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
  /** The trader's own exit prices for this position (USD): an alert when reached (see crossedTargets). */
  target?: number;
  stop?: number;
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

/** The island's look: a background, or a whole palette (see src/core/themes.ts). */
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
  | "moon"
  | "terminal"
  | "vaporwave"
  | "paper"
  | "blueprint";
export const THEME_IDS: readonly Theme[] = [
  "classic", "midnight", "neon", "gold", "glass", "carbon", "solana",
  "ocean", "sunset", "bubblegum", "matrix", "bull", "bear", "moon",
  "terminal", "vaporwave", "paper", "blueprint",
];
/** How see-through the island's background can go (%): past this the words would float on the desktop. */
export const MAX_ISLAND_TRANSPARENCY = 70;
/** A transparency as kept: a whole percent from 0 to MAX_ISLAND_TRANSPARENCY; anything else is 0 (solid). */
export function clampTransparency(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(MAX_ISLAND_TRANSPARENCY, Math.round(v)));
}
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
  | "rocket"
  | "sombrero"
  | "hardhat"
  | "fez"
  | "jester"
  | "bucket"
  | "frog"
  | "alien"
  | "sprout"
  | "mushroom"
  | "sweatband"
  | "unicorn"
  | "fedora"
  | "nightcap";
export const OUTFIT_IDS: readonly Outfit[] = [
  "none", "cap", "crown", "party", "headphones", "tophat", "cowboy", "beanie",
  "halo", "horns", "wizard", "viking", "bow", "chef", "pirate",
  "santa", "grad", "beret", "propeller", "flowers", "bunny", "pumpkin",
  "catears", "rocket", "sombrero", "hardhat", "fez", "jester", "bucket", "frog",
  "alien", "sprout", "mushroom", "sweatband", "unicorn", "fedora",
  "nightcap",
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
  | "facemask"
  | "scarf"
  | "aviators"
  | "sleepmask"
  | "snorkel"
  | "cateye"
  | "hypno"
  | "cyborg"
  | "partyhorn"
  | "pacifier"
  | "rose"
  | "bowtie"
  | "goldchain";
export const FACE_IDS: readonly Face[] = [
  "none", "shades", "laser", "glasses", "monocle", "mustache", "starglasses",
  "threed", "eyepatch", "heartglasses", "clownnose", "beard", "domino", "vr",
  "pixel", "goggles", "whiskers", "freckles", "bandaid", "lollipop", "bubblegum",
  "warpaint", "dollareyes", "facemask", "scarf", "aviators", "sleepmask",
  "snorkel", "cateye", "hypno", "cyborg", "partyhorn", "pacifier", "rose",
  "bowtie", "goldchain",
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
export type Costume = "none" | "gengar" | "spiderman" | "shadow" | "v" | "astronaut" | "ninja" | "robot" | "dino" | "bull" | "bear" | "ghost" | "penguin" | "bee" | "edition";
export const COSTUME_IDS: readonly Costume[] = ["none", "gengar", "spiderman", "shadow", "v", "astronaut", "ninja", "robot", "dino", "bull", "bear", "ghost", "penguin", "bee", "edition"];
/**
 * Costumes named by a common noun, shown in the trader's language (Robô,
 * Roboter); the others are characters and keep their names everywhere (Gengar).
 */
export const NOUN_COSTUMES: readonly Costume[] = ["astronaut", "ninja", "robot", "dino", "bull", "bear", "ghost", "penguin", "bee"];
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

/**
 * What each costume is called, for the wardrobe and Settings alike; "none" is
 * Candy itself. The common nouns (NOUN_COSTUMES) are marked with N_ and
 * translated where shown (costumeName).
 */
export const COSTUME_NAMES: Record<Costume, string> = {
  none: "Candy",
  gengar: "Gengar",
  spiderman: "Spiderman",
  shadow: "Shadow",
  v: "V",
  astronaut: N_("Astronaut"),
  ninja: N_("Ninja"),
  robot: N_("Robot"),
  dino: N_("Dinosaur"),
  // The market's two animals; the island has backgrounds by the same names.
  bull: N_("Bull"),
  bear: N_("Bear"),
  ghost: N_("Ghost"),
  penguin: N_("Penguin"),
  bee: N_("Bee"),
  edition: EDITION_NAME,
};

/** A costume's name as shown: a common noun in the trader's language, a character's own name as it is. */
export function costumeName(id: Costume): string {
  return NOUN_COSTUMES.includes(id) ? t(COSTUME_NAMES[id]) : COSTUME_NAMES[id];
}
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

/**
 * The compact island (src/core/layout.ts): lower, with fewer columns and
 * smaller type, for a small screen. "auto": on when the display is short
 * (COMPACT_SCREEN_H), as a laptop's is.
 */
export type CompactIsland = "auto" | "on" | "off";
export const COMPACT_CHOICES: readonly CompactIsland[] = ["auto", "on", "off"];

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
  /** Global shortcut that adds the copied token link or address (Candy swallows it). */
  pasteHotkey: string;
  /** The other global shortcuts' keys ("" = off; a missing one has its default, see shortcuts.ts). */
  shortcuts: Partial<Record<ShortcutId, string>>;
  theme: Theme;
  /** How much of what is behind the island shows through its background (%, 0 = solid; see themes.ts). */
  islandTransparency: number;
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
  /** From midnight to 6 am: striped pyjamas and a nightcap, and more yawns (see night.ts). */
  pyjamas: boolean;
  /** A night the trader picked a look of their own during (see night.ts): no pyjamas until morning. */
  nightOff: string;
  /** With the PC idle and the market calm, Candy now and then naps in a little bed (see nap.ts). */
  napBed: boolean;
  /** On a strong drop Candy's wax runs down his body, and firms up as it recovers (see melt.ts). */
  meltOnDrop: boolean;
  /** The mascot's eyes follow the mouse; it fidgets now and then. */
  lively: boolean;
  /** Candy dances while something plays on the PC (see src/mascot/dance.ts). */
  danceToMusic: boolean;
  /** The island shows what plays on the PC, with its controls (src/views/music.ts). */
  musicCard: boolean;
  /** The island opens as soon as the pointer rests on its ticker, and folds soon after it leaves. */
  openOnHover: boolean;
  /** An alert card stays open until it is looked at (OK, or folded with ⌃). */
  stickyAlerts: boolean;
  /** The daily recap card shows signs and % only, no amounts. */
  recapHideMoney: boolean;
  /** BTC and the Fear & Greed index in the island's header. */
  headerMarket: boolean;
  /** An alert when a token's 5-minute volume runs this many times the hour's pace; 0 = off. */
  volumeAlertX: number;
  /** Tokens whose alerts are silenced, until when (ms), by key. */
  muted: Record<string, number>;
  /** The checklist card comes up when a token is added (src/market/checklist.ts). */
  addChecklist: boolean;
  /** A token added by pasting its CA (shortcut or drop) also opens on the terminal. */
  pasteOpens: boolean;
  /** An alert sound per watchlist folder, by folder name ("" or missing: the usual ones). */
  folderSounds: Record<string, string>;
  /** The size calculator (Discipline tab): the bank, in the journal's unit, and the share risked per trade. */
  sizing: { bank: number; riskPct: number };
  /** The order of the My wallet tab's rows (src/positions/board.ts). */
  walletSort: PositionSort;
  /** The last week whose Monday recap came up, by its Monday (ms); 0: none yet. */
  weekRecapSeen: number;
  /**
   * Discipline on or off as a whole: off, its tab, the header's day pill and
   * every card it raises (breaks, loss limit, max trades, cooldown, tilt,
   * session end, check-in, the Monday recap) go away. Trades are still kept, so
   * turning it back on finds the journal whole.
   */
  disciplineOn: boolean;
  /** After a trade closes: "did you follow your plan?", into the journal. */
  checkIn: boolean;
  /** The mini charts also draw the chain's coin (SOL…) faintly: did the token rise alone? */
  relativeStrength: boolean;
  /** An alert when a token leaves its launchpad's bonding curve (pump.fun…) for a DEX pool. */
  graduationAlert: boolean;
  /** An alert when a watched token's market cap crosses $1M, $5M, $10M… either way. */
  milestoneAlert: boolean;
  /** An alert when a watched token's sells far outnumber its buys over 5 minutes. */
  sellPressureAlert: boolean;
  /** The economic calendar's heads-up, minutes before a US release (CPI, the Fed…); 0: off (src/market/calendar.ts). */
  calendarLeadMin: number;
  /** Candy's language (src/core/i18n.ts); "auto": the system's, when Candy has it. */
  language: LangSetting;
  /** Windows: while a game, a video or a presentation is fullscreen, alert cards and sounds wait. */
  fullscreenQuiet: boolean;
  /** The watchlist sorted by a column (pinned tokens stay on top); null: the trader's own order. */
  watchlistSort: WatchSort | null;
  /** The last month whose recap came up, by its first day (ms); 0: none yet. */
  monthRecapSeen: number;
  /** The compact island: by the screen's height ("auto"), always, or never (see layout.ts). */
  compactIsland: CompactIsland;
  /** The candle size of the chart that opens on a hovered row (src/market/chart.ts); the last one picked. */
  chartInterval: ChartInterval;
  /**
   * When the day ends ("HH:MM", local; "" = off): Candy sums the day up on the
   * island then, unless a Discipline session end is set, which ends it instead
   * (src/share/dayend.ts). Once a day, only with a trade or a position to tell of.
   */
  dayEndAt: string;
  /** The day (YYYY-MM-DD) the end-of-day recap last played for; "" = never. */
  dayEndShown: string;
}

/** A column the watchlist can be sorted by (src/market/watchsort.ts). */
export type WatchSortKey = "token" | "value" | "volume" | "txns" | "m5" | "h1" | "h24";
export const WATCH_SORT_KEYS: readonly WatchSortKey[] = ["token", "value", "volume", "txns", "m5", "h1", "h24"];
export interface WatchSort {
  by: WatchSortKey;
  desc: boolean;
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
/** A token note's length, at most. */
export const MAX_NOTE = 280;

/** The volume alert's choices: 0 is off. */
export const VOLUME_ALERT_CHOICES: readonly number[] = [0, 3, 5, 8];

/** The show/hide and paste shortcuts out of the box: shortcuts.ts's defaults. */
export const DEFAULT_HOTKEY = shortcutDefault("toggle");
export const DEFAULT_PASTE_HOTKEY = shortcutDefault("paste");

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
    tiltLosses: 3,
    tiltBreakMin: 30,
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
  pasteHotkey: DEFAULT_PASTE_HOTKEY,
  shortcuts: {},
  theme: "classic",
  islandTransparency: 0,
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
  danceToMusic: true,
  musicCard: true,
  openOnHover: false,
  stickyAlerts: false,
  seasonal: true,
  seasonOff: "",
  pyjamas: true,
  nightOff: "",
  napBed: true,
  meltOnDrop: true,
  headerMarket: true,
  recapHideMoney: false,
  volumeAlertX: 5,
  muted: {},
  addChecklist: true,
  pasteOpens: false,
  folderSounds: {},
  sizing: { bank: 0, riskPct: 1 },
  walletSort: "value",
  weekRecapSeen: 0,
  disciplineOn: true,
  checkIn: true,
  relativeStrength: true,
  graduationAlert: true,
  milestoneAlert: true,
  sellPressureAlert: true,
  calendarLeadMin: 30,
  language: "auto",
  fullscreenQuiet: true,
  watchlistSort: null,
  monthRecapSeen: 0,
  compactIsland: "auto",
  chartInterval: DEFAULT_CHART_INTERVAL,
  dayEndAt: DAY_END_DEFAULT,
  dayEndShown: "",
};

export const DEFAULT_SETTINGS: Settings = {
  soundEnabled: true,
  soundVolume: 0.12,
  autoCloseInterval: 15,
  screen: "primary",
  autostart: false,
  // A new install floats near the top; a saved choice stays.
  placement: "float",
  floatX: 0.5,
  floatY: 0.12,
  floatScreen: "",
  rpcUrl: "",
  companion: DEFAULT_COMPANION,
};

/**
 * A saved wallet entry: files from before EVM wallets have no family (they
 * are Solana, as their addresses say); an EVM wallet with no chains, or none
 * that exist, is followed on all three.
 */
export function normalizeWallet(w: Partial<TrackedWallet> & { address: string }): TrackedWallet {
  const family: WalletFamily = w.family === "evm" || w.family === "solana" ? w.family : (walletFamily(w.address) ?? "solana");
  const picked = Array.isArray(w.chains) ? EVM_CHAINS.filter((c) => w.chains!.includes(c)) : [];
  const chains = family === "evm" ? (picked.length ? picked : [...EVM_CHAINS]) : undefined;
  const out: TrackedWallet = {
    ...(w as TrackedWallet),
    family,
    label: typeof w.label === "string" ? w.label : "",
    mine: w.mine === true,
    baselineUsd: typeof w.baselineUsd === "number" && Number.isFinite(w.baselineUsd) ? w.baselineUsd : null,
    addedAt: typeof w.addedAt === "number" && Number.isFinite(w.addedAt) ? w.addedAt : Date.now(),
  };
  if (chains) out.chains = chains;
  else delete out.chains;
  return out;
}

/**
 * Fills in whatever a saved file is missing — an older build, a hand edit or a
 * fresh install all end up with a complete, valid config.
 */
export function normalizeSettings(raw: Partial<Settings> | null | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) } as Settings;
  if (!PLACEMENTS.includes(s.placement)) s.placement = DEFAULT_SETTINGS.placement;
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
          const note = typeof t.note === "string" && t.note.trim() ? t.note.slice(0, MAX_NOTE) : undefined;
          const pinned = t.pinned === true ? true : undefined;
          return { ...t, chainId, key: tokenKey(chainId, t.address), coingecko, note, pinned };
        })
      : [],
    chains: Array.isArray(c.chains) && c.chains.filter(isChain).length ? ALL_CHAINS.filter((x) => c.chains!.includes(x)) : ["solana"],
    alerts: Array.isArray(c.alerts) ? c.alerts : [],
    journal: Array.isArray(c.journal)
      ? c.journal.slice(-MAX_JOURNAL).map((e) => (e.plan && !["yes", "partly", "no"].includes(e.plan) ? { ...e, plan: undefined } : e))
      : [],
    wallets: Array.isArray(c.wallets)
      ? c.wallets.filter((w) => w && typeof w.address === "string" && w.address).slice(0, MAX_WALLETS).map(normalizeWallet)
      : [],
  };
  // Retired: the mascot no longer reacts to SOL's hour.
  Reflect.deleteProperty(s.companion, "reactToSol");
  s.companion.pollSeconds = Math.min(120, Math.max(10, Number(s.companion.pollSeconds) || 20));
  if (typeof s.companion.hotkey !== "string") s.companion.hotkey = DEFAULT_HOTKEY;
  // Files from before the paste shortcut get it; "" is a chosen Off.
  if (typeof s.companion.pasteHotkey !== "string") s.companion.pasteHotkey = DEFAULT_PASTE_HOTKEY;
  const keys = (c.shortcuts && typeof c.shortcuts === "object" ? c.shortcuts : {}) as Record<string, unknown>;
  s.companion.shortcuts = {};
  for (const d of SHORTCUTS) {
    const k = keys[d.id];
    if (d.id !== "toggle" && d.id !== "paste" && typeof k === "string") s.companion.shortcuts[d.id] = k;
  }
  if (typeof s.companion.danceToMusic !== "boolean") s.companion.danceToMusic = true;
  if (typeof s.companion.musicCard !== "boolean") s.companion.musicCard = true;
  if (typeof s.companion.openOnHover !== "boolean") s.companion.openOnHover = false;
  if (typeof s.companion.stickyAlerts !== "boolean") s.companion.stickyAlerts = false;
  if (!VOLUME_ALERT_CHOICES.includes(s.companion.volumeAlertX)) s.companion.volumeAlertX = DEFAULT_COMPANION.volumeAlertX;
  const muted = c.muted && typeof c.muted === "object" ? (c.muted as Record<string, unknown>) : {};
  s.companion.muted = Object.fromEntries(
    Object.entries(muted).filter((e): e is [string, number] => typeof e[1] === "number" && e[1] > Date.now()),
  );
  if (typeof s.companion.addChecklist !== "boolean") s.companion.addChecklist = true;
  if (typeof s.companion.pasteOpens !== "boolean") s.companion.pasteOpens = false;
  const sounds = c.folderSounds && typeof c.folderSounds === "object" ? (c.folderSounds as Record<string, unknown>) : {};
  s.companion.folderSounds = Object.fromEntries(Object.entries(sounds).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""));
  const sizing = (c.sizing ?? {}) as Partial<Companion["sizing"]>;
  const positive = (v: unknown, dflt: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : dflt);
  s.companion.sizing = { bank: positive(sizing.bank, 0), riskPct: Math.min(100, positive(sizing.riskPct, 1)) };
  if (!POSITION_SORTS.includes(s.companion.walletSort)) s.companion.walletSort = "value";
  if (typeof s.companion.weekRecapSeen !== "number" || !Number.isFinite(s.companion.weekRecapSeen)) s.companion.weekRecapSeen = 0;
  if (typeof s.companion.checkIn !== "boolean") s.companion.checkIn = true;
  for (const k of ["relativeStrength", "graduationAlert", "milestoneAlert", "sellPressureAlert", "fullscreenQuiet", "disciplineOn", "pyjamas", "napBed", "meltOnDrop"] as const)
    if (typeof s.companion[k] !== "boolean") s.companion[k] = true;
  if (typeof s.companion.nightOff !== "string") s.companion.nightOff = "";
  if (!(CALENDAR_LEADS as readonly number[]).includes(s.companion.calendarLeadMin)) s.companion.calendarLeadMin = DEFAULT_COMPANION.calendarLeadMin;
  if (!LANG_SETTINGS.includes(s.companion.language)) s.companion.language = "auto";
  const sort = c.watchlistSort as Partial<WatchSort> | null | undefined;
  s.companion.watchlistSort = sort && WATCH_SORT_KEYS.includes(sort.by as WatchSortKey) ? { by: sort.by as WatchSortKey, desc: !!sort.desc } : null;
  if (typeof s.companion.monthRecapSeen !== "number" || !Number.isFinite(s.companion.monthRecapSeen)) s.companion.monthRecapSeen = 0;
  // Files from before the compact island, or a hand edit: by the screen.
  if (!COMPACT_CHOICES.includes(s.companion.compactIsland)) s.companion.compactIsland = "auto";
  // Files from before the end-of-day recap get its default time; "" is a chosen Off; anything else is no time.
  if (typeof s.companion.dayEndAt !== "string") s.companion.dayEndAt = DAY_END_DEFAULT;
  else if (s.companion.dayEndAt !== "" && dayEndMinutes(s.companion.dayEndAt) == null) s.companion.dayEndAt = DAY_END_DEFAULT;
  if (typeof s.companion.dayEndShown !== "string") s.companion.dayEndShown = "";
  // Shades and laser eyes were outfits before the face slot: move them over.
  const oldOutfit = c.outfit as string | undefined;
  if ((oldOutfit === "shades" || oldOutfit === "laser") && c.face == null) s.companion.face = oldOutfit;
  if (!OUTFIT_IDS.includes(s.companion.outfit)) s.companion.outfit = "none";
  if (!FACE_IDS.includes(s.companion.face)) s.companion.face = "none";
  if (!SKIN_IDS.includes(s.companion.skin)) s.companion.skin = "mint";
  if (!THEME_IDS.includes(s.companion.theme)) s.companion.theme = "classic";
  s.companion.islandTransparency = clampTransparency(c.islandTransparency);
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
  if (!isChartInterval(s.companion.chartInterval)) s.companion.chartInterval = DEFAULT_CHART_INTERVAL;
  return s;
}

// ── Runtime ───────────────────────────────────────────────────────────────────

/** A chart as last fetched: the candles shown, and when. */
export interface ChartCache {
  candles: Candle[];
  fetchedAt: number;
}

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
  /** The token's picture as DexScreener has it now (a token can get one after it was added). */
  imageUrl?: string | null;
  /** When its pair was created (ms), for its age. */
  pairCreatedAt?: number | null;
  /** Where its best pair lives (DexScreener's id: "pumpfun", "raydium"…). */
  dexId?: string;
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
  /** Losses in a row (the tilt rule): a longer break. */
  | { kind: "tilt"; id: string; losses: number; minutes: number }
  /** Monday: last week's recap; the 1st, last month's (`period`; src/share/recap.ts). */
  | { kind: "weekRecap"; id: string; from: number; to: number; label: string; period?: "week" | "month" }
  /** The session the trader set an end for is over. */
  | { kind: "sessionEnd"; id: string; minutes: number }
  /** The day is over: Candy holds up the day's board (src/share/dayend.ts). `minutes`: the session it ended, when it ended one. */
  | { kind: "dayEnd"; id: string; reason: DayEndReason; minutes?: number }
  /** A trade just closed: did it follow the plan? (the journal entry's id) */
  | { kind: "checkin"; id: string; entryId: string; pnl: number; unit: string; symbol: string }
  /** A token just added: what to check before an entry (src/market/checklist.ts). */
  | { kind: "checklist"; id: string; key: string }
  /** Back at the screen after a while: what changed (see src/away). */
  | { kind: "away"; id: string; away: string; lines: string[]; moves?: AwayMove[] }
  /** A newer Candy on GitHub: update now, with the user's go-ahead (see src/core/update.ts). */
  | { kind: "update"; id: string; version: string }
  /** A US release the whole market watches is near (src/market/calendar.ts): its label, when, and its lines. */
  | { kind: "macro"; id: string; label: string; at: number; lines: string[] };

export type MarketStatus = "idle" | "loading" | "ok" | "error";

export type IslandViewName =
  | "watchlist"
  | "trending"
  | "alerts"
  | "wallets"
  | "positions"
  | "discipline"
  | "wardrobe"
  | "music"
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
  /** A Solana wallet's SOL (0 for an EVM wallet). */
  sol: number;
  /** An EVM wallet's coin on each chain it is followed on (ETH, BNB, ETH). */
  natives?: Partial<Record<EvmChain, number>>;
  /** Token key (a Solana mint, or chain:address) → amount (UI units). */
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
  /**
   * False where the island's window can't be placed (plain Wayland without
   * layer-shell): it stays on the top edge. Linux elsewhere (KDE, Sway, GNOME
   * through XWayland…) has every placement, the page dragging the float itself.
   */
  canPlace = true;
  /** True when Candy runs from the Microsoft Store's package: the Store updates it, so no update check or card. */
  packaged = false;
  /**
   * The notch's height (logical px) on a MacBook that has one, else 0. At the
   * top there, the island grows out of the notch: a black band that tall over
   * the menu bar, then the island (see Island.band, window_frame in island.rs).
   */
  notch = 0;
  /**
   * The height (logical px) of the display the island lives on, from boot
   * and every "screen-changed"; 0 until known. With Companion.compactIsland
   * "auto" it decides the compact island (compactFor in layout.ts).
   */
  screenHeight = 0;
  /** The island is compact right now (Island.applySettings; body.compact in style.css). */
  compact = false;
  view: IslandViewName = "watchlist";

  settings: Settings = normalizeSettings(null);
  version = "dev";
  /** The trader's first name from the OS account, for the greeting; null when it has none (or a browser). */
  firstName: string | null = null;
  /** The demo runs (Island.startDemo): fictional tokens, nothing saved. */
  demo = false;

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
  /** SOL itself: the header chip, the wallets' values, trades counted in SOL. */
  sol: Quote | null = null;
  /** Native coins of the chosen chains, for the header chips. */
  natives: Partial<Record<"SOL" | "BNB" | "ETH", Quote>> = {};
  btc: Quote | null = null;
  fearGreed: FearGreed | null = null;
  /** This week's economic calendar, when read (see Companion.calendarTick). */
  calendar: Calendar | null = null;
  /** Candles fetched for the hover chart, by chain, pool and candle size (src/market/charts.ts); the demo preloads it. */
  charts: Record<string, ChartCache> = {};
  /** GeckoTerminal said "too many" (429): no chart is asked for until then (ms). */
  chartBusyUntil = 0;
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
  /** When the session the trader set an end for is over (ms); 0: none set. */
  sessionEndAt = 0;
  /** Buys and sells just seen, the trader's own and followed wallets', newest last (the ticker shows each a moment). */
  feed: { t: number; text: string; tone: "up" | "down" }[] = [];

  paused = false;
  /** The player in front on the PC (the app's media watch, src/core/music.ts); null: nothing loaded. */
  nowPlaying: NowPlaying | null = null;
  /** Music plays right now: Candy may dance (src/mascot/dance.ts). */
  get music(): boolean {
    return this.nowPlaying?.playing ?? false;
  }
  /** Candy is out on the desktop (src/island/desktop.ts): the island's own hides. */
  mascotAway = false;
  mouse = { x: 0, y: 0 };

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
