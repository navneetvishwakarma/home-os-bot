'use strict';
const { describe, it, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const createInviteCode = mock.fn(async () => ({ code: 'ABC12345', expiresAt: new Date(Date.now() + 86400000).toISOString() }));
const findUserByTelegramId = mock.fn(async () => null);
const getAdminCount = mock.fn(async () => 2);
const getHouseholdMembers = mock.fn(async () => []);
const removeMember = mock.fn(async () => {});
const updateMemberRole = mock.fn(async () => {});

require.cache[require.resolve('../../src/services/supabase')] = {
  exports: { createInviteCode, findUserByTelegramId, getAdminCount, getHouseholdMembers, removeMember, updateMemberRole }
};
require.cache[require.resolve('../../src/services/witty-response')] = {
  exports: { generateWittyReply: mock.fn(async () => null) }
};
// guards.js has no external deps — let it run natively
delete require.cache[require.resolve('../../src/middleware/guards')];

const { registerAdminCommands } = require('../../src/handlers/admin');

function buildFakeBot() {
  const handlers = {};
  return {
    command: (name, handler) => { handlers[name] = handler; },
    handlers
  };
}

function makeCtx(text, overrides = {}) {
  const base = {
    household: { id: 'h1', name: 'Test House' },
    householdUser: { id: 'u1', telegramId: '111' },
    memberRole: 'admin',
    message: { text },
    reply: mock.fn(async () => {})
  };
  return { ...base, ...overrides };
}

const MEMBERS = [
  { userId: 'u2', telegramId: '222', displayName: 'Alice', role: 'member', joinedAt: '2025-01-15T00:00:00Z' },
  { userId: 'u3', telegramId: '333', displayName: 'Bob', role: 'admin', joinedAt: '2025-02-01T00:00:00Z' }
];

describe('admin commands', () => {
  let bot;
  let handlers;

  beforeEach(() => {
    createInviteCode.mock.resetCalls();
    findUserByTelegramId.mock.resetCalls();
    getAdminCount.mock.resetCalls();
    getHouseholdMembers.mock.resetCalls();
    removeMember.mock.resetCalls();
    updateMemberRole.mock.resetCalls();

    createInviteCode.mock.mockImplementation(async () => ({ code: 'ABC12345', expiresAt: new Date(Date.now() + 86400000).toISOString() }));
    findUserByTelegramId.mock.mockImplementation(async () => null);
    getAdminCount.mock.mockImplementation(async () => 2);
    getHouseholdMembers.mock.mockImplementation(async () => MEMBERS);
    removeMember.mock.mockImplementation(async () => {});
    updateMemberRole.mock.mockImplementation(async () => {});

    bot = buildFakeBot();
    registerAdminCommands(bot);
    handlers = bot.handlers;
  });

  describe('/invite', () => {
    it('creates an invite code and includes it in the reply', async () => {
      const ctx = makeCtx('/invite');
      await handlers['invite'](ctx);
      assert.equal(createInviteCode.mock.calls.length, 1);
      const reply = ctx.reply.mock.calls[0].arguments[0];
      assert.ok(reply.includes('ABC12345'));
    });

    it('includes the expiry time in the reply', async () => {
      const ctx = makeCtx('/invite');
      await handlers['invite'](ctx);
      const reply = ctx.reply.mock.calls[0].arguments[0];
      assert.ok(reply.includes('Expires'));
    });

    it('includes the /join command in the reply', async () => {
      const ctx = makeCtx('/invite');
      await handlers['invite'](ctx);
      const reply = ctx.reply.mock.calls[0].arguments[0];
      assert.ok(reply.includes('/join ABC12345'));
    });

    it('does not run for non-admin users', async () => {
      const ctx = makeCtx('/invite', { memberRole: 'member' });
      await handlers['invite'](ctx);
      assert.equal(createInviteCode.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('admin'));
    });
  });

  describe('/members', () => {
    it('lists all members with name, role, and join date', async () => {
      const ctx = makeCtx('/members');
      await handlers['members'](ctx);
      const reply = ctx.reply.mock.calls[0].arguments[0];
      assert.ok(reply.includes('Alice'));
      assert.ok(reply.includes('member'));
      assert.ok(reply.includes('Bob'));
      assert.ok(reply.includes('admin'));
      assert.ok(reply.includes('2025-01-15'));
    });

    it('includes household name and member count in the header', async () => {
      const ctx = makeCtx('/members');
      await handlers['members'](ctx);
      const reply = ctx.reply.mock.calls[0].arguments[0];
      assert.ok(reply.includes('Test House'));
      assert.ok(reply.includes('2'));
    });
  });

  describe('/removemember', () => {
    it('removes a member and confirms', async () => {
      findUserByTelegramId.mock.mockImplementation(async () => ({ id: 'u2' }));
      const ctx = makeCtx('/removemember 222');
      await handlers['removemember'](ctx);
      assert.equal(removeMember.mock.calls.length, 1);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('removed'));
    });

    it('replies with error when no telegram ID provided', async () => {
      const ctx = makeCtx('/removemember');
      await handlers['removemember'](ctx);
      assert.equal(removeMember.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('valid Telegram'));
    });

    it('replies with error when user is not found', async () => {
      findUserByTelegramId.mock.mockImplementation(async () => null);
      const ctx = makeCtx('/removemember 9999999');
      await handlers['removemember'](ctx);
      assert.equal(removeMember.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('not found'));
    });

    it('replies with error when target is not in the household', async () => {
      findUserByTelegramId.mock.mockImplementation(async () => ({ id: 'outsider' }));
      const ctx = makeCtx('/removemember 9999999');
      await handlers['removemember'](ctx);
      assert.equal(removeMember.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('not a member'));
    });

    it('tells admin to use /leavehousehold to remove themselves', async () => {
      findUserByTelegramId.mock.mockImplementation(async () => ({ id: 'u2' }));
      getHouseholdMembers.mock.mockImplementation(async () => [
        { userId: 'u2', telegramId: '111', displayName: 'Self', role: 'admin', joinedAt: '2025-01-01T00:00:00Z' }
      ]);
      const ctx = makeCtx('/removemember 111', { householdUser: { id: 'u1', telegramId: '111' } });
      await handlers['removemember'](ctx);
      assert.equal(removeMember.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('leavehousehold'));
    });
  });

  describe('/promote', () => {
    it('promotes a member to admin', async () => {
      findUserByTelegramId.mock.mockImplementation(async () => ({ id: 'u2' }));
      const ctx = makeCtx('/promote 222');
      await handlers['promote'](ctx);
      assert.equal(updateMemberRole.mock.calls.length, 1);
      assert.equal(updateMemberRole.mock.calls[0].arguments[2], 'admin');
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('admin'));
    });

    it('replies with message when target is already an admin', async () => {
      findUserByTelegramId.mock.mockImplementation(async () => ({ id: 'u3' }));
      const ctx = makeCtx('/promote 333');
      await handlers['promote'](ctx);
      assert.equal(updateMemberRole.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('already an admin'));
    });
  });

  describe('/demote', () => {
    it('demotes an admin to member', async () => {
      findUserByTelegramId.mock.mockImplementation(async () => ({ id: 'u3' }));
      const ctx = makeCtx('/demote 333');
      await handlers['demote'](ctx);
      assert.equal(updateMemberRole.mock.calls.length, 1);
      assert.equal(updateMemberRole.mock.calls[0].arguments[2], 'member');
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('member'));
    });

    it('replies with message when target is already a member', async () => {
      findUserByTelegramId.mock.mockImplementation(async () => ({ id: 'u2' }));
      const ctx = makeCtx('/demote 222');
      await handlers['demote'](ctx);
      assert.equal(updateMemberRole.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('already a member'));
    });
  });

  describe('/leavehousehold', () => {
    it('removes the user and replies with farewell message', async () => {
      getHouseholdMembers.mock.mockImplementation(async () => [
        { userId: 'u1', telegramId: '111', role: 'member', displayName: 'Self', joinedAt: '2025-01-01T00:00:00Z' }
      ]);
      const ctx = makeCtx('/leavehousehold');
      await handlers['leavehousehold'](ctx);
      assert.equal(removeMember.mock.calls.length, 1);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes("left"));
    });

    it('blocks sole admin from leaving', async () => {
      getHouseholdMembers.mock.mockImplementation(async () => [
        { userId: 'u1', telegramId: '111', role: 'admin', displayName: 'Self', joinedAt: '2025-01-01T00:00:00Z' }
      ]);
      getAdminCount.mock.mockImplementation(async () => 1);
      const ctx = makeCtx('/leavehousehold');
      await handlers['leavehousehold'](ctx);
      assert.equal(removeMember.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('only admin'));
    });

    it('allows an admin to leave when other admins exist', async () => {
      getHouseholdMembers.mock.mockImplementation(async () => [
        { userId: 'u1', telegramId: '111', role: 'admin', displayName: 'Self', joinedAt: '2025-01-01T00:00:00Z' }
      ]);
      getAdminCount.mock.mockImplementation(async () => 2);
      const ctx = makeCtx('/leavehousehold');
      await handlers['leavehousehold'](ctx);
      assert.equal(removeMember.mock.calls.length, 1);
    });
  });
});
