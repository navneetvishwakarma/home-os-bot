'use strict';
const { describe, it, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const correctTask = mock.fn(async () => ({ criticality: 'HIGH' }));
const updateTask = mock.fn(async () => {});
const clearSession = mock.fn();

require.cache[require.resolve('../../src/services/gemini')] = {
  exports: { correctTask }
};
require.cache[require.resolve('../../src/services/supabase')] = {
  exports: { updateTask }
};
require.cache[require.resolve('../../src/handlers/correction-session')] = {
  exports: { clearSession }
};
require.cache[require.resolve('../../src/services/witty-response')] = {
  exports: { generateWittyReply: mock.fn(async () => null) }
};

const { handleCorrection } = require('../../src/handlers/correction');

const SESSION = {
  task: { id: 'task-1', title: 'Fix tap', criticality: 'LOW', effortMins: 20, assignedTo: 'Me', area: 'Kitchen', tags: [], reasoning: 'just because' }
};

function makeCtx(correctionText) {
  return {
    household: { id: 'h1' },
    message: { text: correctionText },
    chat: { id: 'chat1' },
    from: { id: 'user1' },
    reply: mock.fn(async () => {})
  };
}

describe('handleCorrection', () => {
  beforeEach(() => {
    correctTask.mock.resetCalls();
    updateTask.mock.resetCalls();
    clearSession.mock.resetCalls();
    correctTask.mock.mockImplementation(async () => ({ criticality: 'HIGH' }));
    updateTask.mock.mockImplementation(async () => {});
  });

  it('calls correctTask with the session task and the correction text', async () => {
    correctTask.mock.mockImplementation(async () => ({ criticality: 'HIGH' }));
    const ctx = makeCtx('make it HIGH');
    await handleCorrection(ctx, SESSION);
    assert.equal(correctTask.mock.calls.length, 1);
    assert.deepEqual(correctTask.mock.calls[0].arguments[0], SESSION.task);
    assert.equal(correctTask.mock.calls[0].arguments[1], 'make it HIGH');
  });

  it('calls updateTask with householdId, task id, and the returned patch', async () => {
    const patch = { criticality: 'CRITICAL', effortMins: 45 };
    correctTask.mock.mockImplementation(async () => patch);
    const ctx = makeCtx('change priority and effort');
    await handleCorrection(ctx, SESSION);
    assert.equal(updateTask.mock.calls.length, 1);
    assert.equal(updateTask.mock.calls[0].arguments[0], 'h1');
    assert.equal(updateTask.mock.calls[0].arguments[1], 'task-1');
    assert.deepEqual(updateTask.mock.calls[0].arguments[2], patch);
  });

  it('does not call updateTask and keeps session open when patch is empty', async () => {
    correctTask.mock.mockImplementation(async () => ({}));
    const ctx = makeCtx('some unrecognisable text');
    await handleCorrection(ctx, SESSION);
    assert.equal(updateTask.mock.calls.length, 0);
    assert.equal(clearSession.mock.calls.length, 0);
    assert.equal(ctx.reply.mock.calls.length, 1);
    assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('parse'));
  });

  it('clears the session after correction', async () => {
    correctTask.mock.mockImplementation(async () => ({ criticality: 'HIGH' }));
    const ctx = makeCtx('make it HIGH');
    await handleCorrection(ctx, SESSION);
    assert.equal(clearSession.mock.calls.length, 1);
    assert.equal(clearSession.mock.calls[0].arguments[0], 'chat1');
    assert.equal(clearSession.mock.calls[0].arguments[1], 'user1');
  });

  it('replies with a task-changes message', async () => {
    correctTask.mock.mockImplementation(async () => ({ criticality: 'HIGH' }));
    const ctx = makeCtx('make it HIGH');
    await handleCorrection(ctx, SESSION);
    assert.equal(ctx.reply.mock.calls.length, 1);
    const replyText = ctx.reply.mock.calls[0].arguments[0];
    assert.ok(replyText.includes('criticality'));
    assert.ok(replyText.includes('HIGH'));
  });
});
