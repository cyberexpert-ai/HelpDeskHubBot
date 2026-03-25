require('dotenv').config();
const db = require('../database/database');
const { ADMIN_ID, BOT_NAME } = require('../utils/constants');
const { safeDelete } = require('../utils/helpers');
const { showMainMenu, getMainKeyboard } = require('./user/index');
const { showAdminPanel } = require('./admin/index');

async function handleStart(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
  try { await ctx.deleteMessage(); } catch(e){}
  await db.clearSession(userId);

  if (userId === ADMIN_ID) return showAdminPanel(ctx);

  const user = await db.getUser(userId);
  const isNew = !user?.total_tickets;

  let text;
  if (isNew) {
    text = `🤖 *Welcome to ${BOT_NAME}!*\n\n━━━━━━━━━━━━━━━━━\n\n🔥 *What you can do:*\n\n📩 *Contact Support* — Send your issue directly\n🎫 *My Tickets* — Track your tickets\n❓ *FAQ* — Instant answers\n📢 *Announcements* — Latest updates\nℹ️ *Help* — How to use\n⭐ *Rate Us* — Share your experience\n\n━━━━━━━━━━━━━━━━━\n\n💯 Fast, Secure & Easy to Use\n\n_Tap 📩 Contact Support to get started!_`;
  } else {
    text = `🏠 *Welcome back to ${BOT_NAME}!*\n\n👋 Hello, ${ctx.from.first_name || 'User'}!\n\nWhat can we help you with today?`;
  }

  const msg = await ctx.reply(text, { parse_mode: 'Markdown', ...getMainKeyboard() });
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

module.exports = { handleStart };
