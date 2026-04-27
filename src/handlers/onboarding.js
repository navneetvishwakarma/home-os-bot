const { createHousehold, consumeInviteCode } = require("../services/supabase");

function registerOnboardingCommands(bot) {
  bot.command("start", async (ctx) => {
    if (ctx.household) {
      await ctx.reply(`👋 You're in "${ctx.household.name}". Use /help to see what you can do.`);
      return;
    }
    await ctx.reply(
      "👋 Welcome to Home OS!\n\n" +
      "You're not in a household yet.\n" +
      "• /create My Family — start a new household (you'll be admin)\n" +
      "• /join <code>      — join an existing one with an invite code"
    );
  });

  bot.command("create", async (ctx) => {
    if (ctx.household) {
      await ctx.reply(`⚠️ You're already in "${ctx.household.name}". Use /leavehousehold first to create a new one.`);
      return;
    }

    const name = ctx.message.text.replace(/^\/create\s*/i, "").trim();
    if (!name) return ctx.reply("Usage: /create <household name>\nExample: /create The Smith House");

    if (name.length > 60) return ctx.reply("❌ Household name must be 60 characters or fewer.");

    const household = await createHousehold(name, ctx.householdUser.id);
    await ctx.reply(
      `🏠 "${household.name}" created! You're the admin.\n\n` +
      "Default areas and settings are ready.\n" +
      "Invite your family: /invite"
    );
  });

  bot.command("join", async (ctx) => {
    if (ctx.household) {
      await ctx.reply(`⚠️ You're already in "${ctx.household.name}". Use /leavehousehold first to join a different one.`);
      return;
    }

    const code = ctx.message.text.replace(/^\/join\s*/i, "").trim().toUpperCase();
    if (!code) return ctx.reply("Usage: /join <invite-code>\nExample: /join K7XP2MNQ");

    const result = await consumeInviteCode(code, ctx.householdUser.id);

    if (result === null) {
      return ctx.reply(
        "❌ That invite code is invalid or has expired.\n" +
        "Ask your household admin to run /invite and share a fresh code."
      );
    }

    if (result === "already_member") {
      return ctx.reply(
        "⚠️ You're already in a household.\n" +
        "Use /leavehousehold first if you want to switch."
      );
    }

    await ctx.reply(
      `🏠 You've joined "${result.householdName}"! Welcome.\n\n` +
      "Type naturally to add tasks, or use /help for all commands."
    );
  });
}

module.exports = { registerOnboardingCommands };
