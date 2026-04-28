# ADR-003: Supabase (managed Postgres) for persistence

**Date:** April 2026  
**Status:** Accepted

## Context

Home OS needs persistent storage for tasks, areas, settings, users, households, and invite codes. The storage layer must:
- Support relational queries (tasks filtered by household, ordered by criticality, scoped by completion status)
- Be queryable outside the bot for debugging and ops (e.g. "what tasks are pending for this household right now?")
- Run free at our scale (<1 MB of data for years of typical usage)
- Be forward-compatible with a potential future mobile app that would need row-level security and JWT-scoped access

## Decision

Supabase, accessed via the `@supabase/supabase-js` client using the `service_role` key. All SQL operations are plain Supabase queries — no Supabase-specific features (Realtime, Edge Functions, Auth) are used in v1.

## Alternatives Considered

| Option | Why rejected |
|---|---|
| Firebase Firestore | NoSQL document model makes priority-ordered queries on tasks awkward. No free SQL joins. Dashboard is less useful for tabular task ops inspection. |
| PlanetScale | MySQL-compatible but no free tier as of 2024. Branching model adds unnecessary complexity for a single developer. |
| SQLite (local file) | No remote access — can't inspect data from the dashboard without SSH into Railway. No concurrent access from future clients. Data lives only on the Railway instance. |
| MongoDB Atlas | NoSQL — same join/query concerns as Firebase. Aggregation pipeline is heavier than plain SQL for sorted task lists. |
| Raw Postgres (managed, e.g. Neon) | Viable, but Supabase wraps Postgres with a REST API, dashboard, and RLS support — all of which are useful. No downside over raw Postgres at this scale. |

## Consequences

**Positive:**
- Free tier: 500MB, unlimited API calls — more than sufficient indefinitely.
- Supabase dashboard provides a live visual table view — useful for ops, debugging, and verifying smoke tests without writing SQL.
- Plain Postgres underneath: standard SQL, indexes, enums, and constraints all work as expected.
- RLS is enabled on all tables. The bot uses `service_role` (bypasses RLS), but JWT-scoped policies can be added for mobile clients later using the reserved `supabase_auth_user_id` column — no schema changes required.
- Multi-tenant isolation (`household_id` FK on every data table) is enforced at the application layer and can be enforced at the DB layer via RLS policies when the mobile app is added.

**Negative / trade-offs:**
- Supabase platform dependency: schema migrations, connection strings, and service role keys are managed in the Supabase console. If Supabase changes pricing or is acquired, migration effort is moderate (pure Postgres dump/restore, but the REST client would need replacing with a direct connection).
- `service_role` key bypasses RLS entirely. This is intentional (server-side bot, never exposed to clients), but requires care: the key must never appear in client-side code or logs.
- Supabase free tier projects pause after 1 week of inactivity. The always-on bot keeps the project active, but a deployment gap longer than 7 days would require manual unpausing.
