# Home OS — Member Guide

Members add tasks, receive the daily queue, confirm completion, and manage their own task list. Settings and membership are managed by admins.

---

## Adding a task

Send any plain-English description in your private chat with the bot. No commands, no forms.

```
The bathroom exhaust fan is making a grinding noise
```

```
📋 Fix bathroom exhaust fan
📍 Bathroom
🟡 HIGH  ⏱ 30 mins
👤 Me
🏷 needs-professional
💡 Grinding noise suggests bearing wear — needs inspection before failure
```

**What the AI infers automatically:**
- **Area** — matched against your household's area list; new areas are created if needed
- **Criticality** — CRITICAL / HIGH / MEDIUM / LOW based on urgency and safety
- **Effort** — estimated minutes
- **Assignee** — Me / Spouse / Professional / Both
- **Tags** — from: `needs-professional`, `needs-purchase`, `needs-budget`, `kids-related`, `quick-win`, `safety`, `recurring`, `delegated`, `water-damage-risk`, `electrical`
- **Recurrence** — if you say "every week" or "monthly", the task is marked recurring

---

## Correcting a task

If the AI got something wrong, reply immediately (within 10 minutes):

```
make it CRITICAL and assign to Professional
```

The bot applies only the fields you mentioned. Everything else stays the same. The correction card shows exactly what changed.

Alternatively, type `correct` or `fix this` to start a correction on your most recently captured task.

---

## Editing any pending task

Use `/edit` to change the details of any task in the pending list — not just the one you just added.

### By number (from /pending list)

```
/edit 3
```

### By name (partial match works)

```
/edit exhaust fan
```

The bot shows the current task details and prompts you to describe the change:

```
📝 Editing: Fix bathroom exhaust fan
[HIGH] Bathroom · 30m · Me

Reply with what to change, e.g. "make it CRITICAL" or "change area to Kitchen, 45 mins"
```

Reply in plain English — the AI applies only the fields you mention, leaving everything else unchanged.

---

## Viewing pending tasks

```
/pending
```

```
🏠 The Sharma House

🧾 Pending tasks

1. [CRITICAL] Fix bathroom exhaust fan (~30m)
2. [HIGH] Buy new shower curtain (~20m)
3. [MEDIUM] Deep clean fridge (~45m)
```

Tasks are sorted by criticality first, then by effort (shorter tasks first within the same level).

---

## Marking tasks complete

### By number (from /pending list)

```
/done 1
✅ Marked done: Fix bathroom exhaust fan
```

### By name (partial match works)

```
/done exhaust fan
✅ Marked done: Fix bathroom exhaust fan
```

### Recurring tasks

Completing a recurring task advances its `next_due_date` forward by the recurrence interval and keeps it active — it re-appears in the queue automatically when due again.

---

## Deleting a task

Use `/delete` to permanently remove a task that was captured incorrectly.

```
/delete 3
🗑️ Deleted: Deep clean fridge
```

```
/delete fridge
🗑️ Deleted: Deep clean fridge
```

---

## The daily queue

At your household's configured time, the bot sends a private message with today's prioritised task list and a Google Calendar link.

```
🏠 The Sharma House

📅 Today's queue (2 tasks · 50 mins · 10 min buffer)

1. [CRITICAL] Fix bathroom exhaust fan — 30 min
2. [HIGH] Buy new shower curtain — 20 min

→ https://calendar.google.com/...
```

Tap the Calendar link to create a timed event in your calendar with all the tasks in the description.

---

## Completing the queue

About 30 minutes after your session ends, the bot prompts:

```
⏰ Your block just ended. Done? Reply yes / skip <task> / no
```

**Reply options:**

| Reply | Effect |
|---|---|
| `yes` | All queued tasks marked complete |
| `done` | Same as yes |
| `all done` | Same as yes |
| `skip exhaust fan` | Completes all except the matched task |
| `no` | Bot asks which ones you finished; reply with names |
| `exhaust fan, shower curtain` | Marks only those two tasks complete |
| `exhaust` | Partial name match — marks the exhaust fan task complete |

If you miss the 2-hour window, use `/done` at any time.

---

## Household info

```
/myhousehold
```

```
🏠 The Sharma House
Your role: member
Members:   2
Joined:    2025-02-01
```

---

## Getting help

```
/help
```

Shows all commands available to you based on your role. Admin commands are only shown if you are an admin.

---

## Leaving the household

```
/leavehousehold
```

Your tasks remain in the household. If you want to rejoin later, ask your admin for a new invite code.
