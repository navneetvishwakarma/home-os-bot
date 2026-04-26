const { CRITICALITY_ORDER } = require("../constants");

function sortByPriority(tasks) {
  return [...tasks].sort((a, b) => {
    const diff = CRITICALITY_ORDER[a.criticality] - CRITICALITY_ORDER[b.criticality];
    if (diff !== 0) return diff;
    return a.effortMins - b.effortMins;
  });
}

function buildQueue(tasks, durationMins) {
  const sorted = sortByPriority(tasks);
  const selected = [];
  let used = 0;

  const criticalAndHigh = sorted.filter((task) => ["CRITICAL", "HIGH"].includes(task.criticality));
  const quickWins = sorted.filter(
    (task) =>
      ["MEDIUM", "LOW"].includes(task.criticality) && Array.isArray(task.tags) && task.tags.includes("quick-win")
  );

  for (const task of [...criticalAndHigh, ...quickWins]) {
    if (selected.some((item) => item.id === task.id)) continue;
    if (used + task.effortMins > durationMins) continue;
    selected.push(task);
    used += task.effortMins;
  }

  return {
    tasks: selected,
    totalMins: used,
    bufferMins: Math.max(0, durationMins - used)
  };
}

module.exports = {
  buildQueue
};
