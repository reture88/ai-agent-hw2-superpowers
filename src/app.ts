import express, { Express } from "express";
import { customersRouter } from "./routes/customers";

export function createApp(): Express {
  const app = express();
  app.use("/customers", customersRouter);
  return app;
}
