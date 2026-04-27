-- ─────────────────────────────────────────────────────────────────────────────
-- HOME OS — Multi-tenant schema additions
-- Run BEFORE migrate_to_multitenant.sql.
-- Safe to run on a live database — all new columns are nullable until migration.
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── NEW ENUM ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_role') THEN
    CREATE TYPE member_role AS ENUM ('admin', 'member');
  END IF;
END $$;


-- ─── HOUSEHOLDS ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS households (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz            -- soft-delete; reserved for future use
);

CREATE INDEX IF NOT EXISTS idx_households_active
  ON households (id) WHERE deleted_at IS NULL;


-- ─── USERS ────────────────────────────────────────────────────────────────────
-- One row per Telegram identity.
-- supabase_auth_user_id is NULL until a mobile app links the account.

CREATE TABLE IF NOT EXISTS users (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id           text        NOT NULL UNIQUE,
  telegram_username     text,
  display_name          text,
  supabase_auth_user_id uuid        UNIQUE,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users (telegram_id);

-- updated_at trigger for users
DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ─── HOUSEHOLD MEMBERS ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS household_members (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES users (id)      ON DELETE CASCADE,
  role         member_role NOT NULL DEFAULT 'member',
  joined_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)   -- v1: one household per Telegram user; drop this in v2 for multi-household
);

CREATE INDEX IF NOT EXISTS idx_hm_household ON household_members (household_id);
CREATE INDEX IF NOT EXISTS idx_hm_user      ON household_members (user_id);


-- ─── INVITE CODES ─────────────────────────────────────────────────────────────
-- Single-use (used_at IS NOT NULL means consumed).
-- Codes are generated with crypto.randomBytes — not Math.random.
-- Stored in DB so a future mobile app can generate/consume them via Supabase REST.

CREATE TABLE IF NOT EXISTS invite_codes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid        NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  code         text        NOT NULL UNIQUE,
  created_by   uuid        NOT NULL REFERENCES users (id),
  expires_at   timestamptz NOT NULL,
  used_by      uuid        REFERENCES users (id),
  used_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_code
  ON invite_codes (code) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invite_household
  ON invite_codes (household_id);


-- ─── ALTER EXISTING TABLES ────────────────────────────────────────────────────
-- Columns added as nullable here; NOT NULL enforced after backfill in migrate script.

ALTER TABLE areas
  ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES households (id) ON DELETE CASCADE;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES households (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS timezone      text NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN IF NOT EXISTS permissions   jsonb NOT NULL DEFAULT '{}';
-- permissions JSONB stores per-household access flags without future schema migrations.
-- Currently planned flag: permissions->>'area_management' ('any_member' | 'admin_only')
-- Default ({}) resolves to 'any_member' for all flags.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES households (id) ON DELETE CASCADE;


-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Enabled now so mobile JWT policies can be added later with no schema change.
-- The bot uses the service_role key which bypasses RLS entirely.

ALTER TABLE households        ENABLE ROW LEVEL SECURITY;
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks             ENABLE ROW LEVEL SECURITY;

-- Future mobile RLS policy template (add after linking supabase_auth_user_id):
--
-- CREATE OR REPLACE FUNCTION my_household_id() RETURNS uuid AS $$
--   SELECT household_id FROM household_members
--   WHERE user_id = (SELECT id FROM users WHERE supabase_auth_user_id = auth.uid())
-- $$ LANGUAGE sql SECURITY DEFINER STABLE;
--
-- CREATE POLICY "members read own household tasks"
--   ON tasks FOR SELECT USING (household_id = my_household_id());


-- ─── VERIFY ───────────────────────────────────────────────────────────────────

SELECT 'households'       AS tbl, COUNT(*)::text AS rows FROM households
UNION ALL
SELECT 'users'            AS tbl, COUNT(*)::text AS rows FROM users
UNION ALL
SELECT 'household_members' AS tbl, COUNT(*)::text AS rows FROM household_members
UNION ALL
SELECT 'invite_codes'     AS tbl, COUNT(*)::text AS rows FROM invite_codes;
