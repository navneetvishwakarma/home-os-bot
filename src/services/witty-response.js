const { GoogleGenAI } = require("@google/genai");
const { config } = require("../config");
const { warn } = require("../utils/logger");

const client = new GoogleGenAI({ apiKey: config.geminiApiKey });

const SYSTEM_PROMPT = `You are JARVIS, the dry-witted British AI butler from Iron Man, \
now repurposed to manage domestic tasks for a household.
You confirm household management actions with short, understated British wit.
Rules:
- Maximum 1-2 sentences. Never more.
- No emojis whatsoever.
- No markdown formatting (no bold, no bullets, no asterisks).
- Occasionally address the user as "Sir" or "Ma'am" — not every time.
- This is household chores, not world-saving — let that contrast amuse you, subtly.
- The action is confirmed; the wit is incidental. Never be unhelpfully sarcastic.
- Vary your phrasing. Do not repeat the same sentence structure twice.
- Reference the specific details of the action naturally.`;

const ACTION_DESCRIPTIONS = {
  task_added:        (c) => `A new task has been added: '${c.title}' in the ${c.area} area, assigned to ${c.assignedTo}.`,
  task_corrected:    (c) => `The task '${c.title}' has been updated with corrections.`,
  task_completed:    (c) => `The task '${c.title}' has been marked complete.`,
  tasks_all_done:    (c) => `${c.count} task${c.count !== 1 ? "s" : ""} have been marked complete.`,
  tasks_partial:     (c) => `${c.count} tasks completed; '${c.skippedName}' was intentionally skipped.`,
  task_deleted:      (c) => `The task '${c.title}' has been permanently deleted.`,
  area_added:        (c) => `A new household area called '${c.name}' has been added.`,
  area_removed:      (c) => `The area '${c.name}' has been removed from the household.`,
  time_set:          (c) => `The daily queue time has been set to ${c.time}.`,
  duration_set:      (c) => `The session duration has been set to ${c.mins} minutes.`,
  timezone_set:      (c) => `The timezone has been set to ${c.tz}.`,
  household_created: (c) => `A new household called '${c.name}' has been created.`,
  household_joined:  (c) => `The user has joined the household '${c.name}'.`,
  invite_generated:  (c) => `An invite code has been generated: ${c.code}.`,
  member_removed:    (c) => `${c.name} has been removed from the household.`,
  member_promoted:   (c) => `${c.name} has been promoted to household admin.`,
  member_demoted:    (c) => `${c.name} has been demoted from admin to member.`,
  left_household:    (c) => `The user has left the household '${c.name}'.`,
};

function sanitizeReply(text) {
  const cleaned = text.replace(/\n+/g, " ").trim().slice(0, 300);
  return `✅ ${cleaned}`;
}

async function generateText(prompt) {
  const response = await client.models.generateContent({
    model: config.geminiModel,
    contents: prompt
  });
  const text = (response.text || "").trim();
  if (!text) throw new Error("Gemini returned empty response.");
  return text;
}

async function generateWittyReply(action, context = {}) {
  try {
    const descFn = ACTION_DESCRIPTIONS[action];
    if (!descFn) return null;
    const actionDescription = descFn(context);
    const prompt = `${SYSTEM_PROMPT}\n\nConfirm the following household action with a JARVIS-style witty remark:\n${actionDescription}`;
    const raw = await generateText(prompt);
    return sanitizeReply(raw);
  } catch (err) {
    warn("witty_reply_failed", { action, message: err.message });
    return null;
  }
}

module.exports = { generateWittyReply };
