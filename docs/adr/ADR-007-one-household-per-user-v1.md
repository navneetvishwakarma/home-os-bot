# ADR-007: One household per user (v1 constraint)

**Date:** April 2026  
**Status:** Accepted

## Context

Once the multi-tenant model (ADR-006) allows multiple households to exist, there is a natural follow-on question: should a single user be allowed to belong to more than one household? For example, a user might want to be part of their own family's household and also their parents' household.

The multi-tenant schema supports this theoretically — `household_members` could have multiple rows per user if the `UNIQUE(user_id)` constraint were dropped. However, multiple household membership creates a fundamental UX ambiguity:

> When a user sends a free-text message ("fix the tap"), which household does it belong to?

The bot cannot infer this from message content. The available resolution strategies are:
1. Always ask ("Which household?") — destroys the zero-friction UX
2. Infer from message content (AI-based routing) — unreliable and adds a classification step before classification
3. Maintain an "active household" that the user can switch explicitly — viable but adds state and cognitive load

## Decision

Enforce `UNIQUE(user_id)` on `household_members`. In v1, a user belongs to exactly one household. Attempting to join a second household is rejected with a clear error message.

The active household model has been designed and documented in `docs/multi-household-per-user-plan.md` for when this constraint is lifted.

## Alternatives Considered

| Option | Why rejected |
|---|---|
| Active household model (`/switch <name>`) | Requires tracking `active_household_id` per user (either in-memory or DB). Every task card must show the household name as a safeguard against misfiled tasks. Adds `/switch` and `/myhouseholds` commands. Viable, but premature complexity for v1 where no real user has expressed this need yet. |
| Always-ask routing | Introduces a confirmation step before every task capture. Eliminates the core UX value — frictionless capture. |
| AI-based routing from message context | Requires an extra Gemini call per message to determine the target household. Unreliable when tasks are generic ("clean the kitchen"). |
| No constraint (allow multiple, pick first) | Silently sends tasks to the wrong household. Confusing and hard to debug. |

## Consequences

**Positive:**
- `householdMiddleware` is simple: one DB query, one resolved household, no `active_household_id` concept.
- Task capture has zero ambiguity — every free-text message goes to the one household the user belongs to.
- No `/switch` command needed. Fewer commands = simpler help text, simpler mental model.

**Negative / trade-offs:**
- A user who belongs to two households (e.g. own family + parents) cannot participate in both on the same bot instance. They would need to use two Telegram accounts, which is impractical.
- Lifting this constraint later requires: dropping `UNIQUE(user_id)`, adding an `active_household_id` to users or in-memory state, modifying `householdMiddleware`, adding `/switch` + `/myhouseholds` commands, and updating all task cards to show the household name.
- The design and schema changes required to lift this constraint are pre-documented in `docs/multi-household-per-user-plan.md`.
