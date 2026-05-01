'use strict';
const { describe, it, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Mock withRetry as a pass-through so tests run without delays
const withRetry = mock.fn(async (fn) => fn());
require.cache[require.resolve('../../src/utils/retry')] = {
  exports: { withRetry }
};

// Mock config
require.cache[require.resolve('../../src/config')] = {
  exports: { config: { geminiApiKey: 'fake-key', geminiModel: 'gemini-2.5-flash' } }
};

// Mock @google/genai
const generateContent = mock.fn(async () => ({
  text: '{"title":"Fix tap","area":"Kitchen","isNewArea":false,"criticality":"HIGH","effortMins":30,"tags":[],"assignedTo":"Me","deadline":null,"reasoning":"Dripping.","isRecurring":false,"recurrenceIntervalDays":null,"nextDueDate":null}'
}));
require.cache[require.resolve('@google/genai')] = {
  exports: {
    GoogleGenAI: class {
      get models() { return { generateContent }; }
    }
  }
};

const { classifyTask, correctTask } = require('../../src/services/gemini');

describe('classifyTask', () => {
  beforeEach(() => {
    withRetry.mock.resetCalls();
    generateContent.mock.resetCalls();
    withRetry.mock.mockImplementation(async (fn) => fn());
    generateContent.mock.mockImplementation(async () => ({
      text: '{"title":"Fix tap","area":"Kitchen","isNewArea":false,"criticality":"HIGH","effortMins":30,"tags":[],"assignedTo":"Me","deadline":null,"reasoning":"Dripping.","isRecurring":false,"recurrenceIntervalDays":null,"nextDueDate":null}'
    }));
  });

  it('calls withRetry wrapping the generateContent call', async () => {
    await classifyTask('fix the tap', ['Kitchen']);
    assert.equal(withRetry.mock.calls.length, 1);
  });

  it('returns a sanitized task with correct fields', async () => {
    const task = await classifyTask('fix the tap', ['Kitchen']);
    assert.equal(task.title, 'Fix tap');
    assert.equal(task.area, 'Kitchen');
    assert.equal(task.criticality, 'HIGH');
    assert.equal(task.effortMins, 30);
    assert.equal(task.assignedTo, 'Me');
    assert.equal(task.isNewArea, false);
  });

  it('marks isNewArea true when area is not in the known list', async () => {
    generateContent.mock.mockImplementation(async () => ({
      text: '{"title":"Fix balcony door","area":"Balcony","isNewArea":true,"criticality":"MEDIUM","effortMins":20,"tags":[],"assignedTo":"Me","deadline":null,"reasoning":"ok.","isRecurring":false,"recurrenceIntervalDays":null,"nextDueDate":null}'
    }));
    const task = await classifyTask('fix balcony door', ['Kitchen', 'Bathroom']);
    assert.equal(task.isNewArea, true);
    assert.equal(task.area, 'Balcony');
  });

  it('propagates the error when withRetry exhausts', async () => {
    const overloadErr = new Error('Service overloaded');
    overloadErr.status = 503;
    withRetry.mock.mockImplementation(async () => { throw overloadErr; });
    await assert.rejects(() => classifyTask('fix tap', ['Kitchen']), { message: 'Service overloaded' });
  });

  it('throws when Gemini returns invalid JSON', async () => {
    generateContent.mock.mockImplementation(async () => ({ text: 'not json' }));
    await assert.rejects(() => classifyTask('fix tap', ['Kitchen']), { message: 'Gemini returned invalid JSON.' });
  });
});

describe('correctTask', () => {
  beforeEach(() => {
    withRetry.mock.resetCalls();
    generateContent.mock.resetCalls();
    withRetry.mock.mockImplementation(async (fn) => fn());
  });

  it('calls withRetry wrapping the generateContent call', async () => {
    generateContent.mock.mockImplementation(async () => ({ text: '{"criticality":"HIGH"}' }));
    await correctTask({ title: 'Fix tap', criticality: 'MEDIUM' }, 'make it HIGH');
    assert.equal(withRetry.mock.calls.length, 1);
  });

  it('returns a sanitized patch with only the changed field', async () => {
    generateContent.mock.mockImplementation(async () => ({ text: '{"criticality":"HIGH"}' }));
    const patch = await correctTask({ title: 'Fix tap', criticality: 'MEDIUM' }, 'make it HIGH');
    assert.equal(patch.criticality, 'HIGH');
    assert.equal(Object.keys(patch).length, 1);
  });
});
