# Home OS — Development Guide

## Prerequisites

- Node.js ≥ 20
- A Supabase project (free tier is sufficient)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- A Google Gemini API key from [AI Studio](https://aistudio.google.com)

---

## Environment setup

```bash
cp .env.example .env
```

Fill in `.env`:

```env
TELEGRAM_BOT_TOKEN=          # from @BotFather
GEMINI_API_KEY=              # from aistudio.google.com
GEMINI_MODEL=                # optional; defaults to gemini-2.5-flash
SUPABASE_URL=                # https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=   # Settings → API → service_role (NOT anon key)
COMPLETION_PROMPT_DELAY_MINS= # optional; defaults to 60
```

---

## Database setup

Run these SQL scripts in order via the Supabase SQL Editor:

1. **Fresh install:** `scripts/multi_tenant_schema.sql`
2. **Existing deployment migration:** also run `scripts/migrate_to_multitenant.sql` (edit the two variable values at the top before running)

---

## Running locally

```bash
npm install
npm run dev      # node --watch; restarts on file changes
```

The bot uses long-polling (not webhooks) so it works without a public URL.

---

## Running tests

```bash
npm test                                    # all 222 tests
node --test test/unit/validators.test.js    # single file
node --test test/handlers/                  # one directory
```

The test runner is Node's built-in `node:test`. No external test libraries. Output is TAP format.

---

## Test structure

```
test/
  unit/
    validators.test.js        # input normalisation functions
    formatters.test.js        # Telegram message formatters
    queue-builder.test.js     # greedy queue algorithm
    calendar.test.js          # Google Calendar URL builder
    correction-session.test.js
    queue-session.test.js
    supabase.test.js          # bulkComplete, getIncompleteTasksByPriority, getAllHouseholdsWithSettings
  handlers/
    complete.test.js          # completion reply parsing
    correction.test.js        # task correction flow
    message.test.js           # message routing
    onboarding.test.js        # /create, /join
    admin.test.js             # admin commands
    commands.test.js          # member commands including /done, /delete, /edit
  middleware/
    household.test.js         # household resolution middleware
    guards.test.js            # requireMember, requireAdmin
  cron/
    scheduler.test.js         # cron job creation and callbacks
```

---

## Mocking pattern (CJS)

All production modules use CommonJS `require`. Destructured imports bind at load time, so `mock.method()` on an exported object will not intercept calls inside a module that has already imported the function.

**The correct pattern: inject via `require.cache` before requiring the module under test.**

```js
const { mock } = require('node:test');

// 1. Build the fake module
const fakeSupabase = {
  getIncompleteTasksByPriority: mock.fn(async () => []),
  createTask: mock.fn(async () => 'task-uuid')
};

// 2. Inject into the cache BEFORE requiring the module under test
require.cache[require.resolve('../../src/services/supabase')] = {
  exports: fakeSupabase
};

// 3. Now require the module — it picks up the fake
const { handleMessage } = require('../../src/handlers/message');
```

**Reset between tests:**

```js
beforeEach(() => {
  fakeSupabase.createTask.mock.resetCalls();
  fakeSupabase.createTask.mock.mockImplementation(async () => 'new-id');
});
```

**When mocking a module with side effects at load time** (e.g., `supabase.js` creates a client, `config.js` validates env vars), also inject those dependencies before requiring.

---

## Key constants

Defined in `src/constants.js` and used across handlers and the AI prompt:

- **Criticality:** `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`
- **Assignee:** `Me`, `Spouse`, `Professional`, `Both`
- **Tags:** `needs-professional`, `needs-purchase`, `needs-budget`, `kids-related`, `quick-win`, `safety`, `recurring`, `delegated`, `water-damage-risk`, `electrical`
- **Default areas (12):** Kitchen, Bathroom, Common Bathroom, Living Room, Master Bedroom, Guest Bedroom, Office, Garden, Balcony, Utility Room, Entrance, General

---

## Adding a new command

1. Identify the correct handler file: `onboarding.js` (no household required), `admin.js` (admin-only), or `commands.js` (any member).
2. Register with `bot.command("name", requireMember(async (ctx) => { ... }))` or `requireAdmin(...)`.
3. Add the command name and description to the `/help` handler in `commands.js`.
4. Add a test in the corresponding test file using the `buildFakeBot()` / `makeCtx()` helpers.

---

## Logging

`src/utils/logger.js` emits structured JSON lines to stdout/stderr.

```js
const { info, warn, error } = require('../utils/logger');

info("queue_posted", { householdId, count: 3, audienceCount: 2 });
warn("household_missing_settings", { householdId, name: "Unnamed" });
error("task_capture_failed", { message: err.message, userId });
```

`error` level goes to `console.error`; `info` and `warn` go to `console.log`. Railway captures both streams.
