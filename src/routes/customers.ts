import { Router } from "express";
import { pool } from "../db";
import { haversineKm } from "../geo/haversine";
import { lookupCoordinates } from "../geo/cityLookup";

export const customersRouter = Router();

interface CustomerRow {
  id: number;
  name: string;
  telepules: string;
  lat: number | null;
  lon: number | null;
  budget: number | null;
  note: string | null;
}

customersRouter.get("/count", async (_req, res) => {
  try {
    const result = await pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM customers"
    );
    res.json({ count: result.rows[0].count });
  } catch (error) {
    console.error("Failed to count customers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

customersRouter.get("/by-distance", async (_req, res) => {
  try {
    const result = await pool.query<CustomerRow>(
      "SELECT id, name, telepules, lat, lon, budget, note FROM customers"
    );

    const budapest = lookupCoordinates("Budapest");
    if (!budapest) {
      throw new Error("Budapest coordinates missing from reference data");
    }

    const withDistance = result.rows.map((row) => {
      const distanceKm =
        row.lat !== null && row.lon !== null
          ? Math.round(haversineKm(budapest.lat, budapest.lon, row.lat, row.lon) * 10) / 10
          : null;
      return { ...row, distanceKm };
    });

    withDistance.sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) return a.name.localeCompare(b.name);
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
      return a.name.localeCompare(b.name);
    });

    res.json(withDistance);
  } catch (error) {
    console.error("Failed to compute customer distances:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
