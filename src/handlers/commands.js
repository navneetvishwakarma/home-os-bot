const { buildQueue } = require("../services/queue-builder");
const { buildGCalUrl } = require("../services/calendar");
const {
  addArea,
  getAreas,
  getIncompleteTasksByPriority,
  getSettings,
  removeArea,
  updateSettings
} = require("../services/supabase");
const { formatQueueMessage } = require("../utils/formatters");
const { parseDurationMinutes, parseTimeHHMM } = require("../utils/validators");
const { config } = require("../config");

function isAuthorised(ctx) {
  return config.authorisedIds.has(String(ctx.from.id));
}

function guard(handler) {
  return async (ctx) => {
    if (!isAuthorised(ctx)) return;
    return handler(ctx);
  };
}

async function registerCommands(bot) {
  bot.command("areas", guard(async (ctx) => {
    const areas = await getAreas();
    await ctx.reply(`📍 Areas:\n- ${areas.join("\n- ")}`);
  }));

  bot.command("addarea", guard(async (ctx) => {
    const name = ctx.message.text.replace("/addarea", "").trim();
    if (!name) return ctx.reply("Usage: /addarea <name>");
    await addArea(name);
    return ctx.reply(`✅ Added area: ${name}`);
  }));

  bot.command("removearea", guard(async (ctx) => {
    const name = ctx.message.text.replace("/removearea", "").trim();
    if (!name) return ctx.reply("Usage: /removearea <name>");
    await removeArea(name);
    return ctx.reply(`✅ Removed area: ${name}`);
  }));

  bot.command("queue", guard(async (ctx) => {
    const tasks = await getIncompleteTasksByPriority();
    const settings = await getSettings();
    const queue = buildQueue(tasks, settings.calendarDuration);
    const url = buildGCalUrl(queue.tasks, settings);
    const message = formatQueueMessage(queue.tasks, settings.calendarDuration, settings.calendarTime);
    await ctx.reply(`${message}\n→ ${url}`);
  }));

  bot.command("pending", guard(async (ctx) => {
    const tasks = await getIncompleteTasksByPriority();
    if (!tasks.length) return ctx.reply("No pending tasks.");
    const lines = ["🧾 Pending tasks", ""];
    for (const task of tasks) lines.push(`• [${task.criticality}] ${task.title} (~${task.effortMins}m)`);
    return ctx.reply(lines.join("\n"));
  }));

  bot.command("settings", guard(async (ctx) => {
    const settings = await getSettings();
    await ctx.reply(`⚙️ Time: ${settings.calendarTime}\n⏱ Duration: ${settings.calendarDuration} mins`);
  }));

  bot.command("settime", guard(async (ctx) => {
    const value = ctx.message.text.replace("/settime", "").trim();
    const parsed = parseTimeHHMM(value);
    if (!parsed) return ctx.reply("Usage: /settime HH:MM");
    await updateSettings({ calendarTime: parsed });
    await ctx.reply(`✅ Calendar time updated to ${parsed}`);
  }));

  bot.command("setduration", guard(async (ctx) => {
    const value = ctx.message.text.replace("/setduration", "").trim();
    const parsed = parseDurationMinutes(value);
    if (!parsed) return ctx.reply("Usage: /setduration <15-480>");
    await updateSettings({ calendarDuration: parsed });
    await ctx.reply(`✅ Calendar duration updated to ${parsed} mins`);
  }));

  bot.command("help", guard(async (ctx) => {
    await ctx.reply(
      [
        "Commands:",
        "/areas",
        "/addarea <name>",
        "/removearea <name>",
        "/queue",
        "/pending",
        "/settings",
        "/settime HH:MM",
        "/setduration <mins>",
        "/help"
      ].join("\n")
    );
  }));
}

module.exports = {
  registerCommands
};
