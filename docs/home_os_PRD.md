# Home OS — Product Requirements Document
**Version:** 1.0  
**Status:** Pre-implementation planning document — superseded by live implementation  
**Last updated:** April 2026

> **Note:** This document was written before the multi-tenant rewrite. Several sections (auth model, DB schema, command list, env vars) reflect the original single-tenant design and are no longer accurate. For the current architecture see `docs/engineering/architecture.md`; for the current command reference see `docs/engineering/commands-reference.md`; for environment setup see `docs/engineering/development.md`.

---

## 1. Product Overview

### 1.1 What It Is
Home OS is an AI-powered home task management system for a family with kids. It accepts natural language task input via a Telegram bot, classifies tasks using Gemini 2.5 Flash, persists them in Supabase, and proactively manages daily execution via Google Calendar integration and cron-based automation.

### 1.2 Problem It Solves
- Home tasks are captured informally (mental notes, WhatsApp messages) and lost
- No shared system between spouses that works without app installs or logins
- No intelligent prioritisation — everything feels urgent or nothing does
- No daily execution rhythm — tasks pile up without a time-boxed plan

### 1.3 North Star
> *"Message the bot like WhatsApp. Let it think. Show up, do the work, confirm done."*

---

## 2. Users

| User | Access | Primary Action |
|---|---|---|
| Primary user (you) | Telegram, authorised by user ID | Add tasks, review queue, confirm completion |
| Spouse | Telegram, authorised by user ID | Add tasks, voice notes (v2) |
| Bot | Automated | Classify, queue, remind, complete |

**Authorisation:** Multi-tenant, invite-based. Any Telegram user can start the bot; they join a household via `/create` (becomes admin) or `/join <invite-code>` (becomes member). Access is controlled by `requireMember` / `requireAdmin` middleware guards backed by the `household_members` table.

---

## 3. Architecture

### 3.1 System Flow
```
You / Spouse (Telegram text message)
        ↓
  Telegraf.js handler (Node.js)
        ↓
  Authorised user check
        ↓
  Gemini 2.5 Flash  ←  system prompt with home areas
        ↓
  Supabase (Postgres) — write classified task
        ↓
  Bot replies with confirmation card
        ↓  (correction flow if needed)
  "make it HIGH" → Gemini patch → Supabase update → updated card
```

### 3.2 Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Bot runtime | Node.js 20 + Telegraf.js | Lightweight, excellent Telegram support |
| AI | Gemini 2.5 Flash | Free tier (1500 req/day), reliable JSON output |
| Database | Supabase (Postgres) | Free tier, queryable, visual dashboard, open source |
| Scheduler | node-cron | Daily queue post + completion prompt |
| Hosting | Railway.app | Free tier, always-on, GitHub auto-deploy |
| Voice (v2) | Gemini 2.5 native audio | No Whisper needed |

### 3.3 Project Structure
```
home-os-bot/
├── src/
│   ├── bot.js                 ← Telegraf setup, command routing
│   ├── handlers/
│   │   ├── message.js         ← text → Gemini → Supabase → reply
│   │   ├── correction.js      ← patch flow ("make it HIGH")
│   │   ├── complete.js        ← bulk complete confirmation flow
│   │   └── commands.js        ← /areas /queue /settings etc.
│   ├── services/
│   │   ├── gemini.js          ← Gemini 2.5 Flash API wrapper
│   │   ├── supabase.js        ← all DB read/write operations
│   │   └── calendar.js        ← Google Calendar URL builder
│   ├── cron/
│   │   └── scheduler.js       ← daily queue + completion prompt
│   └── config.js              ← env vars, constants, defaults
├── .env
├── package.json
└── railway.toml
```

---

## 4. Data Model

### 4.1 `tasks` Table
```sql
id                       uuid        PK, auto
title                    text        NOT NULL
area                     text        NOT NULL
criticality              enum        CRITICAL | HIGH | MEDIUM | LOW
effort_mins              int         default 30
tags                     text[]      default {}
assigned_to              text        Me | Spouse | Professional | Both
deadline                 date        nullable
reasoning                text        nullable  (AI-generated one-liner)
raw_input                text        original user message
added_by                 text        Telegram user_id
completed                boolean     default false
completed_at             timestamptz nullable
is_recurring             boolean     default false  (v2 logic, schema reserved)
recurrence_interval_days int         nullable  (7=weekly, 14=fortnightly, 30=monthly)
next_due_date            date        nullable  (computed on completion)
last_completed_at        date        nullable
created_at               timestamptz auto
```

### 4.2 `areas` Table
```sql
id         uuid  PK, auto
name       text  UNIQUE NOT NULL
created_at timestamptz auto
```

**Default seed (12 areas):**
Kitchen, Bathroom, Common Bathroom, Living Room, Master Bedroom, Guest Bedroom, Office, Garden, Balcony, Utility Room, Entrance, General

### 4.3 `settings` Table
```sql
id                uuid  PK, auto
calendar_time     time  default 19:00
calendar_duration int   default 60  (minutes)
updated_at        timestamptz auto-updated
```
Single row. Always UPDATE, never INSERT.

### 4.4 Indexes
```sql
-- Daily queue fetch (incomplete tasks by priority)
CREATE INDEX idx_tasks_incomplete ON tasks (criticality, effort_mins) WHERE completed = false;

-- Area summary queries
CREATE INDEX idx_tasks_area ON tasks (area) WHERE completed = false;

-- Tag-based filtering (quick-win, recurring etc.)
CREATE INDEX idx_tasks_tags ON tasks USING GIN (tags);

-- Recurring task due-date check (v2 cron)
CREATE INDEX idx_tasks_recurring_due ON tasks (next_due_date) WHERE is_recurring = true AND completed = false;
```

---

## 5. AI Classification

### 5.1 Gemini System Prompt
```
You are the brain of a Home OS — an intelligent home task management system for a family with kids.
Your job: Parse a natural language home task input and return a structured JSON object.
Return ONLY valid JSON. No markdown, no explanation, no preamble.

The user's home has these areas: {areas joined by " | "}

JSON shape:
{
  "title": "short clean task title (max 8 words)",
  "area": "best matching area from the list above, or a new short area name if none fit",
  "isNewArea": true or false,
  "criticality": "one of: CRITICAL | HIGH | MEDIUM | LOW",
  "effortMins": number,
  "tags": array from: ["needs-professional","needs-purchase","needs-budget","kids-related","quick-win","safety","recurring","delegated","water-damage-risk","electrical"],
  "assignedTo": "one of: Me | Spouse | Professional | Both",
  "deadline": "ISO date string if mentioned, else null",
  "reasoning": "one sentence explaining criticality"
}

Criticality rules:
- CRITICAL: Safety risk, health risk, structural damage, active leaks, broken alarms
- HIGH: Affects daily function, school deadlines, broken appliances, kid needs
- MEDIUM: Comfort, recurring maintenance, non-urgent repairs
- LOW: Aesthetic, nice-to-have, someday items
quick-win = effort under 15 mins
```

### 5.2 Correction Prompt
```
You are updating a home task record based on a user's correction.
Return ONLY a JSON object with ONLY the changed fields. No markdown, no explanation.
Valid fields: title, area, criticality, effortMins, tags, assignedTo, deadline, reasoning
Examples:
- "make it HIGH" → {"criticality":"HIGH"}
- "change area to Office" → {"area":"Office"}
- "assign to Spouse" → {"assignedTo":"Spouse"}
```

### 5.3 Criticality Config

| Level | Meaning |
|---|---|
| CRITICAL | Safety/health risk, active leaks, broken alarms, structural damage |
| HIGH | Affects daily function, school deadlines, broken appliances, kid needs |
| MEDIUM | Comfort, recurring maintenance, non-urgent repairs |
| LOW | Aesthetic, nice-to-have, someday items |

### 5.4 Tag Taxonomy
`needs-professional` · `needs-purchase` · `needs-budget` · `kids-related` · `quick-win` · `safety` · `recurring` · `delegated` · `water-damage-risk` · `electrical`

---

## 6. Features

### 6.1 Task Capture (Core)
- User sends natural language text to bot
- Bot checks if user is authorised
- Calls Gemini with current areas list as context
- Writes classified task to Supabase
- Replies with confirmation card:
  ```
  ✅ Task Added!
  
  📝 Kitchen tap repair
  📍 Area: Kitchen
  🔴 CRITICAL
  ⏱ Effort: ~30 mins
  👤 Assigned: Professional
  🏷 Tags: #needs-professional #water-damage-risk
  
  ↳ Active leak poses water damage risk.
  
  ↩ Wrong? Reply "correct" to fix it.
  ```
- If Gemini identifies a new area not in the list, bot confirms: *"🆕 Added 'Terrace' as a new area."*

### 6.2 Correction Flow
- User replies `correct` or `fix this` after a confirmation card
- Bot enters correction mode (in-memory state keyed by chat+user ID)
- User types correction in plain English: *"make it HIGH"*, *"assign to Spouse"*
- Calls Gemini correction prompt with existing task JSON + correction text
- Gemini returns only changed fields (patch object)
- Supabase updates task with patch
- Bot replies with updated card showing changed fields

### 6.3 Area Management
- `/areas` — lists all areas currently in Supabase
- `/addarea <name>` — adds new area
- `/removearea <name>` — removes area (tasks using it are unaffected)
- Areas are passed to Gemini on every classification call
- If Gemini suggests a new area, it is auto-added to Supabase with bot confirmation

### 6.4 Daily Queue + Google Calendar
**Trigger:** node-cron fires at `settings.calendar_time`

**Queue building logic (greedy fill):**
1. Sort all incomplete tasks by criticality order: CRITICAL → HIGH → MEDIUM → LOW
2. Fill CRITICAL tasks first until budget exhausted
3. Fill HIGH tasks next
4. Fill `quick-win` tagged MEDIUM/LOW tasks to use remaining buffer
5. Stop when `calendar_duration` budget is consumed

**Bot posts to chat:**
```
📋 Today's 60-Minute Queue

1. [CRITICAL] Kitchen tap repair (~30m)
2. [HIGH] Buy school bag for kids (~15m)
3. [MEDIUM] #quick-win — Wipe kitchen shelves (~10m)

Total: 55 mins · 5 mins buffer

📅 Add to Google Calendar at 7:00 PM
→ [calendar link]
```

**Google Calendar URL format:**
- Action: `TEMPLATE`
- Title: `🏠 Home OS — N tasks`
- Dates: start = `calendar_time`, end = start + `calendar_duration` mins
- Description: numbered list of tasks with criticality and effort

### 6.5 Completion Flow
**Trigger:** node-cron fires at `calendar_time + calendar_duration + 30 mins`

**Bot posts:**
```
⏰ Your 60-minute block just ended.
Did you complete today's tasks? Reply:
• "yes" or "done" — mark all complete
• "skip <task name>" — complete all except that one
• "no" — I'll ask which ones you finished
```

**Flow:**
- `yes` / `done` / `all done` → `bulkComplete(queuedTaskIds)` → reply with count
- `skip plumber` → fuzzy match task title → complete all except matched → reply
- `no` → bot asks *"Which ones did you finish? List them."* → partial complete
- No reply in 2 hours → silently move on, tasks stay incomplete
- On completion of recurring tasks (v2): bot notifies next due date

### 6.6 Bot Commands Reference

| Command | Description |
|---|---|
| `/areas` | List all home areas |
| `/addarea <name>` | Add a new area |
| `/removearea <name>` | Remove an area |
| `/queue` | Manually trigger today's priority queue + Calendar link |
| `/pending` | List all incomplete tasks grouped by criticality |
| `/settings` | Show current calendar time and duration |
| `/settime HH:MM` | Update calendar block start time |
| `/setduration <mins>` | Update calendar block duration |
| `/help` | Command reference |

---

## 7. Cron Jobs

| Job | Schedule | Action |
|---|---|---|
| Daily queue | `calendar_time` | Build queue, post to chat, include Calendar link |
| Completion prompt | `calendar_time + duration + 30 mins` | Ask user if tasks are done |
| Recurring due check (v2) | Daily at midnight | Surface due recurring tasks as new incomplete tasks |

---

## 8. Environment Variables

```
TELEGRAM_BOT_TOKEN=           # from @BotFather
GEMINI_API_KEY=               # from aistudio.google.com
GEMINI_MODEL=                 # optional; defaults to gemini-2.5-flash
SUPABASE_URL=                 # https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=    # Settings → API → service_role (NOT anon key)
COMPLETION_PROMPT_DELAY_MINS= # optional; defaults to 60
```

> Note: `TELEGRAM_AUTHORISED_IDS` from the original single-tenant design has been removed. Access is now managed through household membership.

> ⚠️ Use `SUPABASE_SERVICE_ROLE_KEY` (not anon key) — the bot is server-side only and needs to bypass RLS.

---

## 9. Validation & Error Handling

- Gemini response must be valid JSON — wrap all calls in try/catch, strip markdown fences before parsing
- `effortMins` must be clamped to 1–480 (max 8 hours) — reject hallucinated values
- `criticality` must be one of the 4 enum values — default to MEDIUM if invalid
- `area` from Gemini must be matched against known areas (case-insensitive) before accepting as new
- All Supabase writes must be wrapped in try/catch — on failure, bot replies: *"⚠️ Something went wrong. Try rephrasing?"*
- Correction state (in-memory Map) must be cleared after 10 minutes of inactivity per user

---

## 10. Supabase Functions Reference

| Function | Description |
|---|---|
| `createTask(task)` | Insert task row, return id |
| `updateTask(id, patch)` | Partial update, only provided fields |
| `getAreas()` | Fetch all area names as string array |
| `addArea(name)` | Insert new area |
| `removeArea(name)` | Delete area by name |
| `getIncompleteTasksByPriority()` | All incomplete tasks sorted by criticality order |
| `bulkComplete(ids)` | Set completed=true, completed_at=now() for id list |
| `getSettings()` | Fetch single settings row |
| `updateSettings(patch)` | Update calendar_time or calendar_duration |

---

## 11. V1 Scope (Build Now)

- [x] Text task capture → Gemini classify → Supabase write → confirmation card
- [x] Correction flow
- [x] Area management commands
- [x] Daily queue cron + Google Calendar link
- [x] Completion confirmation flow
- [x] `/pending`, `/queue`, `/settings`, `/settime`, `/setduration`, `/help`
- [x] Authorised users whitelist
- [x] Railway deployment

---

## 12. V2 Backlog (After Stable)

- [ ] Voice note support — Gemini 2.5 native audio transcription
- [ ] Recurrence engine — auto-recreate tasks on schedule (schema already ready)
- [ ] Weekly summary — every Sunday: *"7 tasks completed, 3 pending"*
- [ ] Completion streak — gamification for consistency
- [ ] Web dashboard — read-only Supabase view of all tasks

---

## 13. Recurrence — Pre-Planned Impact (V2)

Schema columns are already reserved in `tasks` table. When building v2, these 7 layers are impacted:

| Layer | Change needed |
|---|---|
| Gemini prompt | Detect recurrence language, map to interval_days |
| `supabase.js` | `getDueRecurringTasks()`, `recreateRecurringTask()`, `updateNextDueDate()` |
| `complete.js` | Post-completion recreation + next-due notification |
| `scheduler.js` | New midnight cron job for due recurring tasks |
| `commands.js` | `/recurring` list, `/skiprecurrence` command |
| Confirmation card | Show recurrence info if detected |
| `message.js` | Pass is_recurring + interval to Supabase on create |

---

## 14. Smoke Test Checklist

After deployment, verify these flows end to end:

- [ ] Send *"Kitchen tap leaking badly"* → get CRITICAL classified card
- [ ] Reply *"make it HIGH"* → get corrected card with only criticality changed
- [ ] `/areas` → see 9 default areas
- [ ] `/addarea Terrace` → see confirmation, verify in Supabase dashboard
- [ ] `/queue` → see today's priority list + Google Calendar link
- [ ] Open Calendar link → event has correct tasks in description
- [ ] `/settime 08:00` → settings updated
- [ ] Cron fires → bot posts queue automatically at set time
- [ ] Reply `yes` to completion prompt → tasks marked complete in Supabase
- [ ] `/pending` → completed tasks not shown

---

## 15. Cost Estimate

| Service | Free Tier | Expected Usage | Cost |
|---|---|---|---|
| Gemini 2.5 Flash | 1,500 req/day free (per-minute rate limit applies) | ~20–40 req/day | $0 |
| Supabase | 500MB, unlimited API calls | <1MB for years | $0 |
| Railway.app | $5 credit/month | ~$1–2/month | $0–3/month |
| Voice (v2) | Gemini native audio | Negligible | $0 |
| **Total** | | | **$0–3/month** |
