'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { withRetry } = require('../../src/utils/retry');

const noSleep = () => Promise.resolve();

function makeErr(status) {
  const err = new Error(`HTTP ${status}`);
  err.status = status;
  return err;
}

describe('withRetry', () => {
  it('resolves immediately when fn succeeds on first attempt', async () => {
    const result = await withRetry(async () => 'ok', { _sleep: noSleep });
    assert.equal(result, 'ok');
  });

  it('retries on 503 and resolves when fn eventually succeeds', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw makeErr(503);
      return 'ok';
    };
    const result = await withRetry(fn, { _sleep: noSleep });
    assert.equal(result, 'ok');
    assert.equal(calls, 3);
  });

  it('retries on 429 and resolves when fn eventually succeeds', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 2) throw makeErr(429);
      return 'done';
    };
    const result = await withRetry(fn, { _sleep: noSleep });
    assert.equal(result, 'done');
    assert.equal(calls, 2);
  });

  it('does not retry on 400 — throws immediately after one attempt', async () => {
    let calls = 0;
    const fn = async () => { calls++; throw makeErr(400); };
    await assert.rejects(() => withRetry(fn, { _sleep: noSleep }), { message: 'HTTP 400' });
    assert.equal(calls, 1);
  });

  it('does not retry on 401 — throws immediately after one attempt', async () => {
    let calls = 0;
    const fn = async () => { calls++; throw makeErr(401); };
    await assert.rejects(() => withRetry(fn, { _sleep: noSleep }), { message: 'HTTP 401' });
    assert.equal(calls, 1);
  });

  it('does not retry on errors with no status', async () => {
    let calls = 0;
    const fn = async () => { calls++; throw new Error('network'); };
    await assert.rejects(() => withRetry(fn, { _sleep: noSleep }), { message: 'network' });
    assert.equal(calls, 1);
  });

  it('throws last error after exhausting maxAttempts', async () => {
    let calls = 0;
    const fn = async () => { calls++; throw makeErr(503); };
    await assert.rejects(() => withRetry(fn, { maxAttempts: 3, _sleep: noSleep }), { message: 'HTTP 503' });
    assert.equal(calls, 3);
  });

  it('respects custom maxAttempts', async () => {
    let calls = 0;
    const fn = async () => { calls++; throw makeErr(503); };
    await assert.rejects(() => withRetry(fn, { maxAttempts: 2, _sleep: noSleep }));
    assert.equal(calls, 2);
  });

  it('respects custom retryOn list', async () => {
    let calls = 0;
    const fn = async () => { calls++; throw makeErr(500); };
    await assert.rejects(() => withRetry(fn, { retryOn: [500], maxAttempts: 2, _sleep: noSleep }));
    assert.equal(calls, 2);
  });

  it('reads status from err.statusCode when err.status is absent', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 2) {
        const err = new Error('retry');
        err.statusCode = 503;
        throw err;
      }
      return 'ok';
    };
    const result = await withRetry(fn, { _sleep: noSleep });
    assert.equal(result, 'ok');
  });

  it('calls _sleep between retries with increasing delays', async () => {
    const sleepCalls = [];
    const fakeSleep = (ms) => { sleepCalls.push(ms); return Promise.resolve(); };
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw makeErr(503);
      return 'ok';
    };
    await withRetry(fn, { maxAttempts: 3, baseDelayMs: 100, _sleep: fakeSleep });
    assert.equal(sleepCalls.length, 2);
    assert.ok(sleepCalls[0] >= 100, 'first delay >= baseDelayMs');
    assert.ok(sleepCalls[1] >= 200, 'second delay >= 2x baseDelayMs');
  });
});
