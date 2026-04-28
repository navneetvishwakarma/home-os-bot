const sessions = new Map();
const recentTasks = new Map();
const TTL_MS = 10 * 60 * 1000;

function keyOf(chatId, userId) {
  return `${chatId}:${userId}`;
}

function setRecentTask(chatId, userId, task) {
  recentTasks.set(keyOf(chatId, userId), task);
}

function startSession(chatId, userId) {
  const task = recentTasks.get(keyOf(chatId, userId));
  if (!task) return false;
  sessions.set(keyOf(chatId, userId), {
    task,
    expiresAt: Date.now() + TTL_MS
  });
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
  for (const [key, session] of sessions) {
    if (session.expiresAt < Date.now()) sessions.delete(key);
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
