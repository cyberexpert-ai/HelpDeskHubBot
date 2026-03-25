const db = require('../database/database');
const { STATES, ADMIN_ID } = require('../utils/constants');
const { deleteUserMsg } = require('../utils/helpers');
const { submitTicket, handleUserMessage } = require('../commands/user/ticket');
const { handleAdminReply, handleLiveChatAdmin } = require('../commands/admin/ticketManage');
const { handleSearchInput, handleBlockReasonInput, handleTempBlockInput, handleNoteInput } = require('../commands/admin/userManage');
const { handleBroadcastInput, handleMsgUserIdInput, handleMsgUserTextInput } = require('../commands/admin/broadcast');
const { handleAutoReplyInput, handleAddCategoryInput, handleFAQQuestionInput, handleFAQAnswerInput, handleQRTitleInput, handleQRMsgInput } = require('../commands/admin/settings');

const MENU_MAP = {
  '📩 Contact Support': async (ctx) => { const { startCreateTicket } = require('../commands/user/ticket'); await db.clearSession(ctx.from.id); return startCreateTicket(ctx); },
  '🎫 My Tickets':      async (ctx) => { const { showMyTickets } = require('../commands/user/ticket'); await db.clearSession(ctx.from.id); return showMyTickets(ctx); },
  '❓ FAQ':             async (ctx) => { const { showFAQMenu } = require('../commands/user/faq'); await db.clearSession(ctx.from.id); return showFAQMenu(ctx); },
  '📢 Announcements':   async (ctx) => { const { showAnnouncements } = require('../commands/user/faq'); await db.clearSession(ctx.from.id); return showAnnouncements(ctx); },
  'ℹ️ Help':            async (ctx) => { const { showHelp } = require('../commands/user/faq'); await db.clearSession(ctx.from.id); return showHelp(ctx); },
  '⭐ Rate Us':          async (ctx) => { const { showRateUs } = require('../commands/user/faq'); await db.clearSession(ctx.from.id); return showRateUs(ctx); }
};

async function handleMessage(ctx) {
  if (!ctx.message || !ctx.from) return;
  const userId = ctx.from.id;
  const msgText = ctx.message?.text || '';

  // Maintenance check
  if (userId !== ADMIN_ID) {
    const maint = await db.getSetting('maintenance_mode');
    if (maint === 'true') {
      try { await ctx.deleteMessage(); } catch(e){}
      await ctx.reply('🔧 Bot under maintenance. Please try again later.');
      return;
    }
  }

  const sess = await db.getSession(userId);

  // Reply keyboard buttons (user)
  if (userId !== ADMIN_ID && MENU_MAP[msgText]) {
    try { await ctx.deleteMessage(); } catch(e){}
    return MENU_MAP[msgText](ctx);
  }

  // Admin states
  if (userId === ADMIN_ID) {
    if (sess.state === STATES.ADMIN_REPLY_TICKET) return handleAdminReply(ctx);
    if (sess.state === STATES.ADMIN_IN_LIVE_CHAT) return handleLiveChatAdmin(ctx);
    if (sess.state === 'ADMIN_SEARCH_USER') return handleSearchInput(ctx);
    if (sess.state === STATES.ADMIN_BLOCK_REASON) return handleBlockReasonInput(ctx);
    if (sess.state === STATES.ADMIN_TEMP_BLOCK_DUR) return handleTempBlockInput(ctx);
    if (sess.state === STATES.ADMIN_ADD_NOTE) return handleNoteInput(ctx);
    if (sess.state === STATES.ADMIN_BROADCAST_MSG || sess.state === STATES.ADMIN_BROADCAST_PHOTO) return handleBroadcastInput(ctx);
    if (sess.state === STATES.ADMIN_MSG_USER_ID) return handleMsgUserIdInput(ctx);
    if (sess.state === STATES.ADMIN_MSG_USER_TEXT) return handleMsgUserTextInput(ctx);
    if (sess.state === STATES.ADMIN_SET_AUTO_REPLY) return handleAutoReplyInput(ctx);
    if (sess.state === STATES.ADMIN_ADD_CATEGORY) return handleAddCategoryInput(ctx);
    if (sess.state === STATES.ADMIN_ADD_FAQ_Q) return handleFAQQuestionInput(ctx);
    if (sess.state === STATES.ADMIN_ADD_FAQ_A) return handleFAQAnswerInput(ctx);
    if (sess.state === STATES.ADMIN_ADD_QR_TITLE) return handleQRTitleInput(ctx);
    if (sess.state === STATES.ADMIN_ADD_QR_MSG) return handleQRMsgInput(ctx);
  }

  // User states
  if (sess.state === STATES.WRITING_SUBJECT) {
    const text = ctx.message?.text?.trim();
    try { await ctx.deleteMessage(); } catch(e){}
    if (!text) { await ctx.reply('⚠️ Please type a short subject/title.'); return; }
    if (sess.data.lastMsgId) {
      const { safeDelete } = require('../utils/helpers');
      await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
    }
    await db.setSession(userId, STATES.WRITING_MESSAGE, { ...sess.data, subject: text });
    const { askMessage } = require('../commands/user/ticket');
    return askMessage(ctx);
  }

  if (sess.state === STATES.WRITING_MESSAGE) {
    if (sess.data.isReply) return handleUserMessage(ctx);
    return submitTicket(ctx);
  }

  // Live chat from user side
  if (userId !== ADMIN_ID && sess.state === 'IDLE') {
    const active = await db.getActiveTicket(userId);
    if (active?.live_chat_active) {
      const { handleLiveChatUser } = require('../commands/admin/ticketManage');
      await handleLiveChatUser(ctx, active.ticket_id);
      return;
    }
  }

  // Unhandled
  if (userId !== ADMIN_ID && sess.state === 'IDLE') {
    try { await ctx.deleteMessage(); } catch(e){}
    const msg = await ctx.reply(
      '❓ Use the menu buttons below, or /start to restart.',
      { reply_markup: { inline_keyboard: [[{ text: '📩 Contact Support', callback_data: 'tkt_new' }], [{ text: '🏠 Main Menu', callback_data: 'u_main' }]] } }
    );
    setTimeout(async () => { try { await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id); } catch(e){} }, 5000);
  }
}

module.exports = { handleMessage };
