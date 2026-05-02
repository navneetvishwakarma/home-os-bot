const sessions = new Map();
const recentTasks = new Map();
const TTL_MS = 10 * 60 * 1000;

function keyOf(chatId, userId) {
  return `${chatId}:${userId}`;
}

function setRecentTask(chatId, userId, task) {
  recentTasks.set(keyOf(chatId, userId), { task, addedAt: Date.now() });
}

function startSession(chatId, userId) {
  const key = keyOf(chatId, userId);
  const entry = recentTasks.get(key);
  if (!entry) return false;
  if (entry.addedAt + TTL_MS < Date.now()) {
    recentTasks.delete(key);
    return false;
  }
  sessions.set(key, { task: entry.task, expiresAt: Date.now() + TTL_MS });
  return true;
}

function getSession(chatId, userId) {
  const key = keyOf(chatId, userId);
  const session = sessions.get(key);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(key);
    return null;
  }
  return session;
}

function startSessionForTask(chatId, userId, task) {
  sessions.set(keyOf(chatId, userId), { task, expiresAt: Date.now() + TTL_MS });
}

function clearSession(chatId, userId) {
  sessions.delete(keyOf(chatId, userId));
}

function purgeExpiredSessions() {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (session.expiresAt < now) sessions.delete(key);
  }
  for (const [key, entry] of recentTasks) {
    if (entry.addedAt + TTL_MS < now) recentTasks.delete(key);
  }
}

module.exports = {
  setRecentTask,
  startSession,
  startSessionForTask,
  getSession,
  clearSession,
  purgeExpiredSessions
};
