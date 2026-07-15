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
