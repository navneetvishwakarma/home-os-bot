# Home OS — Admin Guide

As a household admin you can manage membership, configure the daily schedule, and control household areas. Members can add tasks and interact with the queue but cannot change settings or manage other members.

---

## Household settings

### View current settings

```
/settings
```

```
⚙️ The Sharma House
Time:     18:00
Duration: 60 mins
Timezone: Asia/Kolkata
```

### Set the daily queue time

```
/settime HH:MM
```

```
/settime 07:30
✅ Queue time set to 07:30
```

The scheduler reschedules immediately — no restart needed.

### Set session duration

The duration controls how many tasks are packed into the queue (greedy fill) and when the completion prompt fires.

```
/setduration <minutes>   # 15–480
```

```
/setduration 90
✅ Duration set to 90 mins
```

### Set timezone

Use any valid IANA timezone name. The queue and completion prompt fire at the correct local time regardless of where the server runs.

```
/settimezone <IANA name>
```

```
/settimezone Europe/London
✅ Timezone set to Europe/London
```

Common timezones: `Asia/Kolkata`, `Europe/London`, `America/New_York`, `America/Los_Angeles`, `Asia/Dubai`, `Australia/Sydney`.

---

## Member management

### Generate an invite

Each code is single-use and expires in 24 hours. Generate a fresh one for each person.

```
/invite
```

```
🔗 Invite code: K7XP2MNQ
Expires: 27 Apr 2026, 18:00

Share this with your family member:
→ /join K7XP2MNQ
```

### List members

```
/members
```

```
👥 The Sharma House — 2 members

1. Navneet (admin) — joined 2025-01-15
   ID: 123456789
2. Priya (member) — joined 2025-02-01
   ID: 987654321
```

The Telegram ID shown next to each member is what you pass to `/promote`, `/demote`, and `/removemember`.

### Promote a member to admin

```
/promote 987654321
✅ Priya is now an admin.
```

### Demote an admin to member

You cannot demote yourself if you are the only admin. Promote someone else first.

```
/demote 987654321
✅ Priya is now a member.
```

### Remove a member

```
/removemember 987654321
✅ Priya has been removed from the household.
```

The member's tasks remain in the household. Only their membership is removed.

### Leave the household

If you are the sole admin, promote another member first.

```
/leavehousehold
👋 You've left "The Sharma House".
```

---

## Area management

Areas appear on every task card and help filter by location. Admins and members can both manage areas by default.

### List areas

```
/areas
```

### Add an area

```
/addarea Terrace
✅ Added area: Terrace
```

### Remove an area

```
/removearea Terrace
✅ Removed area: Terrace
```

Removing an area does not affect tasks already tagged with it.

---

## Default areas

These 12 areas are seeded when the household is created:

Kitchen · Bathroom · Common Bathroom · Living Room · Master Bedroom · Guest Bedroom · Office · Garden · Balcony · Utility Room · Entrance · General

---

## How the daily queue works

1. At the scheduled time the bot fetches all incomplete tasks sorted by criticality (CRITICAL → HIGH → MEDIUM → LOW), then by effort (shortest first within each level).
2. A greedy algorithm fills the session duration: CRITICAL and HIGH tasks are always included; MEDIUM and LOW tasks are included only if tagged `quick-win` and they fit in the remaining time.
3. The queue is sent as a private message to each member, with a Google Calendar link that blocks the session time.
4. After `duration + 30 minutes`, the completion prompt fires.

Tasks from recurring items are only included in the queue when their `next_due_date` is today or in the past.
