import { describe, expect, it } from "vitest";
import { reportUrl } from "./report";

describe("reporting an answer", () => {
  it("opens a new issue on Candy's repository, the answer quoted in it", () => {
    const url = new URL(reportUrl("Buy it all.\nNow."));
    expect(url.origin + url.pathname).toBe("https://github.com/0xVendet4/trader-companion/issues/new");
    expect(url.searchParams.get("title")).toBe("Report: a chat answer");
    expect(url.searchParams.get("body")).toContain("> Buy it all.\n> Now.");
    expect(url.searchParams.get("body")).toContain("What is wrong with it:");
  });

  it("cuts a long answer, in any script, so the link stays one GitHub takes", () => {
    for (const ch of ["a", "語", "й"]) {
      const url = reportUrl(ch.repeat(20_000));
      expect(url.length, ch).toBeLessThanOrEqual(6000);
      expect(new URL(url).searchParams.get("body"), ch).toContain(`${ch}…`);
    }
  });
});
