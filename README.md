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

Megjegyzés: `claude mcp list` a `postgres` szervert "Pending approval" státusszal listázhatja — ez várt viselkedés (a projektszintű MCP szerverek első használat előtt interaktív jóváhagyást igényelnek egy `claude` munkamenetben), nem hiba.
