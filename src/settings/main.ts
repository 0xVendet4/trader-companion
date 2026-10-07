// Settings window: watchlist, alerts, discipline rules, trading terminal,
// general preferences and a preview of every mascot expression.
// Every change is saved at once; Rust broadcasts it back to the island.

import "./settings.css";
import { describeRule } from "../alerts/alerts";
import { Bridge, IS_TAURI, onSettingsChanged } from "../core/bridge";
import { shortAddress } from "../core/format";
import { HOTKEY_CHOICES } from "../core/hotkey";
import { ISLAND_THEMES } from "../core/themes";
import { APP_NAME } from "../core/brand";
import { enableNotifications, notify } from "../core/notify";
import { parseShared, shareEntry, shareText } from "../core/share";
import {
  EDITION_NAME,
  MAX_WALLETS,
  MAX_WATCHLIST,
  OFFERED_COSTUMES,
  THEME_IDS,
  normalizeSettings,
  validRpcUrl,
  type Costume,
  type Face,
  type Outfit,
  type Placement,
  type Settings,
  type Skin,
  type Terminal,
  type Theme,
} from "../core/state";
import { isAddress } from "../wallets/wallets";
import { ALL_CHAINS, CHAINS, isChain, tokenKey, type ChainId } from "../market/chains";
import { parseInput, resolveAddress } from "../market/dexscreener";
import { AXIOM_REFERRAL_URL, RPC_KEY_SITES, TERMINALS } from "../market/links";
import { MASCOT_STATES, Mascot, accessory, dressed, loadManifest, type Manifest } from "../mascot/mascot";
import { BASE_HUE, DEFAULT_CUSTOM_SKIN, customSwatch, skinFilter } from "../mascot/skins";
import { parseLevels } from "../positions/positions";
import { MAX_FOLDERS, MAX_FOLDER_NAME, cleanFolderName } from "../market/folders";
import { seasonKey } from "../mascot/seasons";
import { clear, h, svg } from "../views/dom";
import { ICONS } from "../views/icons";

let settings: Settings = normalizeSettings(null);

function save() {
  void Bridge.saveSettings(settings);
}

// ── Small controls ────────────────────────────────────────────────────────────

function section(title: string, hint: string | null, ...children: (Node | null)[]): HTMLElement {
  return h(
    "section",
    {},
    h("h2", { text: title }),
    hint ? h("p", { class: "hint", text: hint }) : null,
    ...children,
  );
}

function row(label: string, control: Node, hint?: string): HTMLElement {
  return h(
    "label",
    { class: "row" },
    h("span", { class: "label" }, label, hint ? h("small", { text: hint }) : null),
    control,
  );
}

function toggle(get: () => boolean, set: (v: boolean) => void): HTMLElement {
  const el = h("button", { class: "toggle", type: "button" }, h("i"));
  const paint = () => el.classList.toggle("on", get());
  el.addEventListener("click", (e) => {
    e.preventDefault();
    set(!get());
    paint();
    save();
  });
  paint();
  refreshers.push(paint);
  return el;
}

function number(get: () => number, set: (v: number) => void, min: number, max: number, step = 1): HTMLInputElement {
  const el = h("input", { class: "field num", type: "number", min, max, step }) as HTMLInputElement;
  const paint = () => {
    if (document.activeElement !== el) el.value = String(get());
  };
  el.addEventListener("change", () => {
    const v = Math.min(max, Math.max(min, Number(el.value.replace(",", ".")) || 0));
    set(v);
    el.value = String(v);
    save();
  });
  paint();
  refreshers.push(paint);
  return el;
}

function select<T extends string | number>(
  options: [T, string][],
  get: () => T,
  set: (v: T) => void,
): HTMLSelectElement {
  const el = h("select", { class: "field" }) as HTMLSelectElement;
  for (const [v, label] of options) el.append(h("option", { value: String(v), text: label }));
  const paint = () => (el.value = String(get()));
  el.addEventListener("change", () => {
    const opt = options.find(([v]) => String(v) === el.value);
    if (opt) set(opt[0]);
    save();
  });
  paint();
  refreshers.push(paint);
  return el;
}

/** Repaints every control after settings arrive from the island. */
const refreshers: (() => void)[] = [];

// ── Watchlist ─────────────────────────────────────────────────────────────────

function watchlistSection(): HTMLElement {
  const list = h("div", { class: "list" });
  const input = h("input", { class: "field grow", placeholder: "Token address (CA) or a GMGN / Axiom / DexScreener / explorer link" }) as HTMLInputElement;
  const note = h("span", { class: "note" });
  const add = h("button", { class: "btn", type: "button", text: "Add" }) as HTMLButtonElement;

  async function submit() {
    const text = input.value.trim();
    if (!text) return;
    if (settings.companion.watchlist.length >= MAX_WATCHLIST) {
      note.textContent = `${MAX_WATCHLIST} tokens max.`;
      return;
    }
    add.disabled = true;
    note.className = "note";
    note.textContent = "Looking it up…";
    try {
      const parsed = parseInput(text);
      // Searching by name lives in the island, where results can be compared.
      if (parsed.kind === "query") throw new Error("Paste an address or link here. To search by name, use the field in the island's Watchlist.");
      const token = await resolveAddress(parsed, settings.companion.chains);
      if (!token) throw new Error("Couldn't find that token on DexScreener.");
      if (settings.companion.watchlist.some((t) => t.key === token.key)) {
        throw new Error(`${token.symbol} is already on the list.`);
      }
      settings.companion.watchlist.push(token);
      save();
      input.value = "";
      note.className = "note ok";
      note.textContent = `${token.symbol} added.`;
      paint();
    } catch (err) {
      note.className = "note err";
      note.textContent = String(err instanceof Error ? err.message : err);
    }
    add.disabled = false;
  }
  add.addEventListener("click", () => void submit());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void submit();
  });

  function paint() {
    clear(list);
    const tokens = settings.companion.watchlist;
    if (tokens.length === 0) list.append(h("p", { class: "empty", text: "No tokens yet." }));
    tokens.forEach((t, i) => {
      const up = h("button", { class: "icon", title: "Move up", type: "button", disabled: i === 0 }, svg(ICONS.chevronLeft, 12, { stroke: 2.2 }));
      up.style.transform = "rotate(90deg)";
      up.addEventListener("click", () => {
        tokens.splice(i - 1, 0, tokens.splice(i, 1)[0]);
        save();
        paint();
      });
      const remove = h("button", { class: "icon", title: "Remove", type: "button" }, svg(ICONS.xmark, 12));
      remove.addEventListener("click", () => {
        settings.companion.watchlist = tokens.filter((x) => x.key !== t.key);
        settings.companion.alerts = settings.companion.alerts.filter((a) => a.address !== t.key);
        save();
        paint();
        paintAlerts();
      });
      list.append(
        h(
          "div",
          { class: "item" },
          t.imageUrl ? h("img", { class: "tok", src: t.imageUrl, alt: "" }) : h("span", { class: "tok" }),
          h("b", { text: t.symbol }),
          h("span", { class: "chain-tag", text: CHAINS[t.chainId].tag, title: CHAINS[t.chainId].label, style: `--chain:${CHAINS[t.chainId].color}` }),
          h("span", { class: "muted grow", text: t.name }),
          h("code", { text: shortAddress(t.address), title: t.address }),
          up,
          remove,
        ),
      );
    });
  }
  paint();
  refreshers.push(paint);

  return section(
    "Watchlist",
    "Tokens the mascot watches, on any of its chains. The order here is the order on the island.",
    list,
    h("div", { class: "add" }, input, add),
    note,
    h("p", { class: "sub", text: "Folders (pick one on the island; move a token with the folder button on its row)" }),
    foldersEditor(),
  );
}

/** Rename or delete the watchlist's folders, or add one. */
function foldersEditor(): HTMLElement {
  const box = h("div", { class: "list" });
  const note = h("span", { class: "note err" });
  const paint = () => {
    clear(box);
    const c = settings.companion;
    for (const name of c.folders) {
      const field = h("input", { class: "field", value: name, maxlength: String(MAX_FOLDER_NAME), style: "width:160px" }) as HTMLInputElement;
      field.addEventListener("change", () => {
        if (!c.folders.includes(name)) return; // a field from before the last redraw
        const next = cleanFolderName(field.value, c.folders.filter((f) => f !== name));
        if (!next) {
          note.textContent = "Pick another name.";
          field.value = name;
          return;
        }
        note.textContent = "";
        c.folders = c.folders.map((f) => (f === name ? next : f));
        for (const t of c.watchlist) if (t.folder === name) t.folder = next;
        if (c.activeFolder === name) c.activeFolder = next;
        save();
        paint();
      });
      const count = c.watchlist.filter((t) => t.folder === name).length;
      const remove = h("button", { class: "icon", title: "Delete the folder (its tokens stay, under All)", type: "button" }, svg(ICONS.trash, 12, { stroke: 2 }));
      remove.addEventListener("click", () => {
        c.folders = c.folders.filter((f) => f !== name);
        for (const t of c.watchlist) if (t.folder === name) t.folder = undefined;
        if (c.activeFolder === name) c.activeFolder = "";
        save();
        paint();
      });
      box.append(h("div", { class: "item" }, field, h("span", { class: "grow dim", text: `${count} token${count === 1 ? "" : "s"}` }), remove));
    }
    const add = h("button", { class: "btn", type: "button", text: "New folder" }) as HTMLButtonElement;
    add.disabled = c.folders.length >= MAX_FOLDERS;
    add.addEventListener("click", () => {
      let n = c.folders.length + 1;
      while (c.folders.includes(`Folder ${n}`)) n++;
      c.folders.push(`Folder ${n}`);
      save();
      paint();
    });
    box.append(h("div", { class: "add" }, add), note);
  };
  paint();
  refreshers.push(paint);
  return box;
}

// ── Alerts ────────────────────────────────────────────────────────────────────

let paintAlerts = () => {};

function alertsSection(): HTMLElement {
  const list = h("div", { class: "list" });
  paintAlerts = () => {
    clear(list);
    const rules = settings.companion.alerts;
    if (rules.length === 0) {
      list.append(h("p", { class: "empty", text: "No alerts. Create them from the island's Alerts tab, or with the bell on a token." }));
    }
    for (const rule of rules) {
      const token = settings.companion.watchlist.find((t) => t.key === rule.address);
      const tg = h("button", { class: `toggle ${rule.enabled ? "on" : ""}`, type: "button" }, h("i"));
      tg.addEventListener("click", () => {
        rule.enabled = !rule.enabled;
        save();
        paintAlerts();
      });
      const del = h("button", { class: "icon", title: "Delete", type: "button" }, svg(ICONS.trash, 12, { stroke: 2 }));
      del.addEventListener("click", () => {
        settings.companion.alerts = rules.filter((r) => r.id !== rule.id);
        save();
        paintAlerts();
      });
      list.append(
        h(
          "div",
          { class: `item ${rule.enabled ? "" : "off"}` },
          h("b", { text: token?.symbol ?? "?" }),
          h("span", { class: "muted grow", text: describeRule(rule) }),
          tg,
          del,
        ),
      );
    }
  };
  paintAlerts();
  refreshers.push(() => paintAlerts());
  return section(
    "Alerts",
    "They fire when the condition becomes true, and re-arm once it stops being true.",
    list,
  );
}

// ── Discipline ────────────────────────────────────────────────────────────────

function disciplineSection(): HTMLElement {
  const d = () => settings.companion.discipline;
  return section(
    "Discipline",
    "Your rules. The mascot only reminds you. Use 0 to turn any of them off.",
    row("Break every", h("span", { class: "with-unit" }, number(() => d().breakEveryMin, (v) => (d().breakEveryMin = v), 0, 600, 5), "min")),
    row(
      "Daily loss limit",
      h(
        "span",
        { class: "with-unit" },
        number(() => d().dailyLossLimit, (v) => (d().dailyLossLimit = v), 0, 1_000_000, 0.1),
        select<"SOL" | "USD">([["SOL", "SOL"], ["USD", "USD"]], () => d().unit, (v) => (d().unit = v)),
      ),
      "When you hit it, the mascot asks you to call it a day.",
    ),
    row("Max trades per day", number(() => d().maxTradesPerDay, (v) => (d().maxTradesPerDay = v), 0, 500)),
    row("Cooldown after a loss", h("span", { class: "with-unit" }, number(() => d().cooldownMin, (v) => (d().cooldownMin = v), 0, 240), "min")),
    row(
      "Count my wallet's trades",
      toggle(() => settings.companion.autoJournal, (v) => (settings.companion.autoJournal = v)),
      "With your wallet set, today's trades follow it by themselves: a part sold adds its profit, a closed position is a trade (and a journal line), and both count for these rules.",
    ),
  );
}

// ── Terminal, data, general ───────────────────────────────────────────────────

function terminalSection(): HTMLElement {
  const group = h("div", { class: "choices" });
  // Axiom takes an invite only when an account is made: offered here, never opened on its own.
  const axiomInvite = h(
    "p",
    { class: "hint invite" },
    "New to Axiom? ",
    h("a", { class: "link", href: AXIOM_REFERRAL_URL, text: "Sign up with the developer's referral", onclick: (e: Event) => {
      e.preventDefault();
      void Bridge.openUrl(AXIOM_REFERRAL_URL);
    } }),
    ".",
  );
  const paint = () => {
    axiomInvite.style.display = settings.companion.terminal === "axiom" ? "" : "none";
    clear(group);
    for (const [id, t] of Object.entries(TERMINALS) as [Terminal, (typeof TERMINALS)[Terminal]][]) {
      const b = h("button", { class: `choice ${settings.companion.terminal === id ? "on" : ""}`, type: "button", text: t.label });
      b.addEventListener("click", () => {
        settings.companion.terminal = id;
        save();
        paint();
      });
      group.append(b);
    }
  };
  paint();
  refreshers.push(paint);
  return section("Terminal", "Where a token opens when you click it. GMGN links carry the developer's referral code.", group, axiomInvite);
}

function generalSection(): HTMLElement {
  const volume = h("input", { type: "range", min: 0, max: 0.2, step: 0.01, class: "range" }) as HTMLInputElement;
  const paintVolume = () => (volume.value = String(settings.soundVolume));
  volume.addEventListener("input", () => {
    settings.soundVolume = Number(volume.value);
  });
  volume.addEventListener("change", save);
  paintVolume();
  refreshers.push(paintVolume);

  return section(
    "General",
    null,
    row(
      "Island position",
      select<Placement>(
        [
          ["top", "Top of the screen"],
          ["left", "Left edge"],
          ["right", "Right edge"],
          ["float", "Floating (drag it anywhere)"],
        ],
        () => settings.placement,
        (v) => (settings.placement = v),
      ),
      "Floating: drag the ticker where you want it; it stays on screen.",
    ),
    row("Refresh prices every", select<number>([[10, "10 s"], [15, "15 s"], [20, "20 s"], [30, "30 s"], [60, "1 min"]], () => settings.companion.pollSeconds, (v) => (settings.companion.pollSeconds = v))),
    row("Keep the ticker on screen", toggle(() => settings.companion.keepTickerVisible, (v) => (settings.companion.keepTickerVisible = v)), "When off, the island hides after a minute and comes back when the mouse touches its edge of the screen. Hold Ctrl over the island to click what is behind it."),
    row("Close the island after", select<number>([[8, "8 s"], [15, "15 s"], [30, "30 s"], [60, "1 min"]], () => settings.autoCloseInterval, (v) => (settings.autoCloseInterval = v))),
    row("Sounds", toggle(() => settings.soundEnabled, (v) => (settings.soundEnabled = v))),
    row("Volume", volume),
    row("Screen", select<"primary" | "cursor">([["primary", "Main screen"], ["cursor", "Where the mouse is"]], () => settings.screen, (v) => (settings.screen = v))),
    row("Start with Windows", toggle(() => settings.autostart, (v) => (settings.autostart = v))),
    rpcRow(),
    rpcKeySites(),
  );
}

/**
 * The trader's own Solana RPC (Alchemy, Helius, QuickNode…), for the wallets:
 * faster and rarely busy, unlike the shared public one. A password field, so
 * the key in the URL stays out of screenshots.
 */
function rpcRow(): HTMLElement {
  const input = h("input", {
    class: "field grow",
    type: "password",
    placeholder: "Public RPC — or paste your own https URL",
    spellcheck: "false",
    autocomplete: "off",
  }) as HTMLInputElement;
  const note = h("span", { class: "note" });
  const paint = () => {
    if (document.activeElement !== input) input.value = settings.rpcUrl;
  };
  input.addEventListener("change", () => {
    const v = input.value.trim();
    if (!validRpcUrl(v)) {
      note.className = "note err";
      note.textContent = "Needs an https URL, like https://solana-mainnet.g.alchemy.com/v2/your-key";
      return;
    }
    settings.rpcUrl = v;
    input.value = v;
    note.className = "note ok";
    note.textContent = v ? "Saved: wallets are read through your RPC." : "Back to the public RPC.";
    window.setTimeout(() => (note.textContent = ""), 3500);
    save();
  });
  paint();
  refreshers.push(paint);
  return row(
    "Solana RPC",
    h("span", { class: "rpc-field" }, input, note),
    "Optional. Your wallets are read from Solana's public RPC, which is shared and often busy. A free key from Helius, Alchemy or QuickNode is faster: paste its https URL. Only read-only calls go to it, and it stays on this PC.",
  );
}

/** Where to get a free key, under the RPC field. */
function rpcKeySites(): HTMLElement {
  const links = RPC_KEY_SITES.flatMap((site, i) => [
    i ? " or " : "",
    h("a", { class: "link", href: site.url, text: site.label, onclick: (e: Event) => {
      e.preventDefault();
      void Bridge.openUrl(site.url);
    } }),
  ]);
  return h("p", { class: "hint invite" }, "No key yet? Make one for free on ", ...links, " (Solana mainnet), then paste its https URL above.");
}

// ── Wallets: yours, and the ones you follow ───────────────────────────────────

/**
 * One list of wallets: the trader's own (`mine`: buys and sells recorded, with
 * profit) or other people's (alerts when they buy or sell, nothing else).
 */
function walletList(mine: boolean): { list: HTMLElement; add: HTMLElement; note: HTMLElement } {
  const list = h("div", { class: "list" });
  const address = h("input", { class: "field grow", placeholder: mine ? "Your wallet address (public)" : "Wallet address to follow (public)" }) as HTMLInputElement;
  const label = h("input", { class: "field", placeholder: "Name", style: "width:120px" }) as HTMLInputElement;
  const addBtn = h("button", { class: "btn", type: "button", text: mine ? "Add" : "Follow" }) as HTMLButtonElement;
  const note = h("span", { class: "note" });

  addBtn.addEventListener("click", () => {
    const a = address.value.trim();
    const wallets = settings.companion.wallets;
    note.className = "note err";
    if (!isAddress(a)) return void (note.textContent = "That doesn't look like a Solana address.");
    const known = wallets.find((w) => w.address === a);
    if (known && known.mine === mine) return void (note.textContent = mine ? "That's already your wallet." : "Already following that wallet.");
    if (known) {
      // The same address can't be both: it moves to this list.
      known.mine = mine;
    } else {
      if (wallets.length >= MAX_WALLETS) return void (note.textContent = `${MAX_WALLETS} wallets max.`);
      const same = wallets.filter((w) => w.mine === mine).length;
      const name = label.value.trim().slice(0, 24) || (mine ? (same ? `My wallet ${same + 1}` : "My wallet") : `Wallet ${same + 1}`);
      wallets.push({ address: a, label: name, mine, baselineUsd: null, addedAt: Date.now() });
    }
    save();
    address.value = "";
    label.value = "";
    note.className = "note ok";
    note.textContent = known ? (mine ? "Moved from Following." : "Moved from your wallets.") : mine ? "Added." : "Following.";
    for (const fn of refreshers) fn();
  });

  function paint() {
    clear(list);
    const wallets = settings.companion.wallets.filter((w) => w.mine === mine);
    if (wallets.length === 0) list.append(h("p", { class: "empty", text: mine ? "No wallet yet." : "Not following anyone." }));
    for (const w of wallets) {
      const name = h("input", { class: "field", value: w.label, style: "width:140px" }) as HTMLInputElement;
      name.addEventListener("change", () => {
        if (name.value.trim()) w.label = name.value.trim().slice(0, 24);
        save();
      });
      const remove = h("button", { class: "icon", title: mine ? "Remove" : "Stop following", type: "button" }, svg(ICONS.trash, 12, { stroke: 2 }));
      remove.addEventListener("click", () => {
        settings.companion.wallets = settings.companion.wallets.filter((x) => x.address !== w.address);
        save();
        for (const fn of refreshers) fn();
      });
      list.append(h("div", { class: "item" }, name, h("code", { class: "grow", text: shortAddress(w.address), title: w.address }), remove));
    }
  }
  paint();
  refreshers.push(paint);
  return { list, add: h("div", { class: "add" }, address, label, addBtn), note };
}

function myWalletSection(): HTMLElement {
  const { list, add, note } = walletList(true);

  // Alerts on your own positions (the My wallet tab).
  const levelField = (kind: "up" | "down") => {
    const el = h("input", { class: "field", style: "width:150px" }) as HTMLInputElement;
    const paintField = () => {
      const a = settings.companion.positionAlerts;
      el.value = kind === "up" ? a.ups.map((m) => `${m}x`).join(", ") : a.downs.map((d) => `${d}%`).join(", ");
    };
    el.addEventListener("change", () => {
      const a = settings.companion.positionAlerts;
      const parsed = parseLevels(el.value, kind);
      if (kind === "up") a.ups = parsed;
      else a.downs = parsed;
      save();
      paintField();
    });
    paintField();
    refreshers.push(paintField);
    return el;
  };

  return section(
    "My wallet",
    "Your own wallet, by its public address: its buys and sells are recorded, with the profit of every token (the My wallet tab), and closed trades go into your journal. Never paste a seed phrase or private key: no real app asks for one.",
    list,
    add,
    note,
    row("Position alerts", toggle(() => settings.companion.positionAlerts.enabled, (v) => (settings.companion.positionAlerts.enabled = v)), "When a token in your wallet reaches a level from its entry."),
    row("Up, as multiples", levelField("up"), "e.g. 2x, 3x, 5x, 10x"),
    row("Down, in %", levelField("down"), "e.g. -30%, -50%"),
  );
}

function followingSection(): HTMLElement {
  const { list, add, note } = walletList(false);
  const body = h("div", {}, list, add, note);
  const paintBody = () => (body.style.display = settings.companion.following ? "" : "none");
  paintBody();
  refreshers.push(paintBody);
  return section(
    "Following",
    "Other people's wallets, for an alert when they buy or sell. Off by default: they are checked once a minute on Solana's shared public RPC, so alerts come up to a minute late, and every wallet adds three calls a minute.",
    row(
      "Follow other wallets",
      toggle(
        () => settings.companion.following,
        (v) => {
          settings.companion.following = v;
          paintBody();
        },
      ),
      "Shows the Following tab on the island.",
    ),
    body,
  );
}

// ── Chains ────────────────────────────────────────────────────────────────────

function chainsSection(): HTMLElement {
  const group = h("div", { class: "choices" });
  const paint = () => {
    clear(group);
    const cur = settings.companion.chains;
    const all = h("button", { class: `choice ${cur.length === ALL_CHAINS.length ? "on" : ""}`, type: "button", text: "All" });
    all.addEventListener("click", () => {
      settings.companion.chains = [...ALL_CHAINS];
      save();
      paint();
    });
    group.append(all);
    for (const id of ALL_CHAINS) {
      const on = cur.includes(id);
      const b = h("button", { class: `choice ${on ? "on" : ""}`, type: "button" }, h("i", { class: "chain-dot", style: `background:${CHAINS[id].color}` }), CHAINS[id].label);
      b.addEventListener("click", () => {
        if (on && cur.length === 1) return; // at least one chain
        settings.companion.chains = on ? cur.filter((c) => c !== id) : ALL_CHAINS.filter((c) => c === id || cur.includes(c));
        save();
        paint();
      });
      group.append(b);
    }
  };
  paint();
  refreshers.push(paint);
  return section(
    "Chains",
    "What search, trending and the header prices cover. One, several or all. Tokens added by address work on any of them.",
    group,
  );
}

// ── Appearance ────────────────────────────────────────────────────────────────

const THEMES: [Theme, string][] = THEME_IDS.map((id) => [id, ISLAND_THEMES[id].name]);

const OUTFITS: [Outfit, string][] = [
  ["none", "None"],
  ["cap", "Cap"],
  ["crown", "Crown"],
  ["party", "Party hat"],
  ["headphones", "Headphones"],
  ["tophat", "Top hat"],
  ["cowboy", "Cowboy"],
  ["beanie", "Beanie"],
  ["halo", "Halo"],
  ["horns", "Horns"],
  ["wizard", "Wizard"],
  ["viking", "Viking"],
  ["bow", "Bow"],
  ["chef", "Chef"],
  ["pirate", "Pirate"],
  ["santa", "Santa"],
  ["grad", "Grad cap"],
  ["beret", "Beret"],
  ["propeller", "Propeller"],
  ["flowers", "Flower crown"],
  ["bunny", "Bunny ears"],
  ["pumpkin", "Pumpkin"],
  ["catears", "Cat ears"],
  ["rocket", "Rocket"],
];

const FACES: [Face, string][] = [
  ["none", "None"],
  ["shades", "Shades"],
  ["laser", "Laser eyes"],
  ["glasses", "Glasses"],
  ["monocle", "Monocle"],
  ["mustache", "Mustache"],
  ["starglasses", "Star glasses"],
  ["threed", "3D glasses"],
  ["eyepatch", "Eye patch"],
  ["heartglasses", "Heart glasses"],
  ["clownnose", "Clown nose"],
  ["beard", "Beard"],
  ["domino", "Hero mask"],
  ["vr", "VR headset"],
  ["pixel", "Pixel shades"],
  ["goggles", "Goggles"],
  ["whiskers", "Whiskers"],
  ["freckles", "Freckles"],
  ["bandaid", "Band-aid"],
  ["lollipop", "Lollipop"],
  ["bubblegum", "Bubble gum"],
  ["warpaint", "War paint"],
  ["dollareyes", "Dollar eyes"],
  ["facemask", "Face mask"],
];

/** "none" is Candy itself. Only the costumes this build offers are shown (see OFFERED_COSTUMES). */
const COSTUMES: [Costume, string][] = [
  ["none", "Candy"],
  ["gengar", "Gengar"],
  ["spiderman", "Spiderman"],
  ["shadow", "Shadow"],
  ["v", "V"],
  ["edition", EDITION_NAME],
];

const SKINS: [Skin, string][] = [
  ["mint", "Mint"],
  ["neon", "Neon"],
  ["forest", "Forest"],
  ["lime", "Lime"],
  ["lemon", "Lemon"],
  ["gold", "Gold"],
  ["sunset", "Sunset"],
  ["peach", "Peach"],
  ["cherry", "Cherry"],
  ["ruby", "Ruby"],
  ["rose", "Rose"],
  ["magenta", "Magenta"],
  ["grape", "Grape"],
  ["lavender", "Lavender"],
  ["violet", "Violet"],
  ["teal", "Teal"],
  ["sky", "Sky"],
  ["ice", "Ice"],
  ["ocean", "Ocean"],
  ["navy", "Navy"],
  ["ghost", "Ghost"],
  ["slate", "Slate"],
  ["charcoal", "Charcoal"],
  ["custom", "Custom"],
];

function appearanceSection(manifest: Manifest): HTMLElement {
  const themes = h("div", { class: "choices" });
  const skins = h("div", { class: "outfits" });
  const outfits = h("div", { class: "outfits" });
  const faces = h("div", { class: "outfits" });
  const costumes = h("div", { class: "outfits" });
  /** Previews that follow the current colour, retinted live by the sliders. */
  let tinted: Mascot[] = [];
  let customPreview: Mascot | null = null;

  /** A little Candy wearing a hat, a face accessory and a colour, or a costume (which keeps its own colours). */
  const preview = (outfit: Outfit, face: Face, skin: Skin, costume: Costume = settings.companion.costume) => {
    const m = new Mascot("mascot preview");
    // Still: a hundred of these are drawn again on every pick, and a running
    // one would keep animating after it left the page.
    m.setActive(false);
    m.use(dressed(manifest, costume), false);
    m.setMood("idle");
    m.setFilter(costume === "none" ? skinFilter(skin, settings.companion.customSkin) : "none");
    m.setOutfit(accessory(manifest, "outfits", outfit));
    m.setFace(accessory(manifest, "faces", face));
    return m;
  };

  // The free colour: hue, saturation and brightness over the art.
  const slider = (key: "hue" | "sat" | "light", min: number, max: number) => {
    const el = h("input", { type: "range", min, max, step: 1, class: "range" }) as HTMLInputElement;
    el.addEventListener("input", () => {
      const c = settings.companion;
      c.customSkin = { ...c.customSkin, [key]: Number(el.value) };
      // A colour is Candy's: sliding takes a costume off.
      if (c.skin !== "custom" || c.costume !== "none") {
        c.skin = "custom";
        c.costume = "none";
        paint();
        return;
      }
      for (const m of tinted) m.setSkin("custom", c.customSkin);
      customPreview?.setSkin("custom", c.customSkin);
      paintSliders();
    });
    el.addEventListener("change", save);
    return el;
  };
  const hue = slider("hue", -180, 180);
  const sat = slider("sat", 0, 250);
  const light = slider("light", 60, 140);
  // The hue track shows the colours it leads to.
  const stops = [];
  for (let d = -180; d <= 180; d += 30) stops.push(`hsl(${(((BASE_HUE + d) % 360) + 360) % 360} 70% 50%)`);
  hue.classList.add("hue");
  hue.style.background = `linear-gradient(to right, ${stops.join(", ")})`;
  const swatch = h("i", { class: "skin-swatch" });
  const reset = h("button", { class: "btn ghost", type: "button", text: "Reset" });
  reset.addEventListener("click", () => {
    settings.companion.customSkin = { ...DEFAULT_CUSTOM_SKIN };
    save();
    paint();
  });
  const custom = h(
    "div",
    { class: "custom-skin" },
    row("Hue", hue),
    row("Saturation", sat),
    row("Brightness", light),
    h("div", { class: "custom-foot" }, swatch, h("span", { class: "hint", text: "Pick Custom, then slide. The face still shows the mood." }), reset),
  );
  const paintSliders = () => {
    const c = settings.companion.customSkin;
    hue.value = String(c.hue);
    sat.value = String(c.sat);
    light.value = String(c.light);
    swatch.style.background = customSwatch(c);
  };

  const paint = () => {
    const c = settings.companion;
    tinted = [];
    customPreview = null;
    clear(themes);
    for (const [id, label] of THEMES) {
      const swatch = h("i", { class: "swatch" });
      swatch.style.background = ISLAND_THEMES[id].background;
      if (ISLAND_THEMES[id].ring) swatch.style.boxShadow = ISLAND_THEMES[id].ring!;
      const b = h("button", { class: `choice ${c.theme === id ? "on" : ""}`, type: "button" }, swatch, label);
      b.addEventListener("click", () => {
        c.theme = id;
        save();
        paint();
      });
      themes.append(b);
    }
    clear(skins);
    for (const [id, label] of SKINS) {
      const m = preview(c.outfit, c.face, id, "none");
      if (id === "custom") customPreview = m;
      const b = h("button", { class: `outfit ${c.costume === "none" && c.skin === id ? "on" : ""}`, type: "button" }, m.el, h("span", { text: label }));
      b.addEventListener("click", () => {
        c.skin = id;
        c.costume = "none";
        save();
        paint();
      });
      skins.append(b);
    }
    const grid = (el: HTMLElement, items: [string, string][], current: string, make: (id: string) => Mascot, pick: (id: string) => void, retint = true) => {
      clear(el);
      for (const [id, label] of items) {
        const m = make(id);
        if (retint) tinted.push(m);
        const b = h("button", { class: `outfit ${current === id ? "on" : ""}`, type: "button" }, m.el, h("span", { text: label }));
        b.addEventListener("click", () => {
          pick(id);
          save();
          paint();
        });
        el.append(b);
      }
    };
    // A look picked during a season wins until the season ends.
    const ownPick = () => (c.seasonOff = seasonKey(new Date()) ?? c.seasonOff);
    grid(outfits, OUTFITS, c.outfit, (id) => preview(id as Outfit, c.face, c.skin), (id) => {
      c.outfit = id as Outfit;
      ownPick();
    });
    grid(faces, FACES, c.face, (id) => preview(c.outfit, id as Face, c.skin), (id) => {
      c.face = id as Face;
      ownPick();
    });
    grid(
      costumes,
      COSTUMES.filter(([id]) => OFFERED_COSTUMES.includes(id)),
      c.costume,
      (id) => preview(c.outfit, c.face, c.skin, id as Costume),
      (id) => (c.costume = id as Costume),
      false,
    );
    custom.classList.toggle("off", c.skin !== "custom" || c.costume !== "none");
    paintSliders();
  };
  paint();
  refreshers.push(paint);

  return section(
    "Appearance",
    null,
    h("p", { class: "sub", text: "Island theme" }),
    themes,
    h("p", { class: "sub", text: "Colour (tints every mood but a loss: like a candle, Candy goes red then)" }),
    skins,
    custom,
    h("p", { class: "sub", text: "Hat" }),
    outfits,
    h("p", { class: "sub", text: "Face" }),
    faces,
    h("p", { class: "sub", text: "Costume (redraws the whole mascot, every mood included; it keeps its own colours)" }),
    costumes,
    row("BTC and Fear & Greed", toggle(() => settings.companion.headerMarket, (v) => (settings.companion.headerMarket = v)), "In the island's header, next to your chains' coins."),
    row("Seasonal looks", toggle(() => settings.companion.seasonal, (v) => (settings.companion.seasonal = v)), "A Santa hat in December, a pumpkin at Halloween, a party hat at New Year, heart glasses on Valentine's Day. Your own look comes back after."),
    row("Lively", toggle(() => settings.companion.lively, (v) => (settings.companion.lively = v)), "Candy's eyes follow your mouse, and it fidgets now and then."),
    row("Doze off late at night", toggle(() => settings.companion.nightSleep, (v) => (settings.companion.nightSleep = v)), "From 1 to 6 am the mascot sleeps, unless something big moves."),
    row("React to SOL", toggle(() => settings.companion.reactToSol, (v) => (settings.companion.reactToSol = v)), "Happy or worried when SOL moves 3% in an hour."),
  );
}

// ── Notifications and shortcut ────────────────────────────────────────────────

function notificationsSection(): HTMLElement {
  const note = h("span", { class: "note" });
  const tg = h("button", { class: "toggle", type: "button" }, h("i"));
  const paint = () => tg.classList.toggle("on", settings.companion.notifications);
  tg.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!settings.companion.notifications) {
      const ok = await enableNotifications();
      if (!ok) {
        note.className = "note err";
        note.textContent = "Notifications are blocked. Allow them for this app in your system or browser settings.";
        return;
      }
    }
    settings.companion.notifications = !settings.companion.notifications;
    note.textContent = "";
    save();
    paint();
  });
  paint();
  refreshers.push(paint);

  const test = h("button", { class: "chip-btn", type: "button", text: "Send a test" });
  test.addEventListener("click", async () => {
    if (await enableNotifications()) void notify(APP_NAME, "Notifications work. Alerts will show up like this.");
  });

  return section(
    "Notifications and shortcut",
    null,
    row(
      "System notifications for alerts",
      h("span", { class: "with-unit" }, test, tg),
      IS_TAURI ? "Windows notifications reach you even over a fullscreen game or video." : "Browser notifications, while this page is open.",
    ),
    note,
    row(
      "Show / hide the island",
      select<string>(HOTKEY_CHOICES, () => settings.companion.hotkey, (v) => (settings.companion.hotkey = v)),
      IS_TAURI ? "Works from any app." : "In the browser it only works while the page has focus.",
    ),
  );
}

// ── Share and import ──────────────────────────────────────────────────────────

function shareSection(): HTMLElement {
  const note = h("span", { class: "note" });
  const copy = h("button", { class: "btn", type: "button", text: "Copy token list" });
  copy.addEventListener("click", async () => {
    const entries = settings.companion.watchlist.map(shareEntry);
    note.className = "note err";
    if (!entries.length) return void (note.textContent = "Your watchlist is empty.");
    const ok = await Bridge.copy(shareText(entries));
    note.className = ok ? "note ok" : "note err";
    note.textContent = ok ? "Copied. Anyone with Candy can paste it into Import." : "Couldn't copy.";
  });

  const input = h("input", { class: "field grow", placeholder: "Paste a token list (or addresses)" }) as HTMLInputElement;
  const load = h("button", { class: "btn", type: "button", text: "Import" }) as HTMLButtonElement;
  load.addEventListener("click", async () => {
    const entries = parseShared(input.value);
    note.className = "note err";
    if (!entries.length) return void (note.textContent = "No token addresses in that.");
    load.disabled = true;
    note.className = "note";
    note.textContent = "Importing…";
    let added = 0;
    for (const entry of entries) {
      if (settings.companion.watchlist.length >= MAX_WATCHLIST) break;
      const [chainPart, address] = entry.includes(":") ? entry.split(":", 2) : ["solana", entry];
      const chainId: ChainId = isChain(chainPart) ? chainPart : "solana";
      if (settings.companion.watchlist.some((t) => t.key === tokenKey(chainId, address))) continue;
      try {
        const t = await resolveAddress({ kind: "address", address, chainId, isPool: false });
        if (t && !settings.companion.watchlist.some((x) => x.key === t.key)) {
          settings.companion.watchlist.push(t);
          added++;
        }
      } catch {
        /* skip what DexScreener doesn't know */
      }
    }
    save();
    load.disabled = false;
    input.value = "";
    note.className = "note ok";
    note.textContent = `${added} token${added === 1 ? "" : "s"} added.`;
    for (const fn of refreshers) fn();
  });

  return section(
    "Share",
    "A link carries only the token addresses of your watchlist, nothing else.",
    h("div", { class: "add" }, copy),
    h("div", { class: "add", style: "margin-top:8px" }, input, load),
    note,
  );
}

// ── Mascot preview ────────────────────────────────────────────────────────────

function mascotSection(manifest: Manifest): HTMLElement {
  const grid = h("div", { class: "gallery" });
  for (const state of MASCOT_STATES) {
    const m = new Mascot("mascot preview");
    m.use(manifest, false);
    m.setMood(state);
    grid.append(h("div", { class: "cell" }, m.el, h("span", { text: state })));
  }
  return section("Mascot", "Everything the mascot can feel.", grid);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function main() {
  const root = document.getElementById("settings-root");
  if (!root) return;
  const [boot, manifest] = await Promise.all([Bridge.boot(), loadManifest()]);
  settings = boot.settings;

  const page = h(
    "main",
    {},
    h("h1", { text: "Settings" }),
    watchlistSection(),
    alertsSection(),
    myWalletSection(),
    followingSection(),
    disciplineSection(),
    terminalSection(),
    chainsSection(),
    notificationsSection(),
    appearanceSection(manifest),
    shareSection(),
    generalSection(),
    mascotSection(manifest),
  );
  root.replaceChildren(page);

  await onSettingsChanged((s) => {
    // The app echoes every save back: the one this window just made changes
    // nothing, and keeping the same object keeps what is drawn pointing at it.
    if (JSON.stringify(s) === JSON.stringify(settings)) return;
    settings = s;
    for (const fn of refreshers) fn();
  });
}

void main();
