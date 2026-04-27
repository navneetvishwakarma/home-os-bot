'use strict';
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ─── Supabase client mock ────────────────────────────────────────────────────
// The supabase client uses a fluent builder: from().select().in() etc.
// We queue responses so each top-level from() call dequeues the next one.

let responseQueue = [];

function makeFakeChain(result) {
  const chain = {
    select: () => chain,
    update: () => chain,
    delete: () => chain,
    insert: () => chain,
    upsert: () => chain,
    in: () => chain,
    eq: () => chain,
    is: () => chain,
    gt: () => chain,
    or: () => chain,
    order: () => chain,
    maybeSingle: async () => result,
    single: async () => result,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  };
  return chain;
}

const fakeSupabase = {
  from: () => {
    const result = responseQueue.shift() ?? { data: [], error: null };
    return makeFakeChain(result);
  }
};

require.cache[require.resolve('@supabase/supabase-js')] = {
  exports: { createClient: () => fakeSupabase }
};
require.cache[require.resolve('../../src/config')] = {
  exports: {
    config: {
      supabaseUrl: 'http://fake',
      supabaseServiceRoleKey: 'fake-key'
    }
  }
};

const { bulkComplete, getIncompleteTasksByPriority } = require('../../src/services/supabase');

// ─── bulkComplete ─────────────────────────────────────────────────────────────

describe('bulkComplete', () => {
  beforeEach(() => { responseQueue = []; });

  it('returns 0 immediately for empty id list', async () => {
    const count = await bulkComplete([]);
    assert.equal(count, 0);
    assert.equal(responseQueue.length, 0); // no DB calls made
  });

  it('permanently completes non-recurring tasks', async () => {
    // 1st call: fetch task metadata
    responseQueue.push({ data: [{ id: 't1', is_recurring: false, recurrence_interval_days: null }], error: null });
    // 2nd call: update non-recurring tasks (returns the updated rows)
    responseQueue.push({ data: [{ id: 't1' }], error: null });

    const count = await bulkComplete(['t1']);
    assert.equal(count, 1);
    // responseQueue should be drained
    assert.equal(responseQueue.length, 0);
  });

  it('advances next_due_date for recurring tasks without marking completed', async () => {
    // 1st call: fetch task metadata
    responseQueue.push({
      data: [{ id: 'r1', is_recurring: true, recurrence_interval_days: 7 }],
      error: null
    });
    // 2nd call: update recurring task (no select, returns { error: null })
    responseQueue.push({ error: null });

    const count = await bulkComplete(['r1']);
    assert.equal(count, 1);
    assert.equal(responseQueue.length, 0);
  });

  it('handles mixed recurring and non-recurring in one call', async () => {
    // fetch metadata: one non-recurring, one recurring
    responseQueue.push({
      data: [
        { id: 't1', is_recurring: false, recurrence_interval_days: null },
        { id: 'r1', is_recurring: true, recurrence_interval_days: 3 }
      ],
      error: null
    });
    // update non-recurring batch
    responseQueue.push({ data: [{ id: 't1' }], error: null });
    // update recurring (one per task)
    responseQueue.push({ error: null });

    const count = await bulkComplete(['t1', 'r1']);
    assert.equal(count, 2);
    assert.equal(responseQueue.length, 0);
  });

  it('uses 7-day default interval when recurrence_interval_days is null', async () => {
    responseQueue.push({
      data: [{ id: 'r1', is_recurring: true, recurrence_interval_days: null }],
      error: null
    });
    responseQueue.push({ error: null });

    // Should not throw; falls back to 7-day default
    const count = await bulkComplete(['r1']);
    assert.equal(count, 1);
  });
});

// ─── getIncompleteTasksByPriority ─────────────────────────────────────────────

describe('getIncompleteTasksByPriority', () => {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  function makeRow(overrides) {
    return {
      id: 'tid',
      title: 'task',
      area: 'kitchen',
      criticality: 'MEDIUM',
      effort_mins: 30,
      tags: [],
      assigned_to: 'Me',
      deadline: null,
      reasoning: null,
      raw_input: null,
      added_by: null,
      completed: false,
      completed_at: null,
      is_recurring: false,
      recurrence_interval_days: null,
      next_due_date: null,
      last_completed_at: null,
      created_at: new Date().toISOString(),
      ...overrides
    };
  }

  beforeEach(() => { responseQueue = []; });

  it('includes non-recurring tasks regardless of any date field', async () => {
    responseQueue.push({ data: [makeRow({ id: 't1', is_recurring: false, next_due_date: tomorrow })], error: null });
    const tasks = await getIncompleteTasksByPriority('h1');
    assert.equal(tasks.length, 1);
  });

  it('includes recurring tasks due today', async () => {
    responseQueue.push({ data: [makeRow({ id: 'r1', is_recurring: true, next_due_date: today })], error: null });
    const tasks = await getIncompleteTasksByPriority('h1');
    assert.equal(tasks.length, 1);
  });

  it('includes recurring tasks that are overdue (next_due_date < today)', async () => {
    responseQueue.push({ data: [makeRow({ id: 'r1', is_recurring: true, next_due_date: yesterday })], error: null });
    const tasks = await getIncompleteTasksByPriority('h1');
    assert.equal(tasks.length, 1);
  });

  it('excludes recurring tasks with next_due_date in the future', async () => {
    responseQueue.push({ data: [makeRow({ id: 'r1', is_recurring: true, next_due_date: tomorrow })], error: null });
    const tasks = await getIncompleteTasksByPriority('h1');
    assert.equal(tasks.length, 0);
  });

  it('includes recurring tasks when next_due_date is null', async () => {
    responseQueue.push({ data: [makeRow({ id: 'r1', is_recurring: true, next_due_date: null })], error: null });
    const tasks = await getIncompleteTasksByPriority('h1');
    assert.equal(tasks.length, 1);
  });

  it('sorts tasks by criticality then effort', async () => {
    responseQueue.push({
      data: [
        makeRow({ id: 'low', criticality: 'LOW', effort_mins: 10 }),
        makeRow({ id: 'crit', criticality: 'CRITICAL', effort_mins: 60 }),
        makeRow({ id: 'high-fast', criticality: 'HIGH', effort_mins: 15 }),
        makeRow({ id: 'high-slow', criticality: 'HIGH', effort_mins: 45 })
      ],
      error: null
    });
    const tasks = await getIncompleteTasksByPriority('h1');
    assert.equal(tasks[0].id, 'crit');
    assert.equal(tasks[1].id, 'high-fast');
    assert.equal(tasks[2].id, 'high-slow');
    assert.equal(tasks[3].id, 'low');
  });
});
