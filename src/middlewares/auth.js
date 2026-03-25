const db = require('../database/database');
const { ADMIN_ID } = require('../utils/constants');

async function authMiddleware(ctx, next) {
  if (!ctx.from) return next();
  const tid = ctx.from.id;
  try {
    await db.upsertUser(tid, ctx.from.username, ctx.from.first_name, ctx.from.last_name);
    if (tid === ADMIN_ID) return next();
    const user = await db.getUser(tid);
    if (!user) return next();

    // Auto-unblock expired temp blocks
    if (user.is_temp_blocked && user.block_until && new Date() > new Date(user.block_until)) {
      await db.unblockUser(tid);
      return next();
    }

    if (user.is_blocked) {
      const text = `🚫 *You have been blocked.*\n\n${user.block_reason ? `Reason: ${user.block_reason}` : 'Contact admin for help.'}`;
      const opts = { parse_mode: 'Markdown' };
      if (ctx.callbackQuery) { await ctx.answerCbQuery('🚫 Blocked', { show_alert: true }); }
      else { await ctx.reply(text, opts).catch(() => {}); }
      return;
    }
    if (user.is_temp_blocked) {
      const until = new Date(user.block_until).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      const text = `⏳ *Temporarily restricted until:*\n${until}\n\nReason: ${user.block_reason || 'Suspicious activity'}`;
      if (ctx.callbackQuery) { await ctx.answerCbQuery('⏳ Temporarily restricted', { show_alert: true }); }
      else { await ctx.reply(text, { parse_mode: 'Markdown' }).catch(() => {}); }
      return;
    }
    return next();
  } catch (err) {
    return next();
  }
}

module.exports = { authMiddleware };
