# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # run with --watch for development (auto-restart on file changes)
npm run start    # production start (used by Railway)
npm test         # node --test (no tests implemented yet)
```

There is no linter configured.

## Environment Setup

Copy `.env.example` to `.env` and fill in all values before running. Required vars:
- `TELEGRAM_BOT_TOKEN` — Telegram bot token
- `GEMINI_API_KEY` — Google Gemini API key
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — Supabase project credentials
- `GEMINI_MODEL` — optional, defaults to `gemini-2.5-flash`
- `COMPLETION_PROMPT_DELAY_MINS` — optional, defaults to 60

**Database setup (multi-tenant):** Run these SQL scripts in order in the Supabase SQL Editor:
1. `scripts/update_schema.sql` — base schema (existing deployments) or `scripts/create_schema.sql` (fresh)
2. `scripts/multi_tenant_schema.sql` — adds households, users, members, invite_codes tables; alters areas/tasks/settings
3. `scripts/migrate_to_multitenant.sql` — one-time backfill (set `:seed_household_name` and `:admin_telegram_id` variables first)

Timezone and scheduler settings are now stored per-household in the database, not in env vars.

## Architecture

**Home OS** is a multi-tenant Telegram bot: multiple independent families each have their own household with isolated tasks, areas, settings, and scheduler. It captures tasks in natural language, classifies them via Google Gemini AI, stores them in Supabase, and delivers a prioritized daily queue with Google Calendar integration.

### Data flow

```
Telegram message
  → src/middleware/household.js     # resolve household from Telegram user ID
  → src/handlers/onboarding.js     # /create, /join (if user has no household)
  → src/handlers/admin.js          # /invite, /members, /removemember, etc. (admin-only)
  → src/handlers/commands.js       # /areas, /queue, /pending, /settings, /settime, etc.
  → src/handlers/message.js        # free-text → task capture or correction
  → src/services/gemini.js         # classify task via Gemini API
  → src/services/supabase.js       # persist to Supabase (all queries scoped to household_id)
  → src/handlers/correction.js     # optional AI correction flow
  → src/cron/scheduler.js          # per-household daily queue + completion prompts
  → src/services/queue-builder.js  # sort by criticality then effort
  → src/services/calendar.js       # generate Google Calendar URLs
  → Telegram reply
```

### Key modules

| Path | Role |
|------|------|
| `src/bot.js` | Entry point — registers middleware and all handler modules, starts per-household cron |
| `src/config.js` | Loads and validates env vars (no `TELEGRAM_AUTHORISED_IDS` or `SCHEDULER_TIMEZONE`) |
| `src/constants.js` | Enum values — criticality levels, tags, assignees, default areas |
| `src/middleware/household.js` | Runs on every update: upserts user, resolves household membership, sets `ctx.household`, `ctx.householdUser`, `ctx.memberRole` |
| `src/middleware/guards.js` | `requireMember(handler)` and `requireAdmin(handler)` — replace the old flat whitelist |
| `src/handlers/onboarding.js` | `/create`, `/join`, `/start` — bypass household guard; handle new-user onboarding |
| `src/handlers/admin.js` | `/invite`, `/members`, `/removemember`, `/promote`, `/demote`, `/leavehousehold` |
| `src/handlers/commands.js` | `/areas`, `/addarea`, `/removearea`, `/queue`, `/pending`, `/settings`, `/settime`, `/setduration`, `/settimezone`, `/help` |
| `src/handlers/message.js` | Routes free-text to task capture or correction; uses `ctx.household.id` throughout |
| `src/handlers/correction.js` + `correction-session.js` | 10-min in-memory session for correcting last captured task |
| `src/handlers/complete.js` + `queue-session.js` | 2-hr completion window after daily queue; keyed by Telegram user ID |
| `src/cron/scheduler.js` | `Map<householdId, {queueJob, completionJob}>` — one cron pair per household; `refreshScheduleForHousehold(bot, id)` called on settings change |
| `src/services/gemini.js` | `classifyTask()` and `correctTask()` — Gemini AI integration |
| `src/services/supabase.js` | All DB ops; every function that touches tasks/areas/settings takes `householdId` as first arg |
| `src/services/queue-builder.js` | Greedy bin-pack: CRITICAL+HIGH first, then quick-win tags |
| `src/services/calendar.js` | Generates Google Calendar event URL for the day's queue |
| `src/utils/formatters.js` | Telegram markdown formatters (task cards, queue messages) |
| `src/utils/validators.js` | Input sanitization — effort mins, time, duration, timezone (IANA), JSON |
| `src/utils/logger.js` | Structured JSON logger |

### Database tables (Supabase/PostgreSQL)

**New (multi-tenant):**
- **households** — tenant root; each family is one household
- **users** — one row per Telegram identity; `supabase_auth_user_id` is reserved for future mobile auth
- **household_members** — links users to households with `role` (`admin` | `member`); UNIQUE(user_id) enforces one household per user in v1
- **invite_codes** — single-use, 24h-expiry invite codes generated with `crypto.randomBytes`; stored in DB so a future mobile app can use them

**Extended (household-scoped):**
- **tasks** — now includes `household_id`; all queries filter by it
- **areas** — now includes `household_id`; name is unique per household (not globally)
- **settings** — now one row per household; includes `timezone` (IANA) and `permissions` (JSONB for future access control flags like `area_management: admin_only`)

### Multi-tenancy key patterns

- **Auth**: `householdMiddleware` runs on every update; it upserts the user and resolves their household. Commands use `ctx.household.id` — there is no env-var whitelist.
- **Invite flow**: Admin runs `/invite` → gets a single-use 8-char code → shares it → new user runs `/join CODE`. Code is atomically consumed in the DB.
- **Scheduler**: One cron job pair per household. `scheduleForHousehold(bot, household)` uses the household's own `calendarTime` and `timezone`. `refreshScheduleForHousehold` is called whenever settings change.
- **RLS**: Enabled on all tables now (service_role key bypasses it). When the mobile app is added, JWT-scoped policies can be added without schema changes using `supabase_auth_user_id`.
- **Permissions JSONB**: `settings.permissions` stores per-household access control flags. Currently unused; future use: `{ "area_management": "admin_only" }` to prevent members from modifying areas.

### Deployment

Deployed on Railway via `railway.toml` (NIXPACKS builder, auto-restart up to 10 retries on failure). See `docs/multi-tenant-support.md` for the full architecture design and verification checklist.
