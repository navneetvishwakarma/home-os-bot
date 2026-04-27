function requireMember(handler) {
  return async (ctx) => {
    if (!ctx.household) return;
    return handler(ctx);
  };
}

function requireAdmin(handler) {
  return async (ctx) => {
    if (!ctx.household) return;
    if (ctx.memberRole !== "admin") {
      await ctx.reply("⛔ This command requires admin access.");
      return;
    }
    return handler(ctx);
  };
}

module.exports = { requireMember, requireAdmin };
