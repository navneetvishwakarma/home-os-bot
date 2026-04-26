-- ─────────────────────────────────────────────────────────────────────────────
-- HOME OS — Supabase Schema
-- Run this entire script in Supabase SQL Editor → New Query → Run
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── ENUMS ───────────────────────────────────────────────────────────────────

CREATE TYPE criticality_level AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');


-- ─── AREAS ───────────────────────────────────────────────────────────────────

CREATE TABLE areas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default areas
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
  ('General');


-- ─── SETTINGS ────────────────────────────────────────────────────────────────

CREATE TABLE settings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_time     time NOT NULL DEFAULT '18:00:00',
  calendar_duration int  NOT NULL DEFAULT 60,  -- minutes
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Seed one default settings row (always single row, update never insert)
INSERT INTO settings (calendar_time, calendar_duration)
VALUES ('18:00:00', 60);


-- ─── TASKS ───────────────────────────────────────────────────────────────────

CREATE TABLE tasks (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 
  -- Core fields
  title                    text              NOT NULL,
  area                     text              NOT NULL,
  criticality              criticality_level NOT NULL DEFAULT 'MEDIUM',
  effort_mins              int               NOT NULL DEFAULT 30,
  tags                     text[]            NOT NULL DEFAULT '{}',
  assigned_to              text              NOT NULL DEFAULT 'Me',
  deadline                 date,
  reasoning                text,
  raw_input                text,
  added_by                 text,             -- Telegram user_id as text
 
  -- Completion fields
  completed                boolean           NOT NULL DEFAULT false,
  completed_at             timestamptz,
 
  -- Recurrence fields (v2 logic, schema reserved now)
  is_recurring             boolean           NOT NULL DEFAULT false,
  recurrence_interval_days int,              -- e.g. 7 = weekly, 14 = fortnightly, 30 = monthly
  next_due_date            date,             -- computed on each completion
  last_completed_at        date,             -- date portion of last completion
 
  -- Timestamps
  created_at               timestamptz       NOT NULL DEFAULT now()
);


-- ─── INDEXES ─────────────────────────────────────────────────────────────────

-- Fast fetch for daily queue (incomplete tasks ordered by priority)
CREATE INDEX idx_tasks_incomplete
  ON tasks (criticality, effort_mins)
  WHERE completed = false;

-- Fast fetch by area (for /areas summary queries)
CREATE INDEX idx_tasks_area
  ON tasks (area)
  WHERE completed = false;

-- Fast fetch by tag (for quick-win queue filter)
CREATE INDEX idx_tasks_tags
  ON tasks USING GIN (tags);

-- Fast fetch for due recurring tasks (used by v2 cron job)
CREATE INDEX idx_tasks_recurring_due
  ON tasks (next_due_date)
  WHERE is_recurring = true AND completed = false;


-- ─── UPDATED_AT TRIGGER FOR SETTINGS ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─── ROW LEVEL SECURITY (RLS) ─────────────────────────────────────────────────
-- We use the service role key in the bot (server-side only), so RLS is disabled.
-- Enable only if you add a web frontend with user auth later.

ALTER TABLE tasks    DISABLE ROW LEVEL SECURITY;
ALTER TABLE areas    DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;


-- ─── VERIFY ──────────────────────────────────────────────────────────────────
-- Run these selects after the script to confirm everything looks right.

SELECT * FROM areas    ORDER BY name;
SELECT * FROM settings;
SELECT COUNT(*) AS task_count FROM tasks;