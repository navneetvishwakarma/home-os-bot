const { GoogleGenAI } = require("@google/genai");
const { config } = require("../config");
const { DEFAULT_TAGS } = require("../constants");
const {
  clampEffortMins,
  normalizeAssignee,
  normalizeCriticality,
  normalizeTags,
  safeParseJsonObject
} = require("../utils/validators");
const { withRetry } = require("../utils/retry");

const client = new GoogleGenAI({ apiKey: config.geminiApiKey });

function buildClassificationPrompt(text, areas) {
  return [
    "You are the brain of a Home OS system.",
    "Return ONLY valid JSON with no markdown fences.",
    `Known areas: ${areas.join(" | ")}`,
    `Allowed tags: ${DEFAULT_TAGS.join(", ")}`,
    "Schema:",
    '{"title":"","area":"","isNewArea":false,"criticality":"CRITICAL|HIGH|MEDIUM|LOW","effortMins":30,"tags":[],"assignedTo":"Me|Spouse|Professional|Both","deadline":null,"reasoning":"","isRecurring":false,"recurrenceIntervalDays":null,"nextDueDate":null}',
    "If input implies recurrence (e.g. every day, every 3rd day, weekly, monthly), set isRecurring=true and recurrenceIntervalDays accordingly.",
    `User input: ${text}`
  ].join("\n");
}

function buildCorrectionPrompt(existingTask, correctionText) {
  return [
    "You update a home task object based on correction text.",
    "Return ONLY a JSON patch with changed fields.",
    "Allowed fields: title, area, criticality, effortMins, tags, assignedTo, deadline, reasoning, isRecurring, recurrenceIntervalDays, nextDueDate",
    `Existing task JSON: ${JSON.stringify(existingTask)}`,
    `Correction: ${correctionText}`
  ].join("\n");
}

function isoDateFromNowPlusDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function inferRecurrenceIntervalDays(text) {
  const lower = String(text || "").toLowerCase();

  if (/\bevery day\b|\bdaily\b/.test(lower)) return 1;
  if (/\bweekly\b|\bevery week\b/.test(lower)) return 7;
  if (/\bfortnight\b|\bevery 2 weeks\b|\bbiweekly\b/.test(lower)) return 14;
  if (/\bmonthly\b|\bevery month\b/.test(lower)) return 30;

  const everyNDayMatch = lower.match(/\bevery\s+(\d+)(?:st|nd|rd|th)?\s+day(s)?\b/);
  if (everyNDayMatch) return Number(everyNDayMatch[1]);

  return null;
}

function normalizeRecurrence(raw, originalText) {
  const inferredInterval = inferRecurrenceIntervalDays(originalText);
  const explicitInterval = Number(raw.recurrenceIntervalDays);
  const normalizedExplicitInterval =
    Number.isInteger(explicitInterval) && explicitInterval > 0 ? explicitInterval : null;

  const intervalDays = normalizedExplicitInterval || inferredInterval;
  const isRecurring = Boolean(raw.isRecurring) || intervalDays !== null;

  return {
    isRecurring,
    recurrenceIntervalDays: isRecurring ? intervalDays || 7 : null,
    nextDueDate:
      isRecurring
        ? (raw.nextDueDate ? String(raw.nextDueDate) : isoDateFromNowPlusDays(intervalDays || 7))
        : null
  };
}

function sanitizeTask(raw, areas, originalText) {
  const title = String(raw.title || "").trim() || "Untitled task";
  const area = String(raw.area || "General").trim() || "General";
  const lowerAreas = new Set(areas.map((name) => name.toLowerCase()));
  const isKnownArea = lowerAreas.has(area.toLowerCase());
  const recurrence = normalizeRecurrence(raw, originalText);

  return {
    title,
    area,
    isNewArea: !isKnownArea,
    criticality: normalizeCriticality(raw.criticality),
    effortMins: clampEffortMins(raw.effortMins),
    tags: normalizeTags(raw.tags),
    assignedTo: normalizeAssignee(raw.assignedTo),
    deadline: raw.deadline ? String(raw.deadline) : null,
    reasoning: String(raw.reasoning || "").trim(),
    isRecurring: recurrence.isRecurring,
    recurrenceIntervalDays: recurrence.recurrenceIntervalDays,
    nextDueDate: recurrence.nextDueDate
  };
}

function sanitizePatch(rawPatch) {
  const patch = {};

  if (rawPatch.title) patch.title = String(rawPatch.title).trim();
  if (rawPatch.area) patch.area = String(rawPatch.area).trim();
  if (rawPatch.criticality) patch.criticality = normalizeCriticality(rawPatch.criticality);
  if (rawPatch.effortMins !== undefined) patch.effortMins = clampEffortMins(rawPatch.effortMins);
  if (rawPatch.tags) patch.tags = normalizeTags(rawPatch.tags);
  if (rawPatch.assignedTo) patch.assignedTo = normalizeAssignee(rawPatch.assignedTo);
  if (rawPatch.deadline !== undefined) patch.deadline = rawPatch.deadline ? String(rawPatch.deadline) : null;
  if (rawPatch.reasoning) patch.reasoning = String(rawPatch.reasoning).trim();
  if (rawPatch.isRecurring !== undefined) patch.isRecurring = Boolean(rawPatch.isRecurring);
  if (rawPatch.recurrenceIntervalDays !== undefined) {
    const interval = Number(rawPatch.recurrenceIntervalDays);
    patch.recurrenceIntervalDays = Number.isInteger(interval) && interval > 0 ? interval : null;
  }
  if (rawPatch.nextDueDate !== undefined) {
    patch.nextDueDate = rawPatch.nextDueDate ? String(rawPatch.nextDueDate) : null;
  }

  return patch;
}

async function generateJson(prompt) {
  const response = await withRetry(
    () => client.models.generateContent({ model: config.geminiModel, contents: prompt }),
    { retryOn: [503, 429], maxAttempts: 3, baseDelayMs: 1000 }
  );
  const text = response.text || "";
  const parsed = safeParseJsonObject(text);
  if (!parsed) {
    throw new Error("Gemini returned invalid JSON.");
  }
  return parsed;
}

async function classifyTask(text, areas) {
  try {
    const raw = await generateJson(buildClassificationPrompt(text, areas));
    return sanitizeTask(raw, areas, text);
  } catch (err) {
    if (err.status === 503 || err.status === 429) {
      return {
        title: String(text).trim() || "Untitled task",
        area: "General",
        isNewArea: false,
        criticality: "MEDIUM",
        effortMins: 30,
        tags: [],
        assignedTo: "Me",
        deadline: null,
        reasoning: "",
        isRecurring: false,
        recurrenceIntervalDays: null,
        nextDueDate: null,
        _isFallback: true
      };
    }
    throw err;
  }
}

async function correctTask(existingTask, correctionText) {
  const rawPatch = await generateJson(buildCorrectionPrompt(existingTask, correctionText));
  return sanitizePatch(rawPatch);
}

module.exports = {
  classifyTask,
  correctTask
};
