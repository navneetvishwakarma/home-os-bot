# Home OS — Deployment Guide

Home OS is deployed on Railway as a single always-on Node.js process. It uses Telegram long-polling (not webhooks), so no public URL or SSL certificate is required.

---

## Railway setup

### First deployment

1. Push the repository to GitHub.
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. Select the `home-os-bot` repository.
4. Railway detects Node.js automatically via `package.json` and uses NIXPACKS to build.
5. The start command is `node src/bot.js` (defined in `railway.toml`).

### Environment variables

Add all required variables in the Railway dashboard under **Variables**:

| Variable | Required | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | From @BotFather |
| `GEMINI_API_KEY` | Yes | From aistudio.google.com |
| `SUPABASE_URL` | Yes | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | From Supabase → Settings → API (service_role) |
| `GEMINI_MODEL` | No | Defaults to `gemini-2.5-flash` |
| `COMPLETION_PROMPT_DELAY_MINS` | No | Defaults to `60` |

The bot will not start and will exit with code 1 if any required variable is missing.

---

## Database setup

Run these scripts once in the **Supabase SQL Editor** before the first deployment:

### Fresh install

```
scripts/multi_tenant_schema.sql
```

Creates all tables, enums, indexes, and enables RLS.

### Migrating an existing single-household deployment

```
scripts/migrate_to_multitenant.sql
```

Edit the two variables at the top of the script before running:
- `:seed_household_name` — name for the existing household
- `:admin_telegram_id` — Telegram ID of the existing admin user

---

## railway.toml

```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "node src/bot.js"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

Auto-restarts up to 10 times on failure. If the bot crashes more than 10 times in succession, Railway stops and alerts.

---

## Deploying updates

Push to `main`. Railway detects the push and redeploys automatically.

**Zero-downtime note:** The bot uses long-polling. During the redeploy window (typically 5–15 seconds), Telegram queues incoming messages and delivers them to the new instance. No messages are lost.

---

## Checking health

Railway shows stdout/stderr logs in the dashboard. The bot emits structured JSON on startup:

```json
{"ts":"2026-04-27T12:00:00Z","level":"info","event":"scheduler_started","householdCount":2}
{"ts":"2026-04-27T12:00:00Z","level":"info","event":"bot_started"}
```

If `householdCount` is lower than expected, check for `household_missing_settings` warnings:

```json
{"ts":"2026-04-27T12:00:00Z","level":"warn","event":"household_missing_settings","householdId":"...","name":"..."}
```

This means a household exists in the database but has no settings row — it will not be scheduled until the settings row is created (run `upsertSettings` manually or reinitiate via the bot).

---

## Costs

| Service | Tier | Cost |
|---|---|---|
| Railway | Hobby | ~$5/month (always-on) |
| Supabase | Free | 0 (500 MB storage, 2 GB bandwidth) |
| Gemini API | Free | 0 (1,500 requests/day on free tier) |
| Telegram | Free | 0 |

For a household with 2–4 members adding a few tasks per day, the Gemini free tier is more than sufficient.

---

## Scaling considerations

The current architecture is single-process. All in-memory state (correction sessions, completion windows) is lost on restart. For higher reliability:

- Migrate session state to Redis or a Supabase table
- Use Railway's volume mount for persistence
- Add a health-check endpoint (requires adding a small HTTP server)

These are V2 concerns — the current design handles household-scale load with significant headroom.
