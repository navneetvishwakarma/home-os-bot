const { bulkComplete } = require("../services/supabase");
const { endCompletionWindow, getQueuedTasks } = require("./queue-session");

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

async function handleCompletionReply(ctx) {
  const text = normalizeText(ctx.message.text);
  const queued = getQueuedTasks(ctx.chat.id);
  if (!queued.length) return false;

  if (["yes", "done", "all done"].includes(text)) {
    const count = await bulkComplete(queued.map((task) => task.id));
    endCompletionWindow(ctx.chat.id);
    await ctx.reply(`✅ Marked ${count} tasks as complete.`);
    return true;
  }

  if (text.startsWith("skip ")) {
    const query = text.replace("skip ", "").trim();
    const skipTask = queued.find((task) => task.title.toLowerCase().includes(query));
    const ids = queued.filter((task) => !skipTask || task.id !== skipTask.id).map((task) => task.id);
    const count = await bulkComplete(ids);
    endCompletionWindow(ctx.chat.id);
    await ctx.reply(`✅ Completed ${count} tasks. Skipped ${skipTask ? skipTask.title : "none"}.`);
    return true;
  }

  if (text === "no") {
    await ctx.reply("Which ones did you finish? Reply with task names separated by commas.");
    return true;
  }

  const matches = queued.filter((task) => text.includes(task.title.toLowerCase()));
  if (matches.length > 0) {
    const count = await bulkComplete(matches.map((task) => task.id));
    endCompletionWindow(ctx.chat.id);
    await ctx.reply(`✅ Marked ${count} selected tasks complete.`);
    return true;
  }

  return false;
}

module.exports = {
  handleCompletionReply
};
