const { ASSIGNEE_VALUES, CRITICALITY_VALUES, DEFAULT_TAGS } = require("../constants");

function clampEffortMins(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 30;
  return Math.min(480, Math.max(1, Math.round(numeric)));
}

function normalizeCriticality(value) {
  if (!value) return "MEDIUM";
  const upper = String(value).toUpperCase();
  return CRITICALITY_VALUES.includes(upper) ? upper : "MEDIUM";
}

function normalizeAssignee(value) {
  if (!value) return "Me";
  const matched = ASSIGNEE_VALUES.find(
    (candidate) => candidate.toLowerCase() === String(value).toLowerCase()
  );
  return matched || "Me";
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const allowed = new Set(DEFAULT_TAGS);
  return [...new Set(tags.map((tag) => String(tag).trim().toLowerCase()))].filter((tag) =>
    allowed.has(tag)
  );
}

function parseTimeHHMM(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseDurationMinutes(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 15 || numeric > 480) return null;
  return numeric;
}

function stripCodeFences(raw) {
  return String(raw)
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

function safeParseJsonObject(raw) {
  try {
    const parsed = JSON.parse(stripCodeFences(raw));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
}

module.exports = {
  clampEffortMins,
  normalizeCriticality,
  normalizeAssignee,
  normalizeTags,
  parseTimeHHMM,
  parseDurationMinutes,
  stripCodeFences,
  safeParseJsonObject
};
