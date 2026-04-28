# Home OS — Architecture

## Overview

Home OS is a multi-tenant Telegram bot: multiple independent families each have their own household with isolated tasks, areas, settings, and cron schedule — all served from a single deployed Node.js process. There is no web frontend, no mobile app, and no push infrastructure beyond the Telegram Bot API.

**Stack:** Node.js 20 · Telegraf · Google Gemini · Supabase (Postgres) · node-cron · Railway

---

## Data flow

```
Telegram message
  → Telegraf webhook/polling
  → householdMiddleware          (upsert user, resolve household membership)
  → onboarding handlers          (/start, /create, /join — bypass household guard)
  → admin handlers               (/invite, /members, /promote, /demote, /leavehousehold)
  → command handlers             (/areas, /queue, /pending, /done, /delete, /settings, …)
  → message handler              (free text → task capture OR correction)
      → correction-session       (10-min in-memory TTL)
      → completion-reply         (2-hr in-memory window)
      → Gemini classifyTask()    (AI classification)
      → Supabase createTask()    (persist)
  → Telegram reply
```

```
node-cron (per household)
  queueJob (at calendarTime, household timezone)
    → getIncompleteTasksByPriority()
    → buildQueue()               (greedy fill within calendarDuration)
    → buildGCalUrl()
    → sendMessage() to each member
    → setQueuedTasks()           (in-memory, keyed by member telegramId)
    → startCompletionWindow()

  completionJob (at calendarTime + calendarDuration + 30 min)
    → sendMessage() to each member
```

---

## Key modules

| Module | Responsibility |
|---|---|
| `src/bot.js` | Entry point — wires middleware, registers all handlers, starts scheduler |
| `src/config.js` | Loads and validates required env vars at startup; throws if any are missing |
| `src/constants.js` | Enums: criticality levels, valid tags, assignee values, default area seed list |
| `src/middleware/household.js` | Runs on every update: upserts user row, resolves household membership, attaches `ctx.household`, `ctx.householdUser`, `ctx.memberRole` |
| `src/middleware/guards.js` | `requireMember(handler)` — blocks if no household; `requireAdmin(handler)` — blocks if role is not admin |
| `src/handlers/onboarding.js` | `/start`, `/create`, `/join` — bypass household guard; handle first contact |
| `src/handlers/admin.js` | `/invite`, `/members`, `/removemember`, `/promote`, `/demote`, `/leavehousehold` |
| `src/handlers/commands.js` | `/areas`, `/addarea`, `/removearea`, `/queue`, `/pending`, `/done`, `/delete`, `/edit`, `/settings`, `/settime`, `/setduration`, `/settimezone`, `/help` |
| `src/handlers/message.js` | Routes free text: correction → completion reply → task capture |
| `src/handlers/correction.js` | Calls Gemini `correctTask()`, applies patch via `updateTask()`, clears session |
| `src/handlers/correction-session.js` | In-memory Map keyed by `chatId:userId`; 10-minute TTL per correction session; `startSessionForTask()` allows starting a session on any task (used by `/edit`) |
| `src/handlers/complete.js` | Parses completion replies (yes / skip / no / free text); calls `bulkComplete()` |
| `src/handlers/queue-session.js` | In-memory Maps for queued task lists and 2-hour completion windows; keyed by telegramId |
| `src/cron/scheduler.js` | `Map<householdId, {queueJob, completionJob}>` — one cron pair per household; `refreshScheduleForHousehold()` called on settings change |
| `src/services/gemini.js` | `classifyTask(text, areas)` and `correctTask(task, text)` — Gemini API calls with JSON parsing and field normalisation |
| `src/services/witty-response.js` | `generateWittyReply(action, context)` — Gemini-powered JARVIS-style confirmation lines; returns `null` on any failure so callers always fall back to static text |
| `src/services/supabase.js` | All DB operations; every function scoped to `householdId`; `bulkComplete` handles recurring vs non-recurring tasks differently |
| `src/services/queue-builder.js` | Greedy bin-pack: CRITICAL+HIGH always included, then `quick-win`-tagged MEDIUM/LOW up to the duration budget |
| `src/services/calendar.js` | Builds a Google Calendar TEMPLATE URL for the day's queue |
| `src/utils/formatters.js` | Telegram message formatters: task card, task-changes diff, queue message |
| `src/utils/validators.js` | Input sanitisation: effort mins clamping, time/duration/timezone parsing, JSON fence stripping |
| `src/utils/logger.js` | Structured JSON logger with `info`, `warn`, `error` levels to stdout/stderr |

---

## Multi-tenancy design

Every data table (`tasks`, `areas`, `settings`) carries a `household_id` foreign key. The `householdMiddleware` runs before every handler and attaches the resolved household to `ctx` — handlers never need to look up the household themselves.

**Auth model:**
- Telegram identity → `users` table (upserted on first contact)
- `household_members` links users to households with a `role` column (`admin` | `member`)
- One household per user enforced by `UNIQUE(user_id)` on `household_members`
- Bot uses the Supabase `service_role` key (bypasses RLS); JWT-scoped mobile policies can be added later using `supabase_auth_user_id` without schema changes

**Invite flow:**
- Admin generates a single-use 8-char cryptographically random code (via `crypto.randomBytes`)
- Code stored in `invite_codes` table with 24h expiry
- `consumeInviteCode()` atomically marks the code used and inserts the membership row; a unique constraint handles the race condition

---

## Scheduler design

Each household gets exactly one pair of cron jobs stored in a `Map<householdId, {queueJob, completionJob}>`. The jobs are created with the household's own `calendarTime` and `timezone` so different families fire at completely independent local times.

`refreshScheduleForHousehold(bot, householdId)` stops the old jobs and creates new ones — called automatically whenever `/settime`, `/setduration`, or `/settimezone` succeeds.

At bot startup, `startScheduler` calls `getAllHouseholdsWithSettings()` and schedules a job pair for every household. Any household without a settings row emits a `warn("household_missing_settings")` log and is skipped.

---

## Gemini integration

Two prompts are used:

- **classifyTask(text, areas)** — structured task extraction. Returns title, area, criticality, effortMins, tags, assignedTo, isRecurring, recurrenceIntervalDays, nextDueDate, reasoning. Fields are normalised after parsing (criticality clamped to enum, effortMins clamped to 1–480, unknown tags filtered out).
- **correctTask(existingTask, correctionText)** — patch extraction. Returns only the fields the user explicitly changed, leaving others undefined. Applied as a partial update via `updateTask()`.

Both functions strip markdown code fences before parsing and throw a descriptive error if the response is not valid JSON.

---

## In-memory state

Two modules hold transient state (lost on process restart):

| Module | State | TTL |
|---|---|---|
| `correction-session.js` | Active correction sessions per user | 10 minutes |
| `queue-session.js` | Queued task lists and completion windows per user | 2 hours |

This is intentional for MVP: the bot is stateless across restarts for simplicity. If the process restarts during a completion window, users can fall back to `/done <task>` at any time.

---

## External dependencies

| Service | Usage | Auth |
|---|---|---|
| Telegram Bot API | Message delivery, webhook/polling | Bot token (`TELEGRAM_BOT_TOKEN`) |
| Google Gemini | Task classification and correction | API key (`GEMINI_API_KEY`) |
| Supabase | PostgreSQL database, REST API | Service role key (`SUPABASE_SERVICE_ROLE_KEY`) |
| Railway | Hosting, auto-deploy from GitHub | Dashboard config |
