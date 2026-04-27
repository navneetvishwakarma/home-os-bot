const { correctTask } = require("../services/gemini");
const { updateTask } = require("../services/supabase");
const { formatTaskChanges } = require("../utils/formatters");
const { clearSession } = require("./correction-session");
const { generateWittyReply } = require("../services/witty-response");

async function handleCorrection(ctx, session) {
  const correctionText = ctx.message.text.trim();
  const patch = await correctTask(session.task, correctionText);
  await updateTask(session.task.id, patch);
  clearSession(ctx.chat.id, ctx.from.id);
  const changes = formatTaskChanges(session.task, patch);
  const witty = await generateWittyReply('task_corrected', { title: session.task.title });
  await ctx.reply(witty ? `${changes}\n\n${witty}` : changes);
}

module.exports = {
  handleCorrection
};
