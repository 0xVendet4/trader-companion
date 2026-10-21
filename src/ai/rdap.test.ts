import { describe, expect, it } from "vitest";
import { countryName, parseRdap } from "./rdap";

const SAMPLE_RDAP = {
  objectClassName: "domain",
  handle: "example.com",
  events: [
    { eventAction: "registration", eventDate: "1995-08-14T04:00:00Z" },
    { eventAction: "expiration", eventDate: "2025-08-13T04:00:00Z" },
    { eventAction: "last changed", eventDate: "2024-01-01T00:00:00Z" },
  ],
  nameservers: [
    { ldhName: "NS1.EXAMPLE.COM" },
    { ldhName: "NS2.EXAMPLE.COM" },
  ],
  entities: [
    {
      roles: ["registrar"],
      vcardArray: [
        "vcard",
        [
          ["version", {}, "text", "4.0"],
          ["fn", {}, "text", "ACME Registrar Inc."],
        ],
      ],
    },
    {
      roles: ["registrant"],
      vcardArray: [
        "vcard",
        [
          ["version", {}, "text", "4.0"],
          ["fn", {}, "text", "Redacted"],
          ["adr", {}, "text", ["", "", "123 Main St", "Austin", "TX", "78701", "US"]],
        ],
      ],
    },
  ],
};

describe("parseRdap", () => {
  it("extracts creation and expiry dates", () => {
    const result = parseRdap(SAMPLE_RDAP);
    expect(result.createdAt).toBe(Date.parse("1995-08-14T04:00:00Z"));
    expect(result.expiresAt).toBe(Date.parse("2025-08-13T04:00:00Z"));
  });

  it("extracts registrar name from vcardArray", () => {
    const result = parseRdap(SAMPLE_RDAP);
    expect(result.registrar).toBe("ACME Registrar Inc.");
  });

  it("extracts nameservers and lowercases them", () => {
    const result = parseRdap(SAMPLE_RDAP);
    expect(result.nameservers).toEqual(["ns1.example.com", "ns2.example.com"]);
  });

  it("extracts country code from registrant adr vcard", () => {
    const result = parseRdap(SAMPLE_RDAP);
    expect(result.country).toBe("US");
  });

  it("returns nulls and empty arrays for missing fields", () => {
    const result = parseRdap({});
    expect(result.createdAt).toBeNull();
    expect(result.expiresAt).toBeNull();
    expect(result.registrar).toBeNull();
    expect(result.country).toBeNull();
    expect(result.nameservers).toEqual([]);
  });

  it("survives null/undefined input", () => {
    expect(() => parseRdap(null)).not.toThrow();
    expect(() => parseRdap(undefined)).not.toThrow();
    expect(() => parseRdap("bad")).not.toThrow();
  });

  it("ignores invalid dates", () => {
    const result = parseRdap({ events: [{ eventAction: "registration", eventDate: "not-a-date" }] });
    expect(result.createdAt).toBeNull();
  });

  it("limits nameservers to 4", () => {
    const result = parseRdap({
      nameservers: [1, 2, 3, 4, 5].map((n) => ({ ldhName: `ns${n}.example.com` })),
    });
    expect(result.nameservers).toHaveLength(4);
  });
});

describe("countryName", () => {
  it("returns full name for known codes", () => {
    expect(countryName("US")).toBe("EUA");
    expect(countryName("BR")).toBe("Brasil");
    expect(countryName("DE")).toBe("Alemanha");
  });

  it("returns code for unknown countries", () => {
    expect(countryName("XX")).toBe("XX");
  });

  it("is case-insensitive", () => {
    expect(countryName("us")).toBe("EUA");
  });
});
