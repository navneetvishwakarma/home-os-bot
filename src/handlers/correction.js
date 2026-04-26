const { correctTask } = require("../services/gemini");
const { updateTask } = require("../services/supabase");
const { formatTaskChanges } = require("../utils/formatters");
const { clearSession } = require("./correction-session");

async function handleCorrection(ctx, session) {
  const correctionText = ctx.message.text.trim();
  const patch = await correctTask(session.task, correctionText);
  await updateTask(session.task.id, patch);
  clearSession(ctx.chat.id, ctx.from.id);
  await ctx.reply(formatTaskChanges(session.task, patch));
}

module.exports = {
  handleCorrection
};
