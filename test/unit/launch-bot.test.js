'use strict';
const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');

// launchBot is a pure function — takes (bot, config, env) as explicit args
// No require.cache mocking needed
const { launchBot } = require('../../src/utils/launch-bot');

describe('launchBot — production with webhookUrl', () => {
  it('calls bot.launch with webhook config when NODE_ENV=production and webhookUrl is set', async () => {
    const bot = { launch: mock.fn(async () => {}) };
    const cfg = { webhookUrl: 'https://example.com' };
    const env = { NODE_ENV: 'production', PORT: '3000' };

    await launchBot(bot, cfg, env);

    assert.equal(bot.launch.mock.calls.length, 1);
    assert.deepEqual(bot.launch.mock.calls[0].arguments[0], {
      webhook: { domain: 'https://example.com', port: 3000 }
    });
  });
});

describe('launchBot — development with no webhookUrl', () => {
  it('calls bot.launch with no args when NODE_ENV=development and webhookUrl is null', async () => {
    const bot = { launch: mock.fn(async () => {}) };
    const cfg = { webhookUrl: null };
    const env = { NODE_ENV: 'development' };

    await launchBot(bot, cfg, env);

    assert.equal(bot.launch.mock.calls.length, 1);
    assert.equal(bot.launch.mock.calls[0].arguments.length, 0);
  });
});

describe('launchBot — production but no webhookUrl', () => {
  it('falls back to long-poll when NODE_ENV=production but webhookUrl is null', async () => {
    const bot = { launch: mock.fn(async () => {}) };
    const cfg = { webhookUrl: null };
    const env = { NODE_ENV: 'production' };

    await launchBot(bot, cfg, env);

    assert.equal(bot.launch.mock.calls.length, 1);
    assert.equal(bot.launch.mock.calls[0].arguments.length, 0);
  });
});
