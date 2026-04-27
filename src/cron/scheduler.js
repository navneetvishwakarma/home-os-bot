const cron = require("node-cron");
const { buildGCalUrl } = require("../services/calendar");
const { buildQueue } = require("../services/queue-builder");
const {
  getAllHouseholdsWithSettings,
  getHouseholdMembers,
  getIncompleteTasksByPriority,
  getSettings,
  getHousehold
} = require("../services/supabase");
const { formatQueueMessage } = require("../utils/formatters");
const { info, error } = require("../utils/logger");
const { config } = require("../config");
const { setQueuedTasks, startCompletionWindow } = require("../handlers/queue-session");

// householdId → { queueJob, completionJob }
const jobs = new Map();

function addMinutesToTime(timeHHMM, minsToAdd) {
  const [hour, minute] = timeHHMM.split(":").map(Number);
  const total = hour * 60 + minute + minsToAdd;
  const normalized = ((total % 1440) + 1440) % 1440;
  return { hour: Math.floor(normalized / 60), minute: normalized % 60 };
}

function stopHouseholdJobs(householdId) {
  const existing = jobs.get(householdId);
  if (existing) {
    existing.queueJob.stop();
    existing.completionJob.stop();
    jobs.delete(householdId);
  }
}

function scheduleForHousehold(bot, household) {
  // household = { id, name, settings: { calendarTime, calendarDuration, timezone } }
  stopHouseholdJobs(household.id);

  const { calendarTime, calendarDuration, timezone } = household.settings;
  const [hour, minute] = calendarTime.split(":").map(Number);
  const completionTime = addMinutesToTime(
    calendarTime,
    calendarDuration + config.completionPromptDelayMins
  );

  const queueJob = cron.schedule(
    `${minute} ${hour} * * *`,
    async () => {
      try {
        const [tasks, members, settings] = await Promise.all([
          getIncompleteTasksByPriority(household.id),
          getHouseholdMembers(household.id),
          getSettings(household.id)
        ]);
        const queue = buildQueue(tasks, settings.calendarDuration);
        const message = formatQueueMessage(queue.tasks, settings.calendarDuration, settings.calendarTime);
        const calendarUrl = buildGCalUrl(queue.tasks, settings);

        for (const member of members) {
          setQueuedTasks(member.telegramId, queue.tasks);
          await bot.telegram.sendMessage(member.telegramId, `🏠 ${household.name}\n\n${message}\n→ ${calendarUrl}`);
        }
        info("queue_posted", {
          householdId: household.id,
          count: queue.tasks.length,
          totalMins: queue.totalMins,
          audienceCount: members.length
        });
      } catch (err) {
        error("queue_post_failed", { householdId: household.id, message: err.message });
      }
    },
    { timezone }
  );

  const completionJob = cron.schedule(
    `${completionTime.minute} ${completionTime.hour} * * *`,
    async () => {
      try {
        const members = await getHouseholdMembers(household.id);
        for (const member of members) {
          startCompletionWindow(member.telegramId);
          await bot.telegram.sendMessage(
            member.telegramId,
            "⏰ Your block just ended. Done? Reply yes / skip <task> / no"
          );
        }
        info("completion_prompt_sent", { householdId: household.id, audienceCount: members.length });
      } catch (err) {
        error("completion_prompt_failed", { householdId: household.id, message: err.message });
      }
    },
    { timezone }
  );

  jobs.set(household.id, { queueJob, completionJob });
}

async function startScheduler(bot) {
  try {
    const allHouseholds = await getAllHouseholdsWithSettings();
    for (const household of allHouseholds) {
      scheduleForHousehold(bot, household);
    }
    info("scheduler_started", { householdCount: allHouseholds.length });
  } catch (err) {
    error("scheduler_init_failed", { message: err.message });
  }
}

async function refreshScheduleForHousehold(bot, householdId) {
  const [household, settings] = await Promise.all([
    getHousehold(householdId),
    getSettings(householdId)
  ]);
  scheduleForHousehold(bot, { id: householdId, name: household.name, settings });
}

module.exports = {
  startScheduler,
  refreshScheduleForHousehold
};
