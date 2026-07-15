import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db";

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
