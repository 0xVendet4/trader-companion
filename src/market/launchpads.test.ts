import { describe, expect, it } from "vitest";
import { dexName, graduation } from "./launchpads";

describe("graduation", () => {
  it("is a move from a launchpad's curve to a DEX pool", () => {
    expect(graduation("pumpfun", "pumpswap")).toEqual({ from: "pump.fun", to: "PumpSwap" });
    expect(graduation("moonshot", "raydium")).toEqual({ from: "Moonshot", to: "Raydium" });
    expect(graduation("pumpswap", "raydium")).toBeNull();
    expect(graduation("pumpfun", "pumpfun")).toBeNull();
    expect(graduation("pumpfun", "moonshot")).toBeNull();
    expect(graduation(undefined, "pumpswap")).toBeNull();
  });

  it("names a DEX it doesn't know by its id", () => {
    expect(dexName("lifinity")).toBe("Lifinity");
  });
});
