// The companion: polls DexScreener, keeps the price history, runs the alert
// rules and the discipline clock, checks token safety, follows wallets, works
// out the mascot's mood, and saves every change the user makes. The island
// only draws what this produces.

import { evaluateRules, primeRule, pushSample, type RuleMemory } from "./alerts/alerts";
import { Bridge, IS_TAURI } from "./core/bridge";
import { UPDATE_CHECK_MS, isNewer } from "./core/update";
import { formatPrice, formatUsd } from "./core/format";
import { notify } from "./core/notify";
import {
  MAX_JOURNAL,
  MAX_WALLETS,
  MAX_WATCHLIST,
  State,
  uid,
  type AlertRule,
  type CompanionEvent,
  type Quote,
  type Settings,
  type WalletSnapshot,
  type WatchToken,
} from "./core/state";
import {
  currentLog,
  logTrade,
  lossLimitReached,
  nextBreakIn,
  summarize,
  lastTypedTrade,
  todayKey,
  undoLastTrade,
} from "./discipline/discipline";
import { CHAINS, nativeCoins, tokenKey } from "./market/chains";
import {
  SOL_MINT,
  WBTC,
  fetchPairs,
  fetchQuotes,
  parseInput,
  resolveAddress,
  searchTokens,
  toQuote,
  toWatchToken,
  type DexPair,
} from "./market/dexscreener";
import { MAX_FOLDERS, cleanFolderName } from "./market/folders";
import { COINGECKO_TTL_MS, fetchMarkets } from "./market/coingecko";
import { asMajor, majorFor, majorToken, searchMajors, type MajorMarket } from "./market/majors";
import { SAFETY_TTL_MS, fetchSafety } from "./market/safety";
import { FNG_TTL_MS, fetchFearGreed } from "./market/sentiment";
import { fetchTrending } from "./market/trending";
import type { SeenEvent } from "./away/away";
import type { MascotState } from "./mascot/mascot";
import { computeMood, moodKey, settleMood, settlesIn } from "./mood/mood";
import { entryFromHistory, fetchDeltas, historyCost } from "./positions/history";
import {
  MAX_ACTIVITY,
  applyHistory,
  crossedLevels,
  formatSignedUsd,
  heldAmount,
  needsHistory,
  positionStats,
  setEntry,
  updateBook,
  walletTrades,
  type BookChange,
  type PriceInfo,
  type WalletRead,
} from "./positions/positions";
import { diffHoldings, isAddress, readWallet } from "./wallets/wallets";
import { learn, mintsToPrice, type PricingMemory, type Verdict } from "./wallets/pricing";
import { junkReason } from "./market/spam";
import { fetchNewSwaps, fetchSwaps, gapTrades, mergeActivity, tradesFromSwaps, type Swap } from "./positions/trades";

/** How long a liquidity alert keeps the mascot on edge. */
const LIQ_WARNING_MS = 15 * 60_000;
/** The discipline clock ticks this often; breaks are minutes apart. */
const DISCIPLINE_TICK_MS = 20_000;
/** Wallet balances are read this often — three RPC calls per wallet. */
const WALLET_POLL_MS = 60_000;
/** Trending lists are refreshed this often while their tab is open. */
const TRENDING_TTL_MS = 60_000;
/** The same wallet buying or selling the same token is reported once per window. */
const WALLET_ALERT_COOLDOWN_MS = 10 * 60_000;
/** Holdings priced per wallet and check (DexScreener: 30 per request). See wallets/pricing. */
const MAX_PRICED_HOLDINGS = 300;

/** The same tokens in the same amounts. */
function sameAmounts(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}
/** RugCheck lookups in flight at once — it is a free service, be gentle. */
const SAFETY_CONCURRENCY = 2;

class CompanionController {
  /** Shows a fired alert or a reminder; set by the island. */
  onEvent: ((e: CompanionEvent) => void) | null = null;
  /** A short feeling for something the trader did (a trade, a break); set by the island. */
  onFeeling: ((state: MascotState, line: string) => void) | null = null;

  private memory = new Map<string, RuleMemory>();
  /** Rules saved before this launch, not yet checked against a quote. */
  private unprimed = new Set<string>();
  private liqWarnings = new Map<string, number>();
  private pollTimer: number | null = null;
  private abort: AbortController | null = null;
  private failures = 0;
  private breakPending = false;
  private started = false;

  private safetyQueue: string[] = [];
  private safetyRunning = 0;
  private safetyErrorAt = new Map<string, number>();
  private trendingLoading = false;
  private walletsLoading = false;
  private fngLoading = false;
  private fngTriedAt = 0;
  private walletAlertAt = new Map<string, number>();
  /** Major coins' own market caps and volumes, by CoinGecko id, and when each came (see marketsFor). */
  private markets: Record<string, MajorMarket & { at: number }> = {};
  /** After a refused call (mostly the keyless API's rate limit), CoinGecko is left alone until then. */
  private marketsRetryAt = 0;
  /** Which wallet tokens have a real pair, and which rest (no pair, junk): see wallets/pricing. */
  private pricing: PricingMemory = { known: new Set(), resting: new Map() };

  /** Off in the demo, whose scripted watchlist must never overwrite the real one. */
  persist = true;

  start() {
    if (this.started) return;
    this.started = true;
    for (const r of State.companion.alerts) this.unprimed.add(r.id);
    this.rollDay();
    this.recomputeMood();
    void this.pollNow();
    void this.refreshWallets();
    window.setInterval(() => this.disciplineTick(), DISCIPLINE_TICK_MS);
    window.setInterval(() => void this.refreshWallets(), WALLET_POLL_MS);
    window.setInterval(() => {
      if (State.mode === "expanded" && State.view === "trending") void this.refreshTrending();
    }, TRENDING_TTL_MS / 2);
    // A minute in, then every few hours: a newer Candy on GitHub?
    if (IS_TAURI) {
      window.setTimeout(() => void this.checkUpdate(), 60_000);
      window.setInterval(() => void this.checkUpdate(), UPDATE_CHECK_MS);
    }
  }

  /** The newest version offered this session: "Later" means not again until the next start. */
  private updateOffered: string | null = null;

  /**
   * Asks GitHub for the newest version (src-tauri/src/update.rs) and, when it
   * is newer, offers it on the island. Nothing is downloaded until the user
   * says so.
   */
  async checkUpdate() {
    const latest = await Bridge.checkUpdate();
    if (!latest || !isNewer(latest, State.version) || latest === this.updateOffered) return;
    this.updateOffered = latest;
    void Bridge.log(`update: ${latest} is out (running ${State.version})`);
    this.raise({ kind: "update", id: uid(), version: latest });
  }

  // ── Market ──────────────────────────────────────────────────────────────────

  private schedule() {
    if (this.pollTimer != null) window.clearTimeout(this.pollTimer);
    this.pollTimer = window.setTimeout(() => void this.pollNow(), State.companion.pollSeconds * 1000);
  }

  async pollNow() {
    if (this.pollTimer != null) window.clearTimeout(this.pollTimer);
    this.pollTimer = null;
    const tokens = State.companion.watchlist;
    if (State.paused) {
      State.marketStatus = "idle";
      this.recomputeMood();
      this.schedule();
      return;
    }

    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    if (State.marketStatus === "idle" && tokens.length) State.marketStatus = "loading";
    State.notify();

    try {
      // The native coins of the chosen chains (and SOL, for the mascot) ride
      // along: they share each chain's request, so they cost nothing extra.
      const natives = nativeCoins(State.companion.chains);
      const refs = [
        ...tokens.map((t) => ({ chainId: t.chainId, address: t.address })),
        ...natives.map((n) => ({ chainId: n.chain, address: n.address })),
        { chainId: "solana" as const, address: SOL_MINT },
        ...(State.companion.headerMarket ? [WBTC] : []),
        // Held tokens ride along too, so positions move with the market.
        ...Object.keys(State.companion.book.positions).map((address) => ({ chainId: "solana" as const, address })),
      ];
      const majorIds = tokens.map((t) => majorFor(t)?.coingecko).filter((id): id is string => !!id);
      const [quotes, markets] = await Promise.all([fetchQuotes(refs, abort.signal), this.marketsFor(majorIds)]);
      if (abort.signal.aborted) return;
      this.failures = 0;
      State.sol = quotes[SOL_MINT] ?? State.sol;
      State.btc = quotes[tokenKey(WBTC.chainId, WBTC.address)] ?? State.btc;
      this.logWalletSales();
      void this.refreshFearGreed();
      State.natives = {};
      for (const n of natives) {
        const q = quotes[tokenKey(n.chain, n.address)];
        if (q) State.natives[n.symbol] = q;
      }
      State.marketStatus = tokens.length ? "ok" : "idle";
      State.marketError = null;
      State.lastUpdate = Date.now();
      // A major coin shows its own market cap and volume (see market/majors);
      // the header and positions keep the raw quotes.
      const watched = { ...quotes };
      for (const t of tokens) {
        const m = majorFor(t);
        if (m && watched[t.key]) watched[t.key] = asMajor(watched[t.key], markets[m.coingecko]);
      }
      this.applyQuotes(watched);
      this.applyPositionQuotes(quotes);
      this.ensureSafety(tokens);
    } catch (err) {
      if (abort.signal.aborted) return;
      this.failures++;
      State.marketError = String(err instanceof Error ? err.message : err);
      // One failed poll is noise; two in a row is worth showing.
      if (this.failures >= 2 && tokens.length) State.marketStatus = "error";
      void Bridge.log(`poll failed: ${State.marketError}`);
    }
    this.recomputeMood();
    State.notify();
    this.schedule();
  }

  /**
   * Takes quotes from somewhere other than DexScreener — the demo's scripted
   * market — and runs them through the same history, alerts and mood.
   */
  feed(quotes: Record<string, Quote>) {
    State.marketStatus = "ok";
    State.lastUpdate = Date.now();
    this.applyQuotes(quotes);
    this.recomputeMood();
    State.notify();
  }

  private applyQuotes(quotes: Record<string, Quote>) {
    const now = Date.now();
    let changedTokens = false;
    for (const token of State.companion.watchlist) {
      const q = quotes[token.key];
      if (!q) continue;
      // A pump.fun token migrating to its AMM pool changes its best pair. The
      // old pool's liquidity history would read as a rug: start fresh.
      if (q.pairAddress !== token.pairAddress) {
        token.pairAddress = q.pairAddress;
        State.history[token.key] = [];
        changedTokens = true;
      }
      State.quotes[token.key] = q;
      State.history[token.key] = pushSample(State.history[token.key] ?? [], {
        t: now,
        price: q.priceUsd,
        mcap: q.marketCap,
        liq: q.liquidityUsd,
      });
    }
    if (changedTokens) this.save();
    this.evaluate(now);
  }

  /**
   * The major coins' own market caps and 24 h volumes, from CoinGecko, for the
   * watchlist and for searches alike: one call for all of them when any is a
   * few minutes old or missing. A refused call keeps what came before and
   * leaves CoinGecko alone for a minute.
   */
  private async marketsFor(ids: string[]): Promise<Record<string, MajorMarket>> {
    const now = Date.now();
    const stale = ids.some((id) => now - (this.markets[id]?.at ?? 0) >= COINGECKO_TTL_MS);
    if (stale && now >= this.marketsRetryAt) {
      try {
        const got = await fetchMarkets([...new Set(ids)]);
        for (const [id, m] of Object.entries(got)) this.markets[id] = { ...m, at: now };
      } catch (err) {
        this.marketsRetryAt = now + 60_000;
        void Bridge.log(`CoinGecko: ${err instanceof Error ? err.message : err}`);
      }
    }
    return this.markets;
  }

  /** The Fear & Greed index, at most once an hour. A miss just waits. */
  private async refreshFearGreed() {
    if (!State.companion.headerMarket || this.fngLoading) return;
    const now = Date.now();
    if (State.fearGreed && now - State.fearGreed.fetchedAt < FNG_TTL_MS) return;
    // After a failure, try again in ten minutes rather than every poll.
    if (now - this.fngTriedAt < 10 * 60_000) return;
    this.fngTriedAt = now;
    this.fngLoading = true;
    try {
      State.fearGreed = (await fetchFearGreed()) ?? State.fearGreed;
      State.notify();
    } catch (err) {
      void Bridge.log(`fear & greed failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.fngLoading = false;
    }
  }

  /** Prices the positions and reports the levels the trader asked about. */
  private applyPositionQuotes(quotes: Record<string, Quote>) {
    const book = State.companion.book;
    let changed = false;
    for (const p of Object.values(book.positions)) {
      const key = tokenKey("solana", p.mint);
      const q = quotes[key];
      if (!q) continue;
      State.positionQuotes[p.mint] = q;
      const { hits, alerted } = crossedLevels(p, q.priceUsd, State.companion.positionAlerts);
      if (alerted.length !== p.alerted.length) {
        p.alerted = alerted;
        changed = true;
      }
      for (const hit of hits) {
        this.raise({
          kind: "alert",
          id: uid(),
          ruleId: `position:${p.mint}:${hit.key}`,
          address: key,
          title: hit.title,
          detail: hit.detail,
          tone: hit.tone,
          token: State.token(key) ?? {
            key,
            chainId: "solana",
            address: p.mint,
            symbol: p.symbol,
            name: p.symbol,
            pairAddress: q.pairAddress,
            dexId: "",
            imageUrl: null,
          },
        });
      }
    }
    if (changed) this.save();
  }

  /** The price a position is valued at: the latest quote, or none yet. */
  positionPrice(mint: string): number | null {
    const q = State.positionQuotes[mint] ?? State.quotes[tokenKey("solana", mint)];
    return q ? q.priceUsd : null;
  }

  /** Every priced position with its numbers, biggest first. */
  positions() {
    return Object.values(State.companion.book.positions)
      .map((p) => {
        const price = this.positionPrice(p.mint);
        return price == null ? null : { p, price, s: positionStats(p, price) };
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => b.s.valueUsd - a.s.valueUsd);
  }

  /** The trader typed their real average entry for a position. */
  setPositionEntry(mint: string, price: number) {
    State.companion.book = setEntry(State.companion.book, mint, price);
    this.save();
    State.notify();
  }

  /** Runs the alert rules against the latest quotes and shows what fired. */
  private evaluate(now: number) {
    for (const id of this.unprimed) {
      const rule = State.companion.alerts.find((r) => r.id === id);
      const quote = rule && State.quotes[rule.address];
      if (!rule) this.unprimed.delete(id);
      else if (quote) {
        primeRule(rule, quote, State.history[rule.address] ?? [], this.memory, now);
        this.unprimed.delete(id);
      }
    }
    const fired = evaluateRules(
      State.companion.alerts,
      State.companion.watchlist,
      State.quotes,
      State.history,
      this.memory,
      now,
    );
    for (const f of fired) {
      if (f.rule.kind === "liqDrop") this.liqWarnings.set(f.rule.address, now + LIQ_WARNING_MS);
      this.raise({
        kind: "alert",
        id: uid(),
        ruleId: f.rule.id,
        address: f.rule.address,
        title: f.title,
        detail: f.detail,
        tone: f.tone,
      });
    }
  }

  // ── Token safety (RugCheck) ─────────────────────────────────────────────────

  /**
   * Queues RugCheck lookups for tokens with no report, or a stale one. RugCheck
   * only covers Solana, where a token's key is its mint.
   */
  ensureSafety(tokens: WatchToken[]) {
    const now = Date.now();
    for (const mint of tokens.filter((t) => CHAINS[t.chainId].rugcheck && !majorFor(t)).map((t) => t.key)) {
      const r = State.safety[mint];
      if (r === "loading" || this.safetyQueue.includes(mint)) continue;
      if (r === "error" && now - (this.safetyErrorAt.get(mint) ?? 0) < 5 * 60_000) continue;
      if (r && r !== "error" && now - r.fetchedAt < SAFETY_TTL_MS) continue;
      this.safetyQueue.push(mint);
    }
    this.pumpSafety();
  }

  private pumpSafety() {
    while (this.safetyRunning < SAFETY_CONCURRENCY && this.safetyQueue.length) {
      const mint = this.safetyQueue.shift()!;
      this.safetyRunning++;
      State.safety[mint] = "loading";
      fetchSafety(mint)
        .then((r) => (State.safety[mint] = r))
        .catch(() => {
          State.safety[mint] = "error";
          this.safetyErrorAt.set(mint, Date.now());
        })
        .finally(() => {
          this.safetyRunning--;
          State.notify();
          this.pumpSafety();
        });
    }
  }

  // ── Trending ────────────────────────────────────────────────────────────────

  async refreshTrending(force = false) {
    if (this.trendingLoading || State.paused) return;
    if (!force && Date.now() - State.trending.updatedAt < TRENDING_TTL_MS) return;
    this.trendingLoading = true;
    try {
      const { hot, fresh } = await fetchTrending(State.companion.chains);
      State.trending = { hot, fresh, updatedAt: Date.now(), error: null };
      this.ensureSafety([...hot.slice(0, 10), ...fresh.slice(0, 10)].map((x) => x.token));
    } catch (err) {
      State.trending = { ...State.trending, error: String(err instanceof Error ? err.message : err), updatedAt: Date.now() };
    } finally {
      this.trendingLoading = false;
      State.notify();
    }
  }

  // ── Watchlist and alerts ────────────────────────────────────────────────────

  /**
   * What the watchlist field does with its text: an address or a link adds
   * that token; anything else is a name to search for, and the results open
   * for the user to pick from (`searched`).
   */
  async addToken(input: string): Promise<{ ok: boolean; message: string; searched?: boolean }> {
    const parsed = parseInput(input);
    if (parsed.kind === "query") {
      if (parsed.query.length < 2) return { ok: false, message: "Type at least 2 letters, or paste an address." };
      await this.search(parsed.query);
      return { ok: true, message: "", searched: true };
    }
    let token;
    try {
      token = await resolveAddress(parsed, State.companion.chains);
    } catch (err) {
      return { ok: false, message: String(err instanceof Error ? err.message : err) };
    }
    if (!token) return { ok: false, message: "DexScreener doesn't list it: inactive, too new, or not on Solana, BSC, Ethereum or Robinhood Chain." };
    return this.addWatchToken(token);
  }

  /** Adds a token already resolved (a search result, a trending row). */
  addWatchToken(token: WatchToken): { ok: boolean; message: string } {
    // A major added by its tracking token's address (WBTC…) is still BTC.
    const major = majorFor(token);
    if (major) token = majorToken(major, token);
    const list = State.companion.watchlist;
    if (list.length >= MAX_WATCHLIST) return { ok: false, message: `${MAX_WATCHLIST} tokens max.` };
    if (list.some((t) => t.key === token.key)) return { ok: false, message: `${token.symbol} is already on the list.` };
    // It lands in the folder on screen ("All": none).
    const folder = State.companion.activeFolder || undefined;
    list.push({ ...token, folder });
    this.onFeeling?.("curious", `ooh, ${token.symbol}?`);
    this.save();
    void this.pollNow();
    return { ok: true, message: `${token.symbol} added.` };
  }

  // ── Watchlist folders ────────────────────────────────────────────────────────

  /** Shows a folder ("" for All). */
  showFolder(folder: string) {
    const c = State.companion;
    c.activeFolder = folder && c.folders.includes(folder) ? folder : "";
    this.save();
  }

  /** Puts a token in a folder (undefined: no folder, All only). */
  moveToFolder(key: string, folder: string | undefined) {
    const t = State.companion.watchlist.find((x) => x.key === key);
    if (!t) return;
    t.folder = folder && State.companion.folders.includes(folder) ? folder : undefined;
    this.save();
  }

  /** A new folder, shown at once; an error message when the name can't be used. */
  addFolder(raw: string): string | null {
    const c = State.companion;
    if (c.folders.length >= MAX_FOLDERS) return `${MAX_FOLDERS} folders max.`;
    const name = cleanFolderName(raw, c.folders);
    if (!name) return "Pick another name.";
    c.folders.push(name);
    c.activeFolder = name;
    this.save();
    return null;
  }

  /** Name search for the watchlist field; results land in State.search. */
  async search(query: string) {
    State.search = { query, results: [], loading: true, error: null };
    State.notify();
    try {
      // Major coins first ("btc" → Bitcoin), from the curated list: never one
      // of the copycats that share the ticker (see market/majors).
      const majors = searchMajors(query);
      const [found, pairs, markets] = await Promise.all([
        searchTokens(query, State.companion.chains),
        majors.length ? fetchPairs(majors.map((m) => ({ chainId: m.chainId, address: m.address }))) : Promise.resolve({} as Record<string, DexPair>),
        this.marketsFor(majors.map((m) => m.coingecko)),
      ]);
      if (State.search?.query !== query) return; // a newer search took over
      const now = Date.now();
      const top = majors.map((m) => {
        const token = majorToken(m, null);
        const pair = pairs[token.key];
        return {
          token: pair ? majorToken(m, toWatchToken(pair)) : token,
          quote: pair ? asMajor(toQuote(token.key, pair, now), markets[m.coingecko]) : null,
          boost: 0,
          pairCreatedAt: null,
        };
      });
      const results = [...top, ...found.filter((r) => !majorFor(r.token))];
      State.search = { query, results, loading: false, error: null };
      this.ensureSafety(results.map((r) => r.token));
    } catch (err) {
      if (State.search?.query !== query) return;
      State.search = { query, results: [], loading: false, error: String(err instanceof Error ? err.message : err) };
    }
    State.notify();
  }

  closeSearch() {
    State.search = null;
    State.notify();
  }

  removeToken(key: string) {
    const c = State.companion;
    c.watchlist = c.watchlist.filter((t) => t.key !== key);
    c.alerts = c.alerts.filter((a) => a.address !== key);
    delete State.quotes[key];
    delete State.history[key];
    this.save();
    this.recomputeMood();
  }

  addAlert(rule: Omit<AlertRule, "id" | "enabled">) {
    State.companion.alerts.push({ ...rule, id: uid(), enabled: true });
    this.save();
    // Check it against the latest numbers right away instead of next poll.
    this.evaluate(Date.now());
  }

  /** The one-click "tell me at 2x": market cap, or price when there is none. */
  addMultipleAlert(address: string, factor = 2): string | null {
    const q = State.quotes[address];
    if (!q) return null;
    if (q.marketCap) {
      this.addAlert({ address, kind: "mcapAbove", value: q.marketCap * factor, windowMin: 5 });
      return `Alert at ${formatUsd(q.marketCap * factor)} MC (${factor}x)`;
    }
    if (q.priceUsd > 0) {
      this.addAlert({ address, kind: "priceAbove", value: q.priceUsd * factor, windowMin: 5 });
      return `Alert at ${formatPrice(q.priceUsd * factor)} (${factor}x)`;
    }
    return null;
  }

  removeAlert(id: string) {
    State.companion.alerts = State.companion.alerts.filter((a) => a.id !== id);
    this.memory.delete(id);
    this.save();
  }

  toggleAlert(id: string) {
    const rule = State.companion.alerts.find((a) => a.id === id);
    if (!rule) return;
    rule.enabled = !rule.enabled;
    this.memory.delete(id);
    this.save();
  }

  // ── Wallets (public addresses, read-only) ───────────────────────────────────

  /**
   * Adds a wallet by its public address: the trader's own (`mine`: its buys
   * and sells are recorded, with profit) or someone to follow (alerts only).
   * An address already in the other list moves over.
   */
  addWallet(address: string, label = "", mine = false): { ok: boolean; message: string } {
    const a = address.trim();
    const list = State.companion.wallets;
    if (!isAddress(a)) return { ok: false, message: "That doesn't look like a Solana address." };
    const known = list.find((w) => w.address === a);
    if (known) {
      if (known.mine === mine) return { ok: false, message: mine ? "That's already your wallet." : "Already following that wallet." };
      known.mine = mine;
      if (label.trim()) known.label = label.trim().slice(0, 24);
      this.updatePositions([], {});
      void this.refreshWallets([a]);
      return { ok: true, message: mine ? "Moved from Following to your wallets." : "Moved from your wallets to Following." };
    }
    if (list.length >= MAX_WALLETS) return { ok: false, message: `${MAX_WALLETS} wallets max.` };
    const same = list.filter((w) => w.mine === mine).length;
    const name = label.trim().slice(0, 24) || (mine ? (same ? `My wallet ${same + 1}` : "My wallet") : `Wallet ${same + 1}`);
    list.push({ address: a, label: name, mine, baselineUsd: null, addedAt: Date.now() });
    this.save();
    void this.refreshWallets([a]);
    return { ok: true, message: mine ? "Your wallet is added. Reading it…" : "Following. You'll get an alert when it buys or sells." };
  }

  removeWallet(address: string) {
    State.companion.wallets = State.companion.wallets.filter((w) => w.address !== address);
    delete State.wallets[address];
    this.updatePositions([], {});
  }

  renameWallet(address: string, label: string) {
    const w = State.companion.wallets.find((x) => x.address === address);
    if (!w || !label.trim()) return;
    w.label = label.trim().slice(0, 24);
    this.save();
  }

  /** A read asked for while another was running: run it right after. */
  private walletsQueued: string[] | true | null = null;

  /** Reads balances, prices them, and reports buys and sells since last time. */
  async refreshWallets(only?: string[]) {
    if (State.paused) return;
    if (this.walletsLoading) {
      // A wallet just added must not wait for the next minute's poll.
      this.walletsQueued = !only || this.walletsQueued === true ? true : [...new Set([...(this.walletsQueued ?? []), ...only])];
      return;
    }
    // Followed wallets are read only while Following is on.
    const wallets = State.companion.wallets.filter(
      (w) => (w.mine || State.companion.following) && (!only || only.includes(w.address)),
    );
    if (wallets.length === 0) return;
    this.walletsLoading = true;
    const reads: WalletRead[] = [];
    const prices: Record<string, PriceInfo> = {};
    const gaps: ReturnType<typeof gapTrades>[] = [];
    try {
      for (const w of wallets) {
        const prev = State.wallets[w.address];
        try {
          // The balances are as of now: the transactions read below stop here
          // (later ones go to the next check, with the balances they changed).
          const readAt = Date.now();
          const { sol, holdings, accounts } = await readWallet(w.address);
          if (w.mine) this.tokenAccounts.set(w.address, accounts);
          const solPrice = State.sol?.priceUsd ?? 0;
          // An own wallet's transactions since the last read: a token bought
          // and sold within the minute never shows in the balances.
          let swaps: Swap[] = [];
          if (w.mine && prev && !prev.error && solPrice > 0) {
            // Every transaction the wallet makes moves its SOL (the fee, at
            // least) or a token: when nothing moved and the last read got
            // everything, there is nothing to read, and the shared RPC is spared.
            const still = sol === prev.sol && sameAmounts(holdings, prev.holdings);
            if (still && (w.tradesAt ?? 0) >= prev.checkedAt) {
              w.tradesAt = readAt;
            } else {
              const live = await fetchNewSwaps(w.address, w.tradesAt ?? prev.checkedAt, readAt, this.seenTx).catch(() => null);
              if (live) {
                swaps = live.swaps;
                w.tradesAt = live.upTo;
              }
            }
            if (this.seenTx.size > 1000) this.seenTx = new Set([...this.seenTx].slice(-500));
          }
          // Tokens it had a position in are priced too: one sold to zero has
          // left the balance, and its sale still needs a price.
          const held = w.mine
            ? Object.values(State.companion.book.positions).filter((p) => p.amounts[w.address] != null).map((p) => p.mint)
            : [];
          const traded = swaps.map((x) => x.mint);
          const mints = mintsToPrice({
            held,
            traded,
            holdings,
            prev: prev && !prev.error ? prev.holdings : null,
            memory: this.pricing,
            now: readAt,
            limit: MAX_PRICED_HOLDINGS,
          });
          const fetched = mints.length ? await fetchPairs(mints.map((address) => ({ chainId: "solana" as const, address }))) : {};
          // Junk (an airdropped scam, a coin its pool can't pay for: see
          // market/spam) stays out of the wallet's worth, its reported moves
          // and new positions. A position already held, or a token just
          // traded, keeps its price: a real buy that rugged still closes.
          const pairs: Record<string, DexPair> = {};
          const verdicts: Record<string, Verdict> = {};
          for (const mint of mints) {
            const pair = fetched[mint];
            const junk = pair ? junkReason(pair, holdings[mint] ?? 0) : null;
            verdicts[mint] = !pair ? "none" : junk ? "junk" : "real";
            if (pair && (!junk || held.includes(mint) || traded.includes(mint))) pairs[mint] = pair;
          }
          learn(this.pricing, verdicts, readAt);
          const values: Record<string, number> = {};
          let total = sol * solPrice;
          for (const [mint, pair] of Object.entries(pairs)) {
            const v = holdings[mint] * (Number(pair.priceUsd) || 0);
            if (v > 0) {
              values[mint] = v;
              total += v;
            }
          }
          // Dust and spam airdrops are worth nothing: show real positions only.
          const top = Object.entries(values)
            .filter(([, usd]) => usd >= 1)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([address, usd]) => ({ address, symbol: pairs[address]?.baseToken.symbol ?? "?", usd }));
          const snap: WalletSnapshot = { sol, holdings, values, totalUsd: total, top, checkedAt: readAt, error: null };
          State.wallets[w.address] = snap;
          if (w.baselineUsd == null && total > 0) {
            w.baselineUsd = total;
            this.save();
          }
          if (prev && !prev.error && !w.mine) this.reportWalletMoves(w.address, w.label, prev.holdings, holdings, pairs);
          if (w.mine) {
            reads.push({ address: w.address, holdings });
            for (const [mint, pair] of Object.entries(pairs)) prices[mint] = { price: Number(pair.priceUsd) || 0, symbol: pair.baseToken.symbol };
            if (swaps.length && prev) {
              const symbols: Record<string, string> = {};
              for (const x of swaps) {
                const known = pairs[x.mint]?.baseToken.symbol ?? State.token(x.mint)?.symbol ?? State.companion.book.positions[x.mint]?.symbol;
                if (known) symbols[x.mint] = known;
              }
              const gap = gapTrades(swaps, prev.holdings, holdings, symbols, solPrice);
              // What the balances see moving is costed at the price it really traded at.
              for (const [mint, fill] of Object.entries(gap.fills)) {
                prices[mint] = { price: fill, symbol: prices[mint]?.symbol ?? symbols[mint] ?? `${mint.slice(0, 4)}…` };
              }
              gaps.push(gap);
            }
          }
        } catch (err) {
          State.wallets[w.address] = {
            ...(prev ?? { sol: 0, holdings: {}, values: {}, totalUsd: 0, top: [] }),
            checkedAt: Date.now(),
            error: String(err instanceof Error ? err.message : err),
          };
        }
        State.notify();
      }
      this.updatePositions(reads, prices);
      this.recordGapTrades(gaps);
    } finally {
      this.walletsLoading = false;
    }
    const queued = this.walletsQueued;
    this.walletsQueued = null;
    if (queued) void this.refreshWallets(queued === true ? undefined : queued);
    // An own wallet read for the first time: its recent trades, once.
    const fresh = State.companion.wallets.find((w) => w.mine && w.historyAt == null && State.wallets[w.address] && !State.wallets[w.address].error);
    if (fresh) void this.readTradeHistory(fresh.address);
    void this.checkHistories();
  }

  /**
   * The trades an own wallet made before it was added, from its latest
   * transactions: into Activity, and round trips that closed into the journal
   * (with their own dates; today's discipline log is left alone). Once per
   * wallet; again on demand.
   */
  async readTradeHistory(address: string) {
    const w = State.companion.wallets.find((x) => x.address === address && x.mine);
    // One read at a time; a line showing an error is the one case to start again (Try again).
    if (!w || (State.historyRead && !State.historyRead.error)) return;
    // The entry reader holds the RPC: go right after it (one call at a time, see checkHistories).
    if (this.historyBusy) {
      this.tradeReadQueued = address;
      return;
    }
    this.historyBusy = true;
    State.historyRead = { address, done: 0, total: 0, error: null, found: null };
    State.notify();
    try {
      const { swaps: all, failed } = await fetchSwaps(address, (done, total) => {
        if (State.historyRead) State.historyRead = { ...State.historyRead, done, total };
        State.notify();
      });
      // From the moment it was added, tracking sees the trades itself.
      const swaps = all.filter((s) => s.t < w.addedAt);
      const mints = [...new Set(swaps.map((s) => s.mint))];
      const pairs = mints.length ? await fetchPairs(mints.map((a) => ({ chainId: "solana" as const, address: a }))).catch(() => ({})) : {};
      const symbols: Record<string, string> = {};
      for (const m of mints) {
        const known = State.token(m)?.symbol ?? State.companion.book.positions[m]?.symbol ?? (pairs as Record<string, { baseToken: { symbol: string } }>)[m]?.baseToken.symbol;
        if (known) symbols[m] = known;
      }
      const solUsd = State.sol?.priceUsd ?? 0;
      if (!(solUsd > 0)) throw new Error("no SOL price yet, try again in a moment");
      const { activity, closed, taken } = tradesFromSwaps(swaps, symbols, solUsd);
      const c = State.companion;
      const seen = new Set(c.book.activity.map((a) => a.id).filter(Boolean));
      c.book = { ...c.book, activity: mergeActivity(c.book.activity, activity, MAX_ACTIVITY) };
      // Today's sales count in "Taken today" as if seen live (each sale once:
      // a retry finds the ones already merged).
      const today = todayKey();
      const takenToday = taken.filter((x) => !seen.has(x.id) && todayKey(new Date(x.t)) === today).reduce((sum, x) => sum + x.usd, 0);
      if (takenToday !== 0) {
        const fresh = c.book.day !== today;
        c.book = { ...c.book, day: today, realizedToday: (fresh ? 0 : c.book.realizedToday) + takenToday };
      }
      if (c.autoJournal) {
        const have = new Set(c.journal.map((j) => j.id));
        for (const trip of closed) {
          const id = `hist-${trip.id}`;
          if (have.has(id)) continue;
          const pnl = c.discipline.unit === "SOL" ? trip.pnlSol : trip.pnlUsd;
          c.journal.push({ id, t: trip.t, pnl: Math.round(pnl * 1e4) / 1e4, note: `From wallet history: ${trip.symbol} closed (${formatSignedUsd(trip.pnlUsd)})` });
        }
        c.journal.sort((a, b) => a.t - b.t);
      }
      // What it sold today counts in today's Discipline, as if seen live: a
      // close is a trade (its parts sold are in its total), a part sold of a
      // position still open adds its profit.
      if (c.autoJournal) {
        const day = todayKey();
        const conv = (usd: number) => Math.round((c.discipline.unit === "SOL" ? usd / solUsd : usd) * 1e4) / 1e4;
        const todays = activity.filter((a) => todayKey(new Date(a.t)) === day && !a.costUnknown);
        const closedToday = new Set(todays.filter((a) => a.side === "closed").map((a) => a.mint));
        for (const a of todays) {
          const opts = { auto: true, id: `hist-${a.id}`, at: a.t, journal: false, quiet: true };
          if (a.side === "closed") this.recordTrade(conv(a.realizedUsd), "", { ...opts, tradePnl: conv(a.realizedUsd) });
          else if (a.side === "sold" && !closedToday.has(a.mint)) this.recordTrade(conv(a.realizedUsd), "", { ...opts, partial: true });
        }
      }
      w.historyAt = Date.now();
      this.save();
      const read = State.historyRead?.total ?? 0;
      // Some transactions refused: what was read stays (a retry adds the rest,
      // nothing twice), and the line offers the retry.
      const whose = State.settings.rpcUrl ? "your RPC" : "the public RPC";
      const error = failed ? `${failed} of ${read} transactions could not be read, ${whose} is busy` : null;
      State.historyRead = { address, done: read, total: read, error, found: activity.length };
    } catch (err) {
      State.historyRead = { ...(State.historyRead ?? { address, done: 0, total: 0, found: null }), error: err instanceof Error ? err.message : String(err) };
      // Mark it read anyway so a broken RPC is not hammered every minute; the tab offers a retry.
      w.historyAt = Date.now();
      this.save();
    } finally {
      this.historyBusy = false;
    }
    State.notify();
    // The result line stays a while, then makes room.
    window.setTimeout(() => {
      if (State.historyRead?.address === address && (State.historyRead.found != null || State.historyRead.error)) {
        State.historyRead = null;
        State.notify();
      }
    }, 20_000);
  }

  /** Own wallets' token accounts, by wallet then mint (for their history). */
  private tokenAccounts = new Map<string, Record<string, string[]>>();
  /** Own wallets' transactions already read live (see fetchNewSwaps). */
  private seenTx = new Set<string>();
  /** The RPC is being read for a history (entries or recent trades): one reader at a time. */
  private historyBusy = false;
  /** A trade-history read that waited for the entry reader to finish. */
  private tradeReadQueued: string | null = null;
  /** A history read that failed is tried again after this. */
  private historyRetryAt = new Map<string, number>();

  /**
   * Positions held before tracking began: read the wallets' transactions for
   * their real entry, a couple per round, one RPC call at a time.
   */
  private async checkHistories() {
    if (this.historyBusy || State.paused) return;
    const now = Date.now();
    const todo = needsHistory(State.companion.book)
      .filter((p) => (this.historyRetryAt.get(p.mint) ?? 0) <= now)
      .slice(0, 2);
    if (todo.length === 0) return;
    this.historyBusy = true;
    try {
      for (const p of todo) {
        const amount = heldAmount(p);
        try {
          const parts = [];
          for (const wallet of Object.keys(p.amounts)) {
            const accounts = this.tokenAccounts.get(wallet)?.[p.mint] ?? [];
            if (accounts.length === 0) throw new Error("token accounts not read yet");
            parts.push(entryFromHistory(await fetchDeltas(wallet, p.mint, accounts)));
          }
          const sum = parts.reduce(
            (a, h) => ({ amount: a.amount + h.amount, unknown: a.unknown + h.unknown, costSol: a.costSol + h.costSol, costUsd: a.costUsd + h.costUsd }),
            { amount: 0, unknown: 0, costSol: 0, costUsd: 0 },
          );
          const solUsd = State.sol?.priceUsd ?? 0;
          if (!(solUsd > 0)) throw new Error("no SOL price yet");
          const current = State.companion.book.positions[p.mint];
          // The balance moved while reading: try again next round.
          if (!current || Math.abs(heldAmount(current) - amount) > amount * 1e-6) continue;
          const cost = historyCost(sum, amount, solUsd, amount > 0 ? current.costUsd / amount : 0);
          State.companion.book = applyHistory(State.companion.book, p.mint, cost);
          this.save();
          this.recomputeMood();
          State.notify();
        } catch (err) {
          this.historyRetryAt.set(p.mint, Date.now() + 10 * 60_000);
          void Bridge.log(`history for ${p.symbol} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } finally {
      this.historyBusy = false;
    }
    // A trade-history read that waited for this one.
    const queued = this.tradeReadQueued;
    this.tradeReadQueued = null;
    if (queued) void this.readTradeHistory(queued);
  }

  /** Wallet sales waiting to be counted (in SOL, they need SOL's price). */
  private pendingSales: BookChange[] = [];

  /**
   * Counts the own wallet's sales in Discipline, so the day's profit, trades
   * and rules follow the wallet by themselves: a part sold adds its profit, a
   * closed position is a trade (and a journal line).
   */
  private logWalletSales() {
    if (this.pendingSales.length === 0) return;
    const trades = walletTrades(this.pendingSales, State.companion.discipline.unit, State.sol?.priceUsd ?? null);
    if (trades == null) return;
    this.pendingSales = [];
    for (const t of trades) {
      this.recordTrade(t.pnl, t.note ?? "", { partial: t.partial, tradePnl: t.tradePnl, auto: true, journal: !t.partial });
    }
  }

  /**
   * Round trips made between two reads of an own wallet (see gapTrades):
   * into Activity and Taken today, and each closed trip into the journal and
   * today's discipline, as a closed position seen live would be. Each once:
   * a transaction read again is recognised by its signature.
   */
  private recordGapTrades(gaps: ReturnType<typeof gapTrades>[]) {
    const c = State.companion;
    const solUsd = State.sol?.priceUsd ?? 0;
    for (const g of gaps) {
      const seen = new Set(c.book.activity.map((a) => a.id).filter(Boolean));
      const activity = g.activity.filter((a) => !a.id || !seen.has(a.id));
      if (activity.length === 0) continue;
      c.book = { ...c.book, activity: mergeActivity(c.book.activity, activity, MAX_ACTIVITY) };
      const today = todayKey();
      const taken = g.taken.filter((x) => !seen.has(x.id) && todayKey(new Date(x.t)) === today).reduce((sum, x) => sum + x.usd, 0);
      if (taken !== 0) {
        const fresh = c.book.day !== today;
        c.book = { ...c.book, day: today, realizedToday: (fresh ? 0 : c.book.realizedToday) + taken };
      }
      if (!c.autoJournal || !(solUsd > 0)) continue;
      const conv = (usd: number) => Math.round((c.discipline.unit === "SOL" ? usd / solUsd : usd) * 1e4) / 1e4;
      for (const trip of g.closed) {
        if (seen.has(trip.id)) continue;
        const pnl = conv(trip.pnlUsd);
        this.recordTrade(pnl, `Auto: ${trip.symbol} bought and sold (${formatSignedUsd(trip.pnlUsd)})`, {
          auto: true,
          id: `live-${trip.id}`,
          at: trip.t,
          tradePnl: pnl,
        });
      }
    }
    if (gaps.some((g) => g.activity.length)) {
      this.save();
      this.recomputeMood();
      State.notify();
    }
  }

  /** Folds the own wallets' balances into the positions book. */
  private updatePositions(reads: WalletRead[], prices: Record<string, PriceInfo>) {
    const mine = State.companion.wallets.filter((w) => w.mine).map((w) => w.address);
    // A position the read could not price keeps the last market quote.
    for (const p of Object.values(State.companion.book.positions)) {
      const q = State.positionQuotes[p.mint];
      if (!prices[p.mint] && q && q.priceUsd > 0) prices[p.mint] = { price: q.priceUsd, symbol: p.symbol };
    }
    const { book, changes } = updateBook(State.companion.book, mine, reads, prices, Date.now(), todayKey());
    State.companion.book = book;
    if (State.companion.autoJournal) this.pendingSales.push(...changes.filter((ch) => ch.side === "sold" || ch.side === "closed"));
    this.logWalletSales();
    for (const [mint, info] of Object.entries(prices)) {
      // Fresh from the wallet read: good enough until the next market poll.
      if (book.positions[mint] && !State.positionQuotes[mint]) this.seedPositionPrice(mint, info.price);
    }
    this.save();
    this.recomputeMood();
    State.notify();
  }

  private seedPositionPrice(mint: string, price: number) {
    const zero = { m5: 0, h1: 0, h6: 0, h24: 0 };
    State.positionQuotes[mint] = {
      address: mint,
      pairAddress: "",
      priceUsd: price,
      marketCap: null,
      liquidityUsd: null,
      change: zero,
      volume: zero,
      txnsM5: { buys: 0, sells: 0 },
      updatedAt: Date.now(),
    };
  }

  private reportWalletMoves(
    address: string,
    label: string,
    prev: Record<string, number>,
    next: Record<string, number>,
    pairs: Record<string, DexPair>,
  ) {
    const now = Date.now();
    const { bought, sold } = diffHoldings(prev, next);
    const moves = [...bought.map((m) => ({ ...m, side: "bought" as const })), ...sold.map((m) => ({ ...m, side: "sold" as const }))];
    for (const m of moves) {
      const key = `${label}:${m.mint}:${m.side}`;
      if (now - (this.walletAlertAt.get(key) ?? 0) < WALLET_ALERT_COOLDOWN_MS) continue;
      const pair = pairs[m.mint];
      // Only priced tokens: dust and airdropped spam would drown the real moves.
      if (!pair) continue;
      this.walletAlertAt.set(key, now);
      const token = toWatchToken(pair);
      State.walletMoves[address] = { side: m.side === "sold" && m.to === 0 ? "sold all" : m.side, symbol: token.symbol, t: now };
      const q = toQuote(m.mint, pair, now);
      const what = m.side === "sold" && m.to === 0 ? "sold all its" : m.side;
      this.raise({
        kind: "alert",
        id: uid(),
        ruleId: `wallet:${label}`,
        address: m.mint,
        title: `${label} ${what} ${token.symbol}`,
        detail: `MC ${formatUsd(q.marketCap)} · ${formatPrice(q.priceUsd)} · liq ${formatUsd(q.liquidityUsd)}`,
        tone: m.side === "bought" ? "up" : "down",
        token,
      });
    }
  }

  // ── Discipline and journal ──────────────────────────────────────────────────

  /** Drops yesterday's trades once the date changes. */
  private rollDay() {
    const c = State.companion;
    const today = currentLog(c.log);
    if (today !== c.log) {
      c.log = today;
      this.save();
    }
  }

  get stoppedToday(): boolean {
    const c = State.companion;
    return lossLimitReached(c.discipline, summarize(currentLog(c.log)));
  }

  /**
   * A trade for today's log (and the journal). Typed in, or counted from the
   * wallet (`auto`): `partial` is a part sold (its profit only, no journal
   * line), `tradePnl` what a closed position took in all. `quiet`: a trade
   * read from the wallet's history, long done — no cooldown, no card.
   */
  recordTrade(
    pnl: number,
    note = "",
    opts: { partial?: boolean; tradePnl?: number; auto?: boolean; id?: string; at?: number; journal?: boolean; quiet?: boolean } = {},
  ) {
    const c = State.companion;
    if (opts.id && currentLog(c.log).entries.some((e) => e.id === opts.id)) return;
    const at = opts.at ?? Date.now();
    const out = logTrade(c.discipline, c.log, pnl, new Date(at), {
      ...(opts.partial ? { partial: true } : {}),
      ...(opts.tradePnl != null ? { tradePnl: opts.tradePnl } : {}),
      ...(opts.auto ? { auto: true } : {}),
      ...(opts.id ? { id: opts.id } : {}),
    });
    c.log = out.log;
    if (opts.journal !== false && !opts.partial) {
      c.journal.push({ id: uid(), t: at, pnl: opts.tradePnl ?? pnl, note: note.slice(0, 200) });
      if (c.journal.length > MAX_JOURNAL) c.journal.splice(0, c.journal.length - MAX_JOURNAL);
    }
    this.save();
    if (opts.quiet) {
      this.recomputeMood();
      State.notify();
      return;
    }
    const unit = c.discipline.unit;
    if (out.startCooldown) {
      State.cooldownUntil = Date.now() + c.discipline.cooldownMin * 60_000;
    }
    if (out.hitLossLimit) {
      this.raise({
        kind: "lossLimit",
        id: uid(),
        total: summarize(out.log).total,
        limit: c.discipline.dailyLossLimit,
        unit,
      });
    } else if (out.hitMaxTrades) {
      this.raise({ kind: "maxTrades", id: uid(), count: c.discipline.maxTradesPerDay });
    } else if (out.startCooldown) {
      this.raise({ kind: "cooldown", id: uid(), minutes: c.discipline.cooldownMin });
    }
    // A feeling for the trade, unless a discipline card has its own to show.
    const max = c.discipline.maxTradesPerDay;
    if (max > 0 && summarize(out.log).count > max) {
      this.onFeeling?.("angry", "that's past your max for today 😤");
    } else if (!out.hitLossLimit && !out.hitMaxTrades && !out.startCooldown && !opts.partial && pnl !== 0) {
      const result = opts.tradePnl ?? pnl;
      if (opts.auto) this.onFeeling?.(result > 0 ? "proud" : "sad", result > 0 ? "closed in profit 💪" : "closed at a loss. it happens.");
      else this.onFeeling?.(result > 0 ? "proud" : "sad", result > 0 ? "win logged 💪" : "loss logged. it happens.");
    }
    this.recomputeMood();
    State.notify();
  }

  undoTrade() {
    const c = State.companion;
    const last = lastTypedTrade(c.log);
    c.log = undoLastTrade(c.log);
    if (last) c.journal = c.journal.filter((e) => e.t !== last.t);
    this.save();
    this.recomputeMood();
    State.notify();
  }

  setJournalNote(id: string, note: string) {
    const e = State.companion.journal.find((x) => x.id === id);
    if (!e) return;
    e.note = note.slice(0, 200);
    this.save();
  }

  endCooldown() {
    State.cooldownUntil = 0;
    this.onFeeling?.("relieved", "cooldown over. fresh start 😮‍💨");
    this.recomputeMood();
    State.notify();
  }

  /** "Took a break": the break clock starts over. */
  ackBreak() {
    State.lastBreakAt = Date.now();
    this.breakPending = false;
    this.onFeeling?.("proud", "break taken. proud of you 🌿");
    State.notify();
  }

  /** "N more min": the reminder comes back later. */
  snoozeBreak(minutes: number) {
    const every = State.companion.discipline.breakEveryMin;
    State.lastBreakAt = Date.now() - Math.max(0, every - minutes) * 60_000;
    this.breakPending = false;
    State.notify();
  }

  private disciplineTick() {
    this.rollDay();
    const c = State.companion;
    const now = Date.now();
    const due = nextBreakIn(c.discipline, State.lastBreakAt, now);
    if (due != null && due <= 0 && !this.breakPending && !State.paused) {
      this.breakPending = true;
      this.raise({ kind: "break", id: uid(), minutes: c.discipline.breakEveryMin });
    }
    if (State.cooldownUntil && now >= State.cooldownUntil) {
      State.cooldownUntil = 0;
      this.onFeeling?.("relieved", "cooldown over. fresh start 😮‍💨");
    }
    for (const [addr, until] of this.liqWarnings) if (now >= until) this.liqWarnings.delete(addr);
    this.recomputeMood();
    State.notify();
  }

  // ── Mood, events, persistence ───────────────────────────────────────────────

  /** When the current mood's condition began, for settling (see settleMood). */
  private moodKey = "";
  private moodSince = 0;
  private settleTimer: number | null = null;

  recomputeMood() {
    const c = State.companion;
    const raw = computeMood({
      tokens: c.watchlist,
      quotes: State.quotes,
      status: State.marketStatus,
      paused: State.paused,
      stopped: this.stoppedToday,
      coolingDown: State.cooldownUntil > Date.now(),
      liquidityWarnings: new Set(this.liqWarnings.keys()),
      hour: new Date().getHours(),
      nightSleep: c.nightSleep,
      sol: c.reactToSol ? State.sol : null,
      fearGreed: c.headerMarket ? (State.fearGreed?.value ?? null) : null,
      positions: this.positions().map(({ p, s }) => ({
        symbol: p.symbol,
        multiple: s.multiple,
        pnlPct: s.pnlPct,
        fromTracking: p.fromTracking,
      })),
    });
    const now = Date.now();
    const key = moodKey(raw);
    if (key !== this.moodKey) {
      this.moodKey = key;
      this.moodSince = now;
    }
    State.mood = settleMood(raw, this.moodSince, now);
    // Settle on time, not at the next poll: one timer, for this mood only.
    if (this.settleTimer != null) window.clearTimeout(this.settleTimer);
    this.settleTimer = null;
    const left = settlesIn(raw, this.moodSince, now);
    if (left != null && left > 0) {
      this.settleTimer = window.setTimeout(() => {
        this.settleTimer = null;
        this.recomputeMood();
        State.notify();
      }, left + 50);
    }
    // The face it settled from, for a peek now and then.
    State.moodFace = State.mood.state !== raw.state ? raw.state : null;
  }

  /** Queues an event and shows it on the island (and as a system notification). */
  /** Alerts raised lately, for the "while you were away" summary. */
  readonly seenEvents: SeenEvent[] = [];

  raise(e: CompanionEvent) {
    if (e.kind === "alert") {
      this.seenEvents.push({ t: Date.now(), title: e.title, wallet: e.ruleId.startsWith("wallet:") });
      if (this.seenEvents.length > 50) this.seenEvents.splice(0, this.seenEvents.length - 50);
    }
    State.events.push(e);
    // Keep the queue short: a burst of alerts must not bury the island.
    if (State.events.length > 8) State.events.splice(0, State.events.length - 8);
    if (e.kind === "alert") State.unseen = e;
    if (State.companion.notifications) {
      if (e.kind === "alert") void notify(e.title, e.detail);
      if (e.kind === "lossLimit") void notify("Daily loss limit hit", "Time to stop for today.");
    }
    this.onEvent?.(e);
  }

  save() {
    if (this.persist) void Bridge.saveSettings(State.settings);
    State.notify();
  }

  /** Settings written by the other window. */
  applyExternal(s: Settings) {
    const pollChanged = s.companion.pollSeconds !== State.companion.pollSeconds;
    const ids = new Set(s.companion.alerts.map((a) => a.id));
    for (const id of this.memory.keys()) if (!ids.has(id)) this.memory.delete(id);
    const known = new Set(State.companion.watchlist.map((t) => t.key));
    const added = s.companion.watchlist.some((t) => !known.has(t.key));
    const chainsChanged = s.companion.chains.join() !== State.companion.chains.join();
    const knownWallets = new Set(State.companion.wallets.map((w) => w.address));
    const newWallets = s.companion.wallets.filter((w) => !knownWallets.has(w.address)).map((w) => w.address);
    const mineKey = (list: typeof s.companion.wallets) => list.filter((w) => w.mine).map((w) => w.address).join();
    const wasMine = new Set(State.companion.wallets.filter((w) => w.mine).map((w) => w.address));
    const nowMine = s.companion.wallets.filter((w) => w.mine && !wasMine.has(w.address)).map((w) => w.address);
    const mineChanged = mineKey(s.companion.wallets) !== mineKey(State.companion.wallets);
    // Following just turned on: read the followed wallets now.
    const followOn = s.companion.following && !State.companion.following;
    // The positions book is this window's: the settings window never edits it,
    // and its copy may be a poll behind.
    s.companion.book = State.companion.book;
    State.settings = s;
    if (mineChanged) this.updatePositions([], {});
    this.recomputeMood();
    State.notify();
    if (added || pollChanged || chainsChanged) void this.pollNow();
    if (chainsChanged) void this.refreshTrending(true);
    const toRead = [...new Set([...newWallets, ...nowMine])];
    if (followOn) void this.refreshWallets();
    else if (toRead.length) void this.refreshWallets(toRead);
  }

  setPaused(on: boolean) {
    if (State.paused === on) return;
    State.paused = on;
    this.recomputeMood();
    State.notify();
    if (!on) void this.pollNow();
  }
}

export const Companion = new CompanionController();
