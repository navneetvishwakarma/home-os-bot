'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { formatTaskCard, formatTaskChanges, formatQueueMessage } = require('../../src/utils/formatters');

const BASE_TASK = {
  title: 'Fix leaky tap',
  area: 'Kitchen',
  criticality: 'HIGH',
  effortMins: 30,
  assignedTo: 'Me',
  tags: ['quick-win'],
  reasoning: 'Water is dripping steadily.',
  deadline: null,
  isRecurring: false,
  recurrenceIntervalDays: null
};

describe('formatTaskCard', () => {
  it('includes all core fields', () => {
    const card = formatTaskCard(BASE_TASK);
    assert.ok(card.includes('Fix leaky tap'));
    assert.ok(card.includes('Kitchen'));
    assert.ok(card.includes('HIGH'));
    assert.ok(card.includes('30 mins'));
    assert.ok(card.includes('Me'));
    assert.ok(card.includes('#quick-win'));
    assert.ok(card.includes('Water is dripping steadily.'));
  });

  it('shows "None" when tags array is empty', () => {
    const card = formatTaskCard({ ...BASE_TASK, tags: [] });
    assert.ok(card.includes('Tags: None'));
  });

  it('shows "None" when tags is null', () => {
    const card = formatTaskCard({ ...BASE_TASK, tags: null });
    assert.ok(card.includes('Tags: None'));
  });

  it('includes deadline line when deadline is set', () => {
    const card = formatTaskCard({ ...BASE_TASK, deadline: '2025-06-01' });
    assert.ok(card.includes('Deadline: 2025-06-01'));
  });

  it('omits deadline line when deadline is null', () => {
    const card = formatTaskCard(BASE_TASK);
    assert.ok(!card.includes('Deadline'));
  });

  it('includes recurrence line when isRecurring with interval', () => {
    const card = formatTaskCard({ ...BASE_TASK, isRecurring: true, recurrenceIntervalDays: 7 });
    assert.ok(card.includes('Repeats every 7 day(s)'));
  });

  it('omits recurrence line when not recurring', () => {
    const card = formatTaskCard(BASE_TASK);
    assert.ok(!card.includes('Repeats'));
  });

  it('uses fallback reasoning text when reasoning is absent', () => {
    const card = formatTaskCard({ ...BASE_TASK, reasoning: '' });
    assert.ok(card.includes('Captured successfully.'));
  });

  it('includes correction prompt at the bottom', () => {
    const card = formatTaskCard(BASE_TASK);
    assert.ok(card.includes('correct'));
  });
});

describe('formatTaskChanges', () => {
  it('shows changed fields with before and after values', () => {
    const existing = { criticality: 'LOW', effortMins: 20 };
    const patch = { criticality: 'HIGH', effortMins: 45 };
    const result = formatTaskChanges(existing, patch);
    assert.ok(result.includes('criticality'));
    assert.ok(result.includes('LOW'));
    assert.ok(result.includes('HIGH'));
    assert.ok(result.includes('effortMins'));
    assert.ok(result.includes('20'));
    assert.ok(result.includes('45'));
  });

  it('shows "(empty)" when existing value is null', () => {
    const existing = { deadline: null };
    const patch = { deadline: '2025-12-01' };
    const result = formatTaskChanges(existing, patch);
    assert.ok(result.includes('(empty)'));
    assert.ok(result.includes('2025-12-01'));
  });

  it('includes update header', () => {
    const result = formatTaskChanges({ criticality: 'LOW' }, { criticality: 'HIGH' });
    assert.ok(result.includes('Task Updated'));
  });
});

describe('formatQueueMessage', () => {
  it('returns no-tasks message for empty queue', () => {
    const result = formatQueueMessage([], 60, '18:00');
    assert.ok(result.includes('No pending tasks'));
  });

  it('lists tasks with index, criticality, title, and effort', () => {
    const tasks = [
      { criticality: 'HIGH', title: 'Fix tap', effortMins: 30 },
      { criticality: 'MEDIUM', title: 'Mow lawn', effortMins: 25 }
    ];
    const result = formatQueueMessage(tasks, 60, '18:00');
    assert.ok(result.includes('1.'));
    assert.ok(result.includes('HIGH'));
    assert.ok(result.includes('Fix tap'));
    assert.ok(result.includes('30m'));
    assert.ok(result.includes('2.'));
    assert.ok(result.includes('Mow lawn'));
  });

  it('shows correct total and buffer minutes', () => {
    const tasks = [
      { criticality: 'HIGH', title: 'Task A', effortMins: 20 },
      { criticality: 'HIGH', title: 'Task B', effortMins: 15 }
    ];
    const result = formatQueueMessage(tasks, 60, '18:00');
    assert.ok(result.includes('35 mins'));
    assert.ok(result.includes('25 mins buffer'));
  });

  it('includes the calendar time label', () => {
    const tasks = [{ criticality: 'HIGH', title: 'Task A', effortMins: 20 }];
    const result = formatQueueMessage(tasks, 60, '19:30');
    assert.ok(result.includes('19:30'));
  });

  it('includes the duration in the header', () => {
    const tasks = [{ criticality: 'HIGH', title: 'Task A', effortMins: 20 }];
    const result = formatQueueMessage(tasks, 90, '18:00');
    assert.ok(result.includes('90-Minute'));
  });
});
