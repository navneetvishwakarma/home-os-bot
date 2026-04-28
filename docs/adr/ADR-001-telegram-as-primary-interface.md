# ADR-001: Telegram as the sole user interface

**Date:** April 2026  
**Status:** Accepted

## Context

Home OS needs to be used by two adults (and eventually other family members) with zero onboarding friction. The core UX hypothesis is: if adding a task requires opening an app, finding a form, and tapping through fields, it won't happen consistently. Tasks will continue to be captured in WhatsApp threads and mental notes.

The system needs to feel like messaging — not like software.

## Decision

Telegram is the only interface. There is no web dashboard, no mobile app, and no API for third-party clients. All interactions happen through the Telegram Bot API.

## Alternatives Considered

| Option | Why rejected |
|---|---|
| Native iOS/Android app | Requires App Store install and login — high friction for a household with varied tech comfort. Two to four weeks of additional build time before first usable version. |
| WhatsApp Business API | No free-tier bot API. Message template approval adds friction. Terms of service restrict automation use cases. |
| Web app | Requires a URL to remember, a login flow, and deliberate navigation. Doesn't integrate into existing daily messaging behaviour. |
| Voice assistant (Google/Alexa) | Poor for structured task capture — ambiguity in hands-free transcription. No visual confirmation card. Kids triggering accidental captures. |
| iMessage | Apple-only. Spouse may be on Android. |

## Consequences

**Positive:**
- Zero install. Everyone with Telegram can use it immediately.
- Works on any device, any OS, offline-tolerant (Telegram queues messages).
- Bot API is stable, well-documented, and free for our scale.
- Natural language input via free text matches how people already communicate about home tasks.
- Confirmation cards appear inline in the chat — easy to spot and correct immediately.

**Negative / trade-offs:**
- Telegram-locked. If Telegram changes its Bot API, pricing, or availability in a region, the entire UX layer is at risk.
- No rich UI: no drag-to-reorder, no checklist UI, no calendar view native to the app.
- Multi-media input (photos of broken things) requires extra handling that is out of scope in v1.
- Users who don't have Telegram cannot use the system.
