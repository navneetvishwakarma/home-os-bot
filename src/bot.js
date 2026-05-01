const { Telegraf } = require("telegraf");
const { config } = require("./config");
const { householdMiddleware } = require("./middleware/household");
const { registerOnboardingCommands } = require("./handlers/onboarding");
const { registerAdminCommands } = require("./handlers/admin");
const { registerCommands } = require("./handlers/commands");
const { handleMessage } = require("./handlers/message");
const { purgeExpiredSessions } = require("./handlers/correction-session");
const { startScheduler } = require("./cron/scheduler");
const { info, error } = require("./utils/logger");
const { initSentry } = require("./services/sentry");

initSentry();

const bot = new Telegraf(config.telegramBotToken);

// Resolve household context on every update before any handler runs
bot.use(householdMiddleware);

// Onboarding commands (/create, /join, /start) bypass the household guard in middleware
registerOnboardingCommands(bot);

// All remaining text messages: task capture, correction, completion
bot.on("text", async (ctx, next) => {
  try {
    if (String(ctx.message?.text || "").trim().startsWith("/")) {
      return next();
    }
    await handleMessage(ctx);
  } catch (err) {
    error("text_handler_failed", {
      message: err.message,
      userId: String(ctx.from?.id || ""),
      chatId: String(ctx.chat?.id || "")
    });
    await ctx.reply("⚠️ Something went wrong. Please try again.");
  } finally {
    purgeExpiredSessions();
  }
});

// Admin and member commands (both require household context via guards)
registerAdminCommands(bot);
registerCommands(bot)
  .then(async () => {
    await startScheduler(bot);
    return bot.launch();
  })
  .then(() => info("bot_started"))
  .catch((err) => {
    error("bot_start_failed", { message: err.message });
    process.exitCode = 1;
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
