import { describe, expect, it } from "vitest";
import { lookupCoordinates, normalizeCityName } from "../src/geo/cityLookup";

describe("normalizeCityName", () => {
  it("removes diacritics", () => {
    expect(normalizeCityName("Kraków")).toBe("krakow");
  });

  it("lowercases and trims", () => {
    expect(normalizeCityName("  KRAKOW  ")).toBe("krakow");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeCityName("New   York")).toBe("new york");
  });
});

describe("lookupCoordinates", () => {
  it("finds Budapest regardless of case/accents/whitespace", () => {
    expect(lookupCoordinates(" Budapest ")).toEqual({ lat: 47.4979, lon: 19.0402 });
  });

  it("matches Kraków written without diacritics", () => {
    expect(lookupCoordinates("Krakow")).toEqual({ lat: 50.0647, lon: 19.945 });
  });

  it("returns null for an unknown city", () => {
    expect(lookupCoordinates("Atlantis")).toBeNull();
  });
});
