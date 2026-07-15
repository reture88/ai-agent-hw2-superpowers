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
