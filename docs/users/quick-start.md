# Home OS — Quick Start Guide

Home OS is a Telegram bot that captures household tasks in plain language, prioritises them by urgency, and delivers a time-boxed daily work queue straight to your phone. No app install. No logins. Just message the bot.

---

## Prerequisites

- A Telegram account (mobile or desktop)
- The bot username from your household admin (or from whoever set it up)

---

## Path A — Starting a new household (you are the admin)

### 1. Start the bot

Open a private chat with the bot and send:

```
/start
```

You will see the welcome message with two options.

### 2. Create your household

```
/create The Sharma House
```

- Name can be up to 60 characters
- You become the admin automatically
- Default areas (Kitchen, Bathroom, Living Room, etc.) are seeded
- Default settings: queue at 18:00, 60-minute session, Asia/Kolkata timezone

### 3. Invite your family

```
/invite
```

The bot sends you a single-use 8-character code valid for 24 hours:

```
🔗 Invite code: K7XP2MNQ
Expires: 27 Apr 2026, 18:00

Share this with your family member:
→ /join K7XP2MNQ
```

Share that `/join` line with each person you want to add.

---

## Path B — Joining an existing household

### 1. Start the bot

```
/start
```

### 2. Join with the invite code your admin shared

```
/join K7XP2MNQ
```

Once joined, you are a **member** with full task access. Your admin manages settings and membership.

---

## Your first task

Just send a message in plain English — no commands needed:

```
Kitchen tap is leaking badly
```

The bot replies with a structured task card:

```
🏠 The Sharma House

📋 Fix kitchen tap leak
📍 Kitchen
🔴 CRITICAL  ⏱ 45 mins
👤 Me
🏷 water-damage-risk, safety
💡 Urgent plumbing issue — water damage risk if left unattended
```

If the AI picks up anything wrong, reply immediately:

```
make it HIGH, assign to Professional
```

The bot corrects only the fields you mentioned and confirms the change.

---

## The daily routine

1. **At your set queue time** the bot sends a prioritised task list to each member privately, with a Google Calendar link you can tap to block the time.

2. **After your session ends** the bot prompts:
   ```
   ⏰ Your block just ended. Done? Reply yes / skip <task> / no
   ```

3. **Reply naturally:**
   - `yes` — marks everything complete
   - `skip kitchen tap` — completes all except that one
   - `no` — bot asks which ones you finished; reply with names or use `/done`
   - `fix kitchen tap, mow lawn` — completes just those two

---

## Most useful commands at a glance

| Command | What it does |
|---|---|
| `/pending` | See all tasks, numbered |
| `/done 2` | Mark task #2 complete |
| `/done fix tap` | Mark by name (partial match works) |
| `/delete 3` | Delete a wrongly captured task |
| `/queue` | Manually trigger today's queue |
| `/help` | Full command list |
