# Ügyfél geotávolság REST szolgáltatás — Design

Dátum: 2026-07-15

## Cél

Kis, önálló REST szolgáltatás Postgres fölött, ami offline (külső geokódoló API és LLM-hívás nélkül) betölti a `seed-customers.json` ügyféllistát, lokális referenciaadatból lat/lon-t rendel a településekhez, és két végponton keresztül kiszolgálja az ügyfélszámot, illetve a Budapesthez viszonyított távolság szerint rendezett ügyféllistát.

## Tech stack

- **Nyelv/futtatókörnyezet:** Node.js (v24) + TypeScript, `tsx` a fejlesztői futtatáshoz build lépés nélkül
- **Csomagkezelő:** pnpm
- **HTTP keretrendszer:** Express
- **DB driver:** `pg` (nyers SQL, nincs ORM)
- **Adatbázis:** PostgreSQL 16, `docker-compose.yml`-ben, host port **5433**
- **Tesztelés:** Vitest (unit) + supertest (integrációs, valós Postgres ellen)
- **API port:** 3000

## Projektstruktúra

```
├── docker-compose.yml          # Postgres 16, host port 5433
├── package.json                # pnpm, TypeScript, Express, pg, vitest
├── tsconfig.json
├── .env.example                # DATABASE_URL, PORT
├── data/
│   └── city-coordinates.json   # normalizált telepules -> {lat, lon}
├── migrations/
│   ├── 001_create_customers.sql
│   └── run.ts                  # migrációfuttató, schema_migrations táblával
├── seed-customers.json         # (már megvan a repóban)
├── src/
│   ├── db.ts                   # pg Pool létrehozása DATABASE_URL-ből
│   ├── server.ts               # Express app + listen
│   ├── app.ts                  # Express app összeállítása (route-ok bekötése)
│   ├── routes/
│   │   └── customers.ts        # GET /customers/count, GET /customers/by-distance
│   ├── geo/
│   │   ├── haversine.ts        # tiszta függvény: (lat1,lon1,lat2,lon2) -> km
│   │   └── cityLookup.ts       # normalizeCityName() + lookupCoordinates()
│   └── seed/
│       └── seed.ts             # seed-customers.json beolvasása, geokódolás, UPSERT
└── test/
    ├── haversine.test.ts
    ├── cityLookup.test.ts
    └── customers.route.test.ts
```

Réteges felépítés: a `geo/` mappa tiszta, oldalhatás-mentes függvényeket tartalmaz (unit tesztelhető DB nélkül), a `routes/` réteg csak lekérdezést és HTTP-válaszalakítást végez, a `seed/` a betöltési logikát izolálja. Az `app.ts`/`server.ts` szétválasztás lehetővé teszi, hogy a tesztek az Express app-ot supertest-tel hívják meg anélkül, hogy portot nyitnának.

## Adatmodell és migráció

```sql
-- migrations/001_create_customers.sql
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

- `schema_migrations(filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ)` tábla követi a lefutott migrációkat. A `migrations/run.ts` a `migrations/*.sql` fájlokat ábécésorrendben végigmegy, és csak a még nem alkalmazottakat futtatja le — `pnpm run migrate` kétszeri futtatása biztonságos.
- A `UNIQUE (name, telepules)` constraint adja az idempotencia alapját: a seed script `INSERT ... ON CONFLICT (name, telepules) DO UPDATE SET lat=EXCLUDED.lat, lon=EXCLUDED.lon, budget=EXCLUDED.budget, note=EXCLUDED.note` mintát használ — újrafuttatáskor frissít, nem duplikál.
- `lat`/`lon` nullable `DOUBLE PRECISION` — ismeretlen település esetén `NULL`.
- `budget` és `note` eltárolva, de nem kötelezőek (nullable).

## Geokódolási referencia

**`data/city-coordinates.json`** — normalizált (ékezet nélküli, kisbetűs) városnév kulcsokkal, a seedben szereplő mind a 15 városra:

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

**`src/geo/cityLookup.ts`**:
- `normalizeCityName(city: string): string` — Unicode NFD dekompozíció + kombináló ékezetjelek eltávolítása, kisbetűsítés, `trim()`, belső whitespace összevonása egy szóközre. `"Kraków"`, `" kraków "`, `"KRAKOW"` mind `"krakow"`-ra normalizálódik.
- `lookupCoordinates(city: string): {lat, lon} | null` — normalizál, majd keres a betöltött referenciában; nem talált település esetén `null`.
- Budapest kerületek kezelése **nincs implementálva** (a seed adatban nincs rá példa, a spec opcionálisnak jelöli) — csak pontos `"budapest"` normalizált egyezés számít találatnak.

## Seed folyamat (`src/seed/seed.ts`)

1. Beolvassa `seed-customers.json`-t és `data/city-coordinates.json`-t.
2. Minden ügyfélre: `lookupCoordinates(location.city)` — ha `null`, `console.warn`-nal logolja (`Nincs koordináta ehhez a településhez: "<city>" (ügyfél: <name>) — lat/lon = null`), és folytatja, nem dob hibát.
3. `INSERT INTO customers (...) VALUES (...) ON CONFLICT (name, telepules) DO UPDATE SET ...`.
4. A `telepules` oszlopba az **eredeti** (nem normalizált) városnév kerül a seedből — a normalizálás csak a kereséshez kell.

## Végpontok

### `GET /customers/count`
```sql
SELECT COUNT(*)::int AS count FROM customers;
```
→ `{ "count": 15 }`

### `GET /customers/by-distance`
1. `SELECT id, name, telepules, lat, lon, budget, note FROM customers`.
2. Referenciapont: Budapest koordinátái a `city-coordinates.json` `budapest` kulcsából (egyetlen forrás, nincs duplikált magic number).
3. Minden sorra: ha `lat`/`lon` nem null → `distanceKm = Math.round(haversineKm(BUDAPEST, row) * 10) / 10`; egyébként `distanceKm: null`.
4. Rendezés: nem-null `distanceKm` szerint növekvő, holtverseny esetén `name` szerint (alapértelmezett string-összehasonlítás); a `null` távolságú ügyfelek mindig a lista végén, egymás közt szintén `name` szerint.
5. Válasz: JSON tömb, minden elem `{ id, name, telepules, lat, lon, budget, note, distanceKm }`.

Budapesti ügyfél `distanceKm: 0` (a kerekítés után, mivel a koordinátája megegyezik a referenciaponttal).

## Haversine (`src/geo/haversine.ts`)

```ts
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number
```
Standard nagykör-távolság képlet, Föld sugár R=6371 km, kerekítés nélkül (a kerekítés a válasz-összeállításnál történik).

## Tesztelési stratégia

**Unit tesztek (Vitest, DB nélkül, gyors):**
- `test/haversine.test.ts`:
  - Budapest → Bécs ≈ 214 km (±1 km tolerancia)
  - Budapest → Budapest = 0 km
- `test/cityLookup.test.ts`:
  - `normalizeCityName` ékezet/kis-nagybetű/whitespace eseteire
  - `lookupCoordinates` ismeretlen városra `null`-t ad, nem dob hibát

**Integrációs teszt (supertest + valós Postgres, docker-compose-ból):**
- `test/customers.route.test.ts` ugyanazt a docker-compose-os Postgres instance-t használja, mint a fejlesztés (`DATABASE_URL`), a teszt elején `TRUNCATE customers RESTART IDENTITY` fut, majd a seed logika meghívása (nem a teljes seed script processzként, hanem a `src/seed/seed.ts`-ből exportált betöltő függvény importálva), végül `/customers/count` és `/customers/by-distance` válasz-alak és sorrend ellenőrzése — beleértve egy tesztben mesterségesen beszúrt, null-koordinátás ügyfél lista végén való ellenőrzését. Külön teszt-adatbázis nem szükséges a projekt méreténél.

## Tooling / scriptek

```
"migrate": "tsx migrations/run.ts",
"seed": "tsx src/seed/seed.ts",
"dev": "tsx watch src/server.ts",
"start": "node dist/server.js",
"build": "tsc",
"test": "vitest run"
```

## README tartalma

1. Előfeltételek (Docker, Node 24+, pnpm)
2. `docker compose up -d` — Postgres indítása (5433-as host port)
3. `pnpm install`
4. `pnpm run migrate` — séma létrehozása
5. `pnpm run seed` — seed adat betöltése (idempotens)
6. `pnpm run dev` — szerver indítása (`:3000`)
7. `pnpm test` — unit + integrációs tesztek
8. Végpontok rövid leírása példa `curl` hívásokkal

## Postgres MCP

A `docker-compose.yml` létrehozása és a konténer elindítása után projektszintű `.mcp.json` kerül a repóba egy Postgres MCP szerverrel, ami a `postgresql://localhost:5433/...` connection stringre mutat — fejlesztés közben séma/adat közvetlen lekérdezhető MCP-n keresztül.

## Commit terv

Kis, fókuszált commitok várható sorrendben:
1. docker-compose + README váz
2. migráció + séma
3. city-coordinates referencia + cityLookup + haversine + unit tesztek
4. seed script
5. Express app + count endpoint
6. by-distance endpoint + integrációs teszt
7. README finomítás + MCP bekötés

## Explicit nem-cél (YAGNI)

- Nincs authentikáció/authorizáció
- Nincs POST/PUT/DELETE végpont (csak a két kért GET)
- Nincs Budapest kerület felismerés (opcionális, seedben nincs rá adat)
- Nincs pagináció (15 rekord)
- Nincs Docker image a Node szolgáltatáshoz (csak Postgres fut konténerben; a Node app helyben fut)
