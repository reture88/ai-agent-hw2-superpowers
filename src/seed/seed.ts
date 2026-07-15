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
