function baseLog(level, event, payload = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...payload
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
}

function info(event, payload) {
  baseLog("info", event, payload);
}

function warn(event, payload) {
  baseLog("warn", event, payload);
}

function error(event, payload) {
  baseLog("error", event, payload);
}

module.exports = {
  info,
  warn,
  error
};
