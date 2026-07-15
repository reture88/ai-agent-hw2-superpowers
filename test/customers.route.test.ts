import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db";
import { loadCustomers } from "../src/seed/seed";

const app = createApp();

beforeEach(async () => {
  await pool.query("TRUNCATE customers RESTART IDENTITY");
});

afterAll(async () => {
  await pool.end();
});

describe("GET /customers/count", () => {
  it("returns zero for an empty table", async () => {
    const response = await request(app).get("/customers/count");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ count: 0 });
  });

  it("returns the number of rows in the customers table", async () => {
    await pool.query(
      `INSERT INTO customers (name, telepules) VALUES ('A', 'CityA'), ('B', 'CityB'), ('C', 'CityC')`
    );
    const response = await request(app).get("/customers/count");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ count: 3 });
  });
});

describe("GET /customers/by-distance", () => {
  it("returns 0km for a customer located exactly at the Budapest reference point", async () => {
    await pool.query(
      `INSERT INTO customers (name, telepules, lat, lon) VALUES ('Bp Customer', 'Budapest', 47.4979, 19.0402)`
    );
    const response = await request(app).get("/customers/by-distance");
    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({ telepules: "Budapest", distanceKm: 0 });
  });

  it("places customers with unknown coordinates at the end with distanceKm null", async () => {
    await pool.query(
      `INSERT INTO customers (name, telepules, lat, lon) VALUES
       ('Known City', 'Vienna', 48.2082, 16.3738),
       ('Unknown City', 'Atlantis', NULL, NULL)`
    );
    const response = await request(app).get("/customers/by-distance");
    const last = response.body[response.body.length - 1];
    expect(last).toMatchObject({ telepules: "Atlantis", distanceKm: null });
  });

  it("breaks ties by name when distances are equal", async () => {
    await pool.query(
      `INSERT INTO customers (name, telepules, lat, lon) VALUES
       ('Zeta', 'CityZ', 48.0, 17.0),
       ('Alpha', 'CityA', 48.0, 17.0),
       ('Mid', 'CityM', 48.0, 17.0)`
    );
    const response = await request(app).get("/customers/by-distance");
    const names = response.body.map((c: { name: string }) => c.name);
    expect(names).toEqual(["Alpha", "Mid", "Zeta"]);
  });

  it("includes all seeded customers with a valid ascending distance order", async () => {
    await loadCustomers();
    const response = await request(app).get("/customers/by-distance");
    expect(response.body).toHaveLength(15);

    const nonNullDistances = response.body
      .map((c: { distanceKm: number | null }) => c.distanceKm)
      .filter((d: number | null): d is number => d !== null);
    const sorted = [...nonNullDistances].sort((a, b) => a - b);
    expect(nonNullDistances).toEqual(sorted);
    expect(response.body[0].distanceKm).toBe(0);
  });
});
