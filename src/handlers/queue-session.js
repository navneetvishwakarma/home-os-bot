const queueByChat = new Map();
const completionSession = new Map();
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function setQueuedTasks(chatId, tasks) {
  queueByChat.set(String(chatId), tasks);
}

function getQueuedTasks(chatId) {
  return queueByChat.get(String(chatId)) || [];
}

function startCompletionWindow(chatId) {
  completionSession.set(String(chatId), Date.now() + TWO_HOURS_MS);
}

function isCompletionWindowActive(chatId) {
  const expiresAt = completionSession.get(String(chatId));
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    completionSession.delete(String(chatId));
    return false;
  }
  return true;
}

function endCompletionWindow(chatId) {
  completionSession.delete(String(chatId));
}

module.exports = {
  setQueuedTasks,
  getQueuedTasks,
  startCompletionWindow,
  isCompletionWindowActive,
  endCompletionWindow
};
