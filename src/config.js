const dotenv = require("dotenv");

dotenv.config();

const REQUIRED_ENV_VARS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_AUTHORISED_IDS",
  "GEMINI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function parseAuthorisedIds(rawIds) {
  const ids = rawIds
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    throw new Error("TELEGRAM_AUTHORISED_IDS must contain at least one user id.");
  }

  for (const id of ids) {
    if (!/^\d+$/.test(id)) {
      throw new Error(`Invalid Telegram user id in TELEGRAM_AUTHORISED_IDS: ${id}`);
    }
  }

  return new Set(ids);
}

function parseDuration(rawDuration) {
  const fallback = 60;
  if (!rawDuration) return fallback;
  const asNumber = Number(rawDuration);
  if (!Number.isInteger(asNumber) || asNumber < 15 || asNumber > 480) {
    return fallback;
  }
  return asNumber;
}

function parseTimezone(rawTz) {
  return rawTz && rawTz.trim() ? rawTz.trim() : "Asia/Kolkata";
}

function parseGeminiModel(rawModel) {
  return rawModel && rawModel.trim() ? rawModel.trim() : "gemini-2.5-flash";
}

for (const name of REQUIRED_ENV_VARS) {
  requireEnv(name);
}

const config = {
  telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
  authorisedIds: parseAuthorisedIds(requireEnv("TELEGRAM_AUTHORISED_IDS")),
  geminiApiKey: requireEnv("GEMINI_API_KEY"),
  geminiModel: parseGeminiModel(process.env.GEMINI_MODEL),
  supabaseUrl: requireEnv("SUPABASE_URL"),
  supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  schedulerTimezone: parseTimezone(process.env.SCHEDULER_TIMEZONE),
  completionPromptDelayMins: parseDuration(process.env.COMPLETION_PROMPT_DELAY_MINS)
};

module.exports = {
  config
};
