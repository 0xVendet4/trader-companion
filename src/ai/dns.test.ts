import { describe, expect, it } from "vitest";
import { parseDoh } from "./dns";

const CLOUDFLARE_A_RESPONSE = {
  Status: 0,
  Answer: [
    { name: "example.com.", type: 1, TTL: 3600, data: "93.184.216.34" },
    { name: "example.com.", type: 1, TTL: 3600, data: "93.184.216.35" },
  ],
};

const CLOUDFLARE_MX_RESPONSE = {
  Status: 0,
  Answer: [{ name: "example.com.", type: 15, TTL: 3600, data: "10 mail.example.com." }],
};

const CLOUDFLARE_TXT_RESPONSE = {
  Status: 0,
  Answer: [{ name: "example.com.", type: 16, TTL: 3600, data: "v=spf1 include:_spf.google.com ~all" }],
};

describe("parseDoh", () => {
  it("extracts A records", () => {
    const result = parseDoh(CLOUDFLARE_A_RESPONSE, "A");
    expect(result).toEqual(["93.184.216.34", "93.184.216.35"]);
  });

  it("extracts MX records", () => {
    const result = parseDoh(CLOUDFLARE_MX_RESPONSE, "MX");
    expect(result).toEqual(["10 mail.example.com."]);
  });

  it("extracts TXT records", () => {
    const result = parseDoh(CLOUDFLARE_TXT_RESPONSE, "TXT");
    expect(result).toContain("v=spf1 include:_spf.google.com ~all");
  });

  it("returns empty array for wrong type", () => {
    const result = parseDoh(CLOUDFLARE_A_RESPONSE, "MX");
    expect(result).toEqual([]);
  });

  it("returns empty array for null input", () => {
    expect(parseDoh(null, "A")).toEqual([]);
    expect(parseDoh(undefined, "A")).toEqual([]);
    expect(parseDoh({}, "A")).toEqual([]);
  });

  it("returns empty array when Answer is absent", () => {
    expect(parseDoh({ Status: 3 }, "A")).toEqual([]);
  });
});
