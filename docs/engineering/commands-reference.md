# Home OS — Commands Reference

All commands are available in the private chat with the bot. Commands are case-insensitive.

---

## Onboarding (no household required)

These commands are available before joining a household.

### `/start`

Shows the welcome message if not in a household. If already in one, shows the household name and a pointer to `/help`.

### `/create <name>`

Creates a new household with the caller as admin.

```
/create The Sharma House
```

- Name must be 1–60 characters
- Seeds 12 default areas
- Creates default settings (18:00, 60 min, Asia/Kolkata)
- Fails if caller is already in a household

### `/join <code>`

Joins a household using a single-use invite code.

```
/join K7XP2MNQ
```

- Code is case-insensitive
- Fails if code is expired, already used, or invalid
- Fails if caller is already in a household

---

## Member commands

Available to all members (including admins).

### `/myhousehold`

Shows your household name, your role, total member count, and your join date.

### `/pending`

Lists all incomplete tasks sorted by criticality then effort, numbered for use with `/done` and `/delete`.

```
🧾 Pending tasks

1. [CRITICAL] Fix bathroom exhaust fan (~30m)
2. [HIGH] Buy shower curtain (~20m)
3. [MEDIUM] Deep clean fridge (~45m)
```

### `/done <number or name>`

Marks a single pending task complete. Supports 1-based index from `/pending` or case-insensitive partial name match.

```
/done 1
/done exhaust fan
```

- Recurring tasks: advances `next_due_date`, keeps the task active
- Non-recurring tasks: permanently marks `completed = true`

### `/delete <number or name>`

Permanently deletes a pending task. Useful for wrongly captured tasks.

```
/delete 3
/delete fridge
```

### `/queue`

Manually triggers today's queue — same output as the scheduled cron job. Does not affect the cron schedule.

### `/areas`

Lists all household areas alphabetically.

### `/addarea <name>`

Adds a new area to the household.

```
/addarea Terrace
```

Duplicate names are silently ignored.

### `/removearea <name>`

Removes an area from the household. Does not affect tasks already tagged with that area.

```
/removearea Terrace
```

### `/settings`

Shows the current household settings (read-only for members, editable by admins).

```
⚙️ The Sharma House
Time:     18:00
Duration: 60 mins
Timezone: Asia/Kolkata
```

### `/leavehousehold`

Removes you from the household. Tasks remain. If you are the sole admin, you must promote another member first.

### `/help`

Shows all commands available to your role. Admin commands are included only if you are an admin.

---

## Admin commands

### `/invite`

Generates a single-use invite code valid for 24 hours.

```
🔗 Invite code: K7XP2MNQ
Expires: 27 Apr 2026, 18:00

→ /join K7XP2MNQ
```

### `/members`

Lists all household members with their role, join date, and Telegram ID. The Telegram ID is required for `/promote`, `/demote`, and `/removemember`.

```
👥 The Sharma House — 2 members

1. Navneet (admin) — joined 2025-01-15
   ID: 123456789
2. Priya (member) — joined 2025-02-01
   ID: 987654321
```

### `/promote <telegram-id>`

Promotes a member to admin.

```
/promote 987654321
✅ Priya is now an admin.
```

### `/demote <telegram-id>`

Demotes an admin to member. Cannot demote yourself if you are the sole admin.

```
/demote 987654321
✅ Priya is now a member.
```

### `/removemember <telegram-id>`

Removes a member from the household. Cannot use this to remove yourself — use `/leavehousehold` instead.

```
/removemember 987654321
✅ Priya has been removed from the household.
```

### `/settime HH:MM`

Sets the time at which the daily queue is sent. Reschedules immediately.

```
/settime 07:30
✅ Queue time set to 07:30
```

### `/setduration <minutes>`

Sets the session duration in minutes (15–480). Affects how many tasks are packed into the queue and when the completion prompt fires.

```
/setduration 90
✅ Duration set to 90 mins
```

### `/settimezone <IANA timezone>`

Sets the timezone for the daily queue and completion prompt. Must be a valid IANA timezone name.

```
/settimezone Europe/London
✅ Timezone set to Europe/London
```

---

## Free-text interactions

### Task capture

Any message that is not a command and does not trigger another flow is treated as a new task.

```
The kitchen tap is dripping
```

### Correction

Within 10 minutes of capturing a task, type `correct` or `fix this` to start a correction, then describe the change:

```
correct
→ make it HIGH and assign to Professional
```

Or for the most recently added task, just describe the correction directly:

```
actually it should be CRITICAL
```

### Completion replies

During the 2-hour completion window (after the scheduler prompt):

| Input | Effect |
|---|---|
| `yes` / `done` / `all done` | All queued tasks marked complete |
| `skip <name>` | Complete all except the matched task |
| `no` | Prompts for which tasks were done |
| `<task name>` | Completes matching tasks (partial name OK) |
| `<name1>, <name2>` | Completes multiple tasks by partial name |

---

## Allowed values

### Criticality

`CRITICAL` · `HIGH` · `MEDIUM` · `LOW`

### Assignee

`Me` · `Spouse` · `Professional` · `Both`

### Tags

`needs-professional` · `needs-purchase` · `needs-budget` · `kids-related` · `quick-win` · `safety` · `recurring` · `delegated` · `water-damage-risk` · `electrical`

The `quick-win` tag is used by the queue builder to include MEDIUM and LOW tasks in the queue when time allows.
