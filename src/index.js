require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const cron = require('node-cron');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const logger = require('./utils/logger');
const db = require('./database/database');
const { authMiddleware } = require('./middlewares/auth');
const { handleStart } = require('./commands/start');
const { handleMessage } = require('./handlers/messageHandler');
const { handleCallback } = require('./handlers/callbackHandler');
const { ADMIN_ID, BOT_NAME } = require('./utils/constants');
const { showAdminPanel } = require('./commands/admin/index');

// Express routes
app.get('/', (req, res) => res.status(200).send(`✅ ${BOT_NAME} Bot is running`));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', uptime: process.uptime() }));

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.catch((err, ctx) => logger.error(`Bot error [${ctx.updateType}]: ${err.message}`));
bot.use(authMiddleware);

// Commands
bot.start(handleStart);
bot.command('admin', async (ctx) => {
  if (ctx.from.id === ADMIN_ID) {
    try { await ctx.deleteMessage(); } catch(e){}
    return showAdminPanel(ctx);
  }
});
bot.command('help', async (ctx) => {
  try { await ctx.deleteMessage(); } catch(e){}
  const { showHelp } = require('./commands/user/faq');
  return showHelp(ctx);
});

// Handlers
bot.on('callback_query', handleCallback);
bot.on(['message', 'photo', 'voice', 'document', 'sticker'], handleMessage);

// Cron: auto-close old tickets every hour
cron.schedule('0 * * * *', async () => {
  try {
    const hours = await db.getSetting('ticket_auto_close_hours') || '48';
    const res = await db.query(
      `UPDATE tickets SET status='CLOSED', closed_at=NOW(), updated_at=NOW()
       WHERE status='RESOLVED' AND updated_at < NOW() - INTERVAL '${parseInt(hours)} hours'
       RETURNING ticket_id, user_id`
    );
    for (const row of res.rows) {
      try {
        await bot.telegram.sendMessage(row.user_id,
          `⛔ Ticket \`${row.ticket_id}\` has been auto-closed after ${hours} hours.`,
          { parse_mode: 'Markdown' }
        );
      } catch(e){}
    }
    if (res.rowCount > 0) logger.info(`Auto-closed ${res.rowCount} tickets`);
  } catch(e){ logger.error('Cron error: ' + e.message); }
});

// Cron: auto-unblock temp users every minute
cron.schedule('* * * * *', async () => {
  try {
    await db.query(
      `UPDATE users SET is_temp_blocked=false, block_reason=null, block_until=null
       WHERE is_temp_blocked=true AND block_until < NOW()`
    );
  } catch(e){}
});

async function launch() {
  try {
    await db.initDatabase();
    logger.info('✅ Database initialized');

    const PORT = process.env.PORT || 3000;

    if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
      const path = `/bot${process.env.BOT_TOKEN}`;
      const url = `${process.env.WEBHOOK_URL}${path}`;
      app.use(bot.webhookCallback(path));
      await bot.telegram.setWebhook(url);
      logger.info(`✅ Webhook: ${url}`);
      app.listen(PORT, () => logger.info(`🚀 Server on port ${PORT}`));
    } else {
      await bot.telegram.deleteWebhook();
      app.listen(PORT, () => logger.info(`🚀 Server on port ${PORT}`));
      await bot.launch();
      logger.info('🤖 Bot launched (polling)');
    }

    // Notify admin on start
    try {
      await bot.telegram.sendMessage(ADMIN_ID,
        `✅ *${BOT_NAME} Bot Started!*\n\n🕐 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
        { parse_mode: 'Markdown' }
      );
    } catch(e){}

  } catch(err) {
    logger.error('Launch error: ' + err.message);
    process.exit(1);
  }
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

launch();
