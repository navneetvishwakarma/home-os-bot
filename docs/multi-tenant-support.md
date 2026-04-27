# Multi-Tenant Support Plan — Home OS Bot

## Context

Home OS currently operates as a single-household bot: one global settings row, shared tasks/areas, and a flat whitelist in `TELEGRAM_AUTHORISED_IDS`. The goal is to make the same deployed bot instance serve multiple independent families, each with their own tasks, areas, settings, and scheduler, while keeping the schema forward-compatible for a future mobile app.

---

## New Database Schema

### New tables

```sql
-- households: the top-level tenant
CREATE TABLE households (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz         -- soft-delete for future use
);

-- users: one row per Telegram identity; mobile auth hooks in later
CREATE TABLE users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id           text NOT NULL UNIQUE,
  telegram_username     text,
  display_name          text,
  supabase_auth_user_id uuid UNIQUE,   -- NULL until mobile app links account
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE member_role AS ENUM ('admin', 'member');

-- household_members: v1 enforces one household per user
CREATE TABLE household_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role         member_role NOT NULL DEFAULT 'member',
  joined_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)   -- one household per user (drop in v2 if needed)
);

-- invite_codes: stored in DB so a future mobile app can use them too
-- Single-use: once consumed (used_at IS NOT NULL) the code is dead.
-- Code is generated with crypto.randomBytes (not Math.random) for unguessability.
CREATE TABLE invite_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  code         text NOT NULL UNIQUE,     -- 8-char cryptographically random alphanumeric
  created_by   uuid NOT NULL REFERENCES users (id),
  expires_at   timestamptz NOT NULL,     -- default 24 h from creation
  used_by      uuid REFERENCES users (id),
  used_at      timestamptz,             -- set atomically on join; code unusable after this
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

### Modifications to existing tables

```sql
-- areas: household-scoped (drop global UNIQUE on name, replace with per-household uniqueness)
ALTER TABLE areas
  ADD COLUMN household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE;
ALTER TABLE areas DROP CONSTRAINT areas_name_key;
CREATE UNIQUE INDEX idx_areas_household_name ON areas (household_id, name);

-- settings: one row per household; add timezone + permissions columns
ALTER TABLE settings
  ADD COLUMN household_id uuid UNIQUE NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  ADD COLUMN timezone      text NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN permissions   jsonb NOT NULL DEFAULT '{}';
-- permissions JSONB allows per-household access flags without future schema migrations.
-- Example future value: {"area_management": "admin_only"}
-- Default ({}) is read as "any_member" for all flags.
-- Currently used flag: permissions->>'area_management' ('any_member' | 'admin_only')

-- tasks: household-scoped
ALTER TABLE tasks
  ADD COLUMN household_id uuid NOT NULL REFERENCES households (id) ON DELETE CASCADE;

-- Rebuild partial indexes to include household_id
DROP INDEX idx_tasks_incomplete;
DROP INDEX idx_tasks_area;
DROP INDEX idx_tasks_recurring_due;

CREATE INDEX idx_tasks_household_incomplete
  ON tasks (household_id, criticality, effort_mins) WHERE completed = false;
CREATE INDEX idx_tasks_household_area
  ON tasks (household_id, area) WHERE completed = false;
CREATE INDEX idx_tasks_recurring_due
  ON tasks (household_id, next_due_date)
  WHERE is_recurring = true AND completed = false;
```

### RLS (enable now; permissive until mobile arrives)

```sql
ALTER TABLE households        ENABLE ROW LEVEL SECURITY;
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks             ENABLE ROW LEVEL SECURITY;
-- The bot uses service_role key which bypasses RLS.
-- Mobile JWT policies are added later using supabase_auth_user_id without schema changes.
```

### Indexes for new tables

```sql
CREATE INDEX idx_users_telegram_id ON users (telegram_id);
CREATE INDEX idx_hm_household      ON household_members (household_id);
CREATE INDEX idx_hm_user           ON household_members (user_id);
CREATE INDEX idx_invite_code       ON invite_codes (code) WHERE used_at IS NULL;
CREATE INDEX idx_invite_household  ON invite_codes (household_id);
```

---

## Migration Strategy (existing data → seed household)

Run `scripts/migrate_to_multitenant.sql` once. Substitute `seed_household_name` and `admin_telegram_id` variables before running.

See `scripts/multi_tenant_schema.sql` and `scripts/migrate_to_multitenant.sql` for the full idempotent scripts.

---

## UX Flows

### First contact (no household)
```
[Any message]
Bot: "👋 Welcome to Home OS!
You're not in a household yet.
• /create My Family  — start a new household (you'll be admin)
• /join ABC12345     — join an existing one with an invite code"
```

### Create household
```
User: /create The Sharma House
Bot:  "🏠 "The Sharma House" created! You're the admin.
      Default areas and settings are ready.
      Invite your family: /invite"
```

### Generate invite
```
Admin: /invite
Bot:   "🔗 Invite code: K7XP2MNQ  (expires in 24 hours)
       Share this with your family member:
       → /join K7XP2MNQ"
```

### Join household
```
New user: /join K7XP2MNQ
Bot:      "🏠 You've joined "The Sharma House"! Welcome.
          Type naturally to add tasks, or use /help."

Error (expired/invalid): "❌ That code is invalid or has expired.
                          Ask your admin to run /invite again."
Error (already member):  "⚠️ You're already in a household.
                          Use /leavehousehold first to switch."
```

### Settings (admin-only mutations)
```
Admin: /settings
Bot:   "⚙️ The Sharma House
       Time:     18:00
       Duration: 60 mins
       Timezone: Asia/Kolkata"

Admin: /settime 19:30   → "✅ Queue time set to 19:30"
Admin: /settimezone Europe/London  → "✅ Timezone set to Europe/London"
```

### Member management (admin)
```
Admin: /members
Bot:   "👥 The Sharma House — 2 members
       1. Navneet (admin) — joined 2025-01-15
       2. Priya (member)  — joined 2025-02-01"

Admin: /promote 987654321    → "✅ Priya is now an admin."
Admin: /demote 987654321     → "✅ Priya is now a member."
Admin: /removemember 987654  → "✅ Priya removed."
```

### Leave household
```
Member: /leavehousehold  → "👋 You've left "The Sharma House"."
Admin (sole admin): /leavehousehold
→ "⚠️ You're the only admin. Promote another member first."
```

---

## Command Reference

| Command | Access | Description |
|---|---|---|
| `/create <name>` | Anyone (no household) | Create household, become admin |
| `/join <code>` | Anyone (no household) | Join via invite code (single-use, 24h expiry) |
| `/invite` | Admin | Generate single-use 24h invite code |
| `/members` | Admin | List members + roles |
| `/removemember <tg_id>` | Admin | Remove a member |
| `/promote <tg_id>` | Admin | Promote to admin |
| `/demote <tg_id>` | Admin | Demote to member |
| `/leavehousehold` | Any member | Leave current household |
| `/settimezone <tz>` | Admin | Set IANA timezone |
| `/settime HH:MM` | Admin (was any) | Set queue time |
| `/setduration <mins>` | Admin (was any) | Set block duration |
| `/areas`, `/addarea`, `/removearea` | Any member (default); `permissions.area_management` flag makes it admin-only in future | unchanged UX |
| `/queue`, `/pending` | Any member | unchanged |
| `/settings` | Any member (read) | now shows timezone |
| `/help` | Any member | updated list |

---

## Architecture Changes

### Middleware (`src/middleware/household.js`)

Runs on every Telegraf update before any handler:

1. `upsertUser(telegramId, username, displayName)` → creates/updates `users` row on first contact
2. `getMembership(user.id)` → checks `household_members`
3. If no membership AND message is `/create` or `/join` → pass through to onboarding handlers
4. If no membership AND any other message → send onboarding prompt, stop
5. Attach to `ctx`: `ctx.householdUser`, `ctx.household`, `ctx.memberRole`

### Guards (`src/middleware/guards.js`)

- `requireMember(handler)` — replaces old `guard()`; blocks if no `ctx.household`
- `requireAdmin(handler)` — replies "⛔ Admin only" if `ctx.memberRole !== 'admin'`

### Scheduler (`src/cron/scheduler.js`)

`Map<householdId, { queueJob, completionJob }>` replaces single global pair. Each household's jobs use its own `calendarTime` and `timezone` from the DB. `refreshScheduleForHousehold(bot, householdId)` is called after any settings change.

### New Handlers

- `src/handlers/onboarding.js` — `/create`, `/join`
- `src/handlers/admin.js` — `/invite`, `/members`, `/removemember`, `/promote`, `/demote`, `/leavehousehold`

---

## Mobile App Readiness

| Decision | Why it matters |
|---|---|
| `users.supabase_auth_user_id` column | Mobile authenticates via Supabase Auth; link is a single `UPDATE` after proving Telegram identity |
| All data tables carry `household_id` | Supabase auto-REST: `GET /tasks?household_id=eq.<uuid>` works without custom endpoints |
| RLS enabled now | Mobile JWT policies added with no schema change; service_role key bypasses them for bot |
| `invite_codes` in DB | Mobile app can generate/consume codes via Supabase REST — not bot-only |
| `settings.timezone` per-household | Mobile calendar renders correct local times without server logic |
| `member_role` in DB | Mobile UI shows/hides admin features using the same role field |

---

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Invite codes | **Single-use**, 24h expiry, `crypto.randomBytes` | A leaked code can only add one person; best security posture |
| Scheduler delivery | **Private chat per member** | No group chat setup required; each member gets their own queue |
| Area management | **Any member** now; `permissions.area_management` JSONB flag for future `admin_only` toggle | Keeps current UX; lets admin lock it down when kids join without a schema migration |
| One household per user (v1) | `UNIQUE (user_id)` on `household_members` | Keeps onboarding simple; drop the constraint in v2 to support multi-household |

---

## Implementation Phases

| Phase | What | Bot stays up? |
|---|---|---|
| 0 | Run `multi_tenant_schema.sql` + `migrate_to_multitenant.sql` against Supabase | ✅ |
| 1 | Update `config.js` + `supabase.js` | ✅ |
| 2 | Implement + wire `household.js` middleware and `guards.js` | ✅ |
| 3 | Implement `onboarding.js` + `admin.js`; update `commands.js`, `message.js`, `/help` | ✅ |
| 4 | Rewrite `scheduler.js` with per-household job map; add `/settimezone` | ✅ |
| 5 | Cleanup: `.env.example`, timezone validation, invite expiry cron | ✅ |

---

## Verification Checklist

1. **Existing household**: Original user still sees their tasks, settings, queue — no data loss.
2. **New household**: New Telegram account → onboarding prompt → `/create Test House` → `/invite` → second user joins → task isolation confirmed.
3. **Join with first account** (already a member): should get "already in a household" error.
4. **Task isolation**: Tasks from household A not visible in household B's `/queue` or `/pending`.
5. **Per-household scheduler**: Different `/settime` per household; each cron fires independently.
6. **Admin guards**: Member tries `/settime` → "⛔ Admin only".
7. **Invite expiry**: Manually set `expires_at` to the past → `/join` returns expired error.
8. **Mobile readiness**: `GET /tasks?household_id=eq.<uuid>` via Supabase REST returns scoped data.
