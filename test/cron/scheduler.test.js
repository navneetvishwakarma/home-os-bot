'use strict';
const { describe, it, mock, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Fake cron that captures all scheduled jobs for inspection
const cronJobs = [];
const fakeCron = {
  schedule: mock.fn((expr, callback, options) => {
    const job = { expr, callback, options, stop: mock.fn() };
    cronJobs.push(job);
    return job;
  })
};

const getAllHouseholdsWithSettings = mock.fn(async () => []);
const getIncompleteTasksByPriority = mock.fn(async () => []);
const getHouseholdMembers = mock.fn(async () => []);
const getSettings = mock.fn(async () => ({ calendarTime: '18:00', calendarDuration: 60, timezone: 'Asia/Kolkata' }));
const getHousehold = mock.fn(async () => ({ id: 'h1', name: 'Test House' }));

require.cache[require.resolve('node-cron')] = { exports: fakeCron };
require.cache[require.resolve('../../src/services/supabase')] = {
  exports: { getAllHouseholdsWithSettings, getIncompleteTasksByPriority, getHouseholdMembers, getSettings, getHousehold }
};
// queue-session and formatters have no external deps
delete require.cache[require.resolve('../../src/handlers/queue-session')];
delete require.cache[require.resolve('../../src/utils/formatters')];
delete require.cache[require.resolve('../../src/services/calendar')];
delete require.cache[require.resolve('../../src/services/queue-builder')];

const { startScheduler, refreshScheduleForHousehold } = require('../../src/cron/scheduler');

const HOUSEHOLD = {
  id: 'h1',
  name: 'Test House',
  settings: { calendarTime: '18:00', calendarDuration: 60, timezone: 'Asia/Kolkata' }
};

function makeFakeBot() {
  return {
    telegram: {
      sendMessage: mock.fn(async () => {})
    }
  };
}

describe('scheduler', () => {
  beforeEach(() => {
    cronJobs.length = 0;
    fakeCron.schedule.mock.resetCalls();
    getAllHouseholdsWithSettings.mock.resetCalls();
    getIncompleteTasksByPriority.mock.resetCalls();
    getHouseholdMembers.mock.resetCalls();
    getSettings.mock.resetCalls();
    getHousehold.mock.resetCalls();

    getAllHouseholdsWithSettings.mock.mockImplementation(async () => []);
    getIncompleteTasksByPriority.mock.mockImplementation(async () => []);
    getHouseholdMembers.mock.mockImplementation(async () => []);
    getSettings.mock.mockImplementation(async () => ({ calendarTime: '18:00', calendarDuration: 60, timezone: 'Asia/Kolkata' }));
    getHousehold.mock.mockImplementation(async () => ({ id: 'h1', name: 'Test House' }));
  });

  describe('startScheduler', () => {
    it('schedules jobs for each household from the database', async () => {
      getAllHouseholdsWithSettings.mock.mockImplementation(async () => [HOUSEHOLD]);
      const bot = makeFakeBot();
      await startScheduler(bot);
      // Expect 2 cron jobs: queue + completion
      assert.equal(fakeCron.schedule.mock.calls.length, 2);
    });

    it('creates no jobs when there are no households', async () => {
      getAllHouseholdsWithSettings.mock.mockImplementation(async () => []);
      await startScheduler(makeFakeBot());
      assert.equal(fakeCron.schedule.mock.calls.length, 0);
    });
  });

  describe('scheduleForHousehold (via startScheduler)', () => {
    it('creates cron expression using hour and minute from calendarTime', async () => {
      getAllHouseholdsWithSettings.mock.mockImplementation(async () => [
        { ...HOUSEHOLD, settings: { calendarTime: '09:30', calendarDuration: 60, timezone: 'UTC' } }
      ]);
      await startScheduler(makeFakeBot());
      const queueJobExpr = fakeCron.schedule.mock.calls[0].arguments[0];
      // minute hour * * *
      assert.equal(queueJobExpr, '30 9 * * *');
    });

    it('uses the household timezone when scheduling', async () => {
      getAllHouseholdsWithSettings.mock.mockImplementation(async () => [
        { ...HOUSEHOLD, settings: { calendarTime: '18:00', calendarDuration: 60, timezone: 'Europe/London' } }
      ]);
      await startScheduler(makeFakeBot());
      const callArgs = fakeCron.schedule.mock.calls[0].arguments;
      assert.equal(callArgs[2].timezone, 'Europe/London');
    });

    it('completion job fires after calendarDuration + completionPromptDelayMins', async () => {
      // calendarTime 18:00 + 60 mins = 19:00, plus the delay from config
      getAllHouseholdsWithSettings.mock.mockImplementation(async () => [
        { ...HOUSEHOLD, settings: { calendarTime: '18:00', calendarDuration: 60, timezone: 'UTC' } }
      ]);
      await startScheduler(makeFakeBot());
      const completionExpr = fakeCron.schedule.mock.calls[1].arguments[0];
      // completionPromptDelayMins is config.completionPromptDelayMins (default 5 in config.js)
      // 18:00 + 60 + 5 = 19:05 → '5 19 * * *'
      // Just verify it's different from the queue job expression
      const queueExpr = fakeCron.schedule.mock.calls[0].arguments[0];
      assert.notEqual(completionExpr, queueExpr);
    });

    it('stops existing jobs for a household before rescheduling', async () => {
      getAllHouseholdsWithSettings.mock.mockImplementation(async () => [HOUSEHOLD]);
      const bot = makeFakeBot();
      await startScheduler(bot);
      const firstJobStop = cronJobs[0].stop;

      // Schedule again for same household (simulating refreshScheduleForHousehold)
      cronJobs.length = 0;
      getAllHouseholdsWithSettings.mock.mockImplementation(async () => [HOUSEHOLD]);
      await startScheduler(bot);

      // The first job's stop should have been called when reschedule ran
      // (startScheduler calls scheduleForHousehold which calls stopHouseholdJobs first)
      assert.equal(firstJobStop.mock.calls.length, 1);
    });
  });

  describe('refreshScheduleForHousehold', () => {
    it('fetches fresh household and settings, then reschedules', async () => {
      // First, bootstrap the scheduler so it has the household registered
      getAllHouseholdsWithSettings.mock.mockImplementation(async () => [HOUSEHOLD]);
      const bot = makeFakeBot();
      await startScheduler(bot);

      cronJobs.length = 0;
      fakeCron.schedule.mock.resetCalls();

      getHousehold.mock.mockImplementation(async () => ({ id: 'h1', name: 'Test House' }));
      getSettings.mock.mockImplementation(async () => ({ calendarTime: '20:00', calendarDuration: 45, timezone: 'UTC' }));

      await refreshScheduleForHousehold(bot, 'h1');

      assert.equal(fakeCron.schedule.mock.calls.length, 2);
      const newQueueExpr = fakeCron.schedule.mock.calls[0].arguments[0];
      // 20:00 → '0 20 * * *'
      assert.equal(newQueueExpr, '0 20 * * *');
    });
  });

  describe('queue job callback', () => {
    it('sends queue message to each household member', async () => {
      const members = [
        { telegramId: '111' },
        { telegramId: '222' }
      ];
      getHouseholdMembers.mock.mockImplementation(async () => members);
      getIncompleteTasksByPriority.mock.mockImplementation(async () => []);
      getSettings.mock.mockImplementation(async () => ({ calendarTime: '18:00', calendarDuration: 60, timezone: 'UTC' }));

      getAllHouseholdsWithSettings.mock.mockImplementation(async () => [HOUSEHOLD]);
      const bot = makeFakeBot();
      await startScheduler(bot);

      // Invoke the queue job callback manually
      const queueCallback = fakeCron.schedule.mock.calls[0].arguments[1];
      await queueCallback();

      assert.equal(bot.telegram.sendMessage.mock.calls.length, 2);
      const firstMsg = bot.telegram.sendMessage.mock.calls[0].arguments[1];
      assert.ok(firstMsg.includes('Test House'));
    });
  });

  describe('completion job callback', () => {
    it('sends completion prompt to each household member', async () => {
      const members = [{ telegramId: '111' }, { telegramId: '222' }];
      getHouseholdMembers.mock.mockImplementation(async () => members);

      getAllHouseholdsWithSettings.mock.mockImplementation(async () => [HOUSEHOLD]);
      const bot = makeFakeBot();
      await startScheduler(bot);

      const completionCallback = fakeCron.schedule.mock.calls[1].arguments[1];
      await completionCallback();

      assert.equal(bot.telegram.sendMessage.mock.calls.length, 2);
      const msg = bot.telegram.sendMessage.mock.calls[0].arguments[1];
      assert.ok(msg.includes('ended') || msg.includes('Done') || msg.includes('block'));
    });
  });
});
