const {
  createInviteCode,
  findUserByTelegramId,
  getAdminCount,
  getHouseholdMembers,
  removeMember,
  updateMemberRole
} = require("../services/supabase");
const { requireAdmin, requireMember } = require("../middleware/guards");
const { generateWittyReply } = require("../services/witty-response");

function formatJoinedDate(isoString) {
  return new Date(isoString).toISOString().slice(0, 10);
}

async function resolveTargetMember(ctx, telegramIdArg) {
  if (!telegramIdArg || !/^\d+$/.test(telegramIdArg)) {
    await ctx.reply("❌ Provide a valid Telegram user ID.\nGet IDs from /members.");
    return null;
  }

  const targetUser = await findUserByTelegramId(telegramIdArg);
  if (!targetUser) {
    await ctx.reply("❌ User not found. Make sure they have messaged the bot at least once.");
    return null;
  }

  const members = await getHouseholdMembers(ctx.household.id);
  const targetMember = members.find((m) => m.userId === targetUser.id);
  if (!targetMember) {
    await ctx.reply("❌ That user is not a member of your household.");
    return null;
  }

  return targetMember;
}

function registerAdminCommands(bot) {
  bot.command("invite", requireAdmin(async (ctx) => {
    const { code, expiresAt } = await createInviteCode(ctx.household.id, ctx.householdUser.id);
    const expiryDate = new Date(expiresAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
    const inviteBlock = `🔗 Invite code: ${code}\nExpires: ${expiryDate}\n\nShare this with your family member:\n→ /join ${code}`;
    const witty = await generateWittyReply('invite_generated', { code });
    await ctx.reply(witty ? `${inviteBlock}\n\n${witty}` : inviteBlock);
  }));

  bot.command("members", requireAdmin(async (ctx) => {
    const members = await getHouseholdMembers(ctx.household.id);
    const lines = [`👥 ${ctx.household.name} — ${members.length} member${members.length !== 1 ? "s" : ""}`, ""];
    members.forEach((m, i) => {
      lines.push(`${i + 1}. ${m.displayName} (${m.role}) — joined ${formatJoinedDate(m.joinedAt)}`);
      lines.push(`   ID: ${m.telegramId}`);
    });
    await ctx.reply(lines.join("\n"));
  }));

  bot.command("removemember", requireAdmin(async (ctx) => {
    const telegramIdArg = ctx.message.text.replace(/^\/removemember\s*/i, "").trim();
    const targetMember = await resolveTargetMember(ctx, telegramIdArg);
    if (!targetMember) return;

    if (targetMember.telegramId === ctx.householdUser.telegramId) {
      return ctx.reply("⚠️ Use /leavehousehold to remove yourself.");
    }

    await removeMember(ctx.household.id, targetMember.userId);
    const witty = await generateWittyReply('member_removed', { name: targetMember.displayName });
    await ctx.reply(witty || `✅ ${targetMember.displayName} has been removed from the household.`);
  }));

  bot.command("promote", requireAdmin(async (ctx) => {
    const telegramIdArg = ctx.message.text.replace(/^\/promote\s*/i, "").trim();
    const targetMember = await resolveTargetMember(ctx, telegramIdArg);
    if (!targetMember) return;

    if (targetMember.role === "admin") {
      return ctx.reply(`⚠️ ${targetMember.displayName} is already an admin.`);
    }

    await updateMemberRole(ctx.household.id, targetMember.userId, "admin");
    const witty = await generateWittyReply('member_promoted', { name: targetMember.displayName });
    await ctx.reply(witty || `✅ ${targetMember.displayName} is now an admin.`);
  }));

  bot.command("demote", requireAdmin(async (ctx) => {
    const telegramIdArg = ctx.message.text.replace(/^\/demote\s*/i, "").trim();
    const targetMember = await resolveTargetMember(ctx, telegramIdArg);
    if (!targetMember) return;

    if (targetMember.role === "member") {
      return ctx.reply(`⚠️ ${targetMember.displayName} is already a member.`);
    }

    if (targetMember.telegramId === ctx.householdUser.telegramId) {
      const adminCount = await getAdminCount(ctx.household.id);
      if (adminCount <= 1) {
        return ctx.reply("⚠️ You're the only admin. Promote another member first.");
      }
    }

    await updateMemberRole(ctx.household.id, targetMember.userId, "member");
    const witty = await generateWittyReply('member_demoted', { name: targetMember.displayName });
    await ctx.reply(witty || `✅ ${targetMember.displayName} is now a member.`);
  }));

  bot.command("leavehousehold", requireMember(async (ctx) => {
    const members = await getHouseholdMembers(ctx.household.id);
    const self = members.find((m) => m.telegramId === ctx.householdUser.telegramId);

    if (self && self.role === "admin") {
      const adminCount = await getAdminCount(ctx.household.id);
      if (adminCount <= 1) {
        return ctx.reply(
          "⚠️ You're the only admin. Promote another member first:\n" +
          "/promote <telegram-id>"
        );
      }
    }

    await removeMember(ctx.household.id, ctx.householdUser.id);
    const witty = await generateWittyReply('left_household', { name: ctx.household.name });
    await ctx.reply(witty || `👋 You've left "${ctx.household.name}".`);
    await ctx.reply("Use /create or /join to set up a new household.");
  }));
}

module.exports = { registerAdminCommands };
