# Home OS — Architecture Document
**Version:** 1.0  
**Status:** Final — Ready for Implementation  
**Last Updated:** April 2026  
**Prepared by:** Architecture Review

---

## 1. Executive Summary

Home OS is a **serverless-first, AI-powered home task management system** delivered via a Telegram bot. The system accepts natural language input, classifies tasks using Gemini 2.0 Flash, persists to a managed Postgres instance (Supabase), and automates daily execution via cron-based scheduling and Google Calendar integration.

**Design Philosophy:** Thin bot layer. Dumb transport. Smart AI. Reliable persistence.

---

## 2. System Context Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USERS (Telegram)                           │
│              Primary User ◄──────────────► Spouse                  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS (Webhook / Long Poll)
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    HOME OS BOT  (Railway.app)                       │
│                      Node.js 20 / Telegraf.js                       │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Handlers    │  │  Services    │  │  Cron Scheduler          │  │
│  │  message.js  │  │  gemini.js   │  │  Daily Queue (T)         │  │
│  │  correction  │  │  supabase.js │  │  Completion Prompt (T+D) │  │
│  │  complete.js │  │  calendar.js │  └──────────────────────────┘  │
│  │  commands.js │  └──────────────┘                                │
│  └──────────────┘                                                   │
└──────────────┬──────────────────────┬───────────────────────────────┘
               │                      │
               ▼                      ▼
┌──────────────────────┐   ┌─────────────────────────────────────┐
│  Gemini 2.0 Flash    │   │  Supabase (Managed Postgres)        │
│  Google AI Studio    │   │  tables: tasks, areas, settings     │
│  REST API            │   │  REST + Realtime API                │
└──────────────────────┘   └─────────────────────────────────────┘
                                          │
                                          ▼
                            ┌─────────────────────────┐
                            │  Google Calendar (URL)  │
                            │  TEMPLATE link — no     │
                            │  OAuth required         │
                            └─────────────────────────┘
```

---

## 3. Architecture Principles

| Principle | Decision | Rationale |
|---|---|---|
| **Stateless handlers** | No in-process DB connections held open | Railway free tier kills idle processes |
| **AI as classifier only** | Gemini returns structured JSON, never free-form | Deterministic output, easy validation |
| **No OAuth for Calendar** | Google Calendar TEMPLATE URL | Zero auth surface, works for both users |
| **In-memory correction state** | Map keyed by `chatId:userId` | Low volume (2 users), no DB round-trip |
| **Single-row settings** | Always UPDATE, never INSERT | Eliminates row proliferation |
| **Schema-first recurrence** | Columns reserved now, logic in v2 | Zero migration cost when v2 lands |

---

## 4. Component Architecture

### 4.1 Entry Point — `bot.js`

**Responsibilities:**
- Bootstrap Telegraf instance with bot token
- Register middleware: auth guard (check `AUTHORISED_IDS`)
- Wire message handler, command handlers
- Start long polling or set webhook (Railway = long poll)
- Initialise cron scheduler

**Auth Guard (middleware):**
```
Request → Parse Telegram user_id → Check AUTHORISED_IDS array
  ├── Match found → next()
  └── No match   → ctx.stop() — silent drop, no reply
```

---

### 4.2 Handler Layer — `src/handlers/`

#### `message.js` — Core Task Capture
```
Inbound text
  ├── Active correction state? → route to correction.js
  └── New task flow:
        1. supabase.getAreas()
        2. gemini.classifyTask(text, areas)
        3. Validate JSON fields (criticality enum, effortMins clamp)
        4. supabase.createTask(classified)
        5. if isNewArea → supabase.addArea(area)
        6. Reply with confirmation card
        7. Store taskId on reply message for correction routing
```

#### `correction.js` — Patch Flow
```
State: Map<"chatId:userId", { task, expiresAt }>
  ├── TTL: 10 minutes per entry (cleared on reply or timeout)
  └── Flow:
        1. gemini.correctTask(existingTask, correctionText)
        2. Validate patch fields (whitelist check)
        3. supabase.updateTask(id, patch)
        4. Reply: updated card, diff of changed fields only
```

#### `complete.js` — End-of-Block Confirmation
```
Trigger: cron posts prompt → user replies
  ├── "yes" / "done" → bulkComplete(queuedIds)
  ├── "skip <name>"  → fuzzy match title → complete all except matched
  ├── "no"           → ask "Which ones?" → partial complete
  └── No reply in 2h → clear state, tasks stay incomplete
```

#### `commands.js` — Bot Commands
```
/areas          → getAreas() → formatted list
/addarea <n>    → addArea(n) → confirm
/removearea <n> → removeArea(n) → confirm
/queue          → manual queue build → post with calendar link
/pending        → getIncompleteTasksByPriority() → grouped by criticality
/settings       → getSettings() → display
/settime HH:MM  → updateSettings({calendar_time}) → confirm
/setduration N  → updateSettings({calendar_duration}) → confirm
/help           → static text
```

---

### 4.3 Service Layer — `src/services/`

#### `gemini.js`
- **Single responsibility:** Gemini API wrapper. No business logic.
- `classifyTask(text, areas)` — builds system prompt dynamically with current areas list, calls Gemini, strips markdown fences, parses JSON
- `correctTask(task, correction)` — sends correction prompt + existing task JSON, returns patch object (changed fields only)
- **Error contract:** Both functions throw on API error. Callers are responsible for try/catch.
- **Post-parse guards:**
  - `effortMins` clamped to `[1, 480]`
  - `criticality` defaulted to `MEDIUM` if not in enum
  - `area` case-normalised against known areas before accepting as new

#### `supabase.js`
- **Single responsibility:** All DB I/O. No AI, no bot logic.
- Uses `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS (server-side only, never exposed to client)
- All functions wrapped in try/catch; throw on failure with descriptive message
- Functions:

| Function | SQL Operation |
|---|---|
| `createTask(task)` | `INSERT INTO tasks … RETURNING id` |
| `updateTask(id, patch)` | `UPDATE tasks SET … WHERE id = $1` |
| `getAreas()` | `SELECT name FROM areas ORDER BY name` |
| `addArea(name)` | `INSERT INTO areas … ON CONFLICT DO NOTHING` |
| `removeArea(name)` | `DELETE FROM areas WHERE name = $1` |
| `getIncompleteTasksByPriority()` | `SELECT … WHERE completed = false ORDER BY criticality_order` |
| `bulkComplete(ids)` | `UPDATE tasks SET completed=true, completed_at=now() WHERE id = ANY($1)` |
| `getSettings()` | `SELECT * FROM settings LIMIT 1` |
| `updateSettings(patch)` | `UPDATE settings SET … WHERE id = (SELECT id FROM settings LIMIT 1)` |

#### `calendar.js`
- **Single responsibility:** Build Google Calendar TEMPLATE URL
- No API calls, no auth — pure URL construction
- Input: `queueTasks[]`, `settings`
- Output: URL string

---

### 4.4 Cron Layer — `src/cron/scheduler.js`

**Two jobs, two responsibilities:**

| Job | Trigger | Action |
|---|---|---|
| **Daily Queue** | `calendar_time` | Build queue → post to chat → include GCal link |
| **Completion Prompt** | `calendar_time + duration + 30 mins` | Post completion prompt → set 2h reply timeout |

**Queue Build Algorithm (Greedy Fill):**
```
budget = settings.calendar_duration (minutes)

Step 1: Fetch all incomplete tasks, ordered CRITICAL → HIGH → MEDIUM → LOW
Step 2: Fill CRITICAL tasks while budget allows
Step 3: Fill HIGH tasks while budget allows
Step 4: Fill quick-win tagged MEDIUM/LOW tasks to use remaining buffer
Step 5: Stop when budget <= 0

Output: queue[], remaining (buffer minutes)
```

**State Handoff (Job 1 → Job 2):**
- Module-level variable stores `queuedTaskIds[]` at Job 1 fire time
- Job 2 reads this variable when posting completion prompt
- TTL: reset at next Job 1 fire

---

### 4.5 Config — `src/config.js`

- Loads and exports all env vars
- `AUTHORISED_IDS` parsed from comma-separated string to `number[]`
- Criticality order map: `{ CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }`
- Tag taxonomy array
- Assigned-to options array
- `effortMins` clamp bounds: `[1, 480]`

---

## 5. Data Architecture

### 5.1 Schema Overview

```
areas ──────────────────────────────────────────────────
 id (uuid PK) | name (text UNIQUE) | created_at

settings ───────────────────────────────────────────────
 id (uuid PK) | calendar_time (time) | calendar_duration (int) | updated_at
 [Single row. Always UPDATE.]

tasks ──────────────────────────────────────────────────
 id (uuid PK)
 title (text NOT NULL)
 area (text NOT NULL)
 criticality (enum: CRITICAL|HIGH|MEDIUM|LOW)
 effort_mins (int, default 30)
 tags (text[], default {})
 assigned_to (text: Me|Spouse|Professional|Both)
 deadline (date, nullable)
 reasoning (text, nullable)
 raw_input (text)
 added_by (text — Telegram user_id)
 completed (boolean, default false)
 completed_at (timestamptz, nullable)
 is_recurring (boolean, default false) ── v2 reserved
 recurrence_interval_days (int, nullable) ── v2 reserved
 next_due_date (date, nullable) ── v2 reserved
 last_completed_at (date, nullable) ── v2 reserved
 created_at (timestamptz, auto)
```

### 5.2 Indexes

| Index | Columns | Condition | Purpose |
|---|---|---|---|
| `idx_tasks_incomplete` | `(criticality, effort_mins)` | `WHERE completed=false` | Daily queue fetch |
| `idx_tasks_area` | `(area)` | `WHERE completed=false` | Area summary |
| `idx_tasks_tags` | `USING GIN (tags)` | — | Tag-based filter |
| `idx_tasks_recurring_due` | `(next_due_date)` | `WHERE is_recurring=true AND completed=false` | v2 cron |

### 5.3 Criticality as Ordered Enum

Postgres `enum` type does not sort by definition order by default. Use a CASE expression or a lookup join for ordered queries:

```sql
ORDER BY CASE criticality
  WHEN 'CRITICAL' THEN 0
  WHEN 'HIGH'     THEN 1
  WHEN 'MEDIUM'   THEN 2
  WHEN 'LOW'      THEN 3
END
```

---

## 6. AI Integration Architecture

### 6.1 Classification Flow

```
User text
    │
    ▼
buildSystemPrompt(areas[])   ← dynamically injects current area list
    │
    ▼
Gemini 2.0 Flash API call
    │
    ▼
Strip markdown fences → JSON.parse()
    │
    ▼
Field validation:
  ├── criticality ∈ {CRITICAL, HIGH, MEDIUM, LOW} → else default MEDIUM
  ├── effortMins clamped to [1, 480]
  ├── area case-normalised against known areas
  └── tags filtered to known taxonomy
    │
    ▼
Structured task object → Supabase
```

### 6.2 Correction Flow

```
Existing task JSON + user correction text
    │
    ▼
CORRECTION_PROMPT (static) + task + correction → Gemini
    │
    ▼
Returns: patch object (ONLY changed fields)
    │
    ▼
Whitelist check: only valid field names accepted
    │
    ▼
supabase.updateTask(id, patch)
```

### 6.3 Prompt Engineering Constraints

- System prompt injects areas dynamically — keeps Gemini grounded to actual home layout
- Both prompts end with `Return ONLY valid JSON. No markdown, no explanation.` — strips Gemini's tendency to add prose
- Correction prompt is intentionally minimal — returns a patch, not full object — reduces hallucination surface
- `quick-win` defined inline: `effort under 15 mins` — avoids model ambiguity

---

## 7. Infrastructure Architecture

### 7.1 Runtime — Railway.app

- Node.js 20, always-on free tier (~$1–2/month)
- GitHub auto-deploy on push to `main`
- Long polling (no webhook) — simpler for Railway, no public IP needed
- `railway.toml` sets start command: `node src/bot.js`
- All secrets via Railway environment variable dashboard

### 7.2 Environment Variables

```
TELEGRAM_BOT_TOKEN            # from @BotFather
TELEGRAM_AUTHORISED_IDS       # comma-separated: 123456789,987654321
GEMINI_API_KEY                # from aistudio.google.com
SUPABASE_URL                  # https://xyzxyz.supabase.co
SUPABASE_SERVICE_ROLE_KEY     # service_role key — NOT anon key
```

> **Security note:** `service_role` key bypasses Supabase RLS. Never expose to any client-side code. This is a server-only bot — safe by architecture.

### 7.3 Deployment Pipeline

```
Local dev → git push main → Railway GitHub webhook → auto-build → deploy
                                                     (zero-downtime restart)
```

---

## 8. Security Architecture

| Concern | Mitigation |
|---|---|
| Unauthorised Telegram users | Auth guard middleware — silent drop on every message/command |
| Supabase key exposure | Service role key in env var only, never in code or logs |
| Gemini prompt injection | System prompt clearly bounds role; user input is `content`, not `system` |
| Correction state hijack | State keyed by `chatId:userId` — user can only correct their own initiated tasks |
| Stale correction state | 10-minute TTL auto-clears correction state per user |
| Cron misfires | Both jobs read fresh settings from Supabase at fire time — no cached state |

---

## 9. Error Handling Strategy

| Layer | Error Type | Handling |
|---|---|---|
| Gemini API | Network / timeout | try/catch → bot replies "⚠️ Something went wrong. Try rephrasing?" |
| Gemini API | Invalid JSON | Strip fences → parse → fallback to MEDIUM criticality |
| Supabase | Write failure | try/catch → bot replies with generic error |
| Supabase | Read failure | try/catch → bot replies with generic error |
| Correction state | Expired (>10 min) | Auto-cleared, user must re-trigger correction |
| Completion state | No reply in 2h | Timeout clears state, tasks remain incomplete |
| `effortMins` | Out of bounds | Clamped `[1, 480]` post-parse |
| `criticality` | Unknown value | Defaulted to `MEDIUM` |

---

## 10. Module Dependency Graph

```
bot.js
  ├── config.js
  ├── handlers/message.js
  │     ├── services/gemini.js
  │     └── services/supabase.js
  ├── handlers/correction.js
  │     ├── services/gemini.js
  │     └── services/supabase.js
  ├── handlers/complete.js
  │     └── services/supabase.js
  ├── handlers/commands.js
  │     ├── services/supabase.js
  │     └── services/calendar.js
  └── cron/scheduler.js
        ├── services/supabase.js
        └── services/calendar.js
```

**Dependency rules:**
- Handlers depend on services. Services never depend on handlers.
- `config.js` is a leaf node — depends on nothing.
- `calendar.js` is a pure function — no external dependencies.

---

## 11. V2 — Recurrence Engine Impact Map

Schema is already ready. When building v2, these layers need changes:

| Layer | Change |
|---|---|
| `gemini.js` | Detect recurrence language; map to `recurrence_interval_days` |
| `supabase.js` | Add: `getDueRecurringTasks()`, `recreateRecurringTask()`, `updateNextDueDate()` |
| `complete.js` | Post-completion: trigger task recreation + notify next due date |
| `scheduler.js` | Add midnight cron: surface due recurring tasks as new incomplete tasks |
| `commands.js` | Add `/recurring` list, `/skiprecurrence` command |
| Confirmation card | Show recurrence info if `is_recurring=true` |
| `message.js` | Pass `is_recurring + interval_days` to Supabase on create |

---

## 12. Non-Functional Characteristics

| Attribute | Target | How |
|---|---|---|
| **Availability** | Always-on | Railway restarts on crash; long poll reconnects |
| **Latency** | < 3s for task capture | Gemini Flash is optimised for speed |
| **Scale** | 2 users, ~10–20 req/day | Single Node.js process is sufficient |
| **Cost** | $0–3/month | Gemini free tier (1500 req/day), Supabase free, Railway ~$1–2 |
| **Recoverability** | Full state in Supabase | Restart loses only in-memory correction/completion state |
| **Observability** | Console logs + Railway dashboard | Add structured logging in v2 if needed |

---

## 13. Decisions Log

| Decision | Alternatives Considered | Rationale |
|---|---|---|
| Telegraf.js | node-telegram-bot-api, Grammy | Best DX, TypeScript support, active community |
| Gemini 2.0 Flash | GPT-4o-mini, Claude Haiku | Free tier 1500 req/day; sufficient for home use |
| Supabase | PlanetScale, Firebase, SQLite | Free managed Postgres + visual dashboard for ops |
| Railway | Render, Fly.io, VPS | Simplest GitHub deploy; free tier fits single process |
| GCal TEMPLATE URL | OAuth + Calendar API | No credentials, no token refresh, always works |
| In-memory correction state | Redis, Supabase | Volume is 2 users; persistence not required |
| Long polling | Webhook | No public IP needed; Railway free tier doesn't guarantee static IP |

---

*Document prepared based on Home OS PRD v1.0 and Execution Plan v1.0.*
