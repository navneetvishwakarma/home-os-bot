require("dotenv").config();
const { generateWittyReply } = require("../src/services/witty-response");

const scenarios = [
  { label: "task_added",        action: "task_added",        ctx: { title: "Fix kitchen tap leak", area: "Kitchen", assignedTo: "Me" } },
  { label: "task_corrected",    action: "task_corrected",    ctx: { title: "Fix kitchen tap leak" } },
  { label: "task_completed",    action: "task_completed",    ctx: { title: "Mow the lawn" } },
  { label: "tasks_all_done x4", action: "tasks_all_done",    ctx: { count: 4 } },
  { label: "tasks_all_done x1", action: "tasks_all_done",    ctx: { count: 1 } },
  { label: "tasks_partial",     action: "tasks_partial",     ctx: { count: 3, skippedName: "Deep clean fridge" } },
  { label: "task_deleted",      action: "task_deleted",      ctx: { title: "Buy milk" } },
  { label: "area_added",        action: "area_added",        ctx: { name: "Terrace" } },
  { label: "area_removed",      action: "area_removed",      ctx: { name: "Guest Bedroom" } },
  { label: "time_set",          action: "time_set",          ctx: { time: "07:30" } },
  { label: "duration_set",      action: "duration_set",      ctx: { mins: 90 } },
  { label: "timezone_set",      action: "timezone_set",      ctx: { tz: "Europe/London" } },
  { label: "household_created", action: "household_created", ctx: { name: "The Sharma House" } },
  { label: "household_joined",  action: "household_joined",  ctx: { name: "The Sharma House" } },
  { label: "invite_generated",  action: "invite_generated",  ctx: { code: "K7XP2MNQ" } },
  { label: "member_removed",    action: "member_removed",    ctx: { name: "Priya" } },
  { label: "member_promoted",   action: "member_promoted",   ctx: { name: "Priya" } },
  { label: "member_demoted",    action: "member_demoted",    ctx: { name: "Rahul" } },
  { label: "left_household",    action: "left_household",    ctx: { name: "The Sharma House" } },
  { label: "UNKNOWN ACTION",    action: "nonexistent_action", ctx: {} },
];

async function run() {
  console.log("=== JARVIS witty response test ===\n");
  for (const { label, action, ctx } of scenarios) {
    process.stdout.write(`[${label}]\n  → `);
    const reply = await generateWittyReply(action, ctx);
    console.log(reply === null ? "null — fallback (expected for unknown actions)" : reply);
    console.log();
  }
  console.log("=== Done ===");
}

run().catch((err) => {
  console.error("Script failed:", err.message);
  process.exit(1);
});
