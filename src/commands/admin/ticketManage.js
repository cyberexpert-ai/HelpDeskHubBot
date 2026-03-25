const db = require('../../database/database');
const { ADMIN_ID, STATES, STATUS_EMOJI, PRIORITY_EMOJI } = require('../../utils/constants');
const { formatDate, safeDelete, getUserName, truncate } = require('../../utils/helpers');
const { getQuickReplies } = require('../../database/database');

async function showTicketsMenu(ctx) {
  const stats = await db.getTicketCount();
  const opts = {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [
      [{ text: `🟢 Open (${stats?.open||0})`, callback_data: 'admt_open_0' }, { text: `🔵 In Progress (${stats?.in_progress||0})`, callback_data: 'admt_prog_0' }],
      [{ text: `🟡 Waiting (${stats?.waiting||0})`, callback_data: 'admt_wait_0' }, { text: `✅ Resolved (${stats?.resolved||0})`, callback_data: 'admt_res_0' }],
      [{ text: '🔍 Search Ticket', callback_data: 'admt_search' }, { text: '📋 All Tickets', callback_data: 'admt_all_0' }],
      [{ text: '↩️ Back', callback_data: 'adm_back' }]
    ]}
  };
  if (ctx.callbackQuery) { try { return await ctx.editMessageText(`🎫 *Ticket Management*\n\n📊 Overview:\n🟢 Open: *${stats?.open||0}*\n🔵 In Progress: *${stats?.in_progress||0}*\n✅ Resolved: *${stats?.resolved||0}*\n⛔ Closed: *${stats?.closed||0}*\n📊 Total: *${stats?.total||0}*`, opts); } catch(e){} }
  await ctx.reply('🎫 *Ticket Management*', opts);
}

async function showTicketsByStatus(ctx, status, page=0) {
  const statusMap = { open:'OPEN', prog:'IN_PROGRESS', wait:'WAITING', res:'RESOLVED', closed:'CLOSED' };
  const realStatus = statusMap[status] || 'OPEN';
  const tickets = await db.getTicketsByStatus(realStatus, 8, page*8);
  const total = parseInt((await db.query('SELECT COUNT(*) FROM tickets WHERE status=$1',[realStatus])).rows[0].count);

  let text = `${STATUS_EMOJI[realStatus]} *${realStatus} Tickets* (${total} total)\n\n`;
  if (!tickets.length) text += '_No tickets found._';

  const buttons = tickets.map(t => [{
    text: `${PRIORITY_EMOJI[t.priority]||'➡️'} ${t.ticket_id} | ${t.cat_emoji||'📂'} ${t.username?`@${t.username}`:t.first_name||'User'}`,
    callback_data: `admt_view_${t.ticket_id}`
  }]);
  const nav = [];
  if (page > 0) nav.push({ text: '⬅️ Prev', callback_data: `admt_${status}_${page-1}` });
  if ((page+1)*8 < total) nav.push({ text: 'Next ➡️', callback_data: `admt_${status}_${page+1}` });
  if (nav.length) buttons.push(nav);
  buttons.push([{ text: '↩️ Back', callback_data: 'adm_tickets' }]);

  const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } };
  if (ctx.callbackQuery) { try { return await ctx.editMessageText(text, opts); } catch(e){} }
  await ctx.reply(text, opts);
}

async function showTicketDetail(ctx, ticketId) {
  const ticket = await db.getTicket(ticketId);
  if (!ticket) { await ctx.answerCbQuery('Ticket not found.'); return; }

  const user = await db.getUser(ticket.user_id);
  const cat = await db.getCategory(ticket.category_id);
  const messages = await db.getMessages(ticketId, 5);
  const uName = getUserName(user);

  let text = `🎫 *Ticket: ${ticketId}*\n\n━━━━━━━━━━━━━━━━━\n👤 *User:* ${uName} (\`${ticket.user_id}\`)\n${cat?.emoji||'📂'} *Category:* ${cat?.name||'General'}\n📋 *Subject:* ${ticket.subject||'N/A'}\n${STATUS_EMOJI[ticket.status]} *Status:* ${ticket.status}\n${PRIORITY_EMOJI[ticket.priority]||'➡️'} *Priority:* ${ticket.priority}\n📅 *Created:* ${formatDate(ticket.created_at)}\n━━━━━━━━━━━━━━━━━\n\n💬 *Recent Messages:*\n`;

  if (!messages.length) { text += '_No messages._'; }
  else {
    for (const m of messages.slice(-3)) {
      const who = m.sender_type === 'ADMIN' ? '🛡' : '👤';
      text += `${who} ${truncate(m.message || '[Media]', 60)}\n`;
    }
  }

  const kb = {
    inline_keyboard: [
      [{ text: '💬 Reply', callback_data: `adm_reply_${ticketId}` }, { text: '⚡ Quick Reply', callback_data: `adm_qreply_${ticketId}` }],
      [{ text: '✅ Resolve', callback_data: `adm_resolve_${ticketId}` }, { text: '⛔ Close', callback_data: `adm_close_${ticketId}` }],
      [{ text: '🔵 In Progress', callback_data: `adm_status_IN_PROGRESS_${ticketId}` }, { text: '🟡 Waiting', callback_data: `adm_status_WAITING_${ticketId}` }],
      [{ text: '🔼 High', callback_data: `adm_pri_HIGH_${ticketId}` }, { text: '🚨 Urgent', callback_data: `adm_pri_URGENT_${ticketId}` }, { text: '🔽 Low', callback_data: `adm_pri_LOW_${ticketId}` }],
      [{ text: '💬 Live Chat', callback_data: `adm_live_${ticketId}` }, { text: '👤 View User', callback_data: `adm_user_${ticket.user_id}` }],
      [{ text: '📜 Full History', callback_data: `adm_history_${ticketId}` }, { text: '↩️ Back', callback_data: 'adm_tickets' }]
    ]
  };

  const opts = { parse_mode: 'Markdown', reply_markup: kb };
  if (ctx.callbackQuery) { try { return await ctx.editMessageText(text, opts); } catch(e){} }
  const msg = await ctx.reply(text, opts);
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function promptAdminReply(ctx, ticketId) {
  const opts = { parse_mode:'Markdown', reply_markup:{inline_keyboard:[[{text:'⚡ Quick Reply',callback_data:`adm_qreply_${ticketId}`},{text:'↩️ Back',callback_data:`admt_view_${ticketId}`}]]} };
  let msgId;
  if (ctx.callbackQuery) { try { await ctx.editMessageText(`💬 *Reply to Ticket*\n\n\`${ticketId}\`\n\nSend your reply (text, photo, document or voice):`, opts); msgId = ctx.callbackQuery.message.message_id; } catch(e){const m=await ctx.reply('💬 Send your reply:',opts);msgId=m.message_id;} }
  else { const m=await ctx.reply('💬 Send your reply:',opts);msgId=m.message_id; }
  await db.setSession(ADMIN_ID, STATES.ADMIN_REPLY_TICKET, { ticketId, lastMsgId: msgId });
}

async function handleAdminReply(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const { ticketId } = sess.data;
  const msgText = ctx.message?.text || ctx.message?.caption || '';
  const photoId = ctx.message?.photo?.[ctx.message.photo.length-1]?.file_id || null;
  const docId = ctx.message?.document?.file_id || null;
  const voiceId = ctx.message?.voice?.file_id || null;
  try { await ctx.deleteMessage(); } catch(e){}

  if (!msgText && !photoId && !docId && !voiceId) return ctx.reply('⚠️ Send a message or media.');

  const ticket = await db.getTicket(ticketId);
  if (!ticket) return;

  await db.addMessage(ticketId, ADMIN_ID, 'ADMIN', msgText, photoId, docId, voiceId);
  await db.updateTicketStatus(ticketId, 'IN_PROGRESS');

  // Send to user
  const replyText = `🛡 *Support Reply*\n\n🎫 Ticket: \`${ticketId}\`\n\n${msgText || '(See media above)'}`;
  const userKb = { inline_keyboard: [[{text:'💬 Reply',callback_data:`tkt_msg_${ticketId}`},{text:'✅ Mark Resolved',callback_data:`tkt_close_${ticketId}`}]] };
  try {
    if (photoId) { await ctx.telegram.sendPhoto(ticket.user_id, photoId, { caption: replyText, parse_mode:'Markdown', reply_markup: userKb }); }
    else if (voiceId) { await ctx.telegram.sendMessage(ticket.user_id, replyText, { parse_mode:'Markdown', reply_markup: userKb }); await ctx.telegram.sendVoice(ticket.user_id, voiceId); }
    else if (docId) { await ctx.telegram.sendDocument(ticket.user_id, docId, { caption: replyText, parse_mode:'Markdown', reply_markup: userKb }); }
    else { await ctx.telegram.sendMessage(ticket.user_id, replyText, { parse_mode:'Markdown', reply_markup: userKb }); }
  } catch(e){}

  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch(e){}
  await db.clearSession(ADMIN_ID);
  const msg = await ctx.reply(`✅ Reply sent for ticket \`${ticketId}\``, {
    parse_mode:'Markdown',
    reply_markup: { inline_keyboard: [[{text:'🎫 View Ticket',callback_data:`admt_view_${ticketId}`},{text:'↩️ Tickets',callback_data:'adm_tickets'}]] }
  });
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function showQuickRepliesMenu(ctx, ticketId) {
  const qrs = await db.getQuickReplies();
  if (!qrs.length) { await ctx.answerCbQuery('No quick replies saved.', {show_alert:true}); return; }
  const buttons = qrs.map(q => [{ text: q.title, callback_data: `adm_sendqr_${ticketId}_${q.id}` }]);
  buttons.push([{ text: '↩️ Back', callback_data: `admt_view_${ticketId}` }]);
  const opts = { parse_mode:'Markdown', reply_markup:{ inline_keyboard:buttons } };
  if (ctx.callbackQuery) { try { return await ctx.editMessageText('⚡ *Select Quick Reply:*', opts); } catch(e){} }
  await ctx.reply('⚡ Select Quick Reply:', opts);
}

async function sendQuickReply(ctx, ticketId, qrId) {
  const ticket = await db.getTicket(ticketId);
  const qrs = await db.getQuickReplies();
  const qr = qrs.find(q => q.id == qrId);
  if (!qr || !ticket) { await ctx.answerCbQuery('Not found.'); return; }

  await db.addMessage(ticketId, ADMIN_ID, 'ADMIN', qr.message, null, null, null);
  await db.updateTicketStatus(ticketId, 'IN_PROGRESS');

  try {
    await ctx.telegram.sendMessage(ticket.user_id,
      `🛡 *Support Reply*\n\n🎫 \`${ticketId}\`\n\n${qr.message}`,
      { parse_mode:'Markdown', reply_markup: { inline_keyboard: [[{text:'💬 Reply',callback_data:`tkt_msg_${ticketId}`}]] } }
    );
  } catch(e){}

  await ctx.answerCbQuery('✅ Quick reply sent!');
  await showTicketDetail(ctx, ticketId);
}

async function resolveTicket(ctx, ticketId) {
  const ticket = await db.getTicket(ticketId);
  if (!ticket) { await ctx.answerCbQuery('Not found.'); return; }
  await db.updateTicketStatus(ticketId, 'RESOLVED');
  try {
    const ratingEnabled = await db.getSetting('rating_enabled');
    const kb = ratingEnabled==='true'
      ? { inline_keyboard: [[{text:'⭐ Rate Support',callback_data:`tkt_rate_${ticketId}`},{text:'✅ Close Ticket',callback_data:`tkt_close_${ticketId}`}]] }
      : { inline_keyboard: [[{text:'✅ Close Ticket',callback_data:`tkt_close_${ticketId}`}]] };
    await ctx.telegram.sendMessage(ticket.user_id,
      `✅ *Issue Resolved!*\n\n🎫 \`${ticketId}\`\n\nYour support ticket has been resolved by our team.\n\nIf you're satisfied, please rate your experience! ⭐`,
      { parse_mode:'Markdown', reply_markup: kb }
    );
  } catch(e){}
  await ctx.answerCbQuery('✅ Ticket resolved!');
  await showTicketDetail(ctx, ticketId);
}

async function closeTicketAdmin(ctx, ticketId) {
  await db.updateTicketStatus(ticketId, 'CLOSED');
  const ticket = await db.getTicket(ticketId);
  try { await ctx.telegram.sendMessage(ticket?.user_id, `⛔ *Ticket Closed*\n\n🎫 \`${ticketId}\`\n\nYour ticket has been closed by admin. Thank you!`, { parse_mode:'Markdown' }); } catch(e){}
  await ctx.answerCbQuery('✅ Ticket closed!');
  await showTicketsByStatus(ctx, 'open', 0);
}

async function updateTicketStatus(ctx, status, ticketId) {
  await db.updateTicketStatus(ticketId, status);
  const ticket = await db.getTicket(ticketId);
  const statusMsg = { IN_PROGRESS:'🔵 Your ticket is now being processed.', WAITING:'🟡 We need more information from you.' };
  if (statusMsg[status]) {
    try { await ctx.telegram.sendMessage(ticket?.user_id, `${STATUS_EMOJI[status]} *Ticket Update*\n\n🎫 \`${ticketId}\`\n\n${statusMsg[status]}`, { parse_mode:'Markdown' }); } catch(e){}
  }
  await ctx.answerCbQuery(`✅ Status → ${status}`);
  await showTicketDetail(ctx, ticketId);
}

async function updateTicketPriority(ctx, priority, ticketId) {
  await db.updateTicketPriority(ticketId, priority);
  await ctx.answerCbQuery(`✅ Priority → ${priority}`);
  await showTicketDetail(ctx, ticketId);
}

async function showFullHistory(ctx, ticketId) {
  const messages = await db.getMessages(ticketId, 20);
  let text = `📜 *Full History: ${ticketId}*\n\n━━━━━━━━━━━━━━━━━\n`;
  for (const m of messages) {
    const who = m.sender_type==='ADMIN' ? '🛡 Support' : '👤 User';
    const content = m.message || (m.photo_file_id?'[Photo]':m.voice_file_id?'[Voice]':'[Document]');
    text += `${who}: ${content?.slice(0,100)}\n${formatDate(m.created_at)}\n\n`;
  }
  const opts = { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[[{text:'↩️ Back',callback_data:`admt_view_${ticketId}`}]] } };
  if (ctx.callbackQuery) { try { return await ctx.editMessageText(text, opts); } catch(e){} }
  await ctx.reply(text, opts);
}

async function startLiveChat(ctx, ticketId) {
  const ticket = await db.getTicket(ticketId);
  if (!ticket) { await ctx.answerCbQuery('Ticket not found.'); return; }

  await db.setLiveChat(ticketId, true);

  // Notify user
  try {
    await ctx.telegram.sendMessage(ticket.user_id,
      `💬 *Live Chat Started!*\n\n🎫 Ticket: \`${ticketId}\`\n\nA support agent has joined. You can now chat in real-time!\n\n_Send your message now._`,
      { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[[{text:'⛔ End Chat',callback_data:`tkt_endlive_${ticketId}`}]] } }
    );
  } catch(e){}

  // Set admin state to live chat
  try { await ctx.telegram.deleteMessage(ctx.chat.id, ctx.callbackQuery?.message?.message_id); } catch(e){}
  const msg = await ctx.reply(
    `💬 *Live Chat Active*\n\n🎫 \`${ticketId}\`\n\nYou are now in live chat with the user.\nSend messages here to chat directly.\n\n_Type /endchat to end_`,
    { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[[{text:'⛔ End Live Chat',callback_data:`adm_endlive_${ticketId}`}]] } }
  );
  await db.setSession(ADMIN_ID, STATES.ADMIN_IN_LIVE_CHAT, { ticketId, userId: ticket.user_id, lastMsgId: msg.message_id });
}

async function handleLiveChatAdmin(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const { ticketId, userId } = sess.data;
  const msgText = ctx.message?.text || ctx.message?.caption || '';
  const photoId = ctx.message?.photo?.[ctx.message.photo.length-1]?.file_id || null;
  try { await ctx.deleteMessage(); } catch(e){}
  if (!msgText && !photoId) return;
  await db.addMessage(ticketId, ADMIN_ID, 'ADMIN', msgText, photoId);
  try {
    if (photoId) { await ctx.telegram.sendPhoto(userId, photoId, { caption: msgText||'', parse_mode:'Markdown' }); }
    else { await ctx.telegram.sendMessage(userId, `🛡 ${msgText}`, { parse_mode:'Markdown' }); }
  } catch(e){}
}

async function handleLiveChatUser(ctx, ticketId) {
  const userId = ctx.from.id;
  const msgText = ctx.message?.text || ctx.message?.caption || '';
  const photoId = ctx.message?.photo?.[ctx.message.photo.length-1]?.file_id || null;
  try { await ctx.deleteMessage(); } catch(e){}
  if (!msgText && !photoId) return;
  await db.addMessage(ticketId, userId, 'USER', msgText, photoId);
  try {
    if (photoId) { await ctx.telegram.sendPhoto(ADMIN_ID, photoId, { caption: `👤 ${msgText||''}` }); }
    else { await ctx.telegram.sendMessage(ADMIN_ID, `👤 ${msgText}`); }
  } catch(e){}
}

async function endLiveChatAdmin(ctx, ticketId) {
  await db.setLiveChat(ticketId, false);
  const ticket = await db.getTicket(ticketId);
  try { await ctx.telegram.sendMessage(ticket?.user_id, `💬 *Live Chat Ended*\n\n🎫 \`${ticketId}\`\n\nThe support agent has ended the live chat. Your ticket remains open.`, { parse_mode:'Markdown' }); } catch(e){}
  await db.clearSession(ADMIN_ID);
  const sess = await db.getSession(ADMIN_ID);
  if (sess.data.lastMsgId) try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch(e){}
  const msg = await ctx.reply(`✅ Live chat ended for \`${ticketId}\``, { parse_mode:'Markdown', reply_markup:{inline_keyboard:[[{text:'🎫 View Ticket',callback_data:`admt_view_${ticketId}`}]]} });
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

module.exports = {
  showTicketsMenu, showTicketsByStatus, showTicketDetail, promptAdminReply, handleAdminReply,
  showQuickRepliesMenu, sendQuickReply, resolveTicket, closeTicketAdmin, updateTicketStatus,
  updateTicketPriority, showFullHistory, startLiveChat, handleLiveChatAdmin, handleLiveChatUser, endLiveChatAdmin
};
