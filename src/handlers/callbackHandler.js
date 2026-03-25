const db = require('../database/database');
const { ADMIN_ID } = require('../utils/constants');
const { showMainMenu } = require('../commands/user/index');
const { startCreateTicket, askSubject, showMyTickets, showTicketDetail, showTicketHistory, promptSendMessage, closeTicket, promptRating, handleRating } = require('../commands/user/ticket');
const { showFAQMenu, showFAQList, showFAQAnswer, showHelp, showAnnouncements, showRateUs } = require('../commands/user/faq');
const { showAdminPanel } = require('../commands/admin/index');
const { showTicketsMenu, showTicketsByStatus, showTicketDetail: adminTicketDetail, promptAdminReply, showQuickRepliesMenu, sendQuickReply, resolveTicket, closeTicketAdmin, updateTicketStatus, updateTicketPriority, showFullHistory, startLiveChat, endLiveChatAdmin } = require('../commands/admin/ticketManage');
const { showUsersMenu, promptSearchUser, showUserProfile, promptBlockUser, handleUnblock, promptTempBlock, setVIP, showUserTickets, promptAddNote, showNotes, showUserList, showVIPList } = require('../commands/admin/userManage');
const { showBroadcastMenu, promptBroadcast, promptMessageUser } = require('../commands/admin/broadcast');
const { showSettingsMenu, handleToggleSetting, promptSetAutoReply, showStats, showCategoryManage, promptAddCategory, handleToggleCategory, handleDeleteCategory, showFAQManage, promptAddFAQ, showQuickRepliesManage, promptAddQR } = require('../commands/admin/settings');

async function handleCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;
  const userId = ctx.from.id;
  const isAdmin = userId === ADMIN_ID;
  await ctx.answerCbQuery().catch(() => {});

  if (data === 'noop') return; // separator buttons

  // Maintenance
  if (!isAdmin) {
    const maint = await db.getSetting('maintenance_mode');
    if (maint === 'true') {
      try { await ctx.deleteMessage(); } catch(e){}
      await ctx.reply('🔧 Bot under maintenance. Please try again later.');
      return;
    }
  }

  // ── USER ──────────────────────────────────────────────────────
  if (data === 'u_main') {
    try { await ctx.deleteMessage(); } catch(e){}
    await db.clearSession(userId);
    return showMainMenu(ctx);
  }
  if (data === 'u_tickets') { try { await ctx.deleteMessage(); } catch(e){} return showMyTickets(ctx); }
  if (data === 'u_faq')     { try { await ctx.deleteMessage(); } catch(e){} return showFAQMenu(ctx); }
  if (data === 'u_help')    { try { await ctx.deleteMessage(); } catch(e){} return showHelp(ctx); }
  if (data === 'u_announce'){ try { await ctx.deleteMessage(); } catch(e){} return showAnnouncements(ctx); }
  if (data === 'u_rate')    { try { await ctx.deleteMessage(); } catch(e){} return showRateUs(ctx); }

  // Ticket flow
  if (data === 'tkt_new')  { try { await ctx.deleteMessage(); } catch(e){} return startCreateTicket(ctx); }
  if (data.startsWith('tkt_cat_'))     return askSubject(ctx, parseInt(data.replace('tkt_cat_', '')));
  if (data.startsWith('tkt_open_'))    return showTicketDetail(ctx, data.replace('tkt_open_', ''));
  if (data.startsWith('tkt_history_')) return showTicketHistory(ctx, data.replace('tkt_history_', ''));
  if (data.startsWith('tkt_msg_'))     return promptSendMessage(ctx, data.replace('tkt_msg_', ''));
  if (data.startsWith('tkt_close_'))   return closeTicket(ctx, data.replace('tkt_close_', ''), true);
  if (data.startsWith('tkt_rate_'))    return promptRating(ctx, data.replace('tkt_rate_', ''));
  if (data.startsWith('tkt_endlive_')) {
    const tid = data.replace('tkt_endlive_', '');
    await db.setLiveChat(tid, false);
    await db.clearSession(userId);
    try { await ctx.deleteMessage(); } catch(e){}
    return showMainMenu(ctx);
  }
  if (data.startsWith('tkt_livechat_')) return showTicketDetail(ctx, data.replace('tkt_livechat_', ''));
  if (data.startsWith('tkt_reopen_')) {
    const tid = data.replace('tkt_reopen_', '');
    await db.updateTicketStatus(tid, 'OPEN');
    await ctx.answerCbQuery('✅ Ticket reopened!');
    return showTicketDetail(ctx, tid);
  }

  // Rating
  if (data.startsWith('rat_')) {
    const parts = data.replace('rat_', '').split('_');
    const ticketId = parts.slice(0, -1).join('_');
    const rating = parseInt(parts[parts.length - 1]);
    return handleRating(ctx, ticketId, rating);
  }

  // FAQ
  if (data === 'faq_all')               return showFAQList(ctx, null);
  if (data.startsWith('faq_cat_'))      return showFAQList(ctx, parseInt(data.replace('faq_cat_', '')));
  if (data.startsWith('faq_view_'))     return showFAQAnswer(ctx, parseInt(data.replace('faq_view_', '')));
  if (data === 'faq_helpful')           { await ctx.answerCbQuery('😊 Glad it helped!', { show_alert: true }); return; }
  if (data === 'faq_not_helpful')       { await ctx.answerCbQuery('📩 A support agent will assist you.', { show_alert: true }); return; }
  if (data === 'faq_search')            { await ctx.answerCbQuery('🔍 Type your keyword to search FAQs...', { show_alert: true }); return; }

  // ── ADMIN ─────────────────────────────────────────────────────
  if (!isAdmin) return;

  if (data === 'adm_back')       return showAdminPanel(ctx, true);
  if (data === 'adm_tickets')    return showTicketsMenu(ctx);
  if (data === 'adm_users')      return showUsersMenu(ctx);
  if (data === 'adm_broadcast')  return showBroadcastMenu(ctx);
  if (data === 'adm_stats')      return showStats(ctx);
  if (data === 'adm_settings')   return showSettingsMenu(ctx);
  if (data === 'adm_cats')       return showCategoryManage(ctx);
  if (data === 'adm_faqs')       return showFAQManage(ctx);
  if (data === 'adm_qr')         return showQuickRepliesManage(ctx);

  // Ticket management
  if (data.startsWith('admt_open_'))  return showTicketsByStatus(ctx, 'open',   parseInt(data.replace('admt_open_', '')));
  if (data.startsWith('admt_prog_'))  return showTicketsByStatus(ctx, 'prog',   parseInt(data.replace('admt_prog_', '')));
  if (data.startsWith('admt_wait_'))  return showTicketsByStatus(ctx, 'wait',   parseInt(data.replace('admt_wait_', '')));
  if (data.startsWith('admt_res_'))   return showTicketsByStatus(ctx, 'res',    parseInt(data.replace('admt_res_', '')));
  if (data.startsWith('admt_all_'))   return showTicketsByStatus(ctx, 'all',    parseInt(data.replace('admt_all_', '')));
  if (data.startsWith('admt_view_'))  return adminTicketDetail(ctx, data.replace('admt_view_', ''));
  if (data.startsWith('adm_reply_'))  return promptAdminReply(ctx, data.replace('adm_reply_', ''));
  if (data.startsWith('adm_qreply_')) return showQuickRepliesMenu(ctx, data.replace('adm_qreply_', ''));
  if (data.startsWith('adm_sendqr_')) {
    const rest = data.replace('adm_sendqr_', '');
    const li = rest.lastIndexOf('_');
    return sendQuickReply(ctx, rest.substring(0, li), parseInt(rest.substring(li + 1)));
  }
  if (data.startsWith('adm_resolve_')) return resolveTicket(ctx, data.replace('adm_resolve_', ''));
  if (data.startsWith('adm_close_'))   return closeTicketAdmin(ctx, data.replace('adm_close_', ''));
  if (data.startsWith('adm_history_')) return showFullHistory(ctx, data.replace('adm_history_', ''));
  if (data.startsWith('adm_live_'))    return startLiveChat(ctx, data.replace('adm_live_', ''));
  if (data.startsWith('adm_endlive_')) return endLiveChatAdmin(ctx, data.replace('adm_endlive_', ''));
  if (data.startsWith('adm_status_')) {
    const rest = data.replace('adm_status_', '');
    const li = rest.lastIndexOf('_');
    return updateTicketStatus(ctx, rest.substring(0, li), rest.substring(li + 1));
  }
  if (data.startsWith('adm_pri_')) {
    const rest = data.replace('adm_pri_', '');
    const li = rest.lastIndexOf('_');
    return updateTicketPriority(ctx, rest.substring(0, li), rest.substring(li + 1));
  }

  // Users
  if (data === 'admu_search')       return promptSearchUser(ctx);
  if (data === 'admu_vip')          return showVIPList(ctx);
  if (data.startsWith('admu_list_'))    return showUserList(ctx, parseInt(data.replace('admu_list_', '')));
  if (data.startsWith('admu_view_'))    return showUserProfile(ctx, parseInt(data.replace('admu_view_', '')), true);
  if (data.startsWith('admu_block_'))   return promptBlockUser(ctx, parseInt(data.replace('admu_block_', '')));
  if (data.startsWith('admu_unblock_')) return handleUnblock(ctx, parseInt(data.replace('admu_unblock_', '')));
  if (data.startsWith('admu_temp_'))    return promptTempBlock(ctx, parseInt(data.replace('admu_temp_', '')));
  if (data.startsWith('admu_vip_on_'))  return setVIP(ctx, parseInt(data.replace('admu_vip_on_', '')), true);
  if (data.startsWith('admu_vip_off_')) return setVIP(ctx, parseInt(data.replace('admu_vip_off_', '')), false);
  if (data.startsWith('admu_tickets_')) return showUserTickets(ctx, parseInt(data.replace('admu_tickets_', '')));
  if (data.startsWith('admu_note_'))    return promptAddNote(ctx, parseInt(data.replace('admu_note_', '')));
  if (data.startsWith('admu_notes_'))   return showNotes(ctx, parseInt(data.replace('admu_notes_', '')));
  if (data.startsWith('adm_user_'))     return showUserProfile(ctx, parseInt(data.replace('adm_user_', '')), true);

  // Broadcast
  if (data === 'admbr_all')   return promptBroadcast(ctx, false);
  if (data === 'admbr_photo') return promptBroadcast(ctx, true);
  if (data === 'admbr_user')  return promptMessageUser(ctx);
  if (data.startsWith('amu_')) return promptMessageUser(ctx, parseInt(data.replace('amu_', '')));

  // Settings
  if (data.startsWith('adms_toggle_')) {
    const rest = data.replace('adms_toggle_', '');
    const li = rest.lastIndexOf('_');
    return handleToggleSetting(ctx, rest.substring(0, li), rest.substring(li + 1));
  }
  if (data === 'adms_set_autoreply') return promptSetAutoReply(ctx);

  // Categories
  if (data === 'admc_add')                return promptAddCategory(ctx);
  if (data.startsWith('admc_toggle_'))    return handleToggleCategory(ctx, parseInt(data.replace('admc_toggle_', '')));
  if (data.startsWith('admc_del_'))       return handleDeleteCategory(ctx, parseInt(data.replace('admc_del_', '')));

  // FAQs
  if (data === 'admf_add') return promptAddFAQ(ctx);
  if (data.startsWith('admf_del_')) {
    await db.deleteFAQ(parseInt(data.replace('admf_del_', '')));
    await ctx.answerCbQuery('✅ FAQ deleted!');
    return showFAQManage(ctx);
  }
  if (data.startsWith('admf_tog_')) {
    const id = parseInt(data.replace('admf_tog_', ''));
    const faq = await db.getFAQ(id);
    await db.toggleFAQ(id, !faq?.is_active);
    await ctx.answerCbQuery('✅ Toggled!');
    return showFAQManage(ctx);
  }

  // Quick Replies
  if (data === 'admqr_add') return promptAddQR(ctx);
  if (data.startsWith('admqr_del_')) {
    await db.deleteQuickReply(parseInt(data.replace('admqr_del_', '')));
    await ctx.answerCbQuery('✅ Deleted!');
    return showQuickRepliesManage(ctx);
  }
}

module.exports = { handleCallback };
