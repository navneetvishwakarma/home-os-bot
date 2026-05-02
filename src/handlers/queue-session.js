const queueByChat = new Map();
const completionSession = new Map();
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

// Both maps are keyed by Telegram user ID (not chat ID).
// In private DMs these happen to be equal, but user ID is the correct semantic key
// for per-user state since the same user could interact from different chats in future.

function setQueuedTasks(userId, tasks) {
  queueByChat.set(String(userId), tasks);
}

function getQueuedTasks(userId) {
  return queueByChat.get(String(userId)) || [];
}

function startCompletionWindow(userId) {
  completionSession.set(String(userId), Date.now() + TWO_HOURS_MS);
}

function isCompletionWindowActive(userId) {
  const expiresAt = completionSession.get(String(userId));
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    completionSession.delete(String(userId));
    queueByChat.delete(String(userId));
    return false;
  }
  return true;
}

function endCompletionWindow(userId) {
  completionSession.delete(String(userId));
  queueByChat.delete(String(userId));
}

module.exports = {
  setQueuedTasks,
  getQueuedTasks,
  startCompletionWindow,
  isCompletionWindowActive,
  endCompletionWindow
};
