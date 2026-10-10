// Settings window: watchlist, alerts, discipline rules, trading terminal,
// general preferences and a preview of every mascot expression.
// Every change is saved at once; Rust broadcasts it back to the island.

import "./settings.css";
import { describeRule } from "../alerts/alerts";
import { Bridge, IS_TAURI, emitToWindow, onEvent, onSettingsChanged } from "../core/bridge";
import { SOUND_NAMES, Sound, soundFile, type SoundName } from "../core/sound";
import { shortAddress } from "../core/format";
import { SHORTCUTS, keysLabel, recordPress, shortcutKeys, statusLabel, twice, type ShortcutId, type ShortcutStatus } from "../core/shortcuts";
import { ISLAND_THEMES } from "../core/themes";
import { APP_NAME } from "../core/brand";
import { enableNotifications, notify } from "../core/notify";
import { parseShared, shareEntry, shareText } from "../core/share";
import {
  EDITION_NAME,
  MAX_WALLETS,
  MAX_WATCHLIST,
  OFFERED_COSTUMES,
  State,
  THEME_IDS,
  VOLUME_ALERT_CHOICES,
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
import { majorFor } from "../market/majors";
import { AXIOM_REFERRAL_URL, RPC_KEY_SITES, TERMINALS } from "../market/links";
import { MASCOT_STATES, Mascot, accessory, dressed, loadManifest, type Manifest } from "../mascot/mascot";
import { BASE_HUE, DEFAULT_CUSTOM_SKIN, customSwatch, skinFilter } from "../mascot/skins";
import { parseLevels } from "../positions/positions";
import { MAX_FOLDERS, MAX_FOLDER_NAME, cleanFolderName } from "../market/folders";
import { CALENDAR_LEADS } from "../market/calendar";
import { LANGS, N_, devLang, pickLang, systemLangs, t, tn, useLang, type LangSetting } from "../core/i18n";
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
  const input = h("input", { class: "field grow", placeholder: t("Token address (CA) or a GMGN / Axiom / DexScreener / explorer link") }) as HTMLInputElement;
  const note = h("span", { class: "note" });
  const add = h("button", { class: "btn", type: "button", text: t("Add") }) as HTMLButtonElement;

  async function submit() {
    const text = input.value.trim();
    if (!text) return;
    if (settings.companion.watchlist.length >= MAX_WATCHLIST) {
      note.textContent = tn(MAX_WATCHLIST, "{n} token max.", "{n} tokens max.");
      return;
    }
    add.disabled = true;
    note.className = "note";
    note.textContent = t("Looking it up…");
    try {
      const parsed = parseInput(text);
      // Searching by name lives in the island, where results can be compared.
      if (parsed.kind === "query") throw new Error(t("Paste an address or link here. To search by name, use the field in the island's Watchlist."));
      const token = await resolveAddress(parsed, settings.companion.chains);
      if (!token) throw new Error(t("Couldn't find that token on DexScreener."));
      if (settings.companion.watchlist.some((tok) => tok.key === token.key)) {
        throw new Error(t("{symbol} is already on the list.", { symbol: token.symbol }));
      }
      settings.companion.watchlist.push(token);
      save();
      input.value = "";
      note.className = "note ok";
      note.textContent = t("{symbol} added.", { symbol: token.symbol });
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
    if (tokens.length === 0) list.append(h("p", { class: "empty", text: t("No tokens yet.") }));
    tokens.forEach((tok, i) => {
      const up = h("button", { class: "icon", title: t("Move up"), type: "button", disabled: i === 0 }, svg(ICONS.chevronLeft, 12, { stroke: 2.2 }));
      up.style.transform = "rotate(90deg)";
      up.addEventListener("click", () => {
        tokens.splice(i - 1, 0, tokens.splice(i, 1)[0]);
        save();
        paint();
      });
      const remove = h("button", { class: "icon", title: t("Remove"), type: "button" }, svg(ICONS.xmark, 12));
      remove.addEventListener("click", () => {
        settings.companion.watchlist = tokens.filter((x) => x.key !== tok.key);
        settings.companion.alerts = settings.companion.alerts.filter((a) => a.address !== tok.key);
        save();
        paint();
        paintAlerts();
      });
      // A picture that fails to load (gone, or a host the CSP refuses) leaves the plain dot.
      const pic = tok.imageUrl ? h("img", { class: "tok", src: tok.imageUrl, alt: "" }) : h("span", { class: "tok" });
      pic.addEventListener("error", () => pic.replaceWith(h("span", { class: "tok" })));
      list.append(
        h(
          "div",
          { class: "item" },
          pic,
          h("b", { text: tok.symbol }),
          majorFor(tok)
            ? h("span", {
                class: "chain-tag",
                text: t("MAJOR"),
                title: t("A major coin: priced from a token that tracks it on {chain}.", { chain: CHAINS[tok.chainId].label }),
                style: "--chain:#f5b301",
              })
            : h("span", { class: "chain-tag", text: CHAINS[tok.chainId].tag, title: CHAINS[tok.chainId].label, style: `--chain:${CHAINS[tok.chainId].color}` }),
          h("span", { class: "muted grow", text: tok.name }),
          h("code", { text: shortAddress(tok.address), title: tok.address }),
          up,
          remove,
        ),
      );
    });
  }
  paint();
  refreshers.push(paint);

  return section(
    t("Watchlist"),
    t("Tokens the mascot watches, on any of its chains. The order here is the order on the island."),
    list,
    h("div", { class: "add" }, input, add),
    note,
    row(
      t("Checklist when a token is added"),
      toggle(() => settings.companion.addChecklist, (v) => (settings.companion.addChecklist = v)),
      t("Candy goes over mint and freeze authority, locked liquidity, top holders, age and real liquidity, one by one, with what RugCheck and DexScreener say, and sums it up."),
    ),
    row(
      t("Mini charts against the chain's coin"),
      toggle(() => settings.companion.relativeStrength, (v) => (settings.companion.relativeStrength = v)),
      t("SOL (or BNB, ETH) as a faint dashed line under each token's 24 h line: did it rise alone or with the market? Hover for the numbers."),
    ),
    row(
      t("Pasted or dropped: open it too"),
      toggle(() => settings.companion.pasteOpens, (v) => (settings.companion.pasteOpens = v)),
      t("A token you paste with the shortcut or drop on Candy also opens on your terminal."),
    ),
    h("p", { class: "sub", text: t("Folders (pick one on the island; move a token with the folder button on its row)") }),
    foldersEditor(),
  );
}

/** Sounds that make sense for an alert, for a folder's own. */
const ALERT_SOUND_CHOICES: [string, string][] = (
  [
    ["alertUp", N_("Chime up")],
    ["alertDown", N_("Chime down")],
    ["warn", N_("Warning")],
    ["reminder", N_("Reminder")],
    ["tada", N_("Ta-da")],
    ["pop", N_("Pop")],
    ["boing", N_("Boing")],
    ["whee", N_("Whee")],
    ["eep", N_("Eep")],
    ["hmm", N_("Hmm")],
  ] as [string, string][]
).filter(([n]) => (SOUND_NAMES as readonly string[]).includes(n));

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
          note.textContent = t("Pick another name.");
          field.value = name;
          return;
        }
        note.textContent = "";
        c.folders = c.folders.map((f) => (f === name ? next : f));
        for (const tok of c.watchlist) if (tok.folder === name) tok.folder = next;
        if (c.activeFolder === name) c.activeFolder = next;
        save();
        paint();
      });
      const count = c.watchlist.filter((tok) => tok.folder === name).length;
      const remove = h("button", { class: "icon", title: t("Delete the folder (its tokens stay, under All)"), type: "button" }, svg(ICONS.trash, 12, { stroke: 2 }));
      remove.addEventListener("click", () => {
        c.folders = c.folders.filter((f) => f !== name);
        for (const tok of c.watchlist) if (tok.folder === name) tok.folder = undefined;
        if (c.activeFolder === name) c.activeFolder = "";
        save();
        paint();
      });
      box.append(h("div", { class: "item" }, field, h("span", { class: "grow dim", text: tn(count, "{n} token", "{n} tokens") }), remove));
    }
    const add = h("button", { class: "btn", type: "button", text: t("New folder") }) as HTMLButtonElement;
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
      list.append(h("p", { class: "empty", text: t("No alerts. Create them from the island's Alerts tab, or with the bell on a token.") }));
    }
    for (const rule of rules) {
      const token = settings.companion.watchlist.find((tok) => tok.key === rule.address);
      const tg = h("button", { class: `toggle ${rule.enabled ? "on" : ""}`, type: "button" }, h("i"));
      tg.addEventListener("click", () => {
        rule.enabled = !rule.enabled;
        save();
        paintAlerts();
      });
      const del = h("button", { class: "icon", title: t("Delete"), type: "button" }, svg(ICONS.trash, 12, { stroke: 2 }));
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
  // A sound per folder: Runners and Holds don't have to sound the same.
  const folderSounds = h("div", { class: "folder-sounds" });
  const soundChoices: [string, string][] = [["", t("Usual")], ...ALERT_SOUND_CHOICES.map(([n, label]): [string, string] => [n, t(label)])];
  let foldersShown = "";
  const paintFolderSounds = () => {
    const folders = settings.companion.folders;
    if (folders.join("|") === foldersShown) return;
    foldersShown = folders.join("|");
    clear(folderSounds);
    for (const f of folders) {
      const pick = select<string>(soundChoices, () => settings.companion.folderSounds[f] ?? "", (v) => {
        if (v) settings.companion.folderSounds[f] = v;
        else delete settings.companion.folderSounds[f];
        Sound.setEnabled(true);
        if (v) Sound.play(v as SoundName);
      });
      folderSounds.append(row(t("Alert sound: {folder}", { folder: f }), pick));
    }
  };
  paintFolderSounds();
  refreshers.push(paintFolderSounds);

  return section(
    t("Alerts"),
    t("They fire when the condition becomes true, and re-arm once it stops being true. An alert card's Mute 1 h silences that token for an hour."),
    list,
    row(
      t("Volume surges"),
      select<number>(
        VOLUME_ALERT_CHOICES.map((x): [number, string] => [x, x ? t("At {x}x the hour's pace", { x }) : t("Off")]),
        () => settings.companion.volumeAlertX,
        (v) => (settings.companion.volumeAlertX = v),
      ),
      t("An alert when a watched token's 5-minute volume runs that many times the rest of its hour (at least $10K, once per 30 min)."),
    ),
    row(
      t("Graduations"),
      toggle(() => settings.companion.graduationAlert, (v) => (settings.companion.graduationAlert = v)),
      t("An alert when a watched token leaves pump.fun's curve (or another launchpad's) for a DEX pool."),
    ),
    row(
      t("Market cap milestones"),
      toggle(() => settings.companion.milestoneAlert, (v) => (settings.companion.milestoneAlert = v)),
      t("An alert when a watched token's market cap crosses $1M, $5M, $10M, $50M, $100M, $500M or $1B, up or down (once an hour per level)."),
    ),
    row(
      t("Sell pressure"),
      toggle(() => settings.companion.sellPressureAlert, (v) => (settings.companion.sellPressureAlert = v)),
      t("An alert when a watched token's sells run 2.5 times its buys or more over 5 minutes (at least 40 trades, once per 30 min)."),
    ),
    row(
      t("Economic calendar"),
      select<number>(
        CALENDAR_LEADS.map((m): [number, string] => [m, m ? t("{minutes} min before", { minutes: m }) : t("Off")]),
        () => settings.companion.calendarLeadMin,
        (v) => (settings.companion.calendarLeadMin = v),
      ),
      t("A heads-up before the US releases the whole market watches (CPI, the Fed's decisions, the jobs report…), and the next one in the header within a day. From Forex Factory's public calendar."),
    ),
    folderSounds,
  );
}

// ── Discipline ────────────────────────────────────────────────────────────────

function disciplineSection(): HTMLElement {
  const d = () => settings.companion.discipline;
  return section(
    t("Discipline"),
    t("Your rules. The mascot only reminds you. Use 0 to turn any of them off."),
    row(
      t("Discipline"),
      toggle(() => settings.companion.disciplineOn, (v) => (settings.companion.disciplineOn = v)),
      t("Off: no Discipline tab, no day pill, no breaks, limits, cooldowns, check-ins or Monday recap. Your trades are still kept for when you turn it back on."),
    ),
    row(t("Break every"), h("span", { class: "with-unit" }, number(() => d().breakEveryMin, (v) => (d().breakEveryMin = v), 0, 600, 5), t("min"))),
    row(
      t("Daily loss limit"),
      h(
        "span",
        { class: "with-unit" },
        number(() => d().dailyLossLimit, (v) => (d().dailyLossLimit = v), 0, 1_000_000, 0.1),
        select<"SOL" | "USD">([["SOL", "SOL"], ["USD", "USD"]], () => d().unit, (v) => (d().unit = v)),
      ),
      t("When you hit it, the mascot asks you to call it a day."),
    ),
    row(t("Max trades per day"), number(() => d().maxTradesPerDay, (v) => (d().maxTradesPerDay = v), 0, 500)),
    row(t("Cooldown after a loss"), h("span", { class: "with-unit" }, number(() => d().cooldownMin, (v) => (d().cooldownMin = v), 0, 240), t("min"))),
    row(
      t("Tilt: losses in a row"),
      number(() => d().tiltLosses, (v) => (d().tiltLosses = v), 0, 10),
      t("A streak of losing trades asks for a longer break than a single loss."),
    ),
    row(t("Break after a tilt"), h("span", { class: "with-unit" }, number(() => d().tiltBreakMin, (v) => (d().tiltBreakMin = v), 5, 480, 5), t("min"))),
    row(
      t("Count my wallet's trades"),
      toggle(() => settings.companion.autoJournal, (v) => (settings.companion.autoJournal = v)),
      t("With your wallet set, today's trades follow it by themselves: a part sold adds its profit, a closed position is a trade (and a journal line), and both count for these rules."),
    ),
    row(
      t("Check in after a trade"),
      toggle(() => settings.companion.checkIn, (v) => (settings.companion.checkIn = v)),
      t("When a trade closes: did you follow your plan? Yes, partly or no goes into the journal, and into the Monday recap."),
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
    t("New to Axiom?") + " ",
    h("a", { class: "link", href: AXIOM_REFERRAL_URL, text: t("Sign up with the developer's referral"), onclick: (e: Event) => {
      e.preventDefault();
      void Bridge.openUrl(AXIOM_REFERRAL_URL);
    } }),
    ".",
  );
  const paint = () => {
    axiomInvite.style.display = settings.companion.terminal === "axiom" ? "" : "none";
    clear(group);
    for (const [id, term] of Object.entries(TERMINALS) as [Terminal, (typeof TERMINALS)[Terminal]][]) {
      const b = h("button", { class: `choice ${settings.companion.terminal === id ? "on" : ""}`, type: "button", text: term.label });
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
  return section(t("Terminal"), t("Where a token opens when you click it. GMGN and Based Bot links carry the developer's referral code."), group, axiomInvite);
}

/** The sounds folder: the trader's own recordings, named after Candy's sounds, play instead of them. */
function ownSoundsRow(): HTMLElement {
  const count = h("span", { class: "note" });
  const refresh = async () => {
    const n = (await Bridge.customSounds(SOUND_NAMES.map(soundFile)))?.length ?? 0;
    count.textContent = n ? tn(n, "{n} of yours in use", "{n} of yours in use") : t("none of yours yet");
  };
  const open = h("button", { class: "btn", type: "button", text: t("Open sounds folder") });
  open.addEventListener("click", () => void Bridge.revealSoundsFolder());
  const reload = h("button", { class: "btn", type: "button", text: t("Reload") });
  reload.addEventListener("click", async () => {
    await Bridge.reloadSounds();
    await refresh();
  });
  void refresh();
  return row(
    t("Your own sounds"),
    h("span", { class: "with-unit" }, open, reload, count),
    t("A file named after a sound ({files}, …) as .wav, .mp3, .ogg, .m4a or .flac plays instead of Candy's own. The names are in the README.", {
      files: [...SOUND_NAMES.slice(0, 3).map(soundFile), "alert-up"].join(", "),
    }),
  );
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

  const system = LANGS.find(([id]) => id === pickLang("auto", systemLangs()))?.[1] ?? "English";
  return section(
    t("General"),
    null,
    row(
      t("Language"),
      select<LangSetting>(
        [["auto", t("Same as the system ({language})", { language: system })], ...LANGS.map(([id, name]): [LangSetting, string] => [id, name])],
        () => settings.companion.language,
        (v) => {
          settings.companion.language = v;
          // Saved first; then this window is drawn again in the new words (the island relabels itself).
          window.setTimeout(() => location.reload(), 300);
        },
      ),
    ),
    // Without a cursor poll (Linux) the island stays at the top edge.
    !State.cursorPoll ? null : row(
      t("Island position"),
      select<Placement>(
        [
          ["top", t("Top of the screen")],
          ["left", t("Left edge")],
          ["right", t("Right edge")],
          ["float", t("Floating (drag it anywhere)")],
        ],
        () => settings.placement,
        (v) => (settings.placement = v),
      ),
      t("Floating: drag the ticker where you want it; it stays on screen."),
    ),
    row(t("Refresh prices every"), select<number>([[10, t("{n} s", { n: 10 })], [15, t("{n} s", { n: 15 })], [20, t("{n} s", { n: 20 })], [30, t("{n} s", { n: 30 })], [60, t("1 min")]], () => settings.companion.pollSeconds, (v) => (settings.companion.pollSeconds = v))),
    row(t("Keep the ticker on screen"), toggle(() => settings.companion.keepTickerVisible, (v) => (settings.companion.keepTickerVisible = v)), t("When off, the island hides after a minute and comes back when the mouse touches its edge of the screen.") + (State.cursorPoll ? " " + t("Hold Ctrl over the island to click what is behind it.") : "")),
    row(t("Open on hover"), toggle(() => settings.companion.openOnHover, (v) => (settings.companion.openOnHover = v)), t("Resting the pointer on the ticker opens the island, and it folds again soon after the pointer leaves. Click inside to keep it open.")),
    row(t("Keep alert cards"), toggle(() => settings.companion.stickyAlerts, (v) => (settings.companion.stickyAlerts = v)), t("An alert card stays open until you look at it (OK), or fold it for later with its ⌃.")),
    !IS_TAURI || State.os !== "windows"
      ? null
      : row(t("Quiet in fullscreen"), toggle(() => settings.companion.fullscreenQuiet, (v) => (settings.companion.fullscreenQuiet = v)), t("While a game, a video or a presentation fills the screen, alert cards and their sounds wait, and show once it is over.")),
    row(t("Close the island after"), select<number>([[8, t("{n} s", { n: 8 })], [15, t("{n} s", { n: 15 })], [30, t("{n} s", { n: 30 })], [60, t("1 min")]], () => settings.autoCloseInterval, (v) => (settings.autoCloseInterval = v))),
    row(t("Sounds"), toggle(() => settings.soundEnabled, (v) => (settings.soundEnabled = v))),
    row(t("Volume"), volume),
    !IS_TAURI ? null : ownSoundsRow(),
    !State.cursorPoll ? null : row(t("Screen"), select<"primary" | "cursor">([["primary", t("Main screen")], ["cursor", t("Where the mouse is")]], () => settings.screen, (v) => (settings.screen = v))),
    row(State.os === "windows" || !IS_TAURI ? t("Start with Windows") : t("Start when you log in"), toggle(() => settings.autostart, (v) => (settings.autostart = v))),
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
    placeholder: t("Public RPC — or paste your own https URL"),
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
      note.textContent = t("Needs an https URL, like {example}", { example: "https://solana-mainnet.g.alchemy.com/v2/your-key" });
      return;
    }
    settings.rpcUrl = v;
    input.value = v;
    note.className = "note ok";
    note.textContent = v ? t("Saved: wallets are read through your RPC.") : t("Back to the public RPC.");
    window.setTimeout(() => (note.textContent = ""), 3500);
    save();
  });
  paint();
  refreshers.push(paint);
  return row(
    "Solana RPC",
    h("span", { class: "rpc-field" }, input, note),
    t("Optional. Your wallets are read from Solana's public RPC, which is shared and often busy. A free key from Helius, Alchemy or QuickNode is faster: paste its https URL. Only read-only calls go to it, and it stays on this PC."),
  );
}

/** Where to get a free key, under the RPC field. */
function rpcKeySites(): HTMLElement {
  const or = " " + t("or") + " ";
  const links = RPC_KEY_SITES.flatMap((site, i) => [
    i ? or : "",
    h("a", { class: "link", href: site.url, text: site.label, onclick: (e: Event) => {
      e.preventDefault();
      void Bridge.openUrl(site.url);
    } }),
  ]);
  // The links go where {sites} is, wherever a language puts it.
  const [before, after = ""] = t("Make one for free on {sites} (Solana mainnet), then paste its https URL above.").split("{sites}");
  return h("p", { class: "hint invite" }, t("No key yet?") + " " + before, ...links, after);
}

// ── Wallets: yours, and the ones you follow ───────────────────────────────────

/**
 * One list of wallets: the trader's own (`mine`: buys and sells recorded, with
 * profit) or other people's (alerts when they buy or sell, nothing else).
 */
function walletList(mine: boolean): { list: HTMLElement; add: HTMLElement; note: HTMLElement } {
  const list = h("div", { class: "list" });
  const address = h("input", { class: "field grow", placeholder: mine ? t("Your wallet address (public)") : t("Wallet address to follow (public)") }) as HTMLInputElement;
  const label = h("input", { class: "field", placeholder: t("Name"), style: "width:120px" }) as HTMLInputElement;
  const addBtn = h("button", { class: "btn", type: "button", text: mine ? t("Add") : t("Follow") }) as HTMLButtonElement;
  const note = h("span", { class: "note" });

  addBtn.addEventListener("click", () => {
    const a = address.value.trim();
    const wallets = settings.companion.wallets;
    note.className = "note err";
    if (!isAddress(a)) return void (note.textContent = t("That doesn't look like a Solana address."));
    const known = wallets.find((w) => w.address === a);
    if (known && known.mine === mine) return void (note.textContent = mine ? t("That's already your wallet.") : t("Already following that wallet."));
    if (known) {
      // The same address can't be both: it moves to this list.
      known.mine = mine;
    } else {
      if (wallets.length >= MAX_WALLETS) return void (note.textContent = tn(MAX_WALLETS, "{n} wallet max.", "{n} wallets max."));
      const same = wallets.filter((w) => w.mine === mine).length;
      const name = label.value.trim().slice(0, 24) || (mine ? (same ? `My wallet ${same + 1}` : "My wallet") : `Wallet ${same + 1}`);
      wallets.push({ address: a, label: name, mine, baselineUsd: null, addedAt: Date.now() });
    }
    save();
    address.value = "";
    label.value = "";
    note.className = "note ok";
    note.textContent = known ? (mine ? t("Moved from Following.") : t("Moved from your wallets.")) : mine ? t("Added.") : t("Following.");
    for (const fn of refreshers) fn();
  });

  function paint() {
    clear(list);
    const wallets = settings.companion.wallets.filter((w) => w.mine === mine);
    if (wallets.length === 0) list.append(h("p", { class: "empty", text: mine ? t("No wallet yet.") : t("Not following anyone.") }));
    for (const w of wallets) {
      const name = h("input", { class: "field", value: w.label, style: "width:140px" }) as HTMLInputElement;
      name.addEventListener("change", () => {
        if (name.value.trim()) w.label = name.value.trim().slice(0, 24);
        save();
      });
      const remove = h("button", { class: "icon", title: mine ? t("Remove") : t("Stop following"), type: "button" }, svg(ICONS.trash, 12, { stroke: 2 }));
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
    t("My wallet"),
    t("Your own wallet, by its public address: its buys and sells are recorded, with the profit of every token (the My wallet tab), and closed trades go into your journal. Never paste a seed phrase or private key: no real app asks for one."),
    list,
    add,
    note,
    row(t("Position alerts"), toggle(() => settings.companion.positionAlerts.enabled, (v) => (settings.companion.positionAlerts.enabled = v)), t("When a token in your wallet reaches a level from its entry.")),
    row(t("Up, as multiples"), levelField("up"), t("e.g. 2x, 3x, 5x, 10x")),
    row(t("Down, in %"), levelField("down"), t("e.g. -30%, -50%")),
  );
}

function followingSection(): HTMLElement {
  const { list, add, note } = walletList(false);
  const body = h("div", {}, list, add, note);
  const paintBody = () => (body.style.display = settings.companion.following ? "" : "none");
  paintBody();
  refreshers.push(paintBody);
  return section(
    t("Following"),
    t("Other people's wallets, for an alert when they buy or sell. Off by default: they are checked once a minute on Solana's shared public RPC, so alerts come up to a minute late, and every wallet adds three calls a minute."),
    row(
      t("Follow other wallets"),
      toggle(
        () => settings.companion.following,
        (v) => {
          settings.companion.following = v;
          paintBody();
        },
      ),
      t("Shows the Following tab on the island."),
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
    const all = h("button", { class: `choice ${cur.length === ALL_CHAINS.length ? "on" : ""}`, type: "button", text: t("All") });
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
    t("Chains"),
    t("What search, trending and the header prices cover. One, several or all. Tokens added by address work on any of them."),
    group,
  );
}

// ── Appearance ────────────────────────────────────────────────────────────────

const THEMES: [Theme, string][] = THEME_IDS.map((id) => [id, ISLAND_THEMES[id].name]);

const OUTFITS: [Outfit, string][] = [
  ["none", N_("None")],
  ["cap", N_("Cap")],
  ["crown", N_("Crown")],
  ["party", N_("Party hat")],
  ["headphones", N_("Headphones")],
  ["tophat", N_("Top hat")],
  ["cowboy", N_("Cowboy")],
  ["beanie", N_("Beanie")],
  ["halo", N_("Halo")],
  ["horns", N_("Horns")],
  ["wizard", N_("Wizard")],
  ["viking", N_("Viking")],
  ["bow", N_("Bow")],
  ["chef", N_("Chef")],
  ["pirate", N_("Pirate")],
  ["santa", N_("Santa")],
  ["grad", N_("Grad cap")],
  ["beret", N_("Beret")],
  ["propeller", N_("Propeller")],
  ["flowers", N_("Flower crown")],
  ["bunny", N_("Bunny ears")],
  ["pumpkin", N_("Pumpkin")],
  ["catears", N_("Cat ears")],
  ["rocket", N_("Rocket")],
];

const FACES: [Face, string][] = [
  ["none", N_("None")],
  ["shades", N_("Shades")],
  ["laser", N_("Laser eyes")],
  ["glasses", N_("Glasses")],
  ["monocle", N_("Monocle")],
  ["mustache", N_("Mustache")],
  ["starglasses", N_("Star glasses")],
  ["threed", N_("3D glasses")],
  ["eyepatch", N_("Eye patch")],
  ["heartglasses", N_("Heart glasses")],
  ["clownnose", N_("Clown nose")],
  ["beard", N_("Beard")],
  ["domino", N_("Hero mask")],
  ["vr", N_("VR headset")],
  ["pixel", N_("Pixel shades")],
  ["goggles", N_("Goggles")],
  ["whiskers", N_("Whiskers")],
  ["freckles", N_("Freckles")],
  ["bandaid", N_("Band-aid")],
  ["lollipop", N_("Lollipop")],
  ["bubblegum", N_("Bubble gum")],
  ["warpaint", N_("War paint")],
  ["dollareyes", N_("Dollar eyes")],
  ["facemask", N_("Face mask")],
  ["scarf", N_("Scarf")],
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
  ["mint", N_("Mint")],
  ["neon", N_("Neon")],
  ["forest", N_("Forest")],
  ["lime", N_("Lime")],
  ["lemon", N_("Lemon")],
  ["gold", N_("Gold")],
  ["sunset", N_("Sunset")],
  ["peach", N_("Peach")],
  ["cherry", N_("Cherry")],
  ["ruby", N_("Ruby")],
  ["rose", N_("Rose")],
  ["magenta", N_("Magenta")],
  ["grape", N_("Grape")],
  ["lavender", N_("Lavender")],
  ["violet", N_("Violet")],
  ["teal", N_("Teal")],
  ["sky", N_("Sky")],
  ["ice", N_("Ice")],
  ["ocean", N_("Ocean")],
  ["navy", N_("Navy")],
  ["ghost", N_("Ghost")],
  ["slate", N_("Slate")],
  ["charcoal", N_("Charcoal")],
  ["custom", N_("Custom")],
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
  const reset = h("button", { class: "btn ghost", type: "button", text: t("Reset") });
  reset.addEventListener("click", () => {
    settings.companion.customSkin = { ...DEFAULT_CUSTOM_SKIN };
    save();
    paint();
  });
  const custom = h(
    "div",
    { class: "custom-skin" },
    row(t("Hue"), hue),
    row(t("Saturation"), sat),
    row(t("Brightness"), light),
    h("div", { class: "custom-foot" }, swatch, h("span", { class: "hint", text: t("Pick Custom, then slide. The face still shows the mood.") }), reset),
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
      const b = h("button", { class: `choice ${c.theme === id ? "on" : ""}`, type: "button" }, swatch, t(label));
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
      const b = h("button", { class: `outfit ${c.costume === "none" && c.skin === id ? "on" : ""}`, type: "button" }, m.el, h("span", { text: t(label) }));
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
    // Hats and faces in the trader's words; costumes keep their own names.
    const translated = (items: [string, string][]) => items.map(([id, label]): [string, string] => [id, t(label)]);
    grid(outfits, translated(OUTFITS), c.outfit, (id) => preview(id as Outfit, c.face, c.skin), (id) => {
      c.outfit = id as Outfit;
      ownPick();
    });
    grid(faces, translated(FACES), c.face, (id) => preview(c.outfit, id as Face, c.skin), (id) => {
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
    t("Appearance"),
    null,
    h("p", { class: "sub", text: t("Island theme") }),
    themes,
    h("p", { class: "sub", text: t("Colour (tints every mood but a loss: like a candle, Candy goes red then)") }),
    skins,
    custom,
    h("p", { class: "sub", text: t("Hat") }),
    outfits,
    h("p", { class: "sub", text: t("Face") }),
    faces,
    h("p", { class: "sub", text: t("Costume (redraws the whole mascot, every mood included; it keeps its own colours)") }),
    costumes,
    row(t("BTC and Fear & Greed"), toggle(() => settings.companion.headerMarket, (v) => (settings.companion.headerMarket = v)), t("In the island's header, next to your chains' coins.")),
    row(t("Seasonal looks"), toggle(() => settings.companion.seasonal, (v) => (settings.companion.seasonal = v)), t("A Santa hat in December, a pumpkin at Halloween, a party hat at New Year, heart glasses on Valentine's Day. Your own look comes back after.")),
    row(t("Lively"), toggle(() => settings.companion.lively, (v) => (settings.companion.lively = v)), t("Candy's eyes follow your mouse, and it fidgets now and then.")),
    row(t("Music card"), toggle(() => settings.companion.musicCard, (v) => (settings.companion.musicCard = v)), IS_TAURI ? t("What plays on this PC (Spotify, a browser video…) gets a Music tab in the island: cover, progress, play, pause, next.") : t("In the app only.")),
    row(t("Dance when music plays"), toggle(() => settings.companion.danceToMusic, (v) => (settings.companion.danceToMusic = v)), IS_TAURI ? t("Candy bobs along while the island is on screen, folded or open.") : t("In the app only.")),
    row(t("Doze off late at night"), toggle(() => settings.companion.nightSleep, (v) => (settings.companion.nightSleep = v)), t("From 1 to 6 am the mascot sleeps, unless something big moves.")),
    row(t("React to SOL"), toggle(() => settings.companion.reactToSol, (v) => (settings.companion.reactToSol = v)), t("Happy or worried when SOL moves 3% in an hour.")),
  );
}

// ── Notifications and shortcuts ───────────────────────────────────────────────

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
        note.textContent = t("Notifications are blocked. Allow them for this app in your system or browser settings.");
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

  const test = h("button", { class: "chip-btn", type: "button", text: t("Send a test") });
  test.addEventListener("click", async () => {
    if (await enableNotifications()) void notify(APP_NAME, t("Notifications work. Alerts will show up like this."));
  });

  return section(
    t("Notifications and shortcuts"),
    null,
    row(
      t("System notifications for alerts"),
      h("span", { class: "with-unit" }, test, tg),
      !IS_TAURI ? t("Browser notifications, while this page is open.") : State.os === "windows" ? t("Windows notifications reach you even over a fullscreen game or video.") : t("Your desktop's notifications, even while the island is hidden."),
    ),
    note,
    ...shortcutRows(),
  );
}

/**
 * One row per global shortcut: its keys (click to record new ones), off, back
 * to the default, and why it is not working when it is not. While a row
 * records, the island lets go of every shortcut, so pressing one Candy holds
 * records it instead of running it.
 */
function shortcutRows(): HTMLElement[] {
  let status: Partial<Record<ShortcutId, ShortcutStatus>> = {};
  let recording: ShortcutId | null = null;
  // A Mac's ⌘ is what Windows' Ctrl is here (CommandOrControl); its keys read ⌘ ⌥ ⇧ ⌃.
  const mac = State.os === "macos";
  const paints: (() => void)[] = [];

  const keysOf = (id: ShortcutId) => shortcutKeys(settings.companion, id);
  const setKeys = (id: ShortcutId, accel: string | null) => {
    const c = settings.companion;
    const dflt = SHORTCUTS.find((d) => d.id === id)!.dflt;
    if (id === "toggle") c.hotkey = accel ?? dflt;
    else if (id === "paste") c.pasteHotkey = accel ?? dflt;
    else if (accel == null) delete c.shortcuts[id];
    else c.shortcuts[id] = accel;
    save();
  };
  const paintAll = () => paints.forEach((fn) => fn());

  const stopRecording = () => {
    if (!recording) return;
    recording = null;
    window.removeEventListener("keydown", onKey, true);
    void emitToWindow("island", "shortcuts-resume");
    paintAll();
  };
  const onKey = (e: KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") return stopRecording();
    const id = recording;
    if ((e.key === "Backspace" || e.key === "Delete") && !e.ctrlKey && !e.altKey && !e.metaKey) {
      setKeys(id, "");
      return stopRecording();
    }
    const accel = recordPress(e, mac);
    if (!accel) return;
    setKeys(id, accel);
    stopRecording();
  };
  const startRecording = (id: ShortcutId) => {
    if (recording === id) return stopRecording();
    if (!recording) {
      window.addEventListener("keydown", onKey, true);
      void emitToWindow("island", "shortcuts-suspend");
    }
    recording = id;
    paintAll();
  };
  // A click anywhere else, or the window losing focus, stops recording.
  document.addEventListener("mousedown", (e) => {
    if (recording && !(e.target as HTMLElement).closest?.(".keys.recording")) stopRecording();
  });
  window.addEventListener("blur", stopRecording);

  const rows = SHORTCUTS.map((def) => {
    const keys = h("button", { class: "keys", type: "button" }) as HTMLButtonElement;
    keys.addEventListener("click", () => startRecording(def.id));
    const off = h("button", { class: "chip-btn", type: "button", text: t("Off"), title: t("No shortcut for this") });
    off.addEventListener("click", () => {
      stopRecording();
      setKeys(def.id, "");
      paintAll();
    });
    const reset = h("button", { class: "chip-btn", type: "button", text: t("Default"), title: keysLabel(def.dflt, mac) });
    reset.addEventListener("click", () => {
      stopRecording();
      setKeys(def.id, null);
      paintAll();
    });
    const why = h("small", { class: "why" });
    paints.push(() => {
      const k = keysOf(def.id);
      const rec = recording === def.id;
      keys.classList.toggle("recording", rec);
      keys.textContent = rec ? t("Press the keys…") : keysLabel(k, mac);
      keys.title = rec ? t("Esc cancels, Backspace turns it off") : t("Click, then press the new keys");
      off.style.visibility = k ? "" : "hidden";
      reset.style.visibility = k === def.dflt ? "hidden" : "";
      const keysNow = Object.fromEntries(SHORTCUTS.map((d) => [d.id, keysOf(d.id)]));
      const s = twice(keysNow).has(def.id) ? { kind: "twice" as const } : k ? status[def.id] : undefined;
      why.textContent = rec ? "" : statusLabel(s);
    });
    return h("div", { class: "row shortcut" }, h("span", { class: "label" }, t(def.label), why), h("span", { class: "with-unit" }, off, reset, keys));
  });
  refreshers.push(paintAll);
  paintAll();

  // How each registration went, from the island (another app holding the keys…).
  void onEvent<Partial<Record<ShortcutId, ShortcutStatus>>>("shortcuts-status", (s) => {
    status = s;
    paintAll();
  }).then(() => emitToWindow("island", "shortcuts-ask"));

  const where = !IS_TAURI
    ? t("In the browser they only work while the page has focus.")
    : State.os === "linux"
      ? t("They work from any app where your desktop lets apps have global shortcuts (X11, and GNOME through XWayland).")
      : State.os === "macos"
        ? t("They work from any app.")
        : t("They work from any app. Ctrl + Alt is AltGr on many keyboards: a combination that types a character on yours is left alone and flagged.");
  return [
    h("p", { class: "sub", text: t("Shortcuts") }),
    h("p", { class: "hint", text: where + " " + t("While you type in the island, Ctrl + 1–9 picks a tab and Ctrl + , opens Settings.") }),
    ...rows,
  ];
}

// ── Share and import ──────────────────────────────────────────────────────────

function shareSection(): HTMLElement {
  const note = h("span", { class: "note" });
  const copy = h("button", { class: "btn", type: "button", text: t("Copy token list") });
  copy.addEventListener("click", async () => {
    const entries = settings.companion.watchlist.map(shareEntry);
    note.className = "note err";
    if (!entries.length) return void (note.textContent = t("Your watchlist is empty."));
    const ok = await Bridge.copy(shareText(entries));
    note.className = ok ? "note ok" : "note err";
    note.textContent = ok ? t("Copied. Anyone with Candy can paste it into Import.") : t("Couldn't copy.");
  });

  const input = h("input", { class: "field grow", placeholder: t("Paste a token list (or addresses)") }) as HTMLInputElement;
  const load = h("button", { class: "btn", type: "button", text: t("Import") }) as HTMLButtonElement;
  load.addEventListener("click", async () => {
    const entries = parseShared(input.value);
    note.className = "note err";
    if (!entries.length) return void (note.textContent = t("No token addresses in that."));
    load.disabled = true;
    note.className = "note";
    note.textContent = t("Importing…");
    let added = 0;
    for (const entry of entries) {
      if (settings.companion.watchlist.length >= MAX_WATCHLIST) break;
      const [chainPart, address] = entry.includes(":") ? entry.split(":", 2) : ["solana", entry];
      const chainId: ChainId = isChain(chainPart) ? chainPart : "solana";
      if (settings.companion.watchlist.some((tok) => tok.key === tokenKey(chainId, address))) continue;
      try {
        const tok = await resolveAddress({ kind: "address", address, chainId, isPool: false });
        if (tok && !settings.companion.watchlist.some((x) => x.key === tok.key)) {
          settings.companion.watchlist.push(tok);
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
    note.textContent = tn(added, "{n} token added.", "{n} tokens added.");
    for (const fn of refreshers) fn();
  });

  return section(
    t("Share"),
    t("A link carries only the token addresses of your watchlist, nothing else."),
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
  return section(t("Mascot"), t("Everything the mascot can feel."), grid);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function main() {
  const root = document.getElementById("settings-root");
  if (!root) return;
  const [boot, manifest] = await Promise.all([Bridge.boot(), loadManifest()]);
  settings = boot.settings;
  State.os = boot.os ?? "browser";
  State.cursorPoll = boot.cursorPoll ?? true;
  await useLang(pickLang(devLang() ?? settings.companion.language, systemLangs()));

  const page = h(
    "main",
    {},
    // Which Candy this is: what a friend asks when helping.
    h("h1", {}, t("Settings"), h("span", { class: "app-version", text: `Candy ${boot.version}` })),
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
