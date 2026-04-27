'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  setQueuedTasks,
  getQueuedTasks,
  startCompletionWindow,
  isCompletionWindowActive,
  endCompletionWindow
} = require('../../src/handlers/queue-session');

const TASKS = [
  { id: 't1', title: 'Fix tap' },
  { id: 't2', title: 'Mow lawn' }
];

describe('queue-session', () => {
  describe('setQueuedTasks / getQueuedTasks', () => {
    it('stores and retrieves tasks by chatId', () => {
      setQueuedTasks('chat1', TASKS);
      const result = getQueuedTasks('chat1');
      assert.deepEqual(result, TASKS);
    });

    it('returns empty array for unknown chatId', () => {
      const result = getQueuedTasks('never-set-chat');
      assert.deepEqual(result, []);
    });

    it('coerces numeric chatId to string', () => {
      setQueuedTasks(999, TASKS);
      assert.deepEqual(getQueuedTasks('999'), TASKS);
    });
  });

  describe('startCompletionWindow / isCompletionWindowActive', () => {
    it('returns true immediately after starting the window', () => {
      startCompletionWindow('chat-active');
      assert.equal(isCompletionWindowActive('chat-active'), true);
    });

    it('returns false for a chat that never had a window started', () => {
      assert.equal(isCompletionWindowActive('chat-never'), false);
    });

    it('returns false after the 2-hour TTL has elapsed', () => {
      startCompletionWindow('chat-ttl');

      const originalNow = Date.now;
      Date.now = () => originalNow() + 3 * 60 * 60 * 1000;
      const active = isCompletionWindowActive('chat-ttl');
      Date.now = originalNow;

      assert.equal(active, false);
    });
  });

  describe('endCompletionWindow', () => {
    it('deactivates the window immediately', () => {
      startCompletionWindow('chat-end');
      endCompletionWindow('chat-end');
      assert.equal(isCompletionWindowActive('chat-end'), false);
    });
  });
});
