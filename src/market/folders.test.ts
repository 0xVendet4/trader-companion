import { describe, expect, it } from "vitest";
import type { WatchToken } from "../core/state";
import { DEFAULT_FOLDERS, cleanFolderName, folderTokens, normalizeFolders } from "./folders";

const tok = (symbol: string, folder?: string): WatchToken => ({
  key: symbol, chainId: "solana", address: symbol, symbol, name: symbol, pairAddress: "p", dexId: "d", imageUrl: null, folder,
});

describe("watchlist folders", () => {
  it("All shows everything, a folder its own tokens", () => {
    const list = [tok("BONK", "Holds"), tok("WIF"), tok("POPCAT", "Runners")];
    expect(folderTokens(list, "").map((t) => t.symbol)).toEqual(["BONK", "WIF", "POPCAT"]);
    expect(folderTokens(list, "Runners").map((t) => t.symbol)).toEqual(["POPCAT"]);
  });

  it("cleans up names", () => {
    expect(cleanFolderName("  Long   holds  ", [])).toBe("Long holds");
    expect(cleanFolderName("runners", ["Runners"])).toBeNull();
    expect(cleanFolderName("All", [])).toBeNull();
    expect(cleanFolderName("   ", [])).toBeNull();
    expect(cleanFolderName("x".repeat(40), [])).toHaveLength(16);
  });

  it("repairs a saved file, and starts older ones with the default folders", () => {
    expect(normalizeFolders(undefined, [], undefined)).toEqual({ folders: DEFAULT_FOLDERS, tokens: [], active: "" });
    const r = normalizeFolders(["Runners", "runners", 5, "Moon"], [tok("A", "Gone"), tok("B", "Moon")], "Gone");
    expect(r.folders).toEqual(["Runners", "Moon"]);
    expect(r.tokens.map((t) => t.folder)).toEqual([undefined, "Moon"]);
    expect(r.active).toBe("");
  });
});
