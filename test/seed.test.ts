import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../src/db";
import { loadCustomers } from "../src/seed/seed";

beforeEach(async () => {
  await pool.query("TRUNCATE customers RESTART IDENTITY");
});

afterAll(async () => {
  await pool.end();
});

describe("loadCustomers", () => {
  it("loads all 15 seed customers", async () => {
    await loadCustomers();
    const result = await pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM customers"
    );
    expect(result.rows[0].count).toBe(15);
  });

  it("is idempotent when run twice", async () => {
    await loadCustomers();
    await loadCustomers();
    const result = await pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM customers"
    );
    expect(result.rows[0].count).toBe(15);
  });

  it("assigns Budapest's coordinates to the Budapest customer", async () => {
    await loadCustomers();
    const result = await pool.query<{ lat: number; lon: number }>(
      "SELECT lat, lon FROM customers WHERE telepules = 'Budapest'"
    );
    expect(result.rows[0]).toEqual({ lat: 47.4979, lon: 19.0402 });
  });
});
