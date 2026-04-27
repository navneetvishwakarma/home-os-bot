# Multi-Household Per User — Feasibility Plan

## Status: Deferred — schema reserved, not implemented

The current v1 enforces one household per user (`UNIQUE (user_id)` on `household_members`). This plan describes what it would take to lift that restriction.

---

## The Core UX Problem

When a user belongs to multiple households, every task capture message ("fix the leaky tap") is ambiguous — the bot can't know which household it belongs to without asking, which destroys the zero-friction UX that makes the chatbot valuable in the first place.

**Only one approach preserves low friction: the active household model.**

The user has one "active" household at a time. All messages go there. Switching is explicit and rare (`/switch <name>`). The main safeguard is that **every task card shows the household name** so a misfiled task is immediately visible and correctable via the existing correction flow.

---

## UX Design

### Commands added

| Command | Description |
|---|---|
| `/myhouseholds` | List all households the user belongs to, marking the active one |
| `/switch <name>` | Change the active household by name (or prefix) |

### Task card change

Every task card gains a household line at the top:

```
✅ Task Added! · The Sharma House

📝 Fix leaky kitchen tap
📍 Area: Kitchen
...
```

### `/myhouseholds` output

```
🏠 Your households:

→ The Sharma House (active) — admin — 3 members
   Parents Home — member — 2 members

Switch with /switch <name>
```

### `/switch` flow

```
User: /switch parents
Bot:  "🏠 Switched to "Parents Home". Tasks will go here until you switch back."

User: /switch
Bot:  [same as /myhouseholds — shows list]
```

---

## Schema Changes (minimal)

```sql
-- 1. Remove the one-household-per-user constraint
ALTER TABLE household_members DROP CONSTRAINT household_members_user_id_key;

-- 2. Track which household is currently active for each user
ALTER TABLE users
  ADD COLUMN active_household_id uuid REFERENCES households (id) ON DELETE SET NULL;

-- Set active_household_id for all existing users (their only household)
UPDATE users u
SET active_household_id = hm.household_id
FROM household_members hm
WHERE hm.user_id = u.id;
```

---

## Code Changes

### `src/middleware/household.js`

Change household resolution from:
```js
const membership = await getMembership(user.id);
// getMembership finds the only membership row
```

To:
```js
const activeHouseholdId = user.active_household_id;
if (!activeHouseholdId) { /* onboarding */ }
const membership = await getMembershipForHousehold(user.id, activeHouseholdId);
```

New supabase function needed:
```js
getMembershipForHousehold(userId, householdId)
// SELECT role FROM household_members WHERE user_id=$1 AND household_id=$2
```

### `src/services/supabase.js`

New functions:
```js
getUserMemberships(userId)
// Returns all household memberships for the user with household names

setActiveHousehold(userId, householdId)
// UPDATE users SET active_household_id=$2 WHERE id=$1
// Validates user is actually a member of that household first

getMembershipForHousehold(userId, householdId)
// SELECT role, joined_at FROM household_members WHERE user_id=$1 AND household_id=$2
```

Update `upsertUser` to also return `active_household_id`.

### `src/handlers/commands.js`

Add `/switch` and `/myhouseholds` as member commands.

`/switch <name>` flow:
1. Fetch all user memberships
2. Find household whose name starts with the provided string (case-insensitive)
3. If ambiguous: list matches, ask to be more specific
4. Call `setActiveHousehold(userId, householdId)`
5. Reply with confirmation

### `src/handlers/onboarding.js`

`/join` — after joining, if user already has an active household, keep it as active (don't auto-switch). Reply includes: "You're currently active in X. Use /switch to change."

`/leavehousehold` — if user leaves their active household, set `active_household_id` to another membership if one exists, or NULL if none.

### Scheduler

No changes needed. The scheduler already iterates over all members of each household and sends each one a private message. A user in two households will simply receive two separate queue messages at two separate times (each household's configured time). This is the correct behavior.

---

## What does NOT change

- Task capture UX — identical; tasks go to active household
- Gemini classification — no change
- Queue building, calendar URLs — no change
- Admin commands — scoped to active household (same as now)
- Correction flow — works on the last task added (already in active household)
- Completion window — per-user, works independently per household message

---

## Effort Estimate

~1 day of focused work:
- Schema: 30 min (2 SQL statements + migration)
- Supabase service layer: 1–2 hours (3 new functions, update upsertUser)
- Middleware: 1 hour (change resolution logic)
- New commands (`/switch`, `/myhouseholds`): 2 hours
- Onboarding adjustments: 1 hour
- Testing: 1–2 hours (need 2 Telegram accounts in 2 households)

---

## When to implement

When a concrete use case exists — e.g., a user wants to manage both their own home and a parent's home. The schema is ready; it's purely a code change.
