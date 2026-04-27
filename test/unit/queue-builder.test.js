'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildQueue } = require('../../src/services/queue-builder');

function makeTask(id, criticality, effortMins, tags = []) {
  return { id, criticality, effortMins, tags, title: `Task ${id}` };
}

describe('buildQueue', () => {
  it('returns empty result for empty task list', () => {
    const result = buildQueue([], 60);
    assert.deepEqual(result.tasks, []);
    assert.equal(result.totalMins, 0);
    assert.equal(result.bufferMins, 60);
  });

  it('includes CRITICAL tasks within duration', () => {
    const tasks = [makeTask('a', 'CRITICAL', 30)];
    const result = buildQueue(tasks, 60);
    assert.equal(result.tasks.length, 1);
    assert.equal(result.tasks[0].id, 'a');
    assert.equal(result.totalMins, 30);
    assert.equal(result.bufferMins, 30);
  });

  it('includes HIGH tasks within duration', () => {
    const tasks = [makeTask('a', 'HIGH', 30)];
    const result = buildQueue(tasks, 60);
    assert.equal(result.tasks.length, 1);
  });

  it('includes MEDIUM task only when tagged quick-win', () => {
    const withQuickWin = makeTask('a', 'MEDIUM', 20, ['quick-win']);
    const without = makeTask('b', 'MEDIUM', 20, []);
    const result = buildQueue([withQuickWin, without], 60);
    assert.equal(result.tasks.length, 1);
    assert.equal(result.tasks[0].id, 'a');
  });

  it('includes LOW task only when tagged quick-win', () => {
    const withQuickWin = makeTask('a', 'LOW', 15, ['quick-win']);
    const result = buildQueue([withQuickWin], 60);
    assert.equal(result.tasks.length, 1);
  });

  it('skips tasks that would exceed duration', () => {
    const tasks = [makeTask('a', 'CRITICAL', 50), makeTask('b', 'HIGH', 30)];
    const result = buildQueue(tasks, 60);
    assert.equal(result.tasks.length, 1);
    assert.equal(result.tasks[0].id, 'a');
  });

  it('prioritises CRITICAL before HIGH', () => {
    const tasks = [makeTask('high', 'HIGH', 30), makeTask('crit', 'CRITICAL', 30)];
    const result = buildQueue(tasks, 60);
    assert.equal(result.tasks[0].id, 'crit');
    assert.equal(result.tasks[1].id, 'high');
  });

  it('prioritises HIGH before MEDIUM quick-win', () => {
    const tasks = [
      makeTask('med', 'MEDIUM', 15, ['quick-win']),
      makeTask('high', 'HIGH', 15)
    ];
    const result = buildQueue(tasks, 60);
    assert.equal(result.tasks[0].id, 'high');
  });

  it('tie-breaks within same criticality by lower effortMins first', () => {
    const tasks = [makeTask('big', 'HIGH', 50), makeTask('small', 'HIGH', 20)];
    const result = buildQueue(tasks, 60);
    assert.equal(result.tasks[0].id, 'small');
  });

  it('does not include the same task twice', () => {
    const task = makeTask('a', 'CRITICAL', 20);
    const result = buildQueue([task, task], 60);
    const ids = result.tasks.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('totalMins never exceeds duration', () => {
    const tasks = [
      makeTask('a', 'CRITICAL', 40),
      makeTask('b', 'CRITICAL', 40),
      makeTask('c', 'HIGH', 40)
    ];
    const result = buildQueue(tasks, 60);
    assert.ok(result.totalMins <= 60);
  });

  it('bufferMins is max(0, duration - totalMins)', () => {
    const tasks = [makeTask('a', 'CRITICAL', 55)];
    const result = buildQueue(tasks, 60);
    assert.equal(result.bufferMins, 5);
  });
});
