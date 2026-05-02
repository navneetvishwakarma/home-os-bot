'use strict';
const { describe, it, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const generateText = mock.fn(async () => 'task');

require.cache[require.resolve('../../src/services/gemini')] = {
  exports: {
    classifyTask: mock.fn(),
    correctTask: mock.fn(),
    generateText
  }
};

const { classifyIntent, INTENTS } = require('../../src/services/intent-classifier');

describe('INTENTS', () => {
  it('contains all 9 expected intents', () => {
    const expected = ['task', 'note', 'reminder', 'contact', 'expense', 'question', 'correction', 'completion', 'unknown'];
    assert.deepEqual([...INTENTS].sort(), expected.sort());
  });
});

describe('classifyIntent', () => {
  beforeEach(() => {
    generateText.mock.resetCalls();
    generateText.mock.mockImplementation(async () => 'task');
  });

  it('returns the intent string from Gemini when it is a known intent', async () => {
    generateText.mock.mockImplementation(async () => 'note');
    const result = await classifyIntent('remind me to buy milk');
    assert.equal(result, 'note');
  });

  it('returns task when Gemini returns an unrecognised string', async () => {
    generateText.mock.mockImplementation(async () => 'gibberish');
    const result = await classifyIntent('fix the tap');
    assert.equal(result, 'task');
  });

  it('returns task when Gemini throws', async () => {
    generateText.mock.mockImplementation(async () => { throw new Error('AI down'); });
    const result = await classifyIntent('fix the tap');
    assert.equal(result, 'task');
  });

  it('is case-insensitive — normalises Gemini response to lowercase', async () => {
    generateText.mock.mockImplementation(async () => 'EXPENSE');
    const result = await classifyIntent('paid Rs 500 for groceries');
    assert.equal(result, 'expense');
  });

  it('passes message text to generateText', async () => {
    await classifyIntent('buy groceries');
    assert.equal(generateText.mock.calls.length, 1);
    const prompt = generateText.mock.calls[0].arguments[0];
    assert.ok(prompt.includes('buy groceries'), 'prompt should include the message text');
  });
});
