# Home OS — Documentation

## For users

| Document | Description |
|---|---|
| [Quick Start](users/quick-start.md) | Create or join a household and capture your first task |
| [Member Guide](users/member-guide.md) | Daily usage: adding tasks, queue, completion, /done, /delete, /edit |
| [Admin Guide](users/admin-guide.md) | Membership management, settings, invite codes |

## For engineers

| Document | Description |
|---|---|
| [Architecture](engineering/architecture.md) | System design, data flow, module map, multi-tenancy, scheduler |
| [Database Schema](engineering/database-schema.md) | All tables, columns, indexes, RLS, recurring task lifecycle |
| [Commands Reference](engineering/commands-reference.md) | Every bot command with syntax, access level, and examples |
| [Development Guide](engineering/development.md) | Local setup, test runner, CJS mock pattern, adding commands |
| [Deployment Guide](engineering/deployment.md) | Railway setup, env vars, DB scripts, health checking |

## Architecture Decision Records

Significant decisions with context, alternatives considered, and consequences:

| ADR | Decision |
|---|---|
| [ADR-001](adr/ADR-001-telegram-as-primary-interface.md) | Telegram as the sole interface |
| [ADR-002](adr/ADR-002-gemini-for-ai-classification.md) | Gemini 2.5 Flash for AI classification |
| [ADR-003](adr/ADR-003-supabase-for-persistence.md) | Supabase (managed Postgres) for persistence |
| [ADR-004](adr/ADR-004-in-memory-session-state.md) | In-memory Maps for transient session state |
| [ADR-005](adr/ADR-005-google-calendar-template-url.md) | Google Calendar integration via TEMPLATE URL |
| [ADR-006](adr/ADR-006-multi-tenant-household-model.md) | Multi-tenant household model with invite codes |
| [ADR-007](adr/ADR-007-one-household-per-user-v1.md) | One household per user (v1 constraint) |
| [ADR-008](adr/ADR-008-railway-hosting-long-polling.md) | Railway hosting; long polling over webhook |

## Future design

| Document | Description |
|---|---|
| [Multi-Household Per User](multi-household-per-user-plan.md) | Design for lifting the one-household-per-user constraint (deferred — see ADR-007) |
