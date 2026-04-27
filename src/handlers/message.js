const { classifyTask } = require("../services/gemini");
const { addArea, createTask, getAreas } = require("../services/supabase");
const { formatTaskCard } = require("../utils/formatters");
const { error } = require("../utils/logger");
const { handleCorrection } = require("./correction");
const { getSession, setRecentTask, startSession } = require("./correction-session");
const { handleCompletionReply } = require("./complete");
const { isCompletionWindowActive } = require("./queue-session");

async function handleMessage(ctx) {
  if (!ctx.household) return;

  const userId = ctx.householdUser.telegramId;

  const existingCorrection = getSession(ctx.chat.id, ctx.from.id);
  if (existingCorrection) {
    return handleCorrection(ctx, existingCorrection);
  }

  if (isCompletionWindowActive(userId)) {
    const handled = await handleCompletionReply(ctx);
    if (handled) return;
  }

  const incoming = String(ctx.message.text || "").trim();
  if (!incoming) return;
  if (incoming.startsWith("/")) return;

  if (["correct", "fix this"].includes(incoming.toLowerCase())) {
    const started = startSession(ctx.chat.id, ctx.from.id);
    if (!started) {
      await ctx.reply("No recent task found to correct yet.");
      return;
    }
    await ctx.reply('Reply with the correction text, for example: "make it HIGH".');
    return;
  }

  try {
    const areas = await getAreas(ctx.household.id);
    const task = await classifyTask(incoming, areas);
    const taskId = await createTask(ctx.household.id, {
      ...task,
      rawInput: incoming,
      addedBy: userId
    });

    if (task.isNewArea) {
      await addArea(ctx.household.id, task.area);
      await ctx.reply(`🆕 Added "${task.area}" as a new area.`);
    }

    await ctx.reply(`🏠 ${ctx.household.name}\n\n${formatTaskCard({ ...task, id: taskId })}`);
    setRecentTask(ctx.chat.id, ctx.from.id, { ...task, id: taskId });
  } catch (err) {
    error("task_capture_failed", { message: err.message, userId, householdId: ctx.household.id });
    await ctx.reply("⚠️ Something went wrong. Try rephrasing?");
  }
}

module.exports = {
  handleMessage
};
