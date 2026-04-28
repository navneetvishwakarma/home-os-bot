# Architecture Decision Records

This directory records significant architectural decisions made during the design and evolution of Home OS. Each ADR explains the context, the decision, the alternatives that were considered, and the consequences — so future contributors understand *why* the system is the way it is, not just *what* it does.

## Status values

| Status | Meaning |
|---|---|
| **Accepted** | Decision is in effect and reflected in the codebase |
| **Superseded** | Decision has been replaced; see the superseding ADR |
| **Deprecated** | Decision is being phased out |
| **Proposed** | Under discussion, not yet implemented |

## Index

| ADR | Title | Status |
|---|---|---|
| [ADR-001](ADR-001-telegram-as-primary-interface.md) | Telegram as the sole user interface | Accepted |
| [ADR-002](ADR-002-gemini-for-ai-classification.md) | Gemini 2.5 Flash for AI task classification | Accepted |
| [ADR-003](ADR-003-supabase-for-persistence.md) | Supabase (managed Postgres) for persistence | Accepted |
| [ADR-004](ADR-004-in-memory-session-state.md) | In-memory Maps for transient session state | Accepted |
| [ADR-005](ADR-005-google-calendar-template-url.md) | Google Calendar integration via TEMPLATE URL | Accepted |
| [ADR-006](ADR-006-multi-tenant-household-model.md) | Multi-tenant household model with invite codes | Accepted |
| [ADR-007](ADR-007-one-household-per-user-v1.md) | One household per user (v1 constraint) | Accepted |
| [ADR-008](ADR-008-railway-hosting-long-polling.md) | Railway for hosting; long polling over webhook | Accepted |

## How to add an ADR

1. Copy the template below into a new file: `ADR-NNN-short-title.md`
2. Fill in all sections honestly — the *Consequences* section is the most important
3. Add a row to the index above
4. If the new decision supersedes an existing one, update the old ADR's status

```markdown
# ADR-NNN: Title

**Date:** YYYY-MM  
**Status:** Proposed | Accepted | Superseded by ADR-NNN | Deprecated

## Context

What situation or constraint forced this decision?

## Decision

What did we decide?

## Alternatives Considered

| Option | Why rejected |
|---|---|
| ... | ... |

## Consequences

**Positive:**
- ...

**Negative / trade-offs:**
- ...
```
