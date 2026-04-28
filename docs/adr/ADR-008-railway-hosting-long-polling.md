# ADR-008: Railway for hosting; long polling over webhook

**Date:** April 2026  
**Status:** Accepted

## Context

The bot needs to run continuously (not on-demand) because:
- node-cron jobs for the daily queue and completion prompt must fire at configured times regardless of user activity
- Correction and completion windows have time-based expiry driven by module-level timers

A hosting platform is needed that keeps a Node.js process alive 24/7, deploys automatically from GitHub, and fits within a near-zero budget.

Separately, Telegram bots can receive updates via two mechanisms:
1. **Webhook** — Telegram POSTs updates to a public HTTPS endpoint on the bot's server
2. **Long polling** — the bot repeatedly calls `getUpdates` with a timeout; Telegram holds the connection open until an update arrives

## Decision

**Hosting:** Railway.app with NIXPACKS auto-detection. The `railway.toml` sets the start command to `node src/bot.js`. Auto-deploy is triggered on push to `main`. Up to 10 restart retries on failure.

**Update mechanism:** Long polling via Telegraf's default `bot.launch()` (no webhook configuration). The bot initiates connections to Telegram — Telegram never calls back.

## Alternatives Considered

**Hosting:**

| Option | Why rejected |
|---|---|
| Render | Free tier spins down after 15 minutes of inactivity. Cron jobs would not fire reliably. |
| Fly.io | Solid option, but Railway has a simpler GitHub deploy DX and adequate free credits. |
| VPS (DigitalOcean/Hetzner) | Most control but requires OS management, SSL setup, and process supervision (PM2/systemd). Overkill for a personal bot. |
| Serverless (Lambda/Cloud Functions) | Fundamentally incompatible with long-running processes and in-memory cron state. Would require external scheduling (EventBridge, Cloud Scheduler) and stateless handlers — a major architectural shift. |

**Update mechanism:**

| Option | Why rejected |
|---|---|
| Webhook | Requires a stable public HTTPS URL with a valid TLS certificate. Railway free tier does not guarantee a static IP or a reliable public hostname for webhook registration. Long polling avoids this entirely. |

## Consequences

**Positive:**
- Railway provides always-on execution with GitHub auto-deploy on push to `main` — zero deployment ceremony.
- Long polling requires no public IP, no TLS certificate management, and no webhook registration. Works from behind any NAT.
- Railway's dashboard provides log streaming and restart monitoring — sufficient observability for a personal tool.
- `railway.toml` pins the build configuration in the repo — deployment is reproducible.

**Negative / trade-offs:**
- Railway's free tier has changed in the past. If the always-on free tier is removed or capped, the monthly cost would be ~$1–2 (single small process). This is acceptable and was an explicit design constraint.
- Long polling introduces ~1–2 seconds of additional latency per update compared to webhook delivery. For a home task bot this is imperceptible.
- Long polling consumes one persistent outbound HTTP connection. At Railway scale this is irrelevant, but it is the reason webhook is preferred for high-throughput bots.
- The in-process cron scheduler (node-cron) means cron jobs are tied to the Railway process lifecycle. A crash and restart during a queue-post or completion window loses the in-flight state (see ADR-004).
