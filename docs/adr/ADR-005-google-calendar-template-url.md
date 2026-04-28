# ADR-005: Google Calendar integration via TEMPLATE URL (no OAuth)

**Date:** April 2026  
**Status:** Accepted

## Context

The daily queue cron job posts a prioritised task list and a link to add it to Google Calendar as a timed work block. The UX goal is one tap from Telegram to a pre-filled calendar event — without the user needing to configure anything.

Two approaches exist for creating Google Calendar events programmatically:
1. Use the Google Calendar API (OAuth 2.0) to create events server-side
2. Build a `https://calendar.google.com/calendar/render?action=TEMPLATE&...` URL that opens the pre-filled "create event" UI in the user's browser

## Decision

The TEMPLATE URL approach. No OAuth. No credentials. The bot constructs a URL with the event title, start/end time, and task list in the description field. The user taps the link, reviews the event, and saves it themselves.

## Alternatives Considered

| Option | Why rejected |
|---|---|
| Google Calendar API (OAuth 2.0) | Requires each user to grant the bot OAuth access to their calendar. This introduces: an OAuth consent screen, refresh token storage per user, token expiry handling, and a Google Cloud project with Calendar API enabled. The event would be created silently (no user confirmation), which removes the chance to review before saving. Maintenance burden is high for a personal tool. |
| Apple Calendar / CalDAV | Cross-platform support is fragmented. Requires per-user CalDAV credentials. Not viable as a primary integration. |
| No calendar integration | Removing the only time-blocking mechanism leaves the queue as a list with no commitment to when the work happens. Time-boxing is a core part of the daily execution model. |

## Consequences

**Positive:**
- Zero OAuth surface. No tokens to store, refresh, or rotate. No Google Cloud Console setup beyond enabling no APIs.
- Works for any Google account without bot configuration — any household member can tap the link.
- The event creation is always a conscious user action (tap → review → save), reducing accidental calendar pollution.
- The URL is pure URL construction (`calendar.js` is a stateless pure function) — simple to test, impossible to break via API changes.

**Negative / trade-offs:**
- Event creation requires manual user action on every queue. If the user ignores the link, no event is created.
- TEMPLATE URLs are not officially documented by Google as a stable API surface (though they have been stable for 10+ years). A Google UI change could break URL parameter handling.
- The event description is plain text — no rich formatting, no task links. If tasks are updated after the calendar event is created, the event description will be stale.
- One URL per household per day — it creates one block event with all tasks in the description, not individual events per task. This is by design (time-boxing, not scheduling).
