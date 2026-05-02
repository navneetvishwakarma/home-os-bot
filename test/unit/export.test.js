'use strict';
const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');

const getAllTasks = mock.fn(async () => []);
const getAreas = mock.fn(async () => []);
const getSettings = mock.fn(async () => ({ calendarTime: '18:00', calendarDuration: 60, timezone: 'Asia/Kolkata' }));
const getHouseholdMembers = mock.fn(async () => []);
const getHousehold = mock.fn(async () => ({ id: 'h1', name: 'Sharma House', plan: 'free' }));

require.cache[require.resolve('../../src/services/supabase')] = {
  exports: { getAllTasks, getAreas, getSettings, getHouseholdMembers, getHousehold }
};

const { buildExportPayload } = require('../../src/services/export');

describe('buildExportPayload', () => {
  it('returns an object with household, tasks, areas, settings, and members keys', async () => {
    const payload = await buildExportPayload('h1');
    assert.ok('household' in payload, 'missing household');
    assert.ok('tasks' in payload, 'missing tasks');
    assert.ok('areas' in payload, 'missing areas');
    assert.ok('settings' in payload, 'missing settings');
    assert.ok('members' in payload, 'missing members');
    assert.ok('exportedAt' in payload, 'missing exportedAt');
  });

  it('includes household name and plan', async () => {
    getHousehold.mock.mockImplementation(async () => ({ id: 'h1', name: 'Sharma House', plan: 'pro' }));
    const payload = await buildExportPayload('h1');
    assert.equal(payload.household.name, 'Sharma House');
    assert.equal(payload.household.plan, 'pro');
  });

  it('includes all tasks returned by getAllTasks', async () => {
    const tasks = [{ id: 't1', title: 'Fix sink', criticality: 'HIGH' }];
    getAllTasks.mock.mockImplementation(async () => tasks);
    const payload = await buildExportPayload('h1');
    assert.deepEqual(payload.tasks, tasks);
  });

  it('exportedAt is an ISO date string', async () => {
    const payload = await buildExportPayload('h1');
    assert.ok(!isNaN(Date.parse(payload.exportedAt)), 'exportedAt is not a valid date');
  });
});
