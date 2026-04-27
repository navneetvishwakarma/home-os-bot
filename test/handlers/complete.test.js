'use strict';
const { describe, it, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const bulkComplete = mock.fn(async (ids) => ids.length);
const getQueuedTasks = mock.fn(() => []);
const endCompletionWindow = mock.fn();

require.cache[require.resolve('../../src/services/supabase')] = {
  exports: { bulkComplete }
};
require.cache[require.resolve('../../src/handlers/queue-session')] = {
  exports: { getQueuedTasks, endCompletionWindow }
};

const { handleCompletionReply } = require('../../src/handlers/complete');

const TASKS = [
  { id: 'task1', title: 'Fix leaky tap', effortMins: 30 },
  { id: 'task2', title: 'Mow lawn', effortMins: 45 }
];

function makeCtx(text, chatId = 'chat1') {
  return {
    message: { text },
    chat: { id: chatId },
    reply: mock.fn(async () => {})
  };
}

describe('handleCompletionReply', () => {
  beforeEach(() => {
    bulkComplete.mock.resetCalls();
    getQueuedTasks.mock.resetCalls();
    endCompletionWindow.mock.resetCalls();
    bulkComplete.mock.mockImplementation(async (ids) => ids.length);
    getQueuedTasks.mock.mockImplementation(() => []);
  });

  it('returns false immediately when queue is empty', async () => {
    const ctx = makeCtx('yes');
    const result = await handleCompletionReply(ctx);
    assert.equal(result, false);
    assert.equal(ctx.reply.mock.calls.length, 0);
  });

  it('"yes" marks all tasks complete and ends window', async () => {
    getQueuedTasks.mock.mockImplementation(() => TASKS);
    const ctx = makeCtx('yes');
    const result = await handleCompletionReply(ctx);
    assert.equal(result, true);
    assert.equal(bulkComplete.mock.calls[0].arguments[0].length, 2);
    assert.equal(endCompletionWindow.mock.calls.length, 1);
    assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('2'));
  });

  it('"done" marks all tasks complete', async () => {
    getQueuedTasks.mock.mockImplementation(() => TASKS);
    const ctx = makeCtx('done');
    const result = await handleCompletionReply(ctx);
    assert.equal(result, true);
    assert.equal(bulkComplete.mock.calls[0].arguments[0].length, 2);
  });

  it('"all done" marks all tasks complete', async () => {
    getQueuedTasks.mock.mockImplementation(() => TASKS);
    const ctx = makeCtx('all done');
    const result = await handleCompletionReply(ctx);
    assert.equal(result, true);
    assert.equal(bulkComplete.mock.calls.length, 1);
  });

  it('"skip <name>" excludes the matching task', async () => {
    getQueuedTasks.mock.mockImplementation(() => TASKS);
    const ctx = makeCtx('skip fix leaky tap');
    const result = await handleCompletionReply(ctx);
    assert.equal(result, true);
    const completedIds = bulkComplete.mock.calls[0].arguments[0];
    assert.ok(completedIds.includes('task2'));
    assert.ok(!completedIds.includes('task1'));
    assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('Fix leaky tap'));
  });

  it('"skip <unknown>" completes all tasks and reports skipped none', async () => {
    getQueuedTasks.mock.mockImplementation(() => TASKS);
    const ctx = makeCtx('skip nonexistent task here');
    const result = await handleCompletionReply(ctx);
    assert.equal(result, true);
    assert.equal(bulkComplete.mock.calls[0].arguments[0].length, 2);
    assert.ok(ctx.reply.mock.calls[0].arguments[0].includes('none'));
  });

  it('"no" asks for task names without completing anything', async () => {
    getQueuedTasks.mock.mockImplementation(() => TASKS);
    const ctx = makeCtx('no');
    const result = await handleCompletionReply(ctx);
    assert.equal(result, true);
    assert.equal(bulkComplete.mock.calls.length, 0);
    assert.equal(endCompletionWindow.mock.calls.length, 0);
    assert.equal(ctx.reply.mock.calls.length, 1);
  });

  it('task title match in free text completes only matching tasks', async () => {
    getQueuedTasks.mock.mockImplementation(() => TASKS);
    const ctx = makeCtx('i finished fix leaky tap today');
    const result = await handleCompletionReply(ctx);
    assert.equal(result, true);
    const completedIds = bulkComplete.mock.calls[0].arguments[0];
    assert.ok(completedIds.includes('task1'));
    assert.ok(!completedIds.includes('task2'));
    assert.equal(endCompletionWindow.mock.calls.length, 1);
  });

  it('comma-separated partial names match multiple tasks', async () => {
    getQueuedTasks.mock.mockImplementation(() => TASKS);
    // "leaky tap" is a substring of "Fix leaky tap"; "lawn" is a substring of "Mow lawn"
    const ctx = makeCtx('leaky tap, lawn');
    const result = await handleCompletionReply(ctx);
    assert.equal(result, true);
    const completedIds = bulkComplete.mock.calls[0].arguments[0];
    assert.ok(completedIds.includes('task1'));
    assert.ok(completedIds.includes('task2'));
  });

  it('single partial name token matches the right task', async () => {
    getQueuedTasks.mock.mockImplementation(() => TASKS);
    const ctx = makeCtx('leaky tap');
    const result = await handleCompletionReply(ctx);
    assert.equal(result, true);
    const completedIds = bulkComplete.mock.calls[0].arguments[0];
    assert.ok(completedIds.includes('task1'));
    assert.ok(!completedIds.includes('task2'));
  });

  it('returns false when text has no matching task names', async () => {
    getQueuedTasks.mock.mockImplementation(() => TASKS);
    const ctx = makeCtx('random unrelated text');
    const result = await handleCompletionReply(ctx);
    assert.equal(result, false);
    assert.equal(bulkComplete.mock.calls.length, 0);
  });
});
