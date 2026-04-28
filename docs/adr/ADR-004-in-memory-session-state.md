# ADR-004: In-memory Maps for transient session state

**Date:** April 2026  
**Status:** Accepted

## Context

Two flows require short-lived per-user state that doesn't belong in the database:

1. **Correction window** — after a task is added, the user has 10 minutes to send a correction. The bot needs to remember which task to correct and expire the window automatically.
2. **Completion window** — after the daily cron posts the queue, the user has 2 hours to reply with completion status. The bot needs to remember which tasks were in today's queue.

These windows are intentionally ephemeral. There is no need to reconstruct them after a restart — they are conversational state, not application state.

## Decision

Node.js in-memory `Map` objects with TTL-based expiry, implemented in `correction-session.js` and `queue-session.js`. Keys are `chatId:userId` (correction) and `telegramId` (queue). Expired entries are purged on each access and via a periodic sweep.

## Alternatives Considered

| Option | Why rejected |
|---|---|
| Redis | Requires an additional hosted service. For 2–10 users and sessions measured in minutes, the operational overhead and cost of a Redis instance are not justified. |
| Supabase (DB-backed sessions) | Every free-text message would trigger a DB read to check session state. Adds latency and couples a conversational concept to persistent storage, which complicates cleanup and TTL management. |
| Telegraf session middleware (default in-memory or Supabase adapter) | The default in-memory adapter is not TTL-aware out of the box. The Supabase adapter has the same concerns as the option above. Our hand-rolled Maps give explicit control over TTL and key format. |
| File-based session store | More complex than in-memory with no meaningful benefit at this scale. State still lost on restart. |

## Consequences

**Positive:**
- Zero infrastructure overhead — no additional service to deploy, monitor, or pay for.
- Sub-millisecond read/write — no async I/O for session lookups.
- TTL behaviour is explicit and easy to reason about in tests.
- The `startSessionForTask()` function in `correction-session.js` allows starting a correction session on *any* pending task (not just the most recently added), which enables the `/edit` command to reuse the same correction pipeline.

**Negative / trade-offs:**
- State is lost on process restart. If Railway restarts the bot mid-correction or mid-completion window, the session is gone. Users are unblocked by `/done <task>` and `/edit <task>` as explicit fallbacks, and this is documented in user guides.
- No horizontal scaling. A second process instance would not share session state. Acceptable for a single-household bot on Railway; would require Redis if multiple processes were ever needed.
- Memory grows with the number of active sessions. For 2–10 users with 10-minute and 2-hour windows, the maximum memory footprint is a few dozen Map entries — effectively zero.
