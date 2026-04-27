'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  clampEffortMins,
  normalizeCriticality,
  normalizeAssignee,
  normalizeTags,
  parseTimeHHMM,
  parseDurationMinutes,
  parseTimezone,
  stripCodeFences,
  safeParseJsonObject
} = require('../../src/utils/validators');

describe('clampEffortMins', () => {
  it('returns valid integers unchanged', () => {
    assert.equal(clampEffortMins(30), 30);
    assert.equal(clampEffortMins(1), 1);
    assert.equal(clampEffortMins(480), 480);
  });
  it('clamps 0 to minimum of 1', () => assert.equal(clampEffortMins(0), 1));
  it('clamps 481 to maximum of 480', () => assert.equal(clampEffortMins(481), 480));
  it('rounds float values', () => assert.equal(clampEffortMins(4.7), 5));
  it('parses numeric strings', () => assert.equal(clampEffortMins('45'), 45));
  it('returns 30 for NaN', () => assert.equal(clampEffortMins(NaN), 30));
  it('clamps null (Number(null)=0) to minimum 1', () => assert.equal(clampEffortMins(null), 1));
  it('returns 30 for non-numeric string', () => assert.equal(clampEffortMins('abc'), 30));
});

describe('normalizeCriticality', () => {
  it('accepts all valid uppercase values', () => {
    assert.equal(normalizeCriticality('CRITICAL'), 'CRITICAL');
    assert.equal(normalizeCriticality('HIGH'), 'HIGH');
    assert.equal(normalizeCriticality('MEDIUM'), 'MEDIUM');
    assert.equal(normalizeCriticality('LOW'), 'LOW');
  });
  it('uppercases lowercase input', () => {
    assert.equal(normalizeCriticality('critical'), 'CRITICAL');
    assert.equal(normalizeCriticality('high'), 'HIGH');
  });
  it('defaults unknown values to MEDIUM', () => {
    assert.equal(normalizeCriticality('URGENT'), 'MEDIUM');
    assert.equal(normalizeCriticality(''), 'MEDIUM');
  });
  it('defaults null and undefined to MEDIUM', () => {
    assert.equal(normalizeCriticality(null), 'MEDIUM');
    assert.equal(normalizeCriticality(undefined), 'MEDIUM');
  });
});

describe('normalizeAssignee', () => {
  it('returns valid assignees with correct casing', () => {
    assert.equal(normalizeAssignee('Me'), 'Me');
    assert.equal(normalizeAssignee('Spouse'), 'Spouse');
    assert.equal(normalizeAssignee('Professional'), 'Professional');
    assert.equal(normalizeAssignee('Both'), 'Both');
  });
  it('matches case-insensitively', () => {
    assert.equal(normalizeAssignee('me'), 'Me');
    assert.equal(normalizeAssignee('SPOUSE'), 'Spouse');
    assert.equal(normalizeAssignee('professional'), 'Professional');
  });
  it('defaults unknown values to Me', () => {
    assert.equal(normalizeAssignee('Unknown'), 'Me');
    assert.equal(normalizeAssignee(''), 'Me');
  });
  it('defaults null and undefined to Me', () => {
    assert.equal(normalizeAssignee(null), 'Me');
    assert.equal(normalizeAssignee(undefined), 'Me');
  });
});

describe('normalizeTags', () => {
  it('keeps valid tags', () => {
    const result = normalizeTags(['quick-win', 'safety']);
    assert.deepEqual(result, ['quick-win', 'safety']);
  });
  it('filters unknown tags', () => {
    const result = normalizeTags(['quick-win', 'unknown-tag']);
    assert.deepEqual(result, ['quick-win']);
  });
  it('deduplicates tags', () => {
    const result = normalizeTags(['quick-win', 'quick-win']);
    assert.deepEqual(result, ['quick-win']);
  });
  it('lowercases input tags before matching', () => {
    const result = normalizeTags(['QUICK-WIN']);
    assert.deepEqual(result, ['quick-win']);
  });
  it('returns empty array for non-array input', () => {
    assert.deepEqual(normalizeTags('quick-win'), []);
    assert.deepEqual(normalizeTags(null), []);
    assert.deepEqual(normalizeTags(undefined), []);
  });
  it('returns empty array for empty input', () => {
    assert.deepEqual(normalizeTags([]), []);
  });
});

describe('parseTimeHHMM', () => {
  it('accepts valid times', () => {
    assert.equal(parseTimeHHMM('18:00'), '18:00');
    assert.equal(parseTimeHHMM('09:05'), '09:05');
    assert.equal(parseTimeHHMM('00:00'), '00:00');
    assert.equal(parseTimeHHMM('23:59'), '23:59');
  });
  it('rejects invalid hour 25', () => assert.equal(parseTimeHHMM('25:00'), null));
  it('rejects invalid minute 60', () => assert.equal(parseTimeHHMM('18:60'), null));
  it('rejects non-zero-padded hour', () => assert.equal(parseTimeHHMM('9:00'), null));
  it('rejects non-time strings', () => assert.equal(parseTimeHHMM('abc'), null));
  it('rejects empty string', () => assert.equal(parseTimeHHMM(''), null));
});

describe('parseDurationMinutes', () => {
  it('accepts boundary values', () => {
    assert.equal(parseDurationMinutes(15), 15);
    assert.equal(parseDurationMinutes(480), 480);
    assert.equal(parseDurationMinutes(60), 60);
  });
  it('rejects below minimum of 15', () => assert.equal(parseDurationMinutes(14), null));
  it('rejects above maximum of 480', () => assert.equal(parseDurationMinutes(481), null));
  it('rejects floats', () => assert.equal(parseDurationMinutes(15.5), null));
  it('accepts numeric strings that coerce to valid integers', () => assert.equal(parseDurationMinutes('60'), 60));
});

describe('parseTimezone', () => {
  it('accepts valid IANA timezones', () => {
    assert.equal(parseTimezone('Asia/Kolkata'), 'Asia/Kolkata');
    assert.equal(parseTimezone('Europe/London'), 'Europe/London');
    assert.equal(parseTimezone('UTC'), 'UTC');
    assert.equal(parseTimezone('America/New_York'), 'America/New_York');
  });
  it('rejects invalid timezones', () => {
    assert.equal(parseTimezone('Fake/Zone'), null);
    assert.equal(parseTimezone('not-a-timezone'), null);
  });
  it('rejects empty and whitespace-only strings', () => {
    assert.equal(parseTimezone(''), null);
    assert.equal(parseTimezone('   '), null);
  });
  it('rejects null', () => assert.equal(parseTimezone(null), null));
  it('trims surrounding whitespace', () => {
    assert.equal(parseTimezone('  Asia/Kolkata  '), 'Asia/Kolkata');
  });
});

describe('stripCodeFences', () => {
  it('removes ```json header and closing ```', () => {
    const input = '```json\n{"key": "value"}\n```';
    assert.equal(stripCodeFences(input), '{"key": "value"}');
  });
  it('removes bare ``` fences', () => {
    assert.equal(stripCodeFences('```\n{"key": "val"}\n```'), '{"key": "val"}');
  });
  it('trims surrounding whitespace', () => {
    assert.equal(stripCodeFences('  {"a":1}  '), '{"a":1}');
  });
  it('leaves plain text unchanged after trimming', () => {
    assert.equal(stripCodeFences('hello'), 'hello');
  });
});

describe('safeParseJsonObject', () => {
  it('parses a valid JSON object', () => {
    const result = safeParseJsonObject('{"key": "value", "num": 42}');
    assert.deepEqual(result, { key: 'value', num: 42 });
  });
  it('parses JSON wrapped in code fences', () => {
    const result = safeParseJsonObject('```json\n{"key": "value"}\n```');
    assert.deepEqual(result, { key: 'value' });
  });
  it('returns null for JSON arrays', () => {
    assert.equal(safeParseJsonObject('[1,2,3]'), null);
  });
  it('returns null for string primitives', () => {
    assert.equal(safeParseJsonObject('"string"'), null);
  });
  it('returns null for invalid JSON', () => {
    assert.equal(safeParseJsonObject('{invalid json}'), null);
  });
  it('returns null for JSON null literal', () => {
    assert.equal(safeParseJsonObject('null'), null);
  });
});
