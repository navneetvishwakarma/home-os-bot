-- ─────────────────────────────────────────────────────────────────────────────
-- HOME OS — One-time migration: single-household → multi-tenant
-- Run AFTER multi_tenant_schema.sql.
--
-- Before running, replace the two placeholders:
--   :seed_household_name  →  e.g. 'The Sharma House'
--   :admin_telegram_id    →  your Telegram user ID as a string, e.g. '123456789'
--
-- In Supabase SQL Editor, use the "Set variables" panel or do a find-replace
-- before pasting. The script is idempotent and safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. Create seed household with a fixed, well-known UUID ──────────────────
--        Using a fixed UUID makes this script idempotent.

INSERT INTO households (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', :'seed_household_name')
ON CONFLICT (id) DO NOTHING;


-- ─── 2. Register the bot owner as a user ─────────────────────────────────────

INSERT INTO users (telegram_id, display_name)
VALUES (:'admin_telegram_id', 'Owner')
ON CONFLICT (telegram_id) DO UPDATE
  SET display_name = EXCLUDED.display_name;


-- ─── 3. Make owner the admin of the seed household ───────────────────────────

INSERT INTO household_members (household_id, user_id, role)
SELECT
  '00000000-0000-0000-0000-000000000001',
  u.id,
  'admin'
FROM users u
WHERE u.telegram_id = :'admin_telegram_id'
ON CONFLICT (user_id) DO NOTHING;


-- ─── 4. Backfill household_id on all pre-existing rows ───────────────────────

UPDATE areas
  SET household_id = '00000000-0000-0000-0000-000000000001'
  WHERE household_id IS NULL;

UPDATE tasks
  SET household_id = '00000000-0000-0000-0000-000000000001'
  WHERE household_id IS NULL;

UPDATE settings
  SET household_id = '00000000-0000-0000-0000-000000000001'
  WHERE household_id IS NULL;


-- ─── 5. Apply NOT NULL now that backfill is complete ─────────────────────────

ALTER TABLE areas    ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE tasks    ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE settings ALTER COLUMN household_id SET NOT NULL;


-- ─── 6. Enforce one settings row per household ───────────────────────────────
-- ADD CONSTRAINT IF NOT EXISTS is not valid PostgreSQL syntax; use a unique index instead.

CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_household_id
  ON settings (household_id);


-- ─── 7. Replace global area name uniqueness with per-household uniqueness ─────

-- Drop the old global unique constraint on areas.name
ALTER TABLE areas DROP CONSTRAINT IF EXISTS areas_name_key;

-- New: name unique within a household
CREATE UNIQUE INDEX IF NOT EXISTS idx_areas_household_name
  ON areas (household_id, name);

CREATE INDEX IF NOT EXISTS idx_areas_household
  ON areas (household_id);


-- ─── 8. Replace task indexes with household-scoped versions ──────────────────

DROP INDEX IF EXISTS idx_tasks_incomplete;
DROP INDEX IF EXISTS idx_tasks_area;
DROP INDEX IF EXISTS idx_tasks_recurring_due;

CREATE INDEX IF NOT EXISTS idx_tasks_household_incomplete
  ON tasks (household_id, criticality, effort_mins)
  WHERE completed = false;

CREATE INDEX IF NOT EXISTS idx_tasks_household_area
  ON tasks (household_id, area)
  WHERE completed = false;

CREATE INDEX IF NOT EXISTS idx_tasks_recurring_due
  ON tasks (household_id, next_due_date)
  WHERE is_recurring = true AND completed = false;


-- ─── 9. Seed settings row for the seed household if missing ──────────────────

INSERT INTO settings (household_id, calendar_time, calendar_duration, timezone, permissions)
SELECT '00000000-0000-0000-0000-000000000001', '18:00:00', 60, 'Asia/Kolkata', '{}'
WHERE NOT EXISTS (
  SELECT 1 FROM settings WHERE household_id = '00000000-0000-0000-0000-000000000001'
);

COMMIT;


-- ─── VERIFY ───────────────────────────────────────────────────────────────────

SELECT 'seed_household'     AS check, name  AS value FROM households WHERE id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'admin_user'         AS check, telegram_id AS value FROM users WHERE telegram_id = :'admin_telegram_id'
UNION ALL
SELECT 'admin_membership'   AS check, hm.role::text AS value
  FROM household_members hm
  JOIN users u ON u.id = hm.user_id
  WHERE u.telegram_id = :'admin_telegram_id'
UNION ALL
SELECT 'areas_migrated'     AS check, COUNT(*)::text FROM areas    WHERE household_id IS NOT NULL
UNION ALL
SELECT 'tasks_migrated'     AS check, COUNT(*)::text FROM tasks    WHERE household_id IS NOT NULL
UNION ALL
SELECT 'settings_migrated'  AS check, COUNT(*)::text FROM settings WHERE household_id IS NOT NULL;
