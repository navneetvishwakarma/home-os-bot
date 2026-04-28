# ADR-006: Multi-tenant household model with invite-based membership

**Date:** April 2026  
**Status:** Accepted  
**Supersedes:** Original single-tenant design (flat `TELEGRAM_AUTHORISED_IDS` whitelist)

## Context

The initial design used a flat `TELEGRAM_AUTHORISED_IDS` env var: a comma-separated list of Telegram user IDs that were allowed to use the bot. This worked for a single family but had three problems:

1. **Deployment coupling.** Adding a new user required a Railway env var change and a redeploy.
2. **No isolation.** All authorised users shared the same tasks, areas, and settings. There was no way to run the same bot instance for two independent households.
3. **No self-service.** Users could not join without an operator touching the server.

The system needed to evolve to support multiple independent families on one deployment, each with their own isolated task list, areas, settings, and scheduler — without any operator involvement when a new family joins.

## Decision

A household-centric multi-tenant model:

- **`households`** table is the tenant root. Each family is one household.
- **`users`** table holds one row per Telegram identity, upserted on first contact.
- **`household_members`** links users to households with a `role` (`admin` | `member`).
- **`invite_codes`** table stores single-use, 24-hour-expiry codes generated with `crypto.randomBytes`. Codes are consumed atomically in the database (unique constraint on `used_at`).
- All data tables (`tasks`, `areas`, `settings`) carry `household_id` as a foreign key. All application queries are scoped to it.
- The `householdMiddleware` runs on every Telegram update, upserts the user, resolves membership, and attaches `ctx.household`, `ctx.householdUser`, and `ctx.memberRole`.
- `requireMember()` and `requireAdmin()` middleware guards replace the old whitelist check.

**Onboarding flow:**
- First contact: `/start` → offer `/create` or `/join`
- `/create <name>` → creates household, makes caller admin, seeds 12 default areas and one settings row
- `/join <CODE>` → atomically consumes the invite code, inserts membership

## Alternatives Considered

| Option | Why rejected |
|---|---|
| Separate deployment per family | Operationally expensive. Each family requires its own Railway project, env vars, and Railway billing. Defeats the purpose of a shared codebase. |
| Subdomain routing | Not applicable to Telegram bots — the Telegram Bot API routes to one bot token, not to subdomains. |
| Hardcoded whitelist per household in env vars | Non-starter for self-service. Any new member requires an operator to redeploy. |
| Shared task space with user tagging | Wrong isolation level. Two families on the same deployment would see each other's tasks. |
| OAuth-based identity (Google/Apple) | Adds a mobile app dependency. The bot's strength is Telegram-only, no-install access. OAuth identity is reserved for a future mobile app via `supabase_auth_user_id`. |

## Consequences

**Positive:**
- A single Railway deployment serves N families with zero operator involvement per new household.
- Invite codes are stored in the DB, making them usable by a future mobile app (same code, same API).
- The `supabase_auth_user_id` column on `users` is reserved for future JWT-based mobile auth without schema changes.
- Per-household scheduler: each family fires their daily queue at their own configured time and timezone.
- The `permissions` JSONB column on `settings` allows per-household access flags (e.g. area management admin-only) without schema changes.
- RLS policies can be added per table to enforce household isolation at the DB layer when the mobile app is added — the `household_id` FK is already in place.

**Negative / trade-offs:**
- The `householdMiddleware` runs a DB upsert on *every* Telegram update, including commands from users who are not yet members. This is a small but real overhead that was not present in the whitelist design.
- Bot startup now requires loading all households and initialising one cron job pair per household. A deployment with hundreds of households would need a more efficient scheduler bootstrap.
- The multi-tenant schema migration from the single-tenant design requires a one-time backfill script (`scripts/migrate_to_multitenant.sql`), which must be run manually with household name and admin Telegram ID set as SQL variables.
