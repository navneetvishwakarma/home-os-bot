const dotenv = require("dotenv");

dotenv.config();

const REQUIRED_ENV_VARS = [
  "TELEGRAM_BOT_TOKEN",
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

function parseDuration(rawDuration) {
  const fallback = 60;
  if (!rawDuration) return fallback;
  const asNumber = Number(rawDuration);
  if (!Number.isInteger(asNumber) || asNumber < 15 || asNumber > 480) {
    return fallback;
  }
  return asNumber;
}

function parseGeminiModel(rawModel) {
  return rawModel && rawModel.trim() ? rawModel.trim() : "gemini-2.5-flash";
}

for (const name of REQUIRED_ENV_VARS) {
  requireEnv(name);
}

const config = {
  telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
  geminiApiKey: requireEnv("GEMINI_API_KEY"),
  geminiModel: parseGeminiModel(process.env.GEMINI_MODEL),
  supabaseUrl: requireEnv("SUPABASE_URL"),
  supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  completionPromptDelayMins: parseDuration(process.env.COMPLETION_PROMPT_DELAY_MINS),
  webhookUrl: process.env.WEBHOOK_URL?.trim() || null
};

module.exports = {
  config
};
