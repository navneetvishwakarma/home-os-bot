'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildGCalUrl } = require('../../src/services/calendar');

const SETTINGS = { calendarTime: '18:00', calendarDuration: 60, timezone: 'Asia/Kolkata' };

const TASKS = [
  { criticality: 'HIGH', title: 'Fix leaky tap', effortMins: 30 },
  { criticality: 'MEDIUM', title: 'Mow lawn', effortMins: 25 }
];

function getParams(url) {
  return new URL(url).searchParams;
}

describe('buildGCalUrl', () => {
  it('returns a Google Calendar render URL', () => {
    const url = buildGCalUrl(TASKS, SETTINGS);
    assert.ok(url.startsWith('https://calendar.google.com/calendar/render'));
  });

  it('includes action=TEMPLATE parameter', () => {
    const url = buildGCalUrl(TASKS, SETTINGS);
    assert.equal(getParams(url).get('action'), 'TEMPLATE');
  });

  it('includes task count in the title', () => {
    const url = buildGCalUrl(TASKS, SETTINGS);
    const title = getParams(url).get('text');
    assert.ok(title.includes('2 tasks'));
  });

  it('encodes task details with index, criticality, title, effort', () => {
    const url = buildGCalUrl(TASKS, SETTINGS);
    const details = getParams(url).get('details');
    assert.ok(details.includes('1.'));
    assert.ok(details.includes('[HIGH]'));
    assert.ok(details.includes('Fix leaky tap'));
    assert.ok(details.includes('30m'));
    assert.ok(details.includes('2.'));
    assert.ok(details.includes('[MEDIUM]'));
    assert.ok(details.includes('Mow lawn'));
  });

  it('end time is start + calendarDuration minutes', () => {
    // Use UTC-safe comparison: end - start == duration * 60000 ms
    const url = buildGCalUrl([TASKS[0]], { calendarTime: '10:00', calendarDuration: 90 });
    const dates = getParams(url).get('dates');
    const [startStr, endStr] = dates.split('/');
    // Parse UTC timestamps from the date strings (they're in ISO compact format YYYYMMDDTHHmmssZ)
    const toMs = (s) => new Date(
      s.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/, '$1-$2-$3T$4:$5:$6Z')
    ).getTime();
    const diffMins = (toMs(endStr) - toMs(startStr)) / 60000;
    assert.equal(diffMins, 90);
  });

  it('handles empty task list gracefully', () => {
    const url = buildGCalUrl([], SETTINGS);
    const title = getParams(url).get('text');
    assert.ok(title.includes('0 tasks'));
  });

  it('dates format contains no hyphens or colons', () => {
    const url = buildGCalUrl(TASKS, SETTINGS);
    const dates = getParams(url).get('dates');
    assert.ok(!dates.includes('-'));
    assert.ok(!dates.includes(':'));
  });

  it('dates format has the correct compact ISO structure', () => {
    const url = buildGCalUrl(TASKS, SETTINGS);
    const dates = getParams(url).get('dates');
    const [startStr, endStr] = dates.split('/');
    // YYYYMMDDTHHmmssZ — 16 chars including trailing Z
    assert.ok(startStr.length >= 15);
    assert.ok(endStr.length >= 15);
    assert.ok(startStr.includes('T'));
    assert.ok(endStr.includes('T'));
  });
});
