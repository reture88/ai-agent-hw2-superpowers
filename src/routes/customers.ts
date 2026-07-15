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
