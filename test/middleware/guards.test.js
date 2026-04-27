'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { requireMember, requireAdmin } = require('../../src/middleware/guards');

function makeCtx(overrides = {}) {
  return {
    household: { id: 'h1', name: 'Test House' },
    memberRole: 'member',
    reply: async (text) => text,
    ...overrides
  };
}

describe('requireMember', () => {
  it('does not call handler when ctx.household is absent', async () => {
    let called = false;
    const handler = requireMember(async () => { called = true; });
    await handler(makeCtx({ household: undefined }));
    assert.equal(called, false);
  });

  it('calls handler when ctx.household is present', async () => {
    let called = false;
    const handler = requireMember(async () => { called = true; });
    await handler(makeCtx());
    assert.equal(called, true);
  });

  it('passes ctx to the handler', async () => {
    let receivedCtx;
    const ctx = makeCtx();
    const handler = requireMember(async (c) => { receivedCtx = c; });
    await handler(ctx);
    assert.equal(receivedCtx, ctx);
  });
});

describe('requireAdmin', () => {
  it('does not call handler when ctx.household is absent', async () => {
    let called = false;
    const handler = requireAdmin(async () => { called = true; });
    await handler(makeCtx({ household: undefined }));
    assert.equal(called, false);
  });

  it('replies with access-denied message for non-admin role', async () => {
    const replies = [];
    const ctx = makeCtx({ memberRole: 'member', reply: async (t) => replies.push(t) });
    const handler = requireAdmin(async () => {});
    await handler(ctx);
    assert.equal(replies.length, 1);
    assert.ok(replies[0].includes('admin access'));
  });

  it('does not call handler for non-admin role', async () => {
    let called = false;
    const handler = requireAdmin(async () => { called = true; });
    await handler(makeCtx({ memberRole: 'member' }));
    assert.equal(called, false);
  });

  it('calls handler for admin role', async () => {
    let called = false;
    const handler = requireAdmin(async () => { called = true; });
    await handler(makeCtx({ memberRole: 'admin' }));
    assert.equal(called, true);
  });
});
