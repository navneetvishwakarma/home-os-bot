# Home OS — Execution Plan
**Version:** 1.0
**Last updated:** April 2026

---

## Phase 0 — Credentials (~15 mins, you do this)

```
✅ Telegram bot token          — from @BotFather
⬜ Your Telegram user ID       — message @userinfobot
⬜ Spouse Telegram user ID     — ask spouse to message @userinfobot
⬜ Gemini API key              — aistudio.google.com → Get API Key
⬜ Supabase Project URL        — supabase.com → Settings → API
⬜ Supabase service_role key   — supabase.com → Settings → API (NOT anon key)
⬜ Railway account             — railway.app, sign up with GitHub
```

---

## Phase 1 — Supabase Schema (~10 mins)

- [ ] Go to Supabase → SQL Editor → New Query
- [ ] Run `home_os_schema.sql` (creates areas, settings, tasks tables + indexes + trigger)
- [ ] Verify: 9 rows in areas, 1 row in settings, 0 rows in tasks
- [ ] Note: tasks table includes recurrence columns (v2-ready, schema reserved now)

**Files:**
- `home_os_schema.sql` — full schema script
- `home_os_tasks_table.sql` — tasks table only (updated with recurrence columns)

---

## Phase 2 — Project Scaffold (~5 mins)

Create this folder structure locally:

```
home-os-bot/
├── src/
│   ├── bot.js
│   ├── handlers/
│   │   ├── message.js
│   │   ├── correction.js
│   │   ├── complete.js
│   │   └── commands.js
│   ├── services/
│   │   ├── gemini.js
│   │   ├── supabase.js
│   │   └── calendar.js
│   ├── cron/
│   │   └── scheduler.js
│   └── config.js
├── .env
├── .gitignore
├── package.json
└── railway.toml
```

---

## Phase 3 — Core Pipeline (biggest chunk)

### 3a. `config.js`
- Load all env vars
- Export AUTHORISED_IDS as parsed array
- Export criticality order map
- Export default tag list

### 3b. `services/gemini.js`
- `classifyTask(text, areas)` → structured JSON task object
- `correctTask(existingTask, correctionText)` → patch object (changed fields only)
- Both wrapped in try/catch, strip markdown fences before JSON.parse
- Clamp `effortMins` to 1–480 after parsing
- Default `criticality` to MEDIUM if invalid value returned

### 3c. `services/supabase.js`
- `createTask(task)` → insert row, return id
- `updateTask(id, patch)` → partial update, only provided fields
- `getAreas()` → fetch all area names as string[]
- `addArea(name)` → insert new area (upsert, ignore duplicate)
- `removeArea(name)` → delete by name
- `getIncompleteTasksByPriority()` → all incomplete, ordered CRITICAL→LOW
- `bulkComplete(ids)` → set completed=true, completed_at=now()
- `getSettings()` → fetch single settings row
- `updateSettings(patch)` → update calendar_time or calendar_duration

### 3d. `services/calendar.js`
- `buildGCalUrl(queueTasks, settings)` → Google Calendar TEMPLATE URL
- Title: `🏠 Home OS — N tasks`
- Description: numbered list with criticality + effort per task

### 3e. `handlers/message.js`
- Check authorised user — silently ignore if not
- Check correction state map — if active, route to correction handler
- Call `gemini.classifyTask` with current areas
- Call `supabase.createTask`
- If `isNewArea` → call `supabase.addArea`
- Reply with formatted confirmation card
- Store `taskId` in reply for correction button

### 3f. `handlers/correction.js`
- In-memory Map: key = `${chatId}:${userId}`, value = `{ task, expiresAt }`
- Expiry: 10 minutes of inactivity, auto-cleared
- Call `gemini.correctTask` → patch object
- Call `supabase.updateTask(id, patch)`
- Reply with updated card showing only changed fields

### 3g. `handlers/complete.js`
- Parse user reply: `yes/done/all done` → bulk complete all queued IDs
- Parse `skip <name>` → fuzzy match title → complete all except matched
- Parse `no` → ask "Which ones did you finish?" → partial complete
- No reply in 2 hours → silently move on (handled by cron timeout)
- Store queued task IDs in-memory at cron fire time

### 3h. `handlers/commands.js`
- `/areas` → `supabase.getAreas()` → formatted list reply
- `/addarea <n>` → `supabase.addArea(n)` → confirm reply
- `/removearea <n>` → `supabase.removeArea(n)` → confirm reply
- `/queue` → build queue manually → post with calendar link
- `/pending` → `supabase.getIncompleteTasksByPriority()` → grouped reply
- `/settings` → `supabase.getSettings()` → display current values
- `/settime HH:MM` → `supabase.updateSettings({calendar_time})` → confirm
- `/setduration <mins>` → `supabase.updateSettings({calendar_duration})` → confirm
- `/help` → static command reference message

---

## Phase 4 — Cron Jobs (`cron/scheduler.js`)

### Job 1 — Daily Queue (fires at `calendar_time`)
1. `supabase.getIncompleteTasksByPriority()`
2. Greedy fill: CRITICAL → HIGH → quick-win tagged MEDIUM/LOW within duration budget
3. `calendar.buildGCalUrl(queue, settings)`
4. Post queue list + calendar link to authorised chat IDs

### Job 2 — Completion Prompt (fires at `calendar_time + duration + 30 mins`)
1. Store today's queued task IDs in module-level variable (set during Job 1)
2. Post: *"⏰ Your block just ended. Done? Reply yes / skip <task> / no"*
3. Set 2-hour timeout — if no reply, clear state silently

---

## Phase 5 — Deployment on Railway (~15 mins)

- [ ] Create GitHub repo `home-os-bot`
- [ ] Push all code
- [ ] Go to railway.app → New Project → Deploy from GitHub repo
- [ ] Add all env vars in Railway dashboard:
  ```
  TELEGRAM_BOT_TOKEN
  TELEGRAM_AUTHORISED_IDS
  GEMINI_API_KEY
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  ```
- [ ] Railway auto-detects Node.js, runs `node src/bot.js`
- [ ] Verify bot is online — send `/help` on Telegram

---

## Phase 6 — Smoke Test Checklist

- [ ] Send *"Kitchen tap leaking badly"* → get CRITICAL card back
- [ ] Reply *"make it HIGH"* → get corrected card, only criticality changed
- [ ] `/areas` → see 9 default areas
- [ ] `/addarea Terrace` → confirmation, check Supabase dashboard
- [ ] `/queue` → today's priority list + Google Calendar link
- [ ] Open Calendar link → event has correct tasks in description
- [ ] `/settime 08:00` → settings updated, confirmed by bot
- [ ] Wait for cron → bot posts queue automatically at set time
- [ ] Reply `yes` to completion prompt → tasks marked complete in Supabase
- [ ] `/pending` → completed tasks not shown

---

## Environment Variables Reference

```
TELEGRAM_BOT_TOKEN=           # from @BotFather
TELEGRAM_AUTHORISED_IDS=      # comma-separated: 123456789,987654321
GEMINI_API_KEY=               # from aistudio.google.com
SUPABASE_URL=                 # https://xyzxyz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=    # from Supabase → Settings → API (service_role)
```

---

## V1 Scope

- [x] Text task capture → Gemini classify → Supabase write → confirmation card
- [x] Correction flow
- [x] Area management commands
- [x] Daily queue cron + Google Calendar link auto-post
- [x] Completion confirmation flow
- [x] All bot commands
- [x] Authorised users whitelist
- [x] Railway deployment

## V2 Backlog

- [ ] Voice note support — Gemini 2.0 native audio
- [ ] Recurrence engine — schema already ready, 7 layers to implement
- [ ] Weekly summary — every Sunday
- [ ] Completion streak — gamification
- [ ] Web dashboard — read-only Supabase view

---

## Related Files

| File | Purpose |
|---|---|
| `home_os_PRD.md` | Full product requirements — use to rebuild context in new session |
| `home_os_schema.sql` | Full Supabase schema script |
| `home_os_tasks_table.sql` | Tasks table only (with recurrence columns) |
