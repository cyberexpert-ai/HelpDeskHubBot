const db = require('../../database/database');
const { Markup } = require('telegraf');
const { safeDelete } = require('../../utils/helpers');

function getMainKeyboard() {
  return Markup.keyboard([
    ['📩 Contact Support', '🎫 My Tickets'],
    ['❓ FAQ', '📢 Announcements'],
    ['ℹ️ Help', '⭐ Rate Us']
  ]).resize().persistent();
}

function hideKeyboard() {
  return { reply_markup: { remove_keyboard: true } };
}

async function showMainMenu(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const user = await db.getUser(userId);
  const vipBadge = user?.is_vip ? ' 👑' : '';
  const msg = await ctx.reply(
    `🏠 *HelpDesk Main Menu*${vipBadge}\n\n👋 Hello, ${ctx.from.first_name || 'User'}!\n\n📌 How can we help you today?`,
    { parse_mode: 'Markdown', ...getMainKeyboard() }
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

module.exports = { showMainMenu, getMainKeyboard, hideKeyboard };
