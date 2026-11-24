-- =============================================================================
-- Data Plier: seed a tiny Delta table so Databricks "Save and discover" succeeds
-- =============================================================================
-- Your UI error:  no tables found in dataplier.users
-- Run this in:    Databricks > SQL Editor (or a notebook SQL cell) with a warehouse
--                 that can write to catalog `dataplier`.
--
-- Requirements:
--   - Unity Catalog catalog `dataplier` already exists (or change names below).
--   - Your user / service principal has CREATE TABLE on schema `dataplier.users`
--     (CREATE SCHEMA if the schema does not exist yet).
-- =============================================================================

USE CATALOG dataplier;

-- Create schema if it is empty / missing (safe to re-run)
CREATE SCHEMA IF NOT EXISTS users
  COMMENT 'Schema used by Data Plier Databricks connection discovery';

-- Managed Delta table (shows up in Unity Catalog table list used by discovery)
CREATE TABLE IF NOT EXISTS dataplier.users.dataplier_discovery_smoke (
  id            BIGINT       NOT NULL,
  label         STRING,
  amount        DECIMAL(10,2),
  recorded_at   TIMESTAMP
)
USING DELTA
COMMENT 'Smoke-test table for Data Plier connection discovery; safe to delete after testing';

-- One sample row (idempotent — safe to re-run the whole script)
MERGE INTO dataplier.users.dataplier_discovery_smoke AS t
USING (SELECT 1 AS id) AS s
ON t.id = s.id
WHEN NOT MATCHED THEN
  INSERT (id, label, amount, recorded_at)
  VALUES (
    1,
    'hello from dataplier seed script',
    CAST(42.00 AS DECIMAL(10,2)),
    current_timestamp()
  );

-- Verify (optional)
-- SHOW TABLES IN dataplier.users;
-- SELECT * FROM dataplier.users.dataplier_discovery_smoke;
