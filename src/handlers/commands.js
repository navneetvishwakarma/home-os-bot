const { buildQueue } = require("../services/queue-builder");
const { buildGCalUrl } = require("../services/calendar");
const {
  addArea,
  bulkComplete,
  deleteTask,
  getAreas,
  getHouseholdMembers,
  getIncompleteTasksByPriority,
  getMembership,
  getSettings,
  removeArea,
  updateSettings
} = require("../services/supabase");
const { refreshScheduleForHousehold } = require("../cron/scheduler");
const { requireAdmin, requireMember } = require("../middleware/guards");
const { formatQueueMessage } = require("../utils/formatters");
const { parseDurationMinutes, parseTimeHHMM, parseTimezone } = require("../utils/validators");
const { error } = require("../utils/logger");

function householdHeader(name) {
  return `🏠 ${name}\n\n`;
}

function findTaskByQuery(tasks, query) {
  const n = parseInt(query, 10);
  if (Number.isInteger(n) && n >= 1 && n <= tasks.length) return tasks[n - 1];
  const lower = query.toLowerCase();
  return tasks.find((t) => t.title.toLowerCase().includes(lower)) || null;
}

async function registerCommands(bot) {
  bot.command("myhousehold", requireMember(async (ctx) => {
    const [membership, members] = await Promise.all([
      getMembership(ctx.householdUser.id),
      getHouseholdMembers(ctx.household.id)
    ]);
    const joinedDate = new Date(membership.joined_at).toISOString().slice(0, 10);
    await ctx.reply(
      `🏠 ${ctx.household.name}\n` +
      `Your role: ${ctx.memberRole}\n` +
      `Members:   ${members.length}\n` +
      `Joined:    ${joinedDate}`
    );
  }));

  bot.command("areas", requireMember(async (ctx) => {
    const areas = await getAreas(ctx.household.id);
    if (!areas.length) return ctx.reply(`${householdHeader(ctx.household.name)}No areas yet. Add one with /addarea <name>.`);
    await ctx.reply(`${householdHeader(ctx.household.name)}📍 Areas:\n- ${areas.join("\n- ")}`);
  }));

  bot.command("addarea", requireMember(async (ctx) => {
    const name = ctx.message.text.replace(/^\/addarea\s*/i, "").trim();
    if (!name) return ctx.reply("Usage: /addarea <name>");
    await addArea(ctx.household.id, name);
    return ctx.reply(`✅ Added area: ${name}`);
  }));

  bot.command("removearea", requireMember(async (ctx) => {
    const name = ctx.message.text.replace(/^\/removearea\s*/i, "").trim();
    if (!name) return ctx.reply("Usage: /removearea <name>");
    await removeArea(ctx.household.id, name);
    return ctx.reply(`✅ Removed area: ${name}`);
  }));

  bot.command("queue", requireMember(async (ctx) => {
    const [tasks, settings] = await Promise.all([
      getIncompleteTasksByPriority(ctx.household.id),
      getSettings(ctx.household.id)
    ]);
    const queue = buildQueue(tasks, settings.calendarDuration);
    const url = buildGCalUrl(queue.tasks, settings);
    const message = formatQueueMessage(queue.tasks, settings.calendarDuration, settings.calendarTime);
    await ctx.reply(`${householdHeader(ctx.household.name)}${message}\n→ ${url}`);
  }));

  bot.command("pending", requireMember(async (ctx) => {
    const tasks = await getIncompleteTasksByPriority(ctx.household.id);
    if (!tasks.length) return ctx.reply(`${householdHeader(ctx.household.name)}No pending tasks.`);
    const lines = [`${householdHeader(ctx.household.name)}🧾 Pending tasks`, ""];
    tasks.forEach((task, i) => lines.push(`${i + 1}. [${task.criticality}] ${task.title} (~${task.effortMins}m)`));
    return ctx.reply(lines.join("\n"));
  }));

  bot.command("done", requireMember(async (ctx) => {
    const query = ctx.message.text.replace(/^\/done\s*/i, "").trim();
    if (!query) return ctx.reply("Usage: /done <number or task name>");
    const tasks = await getIncompleteTasksByPriority(ctx.household.id);
    const task = findTaskByQuery(tasks, query);
    if (!task) return ctx.reply("❌ Task not found. Use /pending to see the list.");
    await bulkComplete([task.id]);
    return ctx.reply(`✅ Marked done: ${task.title}`);
  }));

  bot.command("delete", requireMember(async (ctx) => {
    const query = ctx.message.text.replace(/^\/delete\s*/i, "").trim();
    if (!query) return ctx.reply("Usage: /delete <number or task name>");
    const tasks = await getIncompleteTasksByPriority(ctx.household.id);
    const task = findTaskByQuery(tasks, query);
    if (!task) return ctx.reply("❌ Task not found. Use /pending to see the list.");
    await deleteTask(task.id);
    return ctx.reply(`🗑️ Deleted: ${task.title}`);
  }));

  bot.command("settings", requireMember(async (ctx) => {
    const settings = await getSettings(ctx.household.id);
    await ctx.reply(
      `⚙️ ${ctx.household.name}\n` +
      `Time:     ${settings.calendarTime}\n` +
      `Duration: ${settings.calendarDuration} mins\n` +
      `Timezone: ${settings.timezone}`
    );
  }));

  bot.command("settime", requireAdmin(async (ctx) => {
    const value = ctx.message.text.replace(/^\/settime\s*/i, "").trim();
    const parsed = parseTimeHHMM(value);
    if (!parsed) return ctx.reply("Usage: /settime HH:MM");
    await updateSettings(ctx.household.id, { calendarTime: parsed });
    refreshScheduleForHousehold(bot, ctx.household.id).catch((err) =>
      error("scheduler_refresh_failed", { householdId: ctx.household.id, message: err.message })
    );
    await ctx.reply(`✅ Queue time set to ${parsed}`);
  }));

  bot.command("setduration", requireAdmin(async (ctx) => {
    const value = ctx.message.text.replace(/^\/setduration\s*/i, "").trim();
    const parsed = parseDurationMinutes(value);
    if (!parsed) return ctx.reply("Usage: /setduration <15-480>");
    await updateSettings(ctx.household.id, { calendarDuration: parsed });
    refreshScheduleForHousehold(bot, ctx.household.id).catch((err) =>
      error("scheduler_refresh_failed", { householdId: ctx.household.id, message: err.message })
    );
    await ctx.reply(`✅ Duration set to ${parsed} mins`);
  }));

  bot.command("settimezone", requireAdmin(async (ctx) => {
    const value = ctx.message.text.replace(/^\/settimezone\s*/i, "").trim();
    const tz = parseTimezone(value);
    if (!tz) return ctx.reply("❌ Invalid timezone. Use an IANA timezone name, e.g.:\n/settimezone Asia/Kolkata");
    await updateSettings(ctx.household.id, { timezone: tz });
    refreshScheduleForHousehold(bot, ctx.household.id).catch((err) =>
      error("scheduler_refresh_failed", { householdId: ctx.household.id, message: err.message })
    );
    await ctx.reply(`✅ Timezone set to ${tz}`);
  }));

  bot.command("help", requireMember(async (ctx) => {
    const isAdmin = ctx.memberRole === "admin";
    const lines = [
      `🏠 ${ctx.household.name}`,
      "",
      "Member commands:",
      "/myhousehold — show your household summary",
      "/areas — list areas",
      "/addarea <name> — add an area",
      "/removearea <name> — remove an area",
      "/queue — today's task queue",
      "/pending — all pending tasks (numbered)",
      "/done <number or name> — mark a task complete",
      "/delete <number or name> — delete a task",
      "/settings — show settings",
      "/leavehousehold — leave this household",
      "/help — this message"
    ];
    if (isAdmin) {
      lines.push(
        "",
        "Admin commands:",
        "/settime HH:MM — set daily queue time",
        "/setduration <mins> — set session duration (15–480)",
        "/settimezone <tz> — set timezone (e.g. Asia/Kolkata)",
        "/invite — generate a one-time invite code",
        "/members — list members and their roles",
        "/removemember <tg-id> — remove a member",
        "/promote <tg-id> — make a member an admin",
        "/demote <tg-id> — demote an admin to member"
      );
    }
    await ctx.reply(lines.join("\n"));
  }));
}

module.exports = {
  registerCommands
};
