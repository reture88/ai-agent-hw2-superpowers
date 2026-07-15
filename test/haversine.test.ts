import { describe, expect, it } from "vitest";
import { haversineKm } from "../src/geo/haversine";

const BUDAPEST = { lat: 47.4979, lon: 19.0402 };
const VIENNA = { lat: 48.2082, lon: 16.3738 };

describe("haversineKm", () => {
  it("returns ~214km between Budapest and Vienna", () => {
    const distance = haversineKm(BUDAPEST.lat, BUDAPEST.lon, VIENNA.lat, VIENNA.lon);
    expect(distance).toBeGreaterThan(213);
    expect(distance).toBeLessThan(216);
  });

  it("returns 0 for identical coordinates", () => {
    const distance = haversineKm(BUDAPEST.lat, BUDAPEST.lon, BUDAPEST.lat, BUDAPEST.lon);
    expect(distance).toBe(0);
  });
});
