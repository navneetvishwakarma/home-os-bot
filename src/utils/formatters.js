function formatTaskCard(task) {
  const tags = task.tags && task.tags.length ? task.tags.map((tag) => `#${tag}`).join(" ") : "None";
  const deadlineLine = task.deadline ? `\n📅 Deadline: ${task.deadline}` : "";
  const recurrenceLine =
    task.isRecurring && task.recurrenceIntervalDays
      ? `\n🔁 Repeats every ${task.recurrenceIntervalDays} day(s)`
      : "";
  return [
    "✅ Task Added!",
    "",
    `📝 ${task.title}`,
    `📍 Area: ${task.area}`,
    `🔖 ${task.criticality}`,
    `⏱ Effort: ~${task.effortMins} mins`,
    `👤 Assigned: ${task.assignedTo}`,
    `🏷 Tags: ${tags}${deadlineLine}${recurrenceLine}`,
    "",
    `↳ ${task.reasoning || "Captured successfully."}`,
    "",
    '↩ Wrong? Reply "correct" to fix it.'
  ].join("\n");
}

function formatTaskChanges(existing, patch) {
  const changed = Object.keys(patch);
  const lines = ["✅ Task Updated!", ""];

  for (const key of changed) {
    lines.push(`• ${key}: ${existing[key] ?? "(empty)"} → ${patch[key]}`);
  }

  return lines.join("\n");
}

function formatQueueMessage(queueTasks, durationMins, timeLabel) {
  if (!queueTasks.length) {
    return "📋 No pending tasks for today. You're all clear.";
  }

  const total = queueTasks.reduce((sum, task) => sum + task.effortMins, 0);
  const lines = [`📋 Today's ${durationMins}-Minute Queue`, ""];

  queueTasks.forEach((task, index) => {
    lines.push(`${index + 1}. [${task.criticality}] ${task.title} (~${task.effortMins}m)`);
  });

  lines.push("", `Total: ${total} mins · ${Math.max(0, durationMins - total)} mins buffer`, "");
  lines.push(`📅 Add to Google Calendar at ${timeLabel}`);
  return lines.join("\n");
}

module.exports = {
  formatTaskCard,
  formatTaskChanges,
  formatQueueMessage
};
