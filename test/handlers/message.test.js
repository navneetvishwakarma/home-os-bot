'use strict';
const { describe, it, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// All mocks set up before requiring the module under test
const classifyTask = mock.fn(async () => ({
  title: 'Fix tap',
  area: 'Kitchen',
  criticality: 'HIGH',
  effortMins: 30,
  assignedTo: 'Me',
  tags: [],
  reasoning: 'Water dripping.',
  isNewArea: false
}));
const createTask = mock.fn(async () => 'new-task-id');
const addArea = mock.fn(async () => {});
const getAreas = mock.fn(async () => ['Kitchen', 'Bathroom']);

const getSession = mock.fn(() => null);
const setRecentTask = mock.fn();
const startSession = mock.fn(() => false);

const handleCorrection = mock.fn(async () => {});
const handleCompletionReply = mock.fn(async () => false);
const isCompletionWindowActive = mock.fn(() => false);

require.cache[require.resolve('../../src/services/gemini')] = {
  exports: { classifyTask }
};
require.cache[require.resolve('../../src/services/supabase')] = {
  exports: { addArea, createTask, getAreas }
};
require.cache[require.resolve('../../src/handlers/correction-session')] = {
  exports: { getSession, setRecentTask, startSession }
};
require.cache[require.resolve('../../src/handlers/correction')] = {
  exports: { handleCorrection }
};
require.cache[require.resolve('../../src/handlers/complete')] = {
  exports: { handleCompletionReply }
};
require.cache[require.resolve('../../src/handlers/queue-session')] = {
  exports: { isCompletionWindowActive }
};
require.cache[require.resolve('../../src/services/witty-response')] = {
  exports: { generateWittyReply: mock.fn(async () => null) }
};

const { handleMessage } = require('../../src/handlers/message');

function makeCtx(text, overrides = {}) {
  return {
    household: { id: 'h1', name: 'Test House' },
    householdUser: { telegramId: '111' },
    chat: { id: 'chat1' },
    from: { id: 'user1' },
    message: { text },
    reply: mock.fn(async () => {}),
    ...overrides
  };
}

describe('handleMessage', () => {
  beforeEach(() => {
    classifyTask.mock.resetCalls();
    createTask.mock.resetCalls();
    addArea.mock.resetCalls();
    getAreas.mock.resetCalls();
    getSession.mock.resetCalls();
    setRecentTask.mock.resetCalls();
    startSession.mock.resetCalls();
    handleCorrection.mock.resetCalls();
    handleCompletionReply.mock.resetCalls();
    isCompletionWindowActive.mock.resetCalls();

    // Reset to default implementations
    classifyTask.mock.mockImplementation(async () => ({
      title: 'Fix tap', area: 'Kitchen', criticality: 'HIGH',
      effortMins: 30, assignedTo: 'Me', tags: [], reasoning: 'ok', isNewArea: false
    }));
    createTask.mock.mockImplementation(async () => 'new-task-id');
    getAreas.mock.mockImplementation(async () => ['Kitchen']);
    getSession.mock.mockImplementation(() => null);
    startSession.mock.mockImplementation(() => false);
    handleCompletionReply.mock.mockImplementation(async () => false);
    isCompletionWindowActive.mock.mockImplementation(() => false);
  });

  it('returns early when ctx.household is absent', async () => {
    const ctx = makeCtx('fix tap', { household: undefined });
    await handleMessage(ctx);
    assert.equal(ctx.reply.mock.calls.length, 0);
    assert.equal(classifyTask.mock.calls.length, 0);
  });

  it('delegates to handleCorrection when a correction session is active', async () => {
    getSession.mock.mockImplementation(() => ({ task: { id: 't1' }, expiresAt: Date.now() + 99999 }));
    const ctx = makeCtx('make it HIGH');
    await handleMessage(ctx);
    assert.equal(handleCorrection.mock.calls.length, 1);
    assert.equal(classifyTask.mock.calls.length, 0);
  });

  it('returns after handleCompletionReply handles the message', async () => {
    isCompletionWindowActive.mock.mockImplementation(() => true);
    handleCompletionReply.mock.mockImplementation(async () => true);
    const ctx = makeCtx('yes');
    await handleMessage(ctx);
    assert.equal(handleCompletionReply.mock.calls.length, 1);
    assert.equal(classifyTask.mock.calls.length, 0);
  });

  it('falls through to task capture when completion window is active but reply not handled', async () => {
    isCompletionWindowActive.mock.mockImplementation(() => true);
    handleCompletionReply.mock.mockImplementation(async () => false);
    const ctx = makeCtx('fix the leaky tap in kitchen');
    await handleMessage(ctx);
    assert.equal(classifyTask.mock.calls.length, 1);
  });

  it('ignores slash commands', async () => {
    const ctx = makeCtx('/help');
    await handleMessage(ctx);
    assert.equal(classifyTask.mock.calls.length, 0);
    assert.equal(ctx.reply.mock.calls.length, 0);
  });

  it('"correct" triggers startSession and replies with correction prompt', async () => {
    startSession.mock.mockImplementation(() => true);
    const ctx = makeCtx('correct');
    await handleMessage(ctx);
    assert.equal(startSession.mock.calls.length, 1);
    assert.equal(ctx.reply.mock.calls.length, 1);
    assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('correction'));
  });

  it('"correct" with no recent task replies with "no recent task" message', async () => {
    startSession.mock.mockImplementation(() => false);
    const ctx = makeCtx('correct');
    await handleMessage(ctx);
    assert.equal(ctx.reply.mock.calls.length, 1);
    assert.ok(ctx.reply.mock.calls[0].arguments[0].toLowerCase().includes('no recent task'));
  });

  it('"fix this" also triggers startSession', async () => {
    startSession.mock.mockImplementation(() => true);
    const ctx = makeCtx('fix this');
    await handleMessage(ctx);
    assert.equal(startSession.mock.calls.length, 1);
  });

  it('classifies task and replies with task card including household name', async () => {
    const ctx = makeCtx('fix the leaky kitchen tap');
    await handleMessage(ctx);
    assert.equal(classifyTask.mock.calls.length, 1);
    assert.equal(createTask.mock.calls.length, 1);
    assert.equal(ctx.reply.mock.calls.length, 1);
    assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('Test House'));
    assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('Task Added'));
  });

  it('calls addArea and sends area notification when task has a new area', async () => {
    classifyTask.mock.mockImplementation(async () => ({
      title: 'Fix balcony door', area: 'Balcony', criticality: 'MEDIUM',
      effortMins: 20, assignedTo: 'Me', tags: [], reasoning: 'ok', isNewArea: true
    }));
    const ctx = makeCtx('fix balcony door');
    await handleMessage(ctx);
    assert.equal(addArea.mock.calls.length, 1);
    assert.equal(ctx.reply.mock.calls.length, 2);
    assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('Balcony'));
  });

  it('replies with generic error message when classifyTask throws an error without a status', async () => {
    classifyTask.mock.mockImplementation(async () => { throw new Error('Gemini error'); });
    const ctx = makeCtx('fix tap');
    await handleMessage(ctx);
    assert.equal(ctx.reply.mock.calls.length, 1);
    assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('went wrong'));
  });

  it('replies with AI overload message when classifyTask throws a 503 error', async () => {
    const overloadErr = new Error('Service overloaded');
    overloadErr.status = 503;
    classifyTask.mock.mockImplementation(async () => { throw overloadErr; });
    const ctx = makeCtx('fix tap');
    await handleMessage(ctx);
    assert.equal(ctx.reply.mock.calls.length, 1);
    assert.ok(
      ctx.reply.mock.calls[0].arguments[0].includes('temporarily overloaded'),
      'should mention temporarily overloaded'
    );
  });

  it('replies with AI overload message when classifyTask throws a 429 error', async () => {
    const rateLimitErr = new Error('Rate limited');
    rateLimitErr.status = 429;
    classifyTask.mock.mockImplementation(async () => { throw rateLimitErr; });
    const ctx = makeCtx('fix tap');
    await handleMessage(ctx);
    assert.equal(ctx.reply.mock.calls.length, 1);
    assert.ok(
      ctx.reply.mock.calls[0].arguments[0].includes('temporarily overloaded'),
      'should mention temporarily overloaded'
    );
  });

  it('shows fallback banner when classifyTask returns _isFallback task', async () => {
    classifyTask.mock.mockImplementation(async () => ({
      title: 'fix the leaky tap', area: 'General', criticality: 'MEDIUM',
      effortMins: 30, assignedTo: 'Me', tags: [], reasoning: '', isNewArea: false,
      isRecurring: false, recurrenceIntervalDays: null, nextDueDate: null,
      _isFallback: true
    }));
    const ctx = makeCtx('fix the leaky tap');
    await handleMessage(ctx);
    assert.equal(ctx.reply.mock.calls.length, 1);
    assert.ok(
      ctx.reply.mock.calls[0].arguments[0].includes('AI unavailable'),
      'reply should include AI unavailable banner'
    );
    assert.ok(
      ctx.reply.mock.calls[0].arguments[0].includes("Reply 'correct'"),
      'reply should prompt user to correct'
    );
  });

  it('does not pass _isFallback to createTask', async () => {
    classifyTask.mock.mockImplementation(async () => ({
      title: 'fix the leaky tap', area: 'General', criticality: 'MEDIUM',
      effortMins: 30, assignedTo: 'Me', tags: [], reasoning: '', isNewArea: false,
      isRecurring: false, recurrenceIntervalDays: null, nextDueDate: null,
      _isFallback: true
    }));
    const ctx = makeCtx('fix the leaky tap');
    await handleMessage(ctx);
    const taskArg = createTask.mock.calls[0].arguments[1];
    assert.equal(taskArg._isFallback, undefined);
  });

  it('skips witty reply and still saves task when fallback is active', async () => {
    classifyTask.mock.mockImplementation(async () => ({
      title: 'buy milk', area: 'General', criticality: 'MEDIUM',
      effortMins: 30, assignedTo: 'Me', tags: [], reasoning: '', isNewArea: false,
      isRecurring: false, recurrenceIntervalDays: null, nextDueDate: null,
      _isFallback: true
    }));
    const ctx = makeCtx('buy milk');
    await handleMessage(ctx);
    assert.equal(createTask.mock.calls.length, 1);
    assert.equal(setRecentTask.mock.calls.length, 1);
    assert.equal(ctx.reply.mock.calls.length, 1);
  });
});
