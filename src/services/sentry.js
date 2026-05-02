'use strict';

const Sentry = require('@sentry/node');

let initialised = false;

function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({ dsn, environment: process.env.NODE_ENV || 'production' });
  initialised = true;
}

function captureException(err, context) {
  if (!initialised) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

module.exports = { initSentry, captureException };
