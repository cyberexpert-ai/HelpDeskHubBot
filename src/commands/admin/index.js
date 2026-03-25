const db = require('../../database/database');
const { ADMIN_ID } = require('../../utils/constants');
const { safeDelete, formatDate } = require('../../utils/helpers');

async function showAdminPanel(ctx, edit = false) {
  if (ctx.from.id !== ADMIN_ID) return;
  const sess = await db.getSession(ADMIN_ID);

  const stats = await db.getTicketCount();
  const users = await db.getUserCount();
  const ratings = await db.getRatingStats();
  const avgRating = ratings?.avg ? parseFloat(ratings.avg).toFixed(1) : 'N/A';

  const text = `👑 *Admin Panel — HelpDesk*\n\n━━━━━━━━━━━━━━━━━\n👥 Total Users: *${users}*\n🟢 Open Tickets: *${stats?.open || 0}*\n🔵 In Progress: *${stats?.in_progress || 0}*\n✅ Resolved: *${stats?.resolved || 0}*\n⛔ Closed: *${stats?.closed || 0}*\n📊 Total Tickets: *${stats?.total || 0}*\n⭐ Avg Rating: *${avgRating}/5*\n━━━━━━━━━━━━━━━━━`;

  const opts = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎫 Tickets', callback_data: 'adm_tickets' }, { text: '👥 Users', callback_data: 'adm_users' }],
        [{ text: '📂 Categories', callback_data: 'adm_cats' }, { text: '❓ FAQs', callback_data: 'adm_faqs' }],
        [{ text: '💬 Quick Replies', callback_data: 'adm_qr' }, { text: '📢 Broadcast', callback_data: 'adm_broadcast' }],
        [{ text: '📊 Statistics', callback_data: 'adm_stats' }, { text: '⚙️ Settings', callback_data: 'adm_settings' }]
      ]
    }
  };

  if (edit && ctx.callbackQuery) {
    try { return await ctx.editMessageText(text, opts); } catch (e) {}
  }
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
  const msg = await ctx.reply(text, opts);
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

module.exports = { showAdminPanel };
