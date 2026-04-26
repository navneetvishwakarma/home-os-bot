# Home OS Bot

Home OS is a Telegram bot that captures home tasks in natural language, classifies them with Gemini, stores them in Supabase, and posts a daily execution queue with calendar support.

## Setup

1. Copy `.env.example` to `.env` and fill the values.
2. Run SQL scripts in Supabase:
   - `scripts/create_schema.sql`
   - `scripts/update_schema.sql` (if upgrading an existing table)
3. Install dependencies:
   - `npm install`
4. Start the bot:
   - `npm run start`

Environment note:
- `GEMINI_MODEL` defaults to `gemini-2.5-flash` and can be changed without code edits.

## Commands

- `/areas`
- `/addarea <name>`
- `/removearea <name>`
- `/queue`
- `/pending`
- `/settings`
- `/settime HH:MM`
- `/setduration <mins>`
- `/help`

## Deployment (Railway)

1. Push this repo to GitHub.
2. Create a Railway project from GitHub.
3. Set all env vars from `.env.example`.
4. Deploy and verify by sending `/help` to the bot.
