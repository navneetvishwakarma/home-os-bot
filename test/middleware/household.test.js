'use strict';
const { describe, it, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Mocks must be injected BEFORE requiring the module under test.
const upsertUser = mock.fn(async () => ({ id: 'u1', telegram_id: '111', display_name: 'Test User' }));
const getMembership = mock.fn(async () => null);
const getHousehold = mock.fn(async () => ({ id: 'h1', name: 'Test House' }));

require.cache[require.resolve('../../src/services/supabase')] = {
  exports: { upsertUser, getMembership, getHousehold }
};

const { householdMiddleware } = require('../../src/middleware/household');

function makeCtx(overrides = {}) {
  return {
    from: { id: 111, username: 'testuser', first_name: 'Test', last_name: 'User' },
    message: { text: 'hello' },
    callbackQuery: null,
    reply: mock.fn(async () => {}),
    ...overrides
  };
}

describe('householdMiddleware', () => {
  beforeEach(() => {
    upsertUser.mock.resetCalls();
    getMembership.mock.resetCalls();
    getHousehold.mock.resetCalls();
    upsertUser.mock.mockImplementation(async () => ({ id: 'u1', telegram_id: '111', display_name: 'Test User' }));
    getMembership.mock.mockImplementation(async () => null);
    getHousehold.mock.mockImplementation(async () => ({ id: 'h1', name: 'Test House' }));
  });

  it('calls next() immediately when ctx.from is absent', async () => {
    let nextCalled = false;
    const ctx = makeCtx({ from: null });
    await householdMiddleware(ctx, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(upsertUser.mock.calls.length, 0);
  });

  it('sends onboarding message and does not call next() when user has no membership', async () => {
    let nextCalled = false;
    const ctx = makeCtx();
    await householdMiddleware(ctx, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(ctx.reply.mock.calls.length, 1);
    assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('Welcome'));
  });

  it('calls next() without replying when message is /create', async () => {
    let nextCalled = false;
    const ctx = makeCtx({ message: { text: '/create My Family' } });
    await householdMiddleware(ctx, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(ctx.reply.mock.calls.length, 0);
  });

  it('calls next() without replying when message is /join', async () => {
    let nextCalled = false;
    const ctx = makeCtx({ message: { text: '/join ABC12345' } });
    await householdMiddleware(ctx, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  it('calls next() without replying when message is /start', async () => {
    let nextCalled = false;
    const ctx = makeCtx({ message: { text: '/start' } });
    await householdMiddleware(ctx, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  it('enriches ctx and calls next() when user has membership', async () => {
    getMembership.mock.mockImplementation(async () => ({
      household_id: 'h1',
      role: 'admin'
    }));

    let nextCalled = false;
    const ctx = makeCtx();
    await householdMiddleware(ctx, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.ok(ctx.household);
    assert.equal(ctx.household.id, 'h1');
    assert.equal(ctx.household.name, 'Test House');
    assert.equal(ctx.memberRole, 'admin');
    assert.ok(ctx.householdUser);
    assert.equal(ctx.householdUser.id, 'u1');
    assert.equal(ctx.householdUser.telegramId, '111');
  });

  it('sets memberRole to "member" for non-admin users', async () => {
    getMembership.mock.mockImplementation(async () => ({
      household_id: 'h1',
      role: 'member'
    }));

    const ctx = makeCtx();
    await householdMiddleware(ctx, () => {});
    assert.equal(ctx.memberRole, 'member');
  });

  it('upserts user using telegramId from ctx.from.id', async () => {
    const ctx = makeCtx({ from: { id: 42, username: 'bob', first_name: 'Bob', last_name: null } });
    await householdMiddleware(ctx, () => {});
    assert.equal(upsertUser.mock.calls.length, 1);
    assert.equal(upsertUser.mock.calls[0].arguments[0], '42');
  });
});
