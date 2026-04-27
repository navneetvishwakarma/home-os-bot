'use strict';
const { describe, it, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const getAreas = mock.fn(async () => []);
const addArea = mock.fn(async () => {});
const removeArea = mock.fn(async () => {});
const getHouseholdMembers = mock.fn(async () => []);
const getMembership = mock.fn(async () => ({ joined_at: '2025-01-15T00:00:00Z' }));
const getIncompleteTasksByPriority = mock.fn(async () => []);
const getSettings = mock.fn(async () => ({ calendarTime: '18:00', calendarDuration: 60, timezone: 'Asia/Kolkata' }));
const updateSettings = mock.fn(async () => {});

const refreshScheduleForHousehold = mock.fn(async () => {});

require.cache[require.resolve('../../src/services/supabase')] = {
  exports: { getAreas, addArea, removeArea, getHouseholdMembers, getMembership, getIncompleteTasksByPriority, getSettings, updateSettings }
};
require.cache[require.resolve('../../src/cron/scheduler')] = {
  exports: { refreshScheduleForHousehold }
};
// guards and validators have no external deps — let them run natively
delete require.cache[require.resolve('../../src/middleware/guards')];
delete require.cache[require.resolve('../../src/utils/validators')];

const { registerCommands } = require('../../src/handlers/commands');

function buildFakeBot() {
  const handlers = {};
  return {
    command: (name, handler) => { handlers[name] = handler; },
    handlers
  };
}

function makeCtx(text, overrides = {}) {
  return {
    household: { id: 'h1', name: 'The Sharma House' },
    householdUser: { id: 'u1', telegramId: '111' },
    memberRole: 'admin',
    message: { text },
    reply: mock.fn(async () => {}),
    ...overrides
  };
}

describe('commands', () => {
  let bot;
  let handlers;

  beforeEach(() => {
    getAreas.mock.resetCalls();
    addArea.mock.resetCalls();
    removeArea.mock.resetCalls();
    getHouseholdMembers.mock.resetCalls();
    getMembership.mock.resetCalls();
    getIncompleteTasksByPriority.mock.resetCalls();
    getSettings.mock.resetCalls();
    updateSettings.mock.resetCalls();
    refreshScheduleForHousehold.mock.resetCalls();

    getAreas.mock.mockImplementation(async () => []);
    getHouseholdMembers.mock.mockImplementation(async () => []);
    getMembership.mock.mockImplementation(async () => ({ joined_at: '2025-01-15T00:00:00Z' }));
    getIncompleteTasksByPriority.mock.mockImplementation(async () => []);
    getSettings.mock.mockImplementation(async () => ({ calendarTime: '18:00', calendarDuration: 60, timezone: 'Asia/Kolkata' }));

    bot = buildFakeBot();
    registerCommands(bot);
    handlers = bot.handlers;
  });

  describe('/myhousehold', () => {
    it('shows household name, role, member count, and join date', async () => {
      getHouseholdMembers.mock.mockImplementation(async () => [{}, {}, {}]);
      const ctx = makeCtx('/myhousehold', { memberRole: 'admin' });
      await handlers['myhousehold'](ctx);
      const reply = ctx.reply.mock.calls[0].arguments[0];
      assert.ok(reply.includes('The Sharma House'));
      assert.ok(reply.includes('admin'));
      assert.ok(reply.includes('3'));
      assert.ok(reply.includes('2025-01-15'));
    });
  });

  describe('/areas', () => {
    it('shows "no areas" message when area list is empty', async () => {
      getAreas.mock.mockImplementation(async () => []);
      const ctx = makeCtx('/areas');
      await handlers['areas'](ctx);
      const reply = ctx.reply.mock.calls[0].arguments[0];
      assert.ok(reply.includes('No areas'));
    });

    it('lists areas with household header', async () => {
      getAreas.mock.mockImplementation(async () => ['Kitchen', 'Bathroom']);
      const ctx = makeCtx('/areas');
      await handlers['areas'](ctx);
      const reply = ctx.reply.mock.calls[0].arguments[0];
      assert.ok(reply.includes('The Sharma House'));
      assert.ok(reply.includes('Kitchen'));
      assert.ok(reply.includes('Bathroom'));
    });
  });

  describe('/queue', () => {
    it('shows no-tasks queue message when nothing pending', async () => {
      getIncompleteTasksByPriority.mock.mockImplementation(async () => []);
      const ctx = makeCtx('/queue');
      await handlers['queue'](ctx);
      const reply = ctx.reply.mock.calls[0].arguments[0];
      assert.ok(reply.includes('The Sharma House'));
      assert.ok(reply.includes('No pending'));
    });

    it('includes a Google Calendar URL in the reply', async () => {
      getIncompleteTasksByPriority.mock.mockImplementation(async () => [
        { id: 't1', title: 'Fix tap', criticality: 'HIGH', effortMins: 30, tags: [] }
      ]);
      const ctx = makeCtx('/queue');
      await handlers['queue'](ctx);
      const reply = ctx.reply.mock.calls[0].arguments[0];
      assert.ok(reply.includes('calendar.google.com'));
    });
  });

  describe('/pending', () => {
    it('shows "no pending tasks" when list is empty', async () => {
      getIncompleteTasksByPriority.mock.mockImplementation(async () => []);
      const ctx = makeCtx('/pending');
      await handlers['pending'](ctx);
      const reply = ctx.reply.mock.calls[0].arguments[0];
      assert.ok(reply.includes('No pending'));
    });

    it('lists tasks with criticality and effort', async () => {
      getIncompleteTasksByPriority.mock.mockImplementation(async () => [
        { id: 't1', title: 'Fix tap', criticality: 'HIGH', effortMins: 30 }
      ]);
      const ctx = makeCtx('/pending');
      await handlers['pending'](ctx);
      const reply = ctx.reply.mock.calls[0].arguments[0];
      assert.ok(reply.includes('HIGH'));
      assert.ok(reply.includes('Fix tap'));
      assert.ok(reply.includes('30m'));
    });
  });

  describe('/settings', () => {
    it('shows household name, time, duration, and timezone', async () => {
      const ctx = makeCtx('/settings');
      await handlers['settings'](ctx);
      const reply = ctx.reply.mock.calls[0].arguments[0];
      assert.ok(reply.includes('The Sharma House'));
      assert.ok(reply.includes('18:00'));
      assert.ok(reply.includes('60'));
      assert.ok(reply.includes('Asia/Kolkata'));
    });
  });

  describe('/settime', () => {
    it('updates settings and refreshes scheduler for valid time', async () => {
      const ctx = makeCtx('/settime 19:00');
      await handlers['settime'](ctx);
      assert.equal(updateSettings.mock.calls.length, 1);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('19:00'));
      // Allow async refresh to settle
      await new Promise(r => setImmediate(r));
    });

    it('replies with usage error for invalid time format', async () => {
      const ctx = makeCtx('/settime 25:00');
      await handlers['settime'](ctx);
      assert.equal(updateSettings.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('HH:MM'));
    });
  });

  describe('/setduration', () => {
    it('updates settings for valid duration', async () => {
      const ctx = makeCtx('/setduration 90');
      await handlers['setduration'](ctx);
      assert.equal(updateSettings.mock.calls.length, 1);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('90'));
    });

    it('replies with error for duration out of range', async () => {
      const ctx = makeCtx('/setduration 5');
      await handlers['setduration'](ctx);
      assert.equal(updateSettings.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('15-480'));
    });
  });

  describe('/settimezone', () => {
    it('updates settings for valid IANA timezone', async () => {
      const ctx = makeCtx('/settimezone Europe/London');
      await handlers['settimezone'](ctx);
      assert.equal(updateSettings.mock.calls.length, 1);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('Europe/London'));
    });

    it('replies with error for invalid timezone', async () => {
      const ctx = makeCtx('/settimezone Fake/Zone');
      await handlers['settimezone'](ctx);
      assert.equal(updateSettings.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('Invalid timezone'));
    });
  });

  describe('/help', () => {
    it('shows member commands for any member', async () => {
      const ctx = makeCtx('/help', { memberRole: 'member' });
      await handlers['help'](ctx);
      const reply = ctx.reply.mock.calls[0].arguments[0];
      assert.ok(reply.includes('/queue'));
      assert.ok(reply.includes('/pending'));
      assert.ok(reply.includes('/myhousehold'));
    });

    it('includes admin commands section only for admins', async () => {
      const adminCtx = makeCtx('/help', { memberRole: 'admin' });
      await handlers['help'](adminCtx);
      const adminReply = adminCtx.reply.mock.calls[0].arguments[0];
      assert.ok(adminReply.includes('/settime'));
      assert.ok(adminReply.includes('/invite'));

      const memberCtx = makeCtx('/help', { memberRole: 'member' });
      await handlers['help'](memberCtx);
      const memberReply = memberCtx.reply.mock.calls[0].arguments[0];
      assert.ok(!memberReply.includes('/settime'));
    });

    it('includes household name at the top', async () => {
      const ctx = makeCtx('/help');
      await handlers['help'](ctx);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('The Sharma House'));
    });
  });
});
