'use strict';
const { describe, it, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const createHousehold = mock.fn(async () => ({ id: 'h1', name: 'The Smith House' }));
const consumeInviteCode = mock.fn(async () => null);

require.cache[require.resolve('../../src/services/supabase')] = {
  exports: { createHousehold, consumeInviteCode }
};

const { registerOnboardingCommands } = require('../../src/handlers/onboarding');

// Capture registered command handlers by setting up a fake bot
function buildFakeBot() {
  const handlers = {};
  return {
    command: (name, handler) => { handlers[name] = handler; },
    handlers
  };
}

function makeCtx(text, overrides = {}) {
  return {
    household: null,
    householdUser: { id: 'u1' },
    message: { text },
    reply: mock.fn(async () => {}),
    ...overrides
  };
}

describe('onboarding commands', () => {
  let bot;
  let handlers;

  beforeEach(() => {
    createHousehold.mock.resetCalls();
    consumeInviteCode.mock.resetCalls();
    createHousehold.mock.mockImplementation(async () => ({ id: 'h1', name: 'The Smith House' }));
    consumeInviteCode.mock.mockImplementation(async () => null);

    bot = buildFakeBot();
    registerOnboardingCommands(bot);
    handlers = bot.handlers;
  });

  describe('/start', () => {
    it('replies with welcome message when user has no household', async () => {
      const ctx = makeCtx('/start');
      await handlers['start'](ctx);
      assert.equal(ctx.reply.mock.calls.length, 1);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('Welcome'));
    });

    it('replies with current household info when already a member', async () => {
      const ctx = makeCtx('/start', { household: { id: 'h1', name: 'Test House' } });
      await handlers['start'](ctx);
      assert.equal(ctx.reply.mock.calls.length, 1);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('Test House'));
    });
  });

  describe('/create', () => {
    it('creates household and replies with confirmation', async () => {
      const ctx = makeCtx('/create The Smith House');
      await handlers['create'](ctx);
      assert.equal(createHousehold.mock.calls.length, 1);
      assert.equal(createHousehold.mock.calls[0].arguments[0], 'The Smith House');
      assert.equal(ctx.reply.mock.calls.length, 1);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('The Smith House'));
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('admin'));
    });

    it('replies with usage error when name is missing', async () => {
      const ctx = makeCtx('/create');
      await handlers['create'](ctx);
      assert.equal(createHousehold.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('Usage'));
    });

    it('replies with length error when name exceeds 60 characters', async () => {
      const longName = 'A'.repeat(61);
      const ctx = makeCtx(`/create ${longName}`);
      await handlers['create'](ctx);
      assert.equal(createHousehold.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('60'));
    });

    it('replies with already-in-household message when user has a household', async () => {
      const ctx = makeCtx('/create New House', { household: { id: 'h1', name: 'Old House' } });
      await handlers['create'](ctx);
      assert.equal(createHousehold.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('already in'));
    });
  });

  describe('/join', () => {
    it('joins household on valid code and replies with welcome', async () => {
      consumeInviteCode.mock.mockImplementation(async () => ({ householdName: 'The Smith House' }));
      const ctx = makeCtx('/join K7XP2MNQ');
      await handlers['join'](ctx);
      assert.equal(consumeInviteCode.mock.calls.length, 1);
      assert.equal(consumeInviteCode.mock.calls[0].arguments[0], 'K7XP2MNQ');
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('The Smith House'));
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('joined'));
    });

    it('uppercases the invite code before consuming', async () => {
      consumeInviteCode.mock.mockImplementation(async () => ({ householdName: 'Test' }));
      const ctx = makeCtx('/join k7xp2mnq');
      await handlers['join'](ctx);
      assert.equal(consumeInviteCode.mock.calls[0].arguments[0], 'K7XP2MNQ');
    });

    it('replies with invalid/expired error when code returns null', async () => {
      consumeInviteCode.mock.mockImplementation(async () => null);
      const ctx = makeCtx('/join BADCODE1');
      await handlers['join'](ctx);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('invalid or has expired'));
    });

    it('replies with already-member error when code returns "already_member"', async () => {
      consumeInviteCode.mock.mockImplementation(async () => 'already_member');
      const ctx = makeCtx('/join GOODCODE');
      await handlers['join'](ctx);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('already in a household'));
    });

    it('replies with usage error when no code provided', async () => {
      const ctx = makeCtx('/join');
      await handlers['join'](ctx);
      assert.equal(consumeInviteCode.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('Usage'));
    });

    it('replies with already-in-household message when user has a household', async () => {
      const ctx = makeCtx('/join GOODCODE', { household: { id: 'h1', name: 'Old House' } });
      await handlers['join'](ctx);
      assert.equal(consumeInviteCode.mock.calls.length, 0);
      assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('already in'));
    });
  });
});
