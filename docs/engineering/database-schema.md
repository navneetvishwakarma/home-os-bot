# Home OS — Database Schema

All tables live in a single Supabase (PostgreSQL) project. The bot connects using the `service_role` key, which bypasses Row Level Security. RLS is enabled on all tables in preparation for a future mobile app that will use JWT-scoped policies.

---

## Entity relationships

```
households
  ├── household_members (household_id FK)  ←  users (user_id FK)
  ├── invite_codes      (household_id FK)
  ├── areas             (household_id FK)
  ├── settings          (household_id FK, 1:1)
  └── tasks             (household_id FK)
```

---

## Table definitions

### `households`

The tenant root. One row per family.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `name` | text NOT NULL | Display name, max 60 chars enforced in app |
| `created_at` | timestamptz | `now()` default |
| `deleted_at` | timestamptz | NULL — reserved for future soft-delete |

---

### `users`

One row per Telegram identity. Created on first contact with the bot.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `telegram_id` | text NOT NULL UNIQUE | Telegram numeric user ID stored as string |
| `telegram_username` | text | `@handle`, may be null |
| `display_name` | text | First name from Telegram, may be null |
| `supabase_auth_user_id` | uuid UNIQUE | NULL — reserved for future mobile auth link |
| `created_at` | timestamptz | `now()` default |
| `updated_at` | timestamptz | `now()` default |

**Indexes:** `idx_users_telegram_id ON users (telegram_id)`

---

### `household_members`

Links users to households with a role. Enforces one household per user in v1.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid NOT NULL | FK → `households(id)` ON DELETE CASCADE |
| `user_id` | uuid NOT NULL UNIQUE | FK → `users(id)` ON DELETE CASCADE; UNIQUE enforces one household per user |
| `role` | `member_role` enum | `'admin'` or `'member'`; default `'member'` |
| `joined_at` | timestamptz | `now()` default |

**Enum:** `CREATE TYPE member_role AS ENUM ('admin', 'member')`

**Indexes:**
- `idx_hm_household ON household_members (household_id)`
- `idx_hm_user ON household_members (user_id)`

---

### `invite_codes`

Single-use invite codes with 24-hour expiry. Stored in DB so a future mobile app can generate/consume them too.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid NOT NULL | FK → `households(id)` ON DELETE CASCADE |
| `code` | text NOT NULL UNIQUE | 8 uppercase alphanumeric chars, `crypto.randomBytes` generated |
| `created_by` | uuid NOT NULL | FK → `users(id)` |
| `expires_at` | timestamptz NOT NULL | Set to `now() + 24h` at creation |
| `used_by` | uuid | FK → `users(id)`; NULL until consumed |
| `used_at` | timestamptz | NULL until consumed; set atomically on join |
| `created_at` | timestamptz | `now()` default |

**Uniqueness:** A code is dead once `used_at IS NOT NULL` — enforced by the atomic UPDATE in `consumeInviteCode()`.

**Indexes:**
- `idx_invite_code ON invite_codes (code) WHERE used_at IS NULL`
- `idx_invite_household ON invite_codes (household_id)`

---

### `areas`

Household-scoped area list. Name is unique per household, not globally.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid NOT NULL | FK → `households(id)` ON DELETE CASCADE |
| `name` | text NOT NULL | |
| `created_at` | timestamptz | `now()` default |

**Unique index:** `idx_areas_household_name ON areas (household_id, name)`

---

### `settings`

One row per household. Created with defaults when the household is created.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | uuid PK | | |
| `household_id` | uuid NOT NULL UNIQUE | | FK → `households(id)` ON DELETE CASCADE |
| `calendar_time` | time NOT NULL | `'18:00:00'` | Daily queue fire time (HH:MM:SS) |
| `calendar_duration` | int NOT NULL | `60` | Session length in minutes (15–480) |
| `timezone` | text NOT NULL | `'Asia/Kolkata'` | IANA timezone identifier |
| `permissions` | jsonb NOT NULL | `'{}'` | Reserved for future access control flags |
| `created_at` | timestamptz | `now()` | |

**Permissions JSONB:** Currently unused. Future example: `{"area_management": "admin_only"}` to restrict area commands to admins only.

---

### `tasks`

The core data table. All queries are scoped to `household_id`.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` | |
| `household_id` | uuid NOT NULL | | FK → `households(id)` ON DELETE CASCADE |
| `title` | text NOT NULL | | Human-readable task name |
| `area` | text NOT NULL | | Matched against `areas.name` |
| `criticality` | text NOT NULL | | `CRITICAL` / `HIGH` / `MEDIUM` / `LOW` |
| `effort_mins` | int NOT NULL | `30` | Clamped to 1–480 |
| `tags` | text[] | `'{}'` | Subset of allowed tag values |
| `assigned_to` | text | | `Me` / `Spouse` / `Professional` / `Both` |
| `deadline` | date | NULL | ISO date, optional |
| `reasoning` | text | NULL | AI explanation shown on task card |
| `raw_input` | text | NULL | Original user message |
| `added_by` | text | NULL | `telegram_id` of the user who created the task |
| `completed` | boolean NOT NULL | `false` | |
| `completed_at` | timestamptz | NULL | Set when permanently completed |
| `is_recurring` | boolean NOT NULL | `false` | |
| `recurrence_interval_days` | int | NULL | Days between occurrences |
| `next_due_date` | date | NULL | Next time this recurring task should appear |
| `last_completed_at` | date | NULL | Date of last completion (used to advance next_due_date) |
| `created_at` | timestamptz | `now()` | |

**Recurring task lifecycle:**
- Non-recurring: `bulkComplete()` sets `completed = true, completed_at = now`
- Recurring: `bulkComplete()` sets `last_completed_at = today`, advances `next_due_date += recurrence_interval_days`, leaves `completed = false`
- `getIncompleteTasksByPriority()` filters recurring tasks to only those where `next_due_date <= today` or `next_due_date IS NULL`

**Indexes:**
```sql
CREATE INDEX idx_tasks_household_incomplete
  ON tasks (household_id, criticality, effort_mins) WHERE completed = false;

CREATE INDEX idx_tasks_household_area
  ON tasks (household_id, area) WHERE completed = false;

CREATE INDEX idx_tasks_recurring_due
  ON tasks (household_id, next_due_date)
  WHERE is_recurring = true AND completed = false;
```

---

## RLS status

RLS is enabled on all tables. The bot uses the `service_role` key which bypasses all policies. When a mobile app is added, row-level policies using `supabase_auth_user_id` can be applied without any schema changes.

```sql
ALTER TABLE households        ENABLE ROW LEVEL SECURITY;
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks             ENABLE ROW LEVEL SECURITY;
```

---

## Setup scripts

Run in this order via the Supabase SQL Editor:

1. `scripts/multi_tenant_schema.sql` — creates all tables, types, indexes, RLS
2. `scripts/migrate_to_multitenant.sql` — one-time backfill for existing deployments (skip for fresh installs)
