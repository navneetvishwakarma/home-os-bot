'use strict';
const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const sentryInit = mock.fn();
const sentryCaptureException = mock.fn();

require.cache[require.resolve('@sentry/node')] = {
  exports: {
    init: sentryInit,
    captureException: sentryCaptureException
  }
};

// Load fresh module for each describe block by deleting cache between groups
function loadFreshSentry() {
  delete require.cache[require.resolve('../../src/services/sentry')];
  return require('../../src/services/sentry');
}

describe('initSentry — with DSN', () => {
  beforeEach(() => {
    sentryInit.mock.resetCalls();
    sentryCaptureException.mock.resetCalls();
    delete require.cache[require.resolve('../../src/services/sentry')];
    process.env.SENTRY_DSN = 'https://fake@sentry.io/123';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    delete process.env.SENTRY_DSN;
  });

  it('calls Sentry.init with dsn and environment when DSN is present', () => {
    const { initSentry } = loadFreshSentry();
    initSentry();
    assert.equal(sentryInit.mock.calls.length, 1);
    const opts = sentryInit.mock.calls[0].arguments[0];
    assert.equal(opts.dsn, 'https://fake@sentry.io/123');
    assert.equal(opts.environment, 'test');
  });

  it('captureException delegates to Sentry after init', () => {
    const { initSentry, captureException } = loadFreshSentry();
    initSentry();
    const err = new Error('boom');
    captureException(err, { householdId: 'h1' });
    assert.equal(sentryCaptureException.mock.calls.length, 1);
    assert.equal(sentryCaptureException.mock.calls[0].arguments[0], err);
  });

  it('captureException passes context as extra when provided', () => {
    const { initSentry, captureException } = loadFreshSentry();
    initSentry();
    captureException(new Error('x'), { householdId: 'h2', operation: 'queue' });
    const callArgs = sentryCaptureException.mock.calls[0].arguments;
    assert.deepEqual(callArgs[1], { extra: { householdId: 'h2', operation: 'queue' } });
  });
});

describe('initSentry — without DSN', () => {
  beforeEach(() => {
    sentryInit.mock.resetCalls();
    sentryCaptureException.mock.resetCalls();
    delete require.cache[require.resolve('../../src/services/sentry')];
    delete process.env.SENTRY_DSN;
  });

  it('does not call Sentry.init when DSN is absent', () => {
    const { initSentry } = loadFreshSentry();
    initSentry();
    assert.equal(sentryInit.mock.calls.length, 0);
  });

  it('captureException is a no-op when DSN is absent', () => {
    const { initSentry, captureException } = loadFreshSentry();
    initSentry();
    assert.doesNotThrow(() => captureException(new Error('ignored')));
    assert.equal(sentryCaptureException.mock.calls.length, 0);
  });
});
