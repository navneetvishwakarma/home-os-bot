-- ─────────────────────────────────────────────────────────────────────────────
-- HOME OS — Idempotent schema update (safe to run repeatedly)
-- Brings an existing database to the latest app schema.
-- ─────────────────────────────────────────────────────────────────────────────

-- Ensure extension exists for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── ENUMS ───────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    WHERE t.typname = 'criticality_level'
  ) THEN
    CREATE TYPE criticality_level AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
  END IF;
END $$;

-- ─── TABLES ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS areas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_time     time NOT NULL DEFAULT '18:00:00',
  calendar_duration int  NOT NULL DEFAULT 60,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                    text              NOT NULL,
  area                     text              NOT NULL,
  criticality              criticality_level NOT NULL DEFAULT 'MEDIUM',
  effort_mins              int               NOT NULL DEFAULT 30,
  tags                     text[]            NOT NULL DEFAULT '{}',
  assigned_to              text              NOT NULL DEFAULT 'Me',
  deadline                 date,
  reasoning                text,
  raw_input                text,
  added_by                 text,
  completed                boolean           NOT NULL DEFAULT false,
  completed_at             timestamptz,
  is_recurring             boolean           NOT NULL DEFAULT false,
  recurrence_interval_days int,
  next_due_date            date,
  last_completed_at        date,
  created_at               timestamptz       NOT NULL DEFAULT now()
);

-- ─── TABLE ALIGNMENT FOR PRE-EXISTING INSTALLS ──────────────────────────────

ALTER TABLE areas
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS calendar_time     time        NOT NULL DEFAULT '18:00:00',
  ADD COLUMN IF NOT EXISTS calendar_duration int         NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz NOT NULL DEFAULT now();

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS title                    text,
  ADD COLUMN IF NOT EXISTS area                     text,
  ADD COLUMN IF NOT EXISTS criticality              criticality_level,
  ADD COLUMN IF NOT EXISTS effort_mins              int,
  ADD COLUMN IF NOT EXISTS tags                     text[],
  ADD COLUMN IF NOT EXISTS assigned_to              text,
  ADD COLUMN IF NOT EXISTS deadline                 date,
  ADD COLUMN IF NOT EXISTS reasoning                text,
  ADD COLUMN IF NOT EXISTS raw_input                text,
  ADD COLUMN IF NOT EXISTS added_by                 text,
  ADD COLUMN IF NOT EXISTS completed                boolean,
  ADD COLUMN IF NOT EXISTS completed_at             timestamptz,
  ADD COLUMN IF NOT EXISTS is_recurring             boolean,
  ADD COLUMN IF NOT EXISTS recurrence_interval_days int,
  ADD COLUMN IF NOT EXISTS next_due_date            date,
  ADD COLUMN IF NOT EXISTS last_completed_at        date,
  ADD COLUMN IF NOT EXISTS created_at               timestamptz;

-- Backfill nulls before constraints/defaults hardening
UPDATE tasks SET criticality = 'MEDIUM' WHERE criticality IS NULL;
UPDATE tasks SET effort_mins = 30 WHERE effort_mins IS NULL;
UPDATE tasks SET tags = '{}'::text[] WHERE tags IS NULL;
UPDATE tasks SET assigned_to = 'Me' WHERE assigned_to IS NULL;
UPDATE tasks SET completed = false WHERE completed IS NULL;
UPDATE tasks SET is_recurring = false WHERE is_recurring IS NULL;
UPDATE tasks SET title = 'Untitled task' WHERE title IS NULL;
UPDATE tasks SET area = 'General' WHERE area IS NULL;
UPDATE tasks SET created_at = now() WHERE created_at IS NULL;

-- Apply expected defaults/not-null where safe
ALTER TABLE tasks
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN area SET NOT NULL,
  ALTER COLUMN criticality SET DEFAULT 'MEDIUM',
  ALTER COLUMN criticality SET NOT NULL,
  ALTER COLUMN effort_mins SET DEFAULT 30,
  ALTER COLUMN effort_mins SET NOT NULL,
  ALTER COLUMN tags SET DEFAULT '{}'::text[],
  ALTER COLUMN tags SET NOT NULL,
  ALTER COLUMN assigned_to SET DEFAULT 'Me',
  ALTER COLUMN assigned_to SET NOT NULL,
  ALTER COLUMN completed SET DEFAULT false,
  ALTER COLUMN completed SET NOT NULL,
  ALTER COLUMN is_recurring SET DEFAULT false,
  ALTER COLUMN is_recurring SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now();

-- ─── SEEDING (idempotent) ────────────────────────────────────────────────────

INSERT INTO areas (name) VALUES
  ('Kitchen'),
  ('Bathroom'),
  ('Common Bathroom'),
  ('Master Bedroom'),
  ('Office'),
  ('Guest Bedroom'),
  ('Living Room'),
  ('Garden'),
  ('Balcony'),
  ('Utility Room'),
  ('Entrance'),
  ('General')
ON CONFLICT (name) DO NOTHING;

INSERT INTO settings (calendar_time, calendar_duration)
SELECT '18:00:00', 60
WHERE NOT EXISTS (SELECT 1 FROM settings);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tasks_incomplete
  ON tasks (criticality, effort_mins)
  WHERE completed = false;

CREATE INDEX IF NOT EXISTS idx_tasks_area
  ON tasks (area)
  WHERE completed = false;

CREATE INDEX IF NOT EXISTS idx_tasks_tags
  ON tasks USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_tasks_recurring_due
  ON tasks (next_due_date)
  WHERE is_recurring = true AND completed = false;

-- ─── UPDATED_AT TRIGGER FOR SETTINGS (idempotent) ───────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS settings_updated_at ON settings;
CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE tasks    DISABLE ROW LEVEL SECURITY;
ALTER TABLE areas    DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;

-- ─── VERIFY ──────────────────────────────────────────────────────────────────

SELECT 'areas_count' AS metric, COUNT(*)::text AS value FROM areas
UNION ALL
SELECT 'settings_count' AS metric, COUNT(*)::text AS value FROM settings
UNION ALL
SELECT 'tasks_count' AS metric, COUNT(*)::text AS value FROM tasks;