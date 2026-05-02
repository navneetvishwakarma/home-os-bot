'use strict';
const { describe, it, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const getAreas = mock.fn(async () => []);
const addArea = mock.fn(async () => {});
const removeArea = mock.fn(async () => {});
const bulkComplete = mock.fn(async () => 1);
const deleteTask = mock.fn(async () => {});
const getHouseholdMembers = mock.fn(async () => []);
const getMembership = mock.fn(async () => ({ joined_at: '2025-01-15T00:00:00Z' }));
const getIncompleteTasksByPriority = mock.fn(async () => []);
const getSettings = mock.fn(async () => ({ calendarTime: '18:00', calendarDuration: 60, timezone: 'Asia/Kolkata' }));
const updateSettings = mock.fn(async () => {});

const refreshScheduleForHousehold = mock.fn(async () => {});
const startSessionForTask = mock.fn();
const buildExportPayload = mock.fn(async () => ({
  exportedAt: '2026-05-01T00:00:00.000Z',
  household: { id: 'h1', name: 'The Sharma House', plan: 'free' },
  tasks: [],
  areas: [],
  settings: { calendarTime: '18:00', calendarDuration: 60, timezone: 'Asia/Kolkata' },
  members: []
}));

require.cache[require.resolve('../../src/services/supabase')] = {
  exports: { getAreas, addArea, removeArea, bulkComplete, deleteTask, getHouseholdMembers, getMembership, getIncompleteTasksByPriority, getSettings, updateSettings }
};
require.cache[require.resolve('../../src/services/export')] = {
  exports: { buildExportPayload }
};
require.cache[require.resolve('../../src/cron/scheduler')] = {
  exports: { refreshScheduleForHousehold }
};
require.cache[require.resolve('../../src/services/witty-response')] = {
  exports: { generateWittyReply: mock.fn(async () => null) }
};
require.cache[require.resolve('../../src/handlers/correction-session')] = {
  exports: { startSessionForTask }
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
    chat: { id: 'chat1' },
    from: { id: 'user1' },
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
    bulkComplete.mock.resetCalls();
    deleteTask.mock.resetCalls();
    getHouseholdMembers.mock.resetCalls();
    getMembership.mock.resetCalls();
    getIncompleteTasksByPriority.mock.resetCalls();
    getSettings.mock.resetCalls();
    updateSettings.mock.resetCalls();
    refreshScheduleForHousehold.mock.resetCalls();
    startSessionForTask.mock.resetCalls();
    buildExportPayload.mock.resetCalls();

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

    it('lists tasks as a numbered list with criticality and effort', async () => {
      getIncompleteTasksByPriority.mock.mockImplementation(async () => [
        { id: 't1', title: 'Fix tap', criticality: 'HIGH', effortMins: 30 },
        { id: 't2', title: 'Buy groceries', criticality: 'MEDIUM', effortMins: 20 }
      ]);
      const ctx = makeCtx('/pending');
      await handlers['pending'](ctx);
      const reply = ctx.reply.mock.calls[0].arguments[0];
      assert.ok(reply.includes('1.'));
      assert.ok(reply.includes('2.'));
      assert.ok(reply.includes('Fix tap'));
      assert.ok(reply.includes('Buy groceries'));
      assert.ok(reply.includes('HIGH'));
      assert.ok(reply.includes('30m'));
    });
  });

  describe('/done', () => {
    it('replies usage error when no argument given', async () => {
      const ctx = makeCtx('/done');
      await handlers['done'](ctx);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('Usage'));
      assert.equal(bulkComplete.mock.calls.length, 0);
    });

    it('marks task done by index number', async () => {
      getIncompleteTasksByPriority.mock.mockImplementation(async () => [
        { id: 't1', title: 'Fix tap', criticality: 'HIGH', effortMins: 30 }
      ]);
      const ctx = makeCtx('/done 1');
      await handlers['done'](ctx);
      assert.equal(bulkComplete.mock.calls.length, 1);
      assert.deepEqual(bulkComplete.mock.calls[0].arguments[0], ['t1']);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('Fix tap'));
    });

    it('marks task done by name substring', async () => {
      getIncompleteTasksByPriority.mock.mockImplementation(async () => [
        { id: 't1', title: 'Fix tap', criticality: 'HIGH', effortMins: 30 }
      ]);
      const ctx = makeCtx('/done fix tap');
      await handlers['done'](ctx);
      assert.equal(bulkComplete.mock.calls.length, 1);
      assert.deepEqual(bulkComplete.mock.calls[0].arguments[0], ['t1']);
    });

    it('replies "not found" when query matches nothing', async () => {
      getIncompleteTasksByPriority.mock.mockImplementation(async () => [
        { id: 't1', title: 'Fix tap', criticality: 'HIGH', effortMins: 30 }
      ]);
      const ctx = makeCtx('/done paint fence');
      await handlers['done'](ctx);
      assert.equal(bulkComplete.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('not found'));
    });
  });

  describe('/delete', () => {
    it('replies usage error when no argument given', async () => {
      const ctx = makeCtx('/delete');
      await handlers['delete'](ctx);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('Usage'));
      assert.equal(deleteTask.mock.calls.length, 0);
    });

    it('deletes task by index number', async () => {
      getIncompleteTasksByPriority.mock.mockImplementation(async () => [
        { id: 't2', title: 'Buy groceries', criticality: 'MEDIUM', effortMins: 20 }
      ]);
      const ctx = makeCtx('/delete 1');
      await handlers['delete'](ctx);
      assert.equal(deleteTask.mock.calls.length, 1);
      assert.equal(deleteTask.mock.calls[0].arguments[0], 'h1'); // householdId
      assert.equal(deleteTask.mock.calls[0].arguments[1], 't2'); // taskId
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('Buy groceries'));
    });

    it('deletes task by name substring', async () => {
      getIncompleteTasksByPriority.mock.mockImplementation(async () => [
        { id: 't2', title: 'Buy groceries', criticality: 'MEDIUM', effortMins: 20 }
      ]);
      const ctx = makeCtx('/delete groceries');
      await handlers['delete'](ctx);
      assert.equal(deleteTask.mock.calls.length, 1);
      assert.equal(deleteTask.mock.calls[0].arguments[0], 'h1'); // householdId
      assert.equal(deleteTask.mock.calls[0].arguments[1], 't2'); // taskId
    });

    it('replies "not found" when query matches nothing', async () => {
      getIncompleteTasksByPriority.mock.mockImplementation(async () => [
        { id: 't2', title: 'Buy groceries', criticality: 'MEDIUM', effortMins: 20 }
      ]);
      const ctx = makeCtx('/delete paint fence');
      await handlers['delete'](ctx);
      assert.equal(deleteTask.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('not found'));
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

  describe('/edit', () => {
    it('replies with usage error when no argument given', async () => {
      const ctx = makeCtx('/edit');
      await handlers['edit'](ctx);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('Usage'));
      assert.equal(startSessionForTask.mock.calls.length, 0);
    });

    it('starts session and shows edit prompt for task by number', async () => {
      const task = { id: 't1', title: 'Fix tap', criticality: 'HIGH', effortMins: 30, area: 'Kitchen', assignedTo: 'Me' };
      getIncompleteTasksByPriority.mock.mockImplementation(async () => [task]);
      const ctx = makeCtx('/edit 1');
      await handlers['edit'](ctx);
      assert.equal(startSessionForTask.mock.calls.length, 1);
      assert.equal(startSessionForTask.mock.calls[0].arguments[2], task);
      const reply = ctx.reply.mock.calls[0].arguments[0];
      assert.ok(reply.includes('Fix tap'));
      assert.ok(reply.includes('📝'));
    });

    it('starts session and shows edit prompt for task by name substring', async () => {
      const task = { id: 't1', title: 'Fix tap', criticality: 'HIGH', effortMins: 30, area: 'Kitchen', assignedTo: 'Me' };
      getIncompleteTasksByPriority.mock.mockImplementation(async () => [task]);
      const ctx = makeCtx('/edit fix tap');
      await handlers['edit'](ctx);
      assert.equal(startSessionForTask.mock.calls.length, 1);
      assert.equal(startSessionForTask.mock.calls[0].arguments[2], task);
    });

    it('replies "not found" when query matches nothing', async () => {
      getIncompleteTasksByPriority.mock.mockImplementation(async () => [
        { id: 't1', title: 'Fix tap', criticality: 'HIGH', effortMins: 30, area: 'Kitchen', assignedTo: 'Me' }
      ]);
      const ctx = makeCtx('/edit paint fence');
      await handlers['edit'](ctx);
      assert.equal(startSessionForTask.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('not found'));
    });
  });

  describe('/help', () => {
    it('shows member commands for any member', async () => {
      const ctx = makeCtx('/help', { memberRole: 'member' });
      await handlers['help'](ctx);
      const reply = ctx.reply.mock.calls[0].arguments[0];
      assert.ok(reply.includes('/queue'));
      assert.ok(reply.includes('/pending'));
      assert.ok(reply.includes('/done'));
      assert.ok(reply.includes('/delete'));
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

  describe('/export', () => {
    it('sends a JSON document with all household data', async () => {
      const replyWithDocument = mock.fn(async () => {});
      const ctx = makeCtx('/export', { replyWithDocument });
      await handlers['export'](ctx);

      assert.equal(buildExportPayload.mock.calls.length, 1);
      assert.equal(buildExportPayload.mock.calls[0].arguments[0], 'h1');

      assert.equal(replyWithDocument.mock.calls.length, 1);
      const [doc] = replyWithDocument.mock.calls[0].arguments;
      assert.equal(doc.filename, 'export.json');
      assert.ok(Buffer.isBuffer(doc.source), 'source should be a Buffer');

      const parsed = JSON.parse(doc.source.toString('utf8'));
      assert.equal(parsed.household.name, 'The Sharma House');
    });
  });
});
