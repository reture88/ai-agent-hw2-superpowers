# Customer Geo-Distance Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a small, self-contained offline REST service over PostgreSQL that loads `seed-customers.json`, geocodes customers against a local bundled reference, and serves customer count and Budapest-distance-sorted listings.

**Architecture:** Node.js/TypeScript/Express service with a raw `pg` connection pool (no ORM), a hand-rolled SQL migration runner, and an idempotent seed script that geocodes via a bundled JSON lookup table. Pure functions (`haversineKm`, `normalizeCityName`/`lookupCoordinates`) are isolated from I/O so they're unit-testable without a database; routes and the seed script are covered by integration tests against a real dockerized Postgres.

**Tech Stack:** Node.js v24, TypeScript (CommonJS output), pnpm, Express 4, `pg`, `tsx` (dev runtime), Vitest + supertest (tests), Docker Compose (Postgres 16).

## Global Constraints

- Node.js v24+, pnpm as package manager — verified locally (`node --version`, `pnpm --version`).
- PostgreSQL runs via Docker Compose, host port **5433** (container port 5432), credentials `postgres`/`postgres`, database `customers`.
- API server listens on port **3000** by default (overridable via `PORT` env var).
- No ORM — raw SQL via the `pg` driver.
- No external network calls at runtime: geocoding uses only the bundled `data/city-coordinates.json`.
- Idempotency key for seeding: `UNIQUE (name, telepules)` constraint with `ON CONFLICT ... DO UPDATE`.
- `GET /customers/count` → `{ "count": <int> }`.
- `GET /customers/by-distance` → array of `{ id, name, telepules, lat, lon, budget, note, distanceKm }`, sorted by `distanceKm` ascending (nulls last), ties broken by `name` ascending. `distanceKm` rounded to 1 decimal; Budapest reference point taken from `data/city-coordinates.json["budapest"]`.
- Unmatched town names never throw — they are logged via `console.warn` and stored with `lat = lon = NULL`.
- City-name matching is accent-insensitive, case-insensitive, and whitespace-trimmed/collapsed (no Budapest-district handling — out of scope per spec).
- Vitest must run test files sequentially (`fileParallelism: false`) because integration tests share one physical Postgres database and use `TRUNCATE` for fixture isolation.

---

## File Structure Overview

```
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
├── .gitignore
├── README.md
├── seed-customers.json          (pre-existing)
├── .mcp.json                    (added in Task 8)
├── data/
│   └── city-coordinates.json
├── migrations/
│   ├── 001_create_customers.sql
│   └── run.ts
├── src/
│   ├── db.ts
│   ├── app.ts
│   ├── server.ts
│   ├── routes/
│   │   └── customers.ts
│   ├── geo/
│   │   ├── haversine.ts
│   │   └── cityLookup.ts
│   └── seed/
│       └── seed.ts
└── test/
    ├── haversine.test.ts
    ├── cityLookup.test.ts
    ├── seed.test.ts
    └── customers.route.test.ts
```

---

### Task 1: Project scaffold — tooling, Docker Compose, config files

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`
- Modify: `README.md`
- Modify: `seed-customers.json` (git-add only; content already exists)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `pnpm run migrate|seed|dev|build|start|test` script names, used by every later task. `DATABASE_URL` / `PORT` env var contract, used by `src/db.ts` (Task 2) and `src/server.ts` (Task 6).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "customer-geodistance-service",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "migrate": "tsx migrations/run.ts",
    "seed": "tsx src/seed/seed.ts",
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "express": "^4.21.0",
    "pg": "^8.13.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.10.0",
    "@types/pg": "^8.11.10",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts", "migrations/**/*.ts"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
```

`fileParallelism: false` is required because multiple test files will `TRUNCATE` the same shared Postgres `customers` table; running files concurrently would cause cross-file races.

- [ ] **Step 4: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: customers
    ports:
      - "5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 2s
      timeout: 2s
      retries: 15

volumes:
  pgdata:
```

- [ ] **Step 5: Create `.env.example`**

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/customers
PORT=3000
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
dist/
.env
```

- [ ] **Step 7: Write README skeleton**

Replace `README.md` contents with:

```markdown
# ai-agent-hw2-superpowers

Kis, önálló REST szolgáltatás ügyfelek Budapesthez viszonyított távolság szerinti listázására, offline geokódolással (nincs külső API-hívás, nincs LLM-hívás futásidőben).

## Előfeltételek

- Docker + Docker Compose
- Node.js v24+
- pnpm

## Futtatás

1. Postgres indítása:
   ```
   docker compose up -d --wait
   ```
2. Függőségek telepítése:
   ```
   pnpm install
   ```
3. Séma létrehozása (idempotens):
   ```
   pnpm run migrate
   ```
4. Seed adat betöltése (idempotens — kétszer futtatva sem duplikál):
   ```
   pnpm run seed
   ```
5. Szerver indítása fejlesztői módban:
   ```
   pnpm run dev
   ```
   Az API a `http://localhost:3000`-en érhető el.
6. Tesztek futtatása (a fenti 1., 2. és 3. lépés szükséges hozzá — a Postgres-nek futnia és migráltnak kell lennie):
   ```
   pnpm test
   ```

## Végpontok

_(Task 8-ban kerül kiegészítésre példa `curl` hívásokkal.)_

## Fejlesztői eszközök

_(Task 8-ban kerül kiegészítésre a Postgres MCP bekötés leírásával.)_
```

- [ ] **Step 8: Verify tooling installs cleanly**

Run: `pnpm install`
Expected: installs without errors, creates `pnpm-lock.yaml` and `node_modules/`.

Run: `docker compose up -d --wait`
Expected: `postgres` service reaches healthy state, command exits 0.

Run: `docker compose ps`
Expected: shows the `postgres` service as `running (healthy)`.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vitest.config.ts docker-compose.yml .env.example .gitignore README.md seed-customers.json
git commit -m "chore: scaffold project tooling, Docker Compose Postgres, and seed data"
```

---

### Task 2: Migration runner and `customers` table schema

**Files:**
- Create: `src/db.ts`
- Create: `migrations/001_create_customers.sql`
- Create: `migrations/run.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` env var (Task 1's `.env.example` contract); `.env` file (engineer must `cp .env.example .env` — call this out in Step 5).
- Produces: `pool: Pool` exported from `src/db.ts`, imported by every later task that touches the database (`migrations/run.ts`, `src/seed/seed.ts`, `src/routes/customers.ts`, all integration tests). `customers` table with columns `id, name, telepules, lat, lon, budget, note` and `UNIQUE (name, telepules)`.

- [ ] **Step 1: Create `src/db.ts`**

```ts
import { Pool } from "pg";
import { existsSync } from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/customers";

export const pool = new Pool({ connectionString: DATABASE_URL });
```

- [ ] **Step 2: Create `migrations/001_create_customers.sql`**

```sql
CREATE TABLE customers (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  telepules  TEXT NOT NULL,
  lat        DOUBLE PRECISION,
  lon        DOUBLE PRECISION,
  budget     INTEGER,
  note       TEXT,
  UNIQUE (name, telepules)
);
```

- [ ] **Step 3: Create `migrations/run.ts`**

```ts
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pool } from "../src/db";

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations"
  );
  return new Set(result.rows.map((row) => row.filename));
}

async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedMigrations();

  const migrationsDir = __dirname;
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping already applied migration: ${file}`);
      continue;
    }

    const sql = readFileSync(path.join(migrationsDir, file), "utf-8");
    console.log(`Applying migration: ${file}`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

runMigrations()
  .then(async () => {
    console.log("Migrations complete.");
    await pool.end();
  })
  .catch(async (error) => {
    console.error("Migration failed:", error);
    await pool.end();
    process.exitCode = 1;
  });
```

- [ ] **Step 4: Create `.env` from the example**

Run: `cp .env.example .env`
Expected: `.env` file created (git-ignored, not committed).

- [ ] **Step 5: Run migration and verify table creation**

Run: `pnpm run migrate`
Expected output includes:
```
Applying migration: 001_create_customers.sql
Migrations complete.
```

Run: `docker compose exec postgres psql -U postgres -d customers -c "\d customers"`
Expected: lists columns `id, name, telepules, lat, lon, budget, note` with the `customers_name_telepules_key` unique constraint.

- [ ] **Step 6: Verify idempotency by running migration again**

Run: `pnpm run migrate`
Expected output:
```
Skipping already applied migration: 001_create_customers.sql
Migrations complete.
```

Run: `docker compose exec postgres psql -U postgres -d customers -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'customers';"`
Expected: `count` = `1` (table was not recreated/duplicated).

- [ ] **Step 7: Commit**

```bash
git add src/db.ts migrations/001_create_customers.sql migrations/run.ts
git commit -m "feat: add migration runner and customers table schema"
```

---

### Task 3: Haversine distance function

**Files:**
- Create: `src/geo/haversine.ts`
- Test: `test/haversine.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, no dependencies on earlier tasks).
- Produces: `haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number`, consumed by `src/routes/customers.ts` (Task 7).

- [ ] **Step 1: Write the failing test**

Create `test/haversine.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/haversine.test.ts`
Expected: FAIL — `Cannot find module '../src/geo/haversine'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/geo/haversine.ts`:

```ts
const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/haversine.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/geo/haversine.ts test/haversine.test.ts
git commit -m "feat: add haversine distance calculation with unit tests"
```

---

### Task 4: City coordinate reference and normalized lookup

**Files:**
- Create: `data/city-coordinates.json`
- Create: `src/geo/cityLookup.ts`
- Test: `test/cityLookup.test.ts`

**Interfaces:**
- Consumes: nothing (pure function/data, no dependencies on earlier tasks).
- Produces: `normalizeCityName(city: string): string` and `lookupCoordinates(city: string): { lat: number; lon: number } | null`, consumed by `src/seed/seed.ts` (Task 5) and `src/routes/customers.ts` (Task 7).

- [ ] **Step 1: Create `data/city-coordinates.json`**

```json
{
  "budapest":   { "lat": 47.4979, "lon": 19.0402 },
  "vienna":     { "lat": 48.2082, "lon": 16.3738 },
  "munich":     { "lat": 48.1351, "lon": 11.5820 },
  "milan":      { "lat": 45.4642, "lon": 9.1900 },
  "barcelona":  { "lat": 41.3874, "lon": 2.1686 },
  "lyon":       { "lat": 45.7640, "lon": 4.8357 },
  "krakow":     { "lat": 50.0647, "lon": 19.9450 },
  "prague":     { "lat": 50.0755, "lon": 14.4378 },
  "lisbon":     { "lat": 38.7223, "lon": -9.1393 },
  "amsterdam":  { "lat": 52.3676, "lon": 4.9041 },
  "stockholm":  { "lat": 59.3293, "lon": 18.0686 },
  "ljubljana":  { "lat": 46.0569, "lon": 14.5058 },
  "bucharest":  { "lat": 44.4268, "lon": 26.1025 },
  "dublin":     { "lat": 53.3498, "lon": -6.2603 },
  "copenhagen": { "lat": 55.6761, "lon": 12.5683 }
}
```

- [ ] **Step 2: Write the failing test**

Create `test/cityLookup.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run test/cityLookup.test.ts`
Expected: FAIL — `Cannot find module '../src/geo/cityLookup'`.

- [ ] **Step 4: Write minimal implementation**

Create `src/geo/cityLookup.ts`:

```ts
import cityCoordinates from "../../data/city-coordinates.json";

export interface Coordinates {
  lat: number;
  lon: number;
}

const DIACRITIC_MARKS = /[\u0300-\u036f]/g;

export function normalizeCityName(city: string): string {
  return city
    .normalize("NFD")
    .replace(DIACRITIC_MARKS, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

const normalizedCoordinates: Record<string, Coordinates> = cityCoordinates;

export function lookupCoordinates(city: string): Coordinates | null {
  const key = normalizeCityName(city);
  return normalizedCoordinates[key] ?? null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run test/cityLookup.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add data/city-coordinates.json src/geo/cityLookup.ts test/cityLookup.test.ts
git commit -m "feat: add local city coordinate reference and normalized lookup"
```

---

### Task 5: Idempotent seed script

**Files:**
- Create: `src/seed/seed.ts`
- Test: `test/seed.test.ts`

**Interfaces:**
- Consumes: `pool` from `src/db.ts` (Task 2), `lookupCoordinates` from `src/geo/cityLookup.ts` (Task 4), `seed-customers.json` (repo root, Task 1).
- Produces: `loadCustomers(): Promise<void>`, consumed by `test/customers.route.test.ts` (Task 7) and by the CLI entrypoint in this file.

- [ ] **Step 1: Write the failing test**

Create `test/seed.test.ts`:

```ts
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
```

This test requires the `customers` table to already exist — Docker Compose (Task 1) and the migration (Task 2) must have been run first.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/seed.test.ts`
Expected: FAIL — `Cannot find module '../src/seed/seed'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/seed/seed.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { pool } from "../db";
import { lookupCoordinates } from "../geo/cityLookup";

interface SeedCustomer {
  name: string;
  budget: number;
  location: { city: string; countryCode: string };
  note: string;
}

export async function loadCustomers(): Promise<void> {
  const seedPath = path.resolve(__dirname, "../../seed-customers.json");
  const customers: SeedCustomer[] = JSON.parse(readFileSync(seedPath, "utf-8"));

  for (const customer of customers) {
    const coordinates = lookupCoordinates(customer.location.city);
    if (!coordinates) {
      console.warn(
        `Nincs koordináta ehhez a településhez: "${customer.location.city}" (ügyfél: ${customer.name}) — lat/lon = null`
      );
    }

    await pool.query(
      `INSERT INTO customers (name, telepules, lat, lon, budget, note)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (name, telepules)
       DO UPDATE SET lat = EXCLUDED.lat, lon = EXCLUDED.lon, budget = EXCLUDED.budget, note = EXCLUDED.note`,
      [
        customer.name,
        customer.location.city,
        coordinates?.lat ?? null,
        coordinates?.lon ?? null,
        customer.budget,
        customer.note,
      ]
    );
  }

  console.log(`Seeded ${customers.length} customers.`);
}

if (require.main === module) {
  loadCustomers()
    .then(() => pool.end())
    .catch((error) => {
      console.error("Seeding failed:", error);
      process.exitCode = 1;
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/seed.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify the CLI entrypoint manually**

Run: `pnpm run seed` (twice in a row)
Expected: both runs print `Seeded 15 customers.` with no errors.

Run: `docker compose exec postgres psql -U postgres -d customers -c "SELECT COUNT(*) FROM customers;"`
Expected: `count` = `15` (not 30 — confirms idempotency of the real CLI path, not just the test path).

- [ ] **Step 6: Commit**

```bash
git add src/seed/seed.ts test/seed.test.ts
git commit -m "feat: add idempotent seed script with offline geocoding"
```

---

### Task 6: Express app and `GET /customers/count`

**Files:**
- Create: `src/app.ts`
- Create: `src/server.ts`
- Create: `src/routes/customers.ts`
- Test: `test/customers.route.test.ts`

**Interfaces:**
- Consumes: `pool` from `src/db.ts` (Task 2).
- Produces: `createApp(): Express` from `src/app.ts`, consumed by `test/customers.route.test.ts` (this task and Task 7) and `src/server.ts`. `customersRouter` mounted at `/customers`, extended in Task 7 with the `/by-distance` handler.

- [ ] **Step 1: Write the failing test**

Create `test/customers.route.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/customers.route.test.ts`
Expected: FAIL — `Cannot find module '../src/app'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/routes/customers.ts`:

```ts
import { Router } from "express";
import { pool } from "../db";

export const customersRouter = Router();

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
```

Create `src/app.ts`:

```ts
import express, { Express } from "express";
import { customersRouter } from "./routes/customers";

export function createApp(): Express {
  const app = express();
  app.use("/customers", customersRouter);
  return app;
}
```

Create `src/server.ts`:

```ts
import { createApp } from "./app";

const PORT = Number(process.env.PORT ?? 3000);

const app = createApp();

app.listen(PORT, () => {
  console.log(`Customer geo-distance service listening on port ${PORT}`);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/customers.route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify the running server manually**

Run: `pnpm run dev` (in a separate terminal, leave it running)
Run: `curl http://localhost:3000/customers/count`
Expected: JSON response like `{"count":15}` (or `0` if `pnpm run seed` hasn't been run in this DB state — either is fine, it just confirms the route responds).
Stop the dev server (Ctrl+C) before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/app.ts src/server.ts src/routes/customers.ts test/customers.route.test.ts
git commit -m "feat: add Express app with GET /customers/count"
```

---

### Task 7: `GET /customers/by-distance` endpoint

**Files:**
- Modify: `src/routes/customers.ts`
- Modify: `test/customers.route.test.ts`

**Interfaces:**
- Consumes: `haversineKm` from `src/geo/haversine.ts` (Task 3), `lookupCoordinates` from `src/geo/cityLookup.ts` (Task 4), `loadCustomers` from `src/seed/seed.ts` (Task 5, used only in the end-to-end smoke test).
- Produces: `GET /customers/by-distance` route, fully implementing the by-distance contract from Global Constraints.

- [ ] **Step 1: Write the failing tests**

Add to `test/customers.route.test.ts` (append after the existing `GET /customers/count` describe block), and add `loadCustomers` to the imports:

```ts
import { loadCustomers } from "../src/seed/seed";
```

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/customers.route.test.ts`
Expected: the four new tests FAIL with 404 status (route doesn't exist yet); the two `GET /customers/count` tests still PASS.

- [ ] **Step 3: Write minimal implementation**

Replace the contents of `src/routes/customers.ts` with:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run test/customers.route.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: all test files pass (haversine, cityLookup, seed, customers.route).

- [ ] **Step 6: Commit**

```bash
git add src/routes/customers.ts test/customers.route.test.ts
git commit -m "feat: add GET /customers/by-distance sorted by haversine distance"
```

---

### Task 8: README finalization and Postgres MCP setup

**Files:**
- Modify: `README.md`
- Create: `.mcp.json` (via `claude mcp add`, not hand-written)

**Interfaces:**
- Consumes: the full API contract from Tasks 6–7 (for documentation), `docker-compose.yml`'s connection details from Task 1 (for the MCP connection string).
- Produces: nothing consumed by later tasks (final task).

- [ ] **Step 1: Replace the "Végpontok" and "Fejlesztői eszközök" sections of `README.md`**

```markdown
## Végpontok

### `GET /customers/count`

```
curl http://localhost:3000/customers/count
```

```json
{ "count": 15 }
```

### `GET /customers/by-distance`

Ügyfelek listája Budapesthez viszonyított távolság szerint növekvő sorrendben. `distanceKm` 1 tizedesre kerekítve; ismeretlen koordinátájú ügyfelek a lista végén, `distanceKm: null`.

```
curl http://localhost:3000/customers/by-distance
```

```json
[
  { "id": 1, "name": "Anna Kovács", "telepules": "Budapest", "lat": 47.4979, "lon": 19.0402, "budget": 850, "note": "...", "distanceKm": 0 },
  { "id": 2, "name": "Lena Fischer", "telepules": "Vienna", "lat": 48.2082, "lon": 16.3738, "budget": 950, "note": "...", "distanceKm": 214.4 }
]
```

## Fejlesztői eszközök

### Postgres MCP

A fejlesztéshez egy projektszintű Postgres MCP szerver van bekötve (`.mcp.json`), ami a docker-compose-ban futó adatbázisra mutat (`postgresql://postgres:postgres@localhost:5433/customers`). Ehhez a Postgres konténernek futnia kell (`docker compose up -d --wait`).
```

- [ ] **Step 2: Add the Postgres MCP server**

Run: `docker compose up -d --wait` (ensure Postgres is running)

Run:
```bash
claude mcp add postgres -s project -- npx -y @modelcontextprotocol/server-postgres postgresql://postgres:postgres@localhost:5433/customers
```
Expected: confirms the `postgres` server was added, and creates/updates `.mcp.json` in the repo root.

- [ ] **Step 3: Verify the MCP server connects**

Run: `claude mcp list`
Expected: `postgres` listed with a connected/healthy status.

- [ ] **Step 4: Full end-to-end smoke test**

Run in order:
```bash
docker compose up -d --wait
pnpm install
pnpm run migrate
pnpm run seed
pnpm run seed
pnpm test
```
Expected: every command succeeds; `pnpm run seed` run twice does not change the final row count (15); `pnpm test` passes all suites.

Run: `pnpm run dev` (separate terminal), then:
```bash
curl http://localhost:3000/customers/count
curl http://localhost:3000/customers/by-distance
```
Expected: `{"count":15}` and a 15-element array sorted ascending by `distanceKm`, Budapest customer(s) first at `0`.
Stop the dev server (Ctrl+C).

- [ ] **Step 5: Commit**

```bash
git add README.md .mcp.json
git commit -m "docs: finalize README with endpoint examples and Postgres MCP setup"
```

---

## Self-Review Notes

- **Spec coverage:** adatmodell (Task 2), idempotens seed + geokódolás + robusztus egyeztetés (Task 4, 5), `/customers/count` (Task 6), `/customers/by-distance` incl. sorrend/kerekítés/null-kezelés/holtverseny (Task 7), unit teszt haversine-re incl. Bp-Bécs/0km/null-kezelés (Task 3 covers the two numeric cases; the null-coordinate case is covered at the route level in Task 7 since `haversineKm` itself never receives nulls — the route layer is what decides `null` vs. calling the function), README (Task 1 + 8), kis fókuszált commitok (8 tasks, 8 commits), Postgres MCP (Task 8). All spec requirements are covered.
- **Type consistency:** `CustomerRow` (Task 7) matches the `customers` table columns from Task 2 exactly; `Coordinates` (Task 4) fields (`lat`, `lon`) match usage in `seed.ts` (Task 5) and `routes/customers.ts` (Task 7); `loadCustomers` name matches its Task 5 export and its Task 7 test import.
- **No placeholders:** every step contains complete, runnable code or exact commands with expected output.
