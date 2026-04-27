const { upsertUser, getMembership, getHousehold } = require("../services/supabase");

const ONBOARDING_COMMANDS = ["/create", "/join", "/start"];

const ONBOARDING_MESSAGE =
  "👋 Welcome to Home OS!\n\n" +
  "You're not in a household yet.\n" +
  "• /create My Family — start a new household (you'll be admin)\n" +
  "• /join <code>      — join an existing one with an invite code";

function isOnboardingCommand(text) {
  if (!text) return false;
  const lower = text.trim().toLowerCase();
  return ONBOARDING_COMMANDS.some((cmd) => lower.startsWith(cmd));
}

async function householdMiddleware(ctx, next) {
  if (!ctx.from) return next();

  const telegramId = String(ctx.from.id);
  const telegramUsername = ctx.from.username || null;
  const displayName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || null;

  const user = await upsertUser(telegramId, telegramUsername, displayName);
  ctx.householdUser = { id: user.id, telegramId: user.telegram_id, displayName: user.display_name };

  const membership = await getMembership(user.id);

  if (!membership) {
    const messageText = ctx.message?.text || ctx.callbackQuery?.data || "";
    if (isOnboardingCommand(messageText)) {
      return next();
    }
    await ctx.reply(ONBOARDING_MESSAGE);
    return;
  }

  const household = await getHousehold(membership.household_id);
  ctx.household = { id: household.id, name: household.name };
  ctx.memberRole = membership.role;

  return next();
}

module.exports = { householdMiddleware };
