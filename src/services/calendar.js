function formatCalendarDate(date) {
  return date.toISOString().replace(/[-:]|\.\d{3}/g, "");
}

function buildGCalUrl(queueTasks, settings) {
  const now = new Date();
  const [hour, minute] = settings.calendarTime.split(":").map(Number);
  const start = new Date(now);
  start.setHours(hour, minute, 0, 0);
  const end = new Date(start.getTime() + settings.calendarDuration * 60 * 1000);

  const title = `🏠 Home OS — ${queueTasks.length} tasks`;
  const details = queueTasks
    .map((task, index) => `${index + 1}. [${task.criticality}] ${task.title} (~${task.effortMins}m)`)
    .join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${formatCalendarDate(start)}/${formatCalendarDate(end)}`,
    details
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

module.exports = {
  buildGCalUrl
};
