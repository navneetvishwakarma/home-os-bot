# ADR-002: Gemini 2.5 Flash for AI task classification

**Date:** April 2026  
**Status:** Accepted

## Context

The value proposition of Home OS is that users send natural language messages and the system figures out criticality, area, effort, assignee, tags, and recurrence. This requires a language model capable of reliably returning structured JSON from varied, often terse, real-world input ("bathroom tap dripping again", "kids school bag needs replacing before Monday").

The model needs to:
- Return valid JSON every time, with no markdown prose wrapping it
- Handle ambiguous or partial descriptions gracefully
- Run within a budget of $0/month for a home use case (~20–40 calls/day)

## Decision

Google Gemini 2.5 Flash via the `@google/genai` SDK. The model is configured via the `GEMINI_MODEL` env var (defaulting to `gemini-2.5-flash`) so it can be swapped without code changes.

## Alternatives Considered

| Option | Why rejected |
|---|---|
| GPT-4o-mini (OpenAI) | No free tier at our call volume. ~$0.15/1M input tokens — negligible cost, but adds a billing relationship for a zero-cost home tool. |
| Claude Haiku (Anthropic) | Similar cost concern. Excellent JSON output, but Gemini free tier makes it hard to justify. |
| Local LLM (Ollama + Mistral) | No always-on free hosting for a local model. Would require a self-hosted machine running 24/7. Latency unpredictable on consumer hardware. |
| Rule-based parser | Regex + keyword matching cannot handle the variety of natural language task descriptions. Would require constant maintenance and would miss edge cases constantly. |
| Gemini 2.5 Pro | Higher quality but not needed for structured extraction from short texts; slower and more expensive. Flash is sufficient. |

## Consequences

**Positive:**
- 1,500 requests/day free on Google AI Studio — comfortably above our ~40 req/day peak.
- Fast response time (Flash is optimised for low latency).
- Reliable JSON output when instructed with "Return ONLY valid JSON".
- Native support for dynamic system prompts (areas list injected per request).
- Model version can be upgraded by changing one env var.

**Negative / trade-offs:**
- Free tier rate limit: 5 requests/minute. Under normal single-household use this is never hit; if load increases (many households, burst usage), requests will be throttled.
- Google dependency: if the free tier terms change, there is a real cost to absorb or a migration to do.
- Both the primary classification prompt and the correction prompt consume a Gemini call. A third call is made for witty confirmations (`witty-response.js`). Total: up to 3 Gemini calls per task-add interaction.
- JSON output still requires defensive parsing: markdown fence stripping, field clamping, enum defaulting. Model can occasionally return malformed output under unexpected input.
- No offline or fallback classification if the Gemini API is unavailable. Task capture fails gracefully with a user-visible error message.
