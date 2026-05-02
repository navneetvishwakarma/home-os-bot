'use strict';
const { generateText } = require('./gemini');

const INTENTS = ['task', 'note', 'reminder', 'contact', 'expense', 'question', 'correction', 'completion', 'unknown'];

function buildIntentPrompt(text) {
  return [
    `Classify the intent of this home assistant message into exactly one of: ${INTENTS.join(', ')}`,
    'Return only the intent word, nothing else.',
    `Message: ${text}`
  ].join('\n');
}

async function classifyIntent(text) {
  try {
    const raw = await generateText(buildIntentPrompt(text));
    const intent = raw.toLowerCase().trim();
    return INTENTS.includes(intent) ? intent : 'task';
  } catch {
    return 'task';
  }
}

module.exports = { classifyIntent, INTENTS };
