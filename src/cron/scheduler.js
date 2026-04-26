const cron = require("node-cron");
const { buildGCalUrl } = require("../services/calendar");
const { buildQueue } = require("../services/queue-builder");
const { getIncompleteTasksByPriority, getSettings } = require("../services/supabase");
const { formatQueueMessage } = require("../utils/formatters");
const { info, error } = require("../utils/logger");
const { config } = require("../config");
const { setQueuedTasks, startCompletionWindow } = require("../handlers/queue-session");

function addMinutesToTime(timeHHMM, minsToAdd) {
  const [hour, minute] = timeHHMM.split(":").map(Number);
  const total = hour * 60 + minute + minsToAdd;
  const normalized = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return { hour: h, minute: m };
}

function startScheduler(bot) {
  let queueJob = null;
  let completionJob = null;

  async function scheduleFromSettings() {
    if (queueJob) queueJob.stop();
    if (completionJob) completionJob.stop();

    const settings = await getSettings();
    const [hour, minute] = settings.calendarTime.split(":").map(Number);
    const completionTime = addMinutesToTime(
      settings.calendarTime,
      settings.calendarDuration + config.completionPromptDelayMins
    );

    queueJob = cron.schedule(
      `${minute} ${hour} * * *`,
      async () => {
        try {
          const tasks = await getIncompleteTasksByPriority();
          const queue = buildQueue(tasks, settings.calendarDuration);
          const message = formatQueueMessage(queue.tasks, settings.calendarDuration, settings.calendarTime);
          const calendarUrl = buildGCalUrl(queue.tasks, settings);

          for (const chatId of config.authorisedIds) {
            setQueuedTasks(chatId, queue.tasks);
            await bot.telegram.sendMessage(chatId, `${message}\n→ ${calendarUrl}`);
          }
          info("queue_posted", {
            count: queue.tasks.length,
            totalMins: queue.totalMins,
            audienceCount: config.authorisedIds.size
          });
        } catch (err) {
          error("queue_post_failed", { message: err.message });
        }
      },
      { timezone: config.schedulerTimezone }
    );

    completionJob = cron.schedule(
      `${completionTime.minute} ${completionTime.hour} * * *`,
      async () => {
        try {
          for (const chatId of config.authorisedIds) {
            startCompletionWindow(chatId);
            await bot.telegram.sendMessage(
              chatId,
              '⏰ Your block just ended. Done? Reply yes / skip <task> / no'
            );
          }
          info("completion_prompt_sent", { audienceCount: config.authorisedIds.size });
        } catch (err) {
          error("completion_prompt_failed", { message: err.message });
        }
      },
      { timezone: config.schedulerTimezone }
    );
  }

  scheduleFromSettings().catch((err) => error("scheduler_init_failed", { message: err.message }));

  return {
    refreshSchedules: scheduleFromSettings
  };
}

module.exports = {
  startScheduler
};
