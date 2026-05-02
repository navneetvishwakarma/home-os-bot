'use strict';

async function launchBot(bot, cfg, env) {
  if (cfg.webhookUrl && env.NODE_ENV === 'production') {
    await bot.launch({
      webhook: { domain: cfg.webhookUrl, port: parseInt(env.PORT || '3000', 10) }
    });
  } else {
    await bot.launch();
  }
}

module.exports = { launchBot };
