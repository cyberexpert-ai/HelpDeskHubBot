const db = require('../../database/database');
const { STATES, ADMIN_ID, STATUS_EMOJI, PRIORITY_EMOJI } = require('../../utils/constants');
const { generateTicketId, formatDate, safeDelete, deleteUserMsg, getUserName, truncate } = require('../../utils/helpers');
const { getMainKeyboard } = require('./index');
const logger = require('../../utils/logger');

// ── STEP 1: Select Category ──────────────────────────────────────────────────
async function startCreateTicket(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  // Check existing active ticket
  const active = await db.getActiveTicket(userId);
  if (active) {
    const msg = await ctx.reply(
      `⚠️ *You already have an active ticket!*\n\n🎫 *${active.ticket_id}*\n${STATUS_EMOJI[active.status]} Status: ${active.status}\n📋 Subject: ${active.subject || 'N/A'}\n\nClose it first or continue chatting.`,
      {
        parse_mode: 'Markdown',
        reply_markup: { remove_keyboard: true, inline_keyboard: [
          [{ text: '💬 Continue Chat', callback_data: `tkt_open_${active.ticket_id}` }],
          [{ text: '⛔ Close Ticket', callback_data: `tkt_close_${active.ticket_id}` }],
          [{ text: '🔙 Main Menu', callback_data: 'u_main' }]
        ]}
      }
    );
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  const categories = await db.getCategories(true);
  if (!categories.length) {
    const msg = await ctx.reply('❌ No support categories available. Please try again later.', {
      reply_markup: { remove_keyboard: true, inline_keyboard: [[{ text: '🔙 Main Menu', callback_data: 'u_main' }]] }
    });
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  const buttons = categories.map(c => [{ text: `${c.emoji} ${c.name}`, callback_data: `tkt_cat_${c.id}` }]);
  buttons.push([{ text: '🔙 Main Menu', callback_data: 'u_main' }]);

  const msg = await ctx.reply(
    `📩 *Contact Support*\n\nPlease select a category for your issue:`,
    { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true, inline_keyboard: buttons } }
  );
  await db.setSession(userId, STATES.SELECTING_CATEGORY, { lastMsgId: msg.message_id });
}

// ── STEP 2: Write Subject ────────────────────────────────────────────────────
async function askSubject(ctx, categoryId) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const cat = await db.getCategory(categoryId);
  const msg = await ctx.reply(
    `${cat?.emoji || '📂'} *Category: ${cat?.name}*\n\n📝 *Step 1 of 2* — Write a short subject/title:\n\n_Examples:_\n• "Order not received"\n• "Payment failed"\n• "Voucher not working"`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'tkt_new' }]] } }
  );
  await db.setSession(userId, STATES.WRITING_SUBJECT, {
    lastMsgId: msg.message_id, categoryId, categoryName: cat?.name, categoryEmoji: cat?.emoji || '📂'
  });
}

// ── STEP 3: Write Message ────────────────────────────────────────────────────
async function askMessage(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const msg = await ctx.reply(
    `✉️ *Step 2 of 2* — Describe your issue in detail:\n\nYou can send:\n📝 Text\n📸 Photo\n📄 Document\n🎤 Voice note\n\n⚠️ Be specific to get faster help!`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'tkt_new' }]] } }
  );
  await db.setSession(userId, STATES.WRITING_MESSAGE, { ...sess.data, lastMsgId: msg.message_id });
}

// ── STEP 4: Submit Ticket ────────────────────────────────────────────────────
async function submitTicket(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.state !== STATES.WRITING_MESSAGE) return;

  const msgText = ctx.message?.text || ctx.message?.caption || '';
  const photoId = ctx.message?.photo?.[ctx.message.photo.length - 1]?.file_id || null;
  const docId = ctx.message?.document?.file_id || null;
  const voiceId = ctx.message?.voice?.file_id || null;

  if (!msgText && !photoId && !docId && !voiceId) {
    await ctx.reply('⚠️ Please send a text, photo, document or voice note.');
    return;
  }
  await deleteUserMsg(ctx);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const ticketId = generateTicketId();
  const { categoryId, categoryName, categoryEmoji, subject } = sess.data;

  await db.createTicket(ticketId, userId, categoryId, subject);
  await db.addMessage(ticketId, userId, 'USER', msgText, photoId, docId, voiceId);

  const autoReply = await db.getSetting('auto_reply_message');
  const autoAssist = await db.getSetting('auto_assist_enabled');

  const msg = await ctx.reply(
    `✅ *Ticket Created!*\n\n━━━━━━━━━━━━━━━━━\n🎫 *ID:* \`${ticketId}\`\n${categoryEmoji} *Category:* ${categoryName}\n📋 *Subject:* ${subject}\n🟢 *Status:* OPEN\n📅 ${formatDate(new Date())}\n━━━━━━━━━━━━━━━━━\n\n${autoReply || '⏳ Support team will respond shortly!'}`,
    { parse_mode: 'Markdown', ...getMainKeyboard() }
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });

  await notifyAdmin(ctx, { ticketId, userId, msgText, photoId, docId, voiceId, subject, categoryName, categoryEmoji });

  if (autoAssist === 'true') {
    await sendAutoAssist(ctx, userId, ticketId, msgText, categoryId);
  }
}

async function notifyAdmin(ctx, { ticketId, userId, msgText, photoId, docId, voiceId, subject, categoryName, categoryEmoji }) {
  try {
    const user = await db.getUser(userId);
    const uName = getUserName(user);
    const vip = user?.is_vip ? ' 👑' : '';

    const adminText = `🎫 *New Ticket*\n\n━━━━━━━━━━━━━━━━━\n🆔 \`${ticketId}\`\n👤 ${uName}${vip} (\`${userId}\`)\n${categoryEmoji} ${categoryName}\n📋 ${subject}\n🟢 OPEN\n━━━━━━━━━━━━━━━━━\n\n${msgText || '(Media attached)'}`;

    const kb = { inline_keyboard: [
      [{ text: '💬 Reply', callback_data: `adm_reply_${ticketId}` }, { text: '⚡ Quick Reply', callback_data: `adm_qreply_${ticketId}` }],
      [{ text: '✅ Resolve', callback_data: `adm_resolve_${ticketId}` }, { text: '⛔ Close', callback_data: `adm_close_${ticketId}` }],
      [{ text: '🔴 High', callback_data: `adm_pri_HIGH_${ticketId}` }, { text: '🚨 Urgent', callback_data: `adm_pri_URGENT_${ticketId}` }],
      [{ text: '💬 Live Chat', callback_data: `adm_live_${ticketId}` }, { text: '👤 User', callback_data: `adm_user_${userId}` }]
    ]};

    let adminMsg;
    if (photoId) { adminMsg = await ctx.telegram.sendPhoto(ADMIN_ID, photoId, { caption: adminText, parse_mode: 'Markdown', reply_markup: kb }); }
    else if (voiceId) { adminMsg = await ctx.telegram.sendMessage(ADMIN_ID, adminText, { parse_mode: 'Markdown', reply_markup: kb }); await ctx.telegram.sendVoice(ADMIN_ID, voiceId); }
    else if (docId) { adminMsg = await ctx.telegram.sendDocument(ADMIN_ID, docId, { caption: adminText, parse_mode: 'Markdown', reply_markup: kb }); }
    else { adminMsg = await ctx.telegram.sendMessage(ADMIN_ID, adminText, { parse_mode: 'Markdown', reply_markup: kb }); }

    if (adminMsg) await db.setTicketAdmin(ticketId, ADMIN_ID, adminMsg.message_id);
  } catch (err) { logger.error('Admin notify: ' + err.message); }
}

async function sendAutoAssist(ctx, userId, ticketId, msgText, categoryId) {
  try {
    const faqs = await db.getFAQs(categoryId, true);
    if (!faqs.length) return;
    const relevant = faqs.filter(f => {
      if (!msgText) return false;
      const words = f.question.toLowerCase().split(' ');
      return words.some(w => w.length > 3 && msgText.toLowerCase().includes(w));
    }).slice(0, 3);
    if (!relevant.length) return;
    const buttons = relevant.map(f => [{ text: `❓ ${f.question.slice(0, 55)}`, callback_data: `faq_view_${f.id}` }]);
    buttons.push([{ text: '🚫 Not helpful', callback_data: 'faq_not_helpful' }]);
    await ctx.telegram.sendMessage(userId,
      `🤖 *Auto-Assist*\n\nI found related FAQs that might help:\n\n_(Ticket is open — agent will respond shortly)_`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }
    );
  } catch (e) {}
}

// ── MY TICKETS ───────────────────────────────────────────────────────────────
async function showMyTickets(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const tickets = await db.getTicketsByUser(userId);
  if (!tickets.length) {
    const msg = await ctx.reply(
      `🎫 *My Tickets*\n\n📭 No tickets yet.\n\nTap *Contact Support* to create one!`,
      { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true, inline_keyboard: [
        [{ text: '📩 Contact Support', callback_data: 'tkt_new' }],
        [{ text: '🔙 Main Menu', callback_data: 'u_main' }]
      ]}}
    );
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  const open = tickets.filter(t => !['CLOSED','RESOLVED'].includes(t.status));
  const closed = tickets.filter(t => ['CLOSED','RESOLVED'].includes(t.status));

  const buttons = [];
  if (open.length) {
    buttons.push([{ text: '── Active Tickets ──', callback_data: 'noop' }]);
    open.slice(0, 5).forEach(t => buttons.push([{
      text: `${STATUS_EMOJI[t.status]} ${t.ticket_id} | ${t.cat_emoji||'📂'} ${t.cat_name||'General'}`,
      callback_data: `tkt_open_${t.ticket_id}`
    }]));
  }
  if (closed.length) {
    buttons.push([{ text: '── Closed Tickets ──', callback_data: 'noop' }]);
    closed.slice(0, 3).forEach(t => buttons.push([{
      text: `${STATUS_EMOJI[t.status]} ${t.ticket_id} | ${t.cat_emoji||'📂'} ${t.cat_name||'General'}`,
      callback_data: `tkt_open_${t.ticket_id}`
    }]));
  }
  buttons.push([{ text: '🔙 Main Menu', callback_data: 'u_main' }]);

  const msg = await ctx.reply(
    `🎫 *My Tickets*\n\n🟢 Active: *${open.length}* | ⛔ Closed: *${closed.length}*\n\nTap a ticket to view details:`,
    { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true, inline_keyboard: buttons } }
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

async function showTicketDetail(ctx, ticketId) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const ticket = await db.getTicket(ticketId);
  if (!ticket || String(ticket.user_id) !== String(userId)) {
    const msg = await ctx.reply(`⚠️ Ticket not found: \`${ticketId}\``, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'u_tickets' }]] }
    });
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  const cat = await db.getCategory(ticket.category_id);
  const messages = await db.getMessages(ticketId);

  let text = `🎫 *Ticket: ${ticketId}*\n\n━━━━━━━━━━━━━━━━━\n${cat?.emoji||'📂'} *Category:* ${cat?.name||'General'}\n📋 *Subject:* ${ticket.subject || 'N/A'}\n${STATUS_EMOJI[ticket.status]} *Status:* ${ticket.status}\n${PRIORITY_EMOJI[ticket.priority]||'➡️'} *Priority:* ${ticket.priority}\n💬 *Messages:* ${messages.length}\n📅 *Created:* ${formatDate(ticket.created_at)}\n`;
  if (ticket.closed_at) text += `⛔ *Closed:* ${formatDate(ticket.closed_at)}\n`;
  text += '━━━━━━━━━━━━━━━━━';

  const buttons = [];
  if (ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS') {
    buttons.push([{ text: '💬 Send Message', callback_data: `tkt_msg_${ticketId}` }]);
    if (ticket.live_chat_active) buttons.push([{ text: '🔴 Live Chat Active', callback_data: `tkt_livechat_${ticketId}` }]);
    buttons.push([{ text: '⛔ Close Ticket', callback_data: `tkt_close_${ticketId}` }]);
  } else if (ticket.status === 'WAITING') {
    buttons.push([{ text: '💬 Reply to Support', callback_data: `tkt_msg_${ticketId}` }]);
  } else if (ticket.status === 'RESOLVED') {
    const rated = (await db.query('SELECT * FROM ratings WHERE ticket_id=$1', [ticketId])).rows[0];
    if (!rated) buttons.push([{ text: '⭐ Rate Support', callback_data: `tkt_rate_${ticketId}` }]);
    buttons.push([{ text: '🔄 Reopen Ticket', callback_data: `tkt_reopen_${ticketId}` }]);
  }
  buttons.push([{ text: '💬 View Messages', callback_data: `tkt_history_${ticketId}` }]);
  buttons.push([{ text: '🔙 My Tickets', callback_data: 'u_tickets' }]);

  const msg = await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

async function showTicketHistory(ctx, ticketId) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const messages = await db.getMessages(ticketId, 15);
  let text = `💬 *Ticket History*\n\`${ticketId}\`\n\n━━━━━━━━━━━━━━━━━\n`;
  if (!messages.length) { text += '_No messages yet._'; }
  else {
    for (const m of messages) {
      const who = m.sender_type === 'USER' ? '👤 You' : '🛡 Support';
      const content = m.message || (m.photo_file_id ? '📸 [Photo]' : m.voice_file_id ? '🎤 [Voice]' : '📄 [Document]');
      text += `*${who}:*\n${content?.slice(0, 100)}\n_${formatDate(m.created_at)}_\n\n`;
    }
  }
  text += '━━━━━━━━━━━━━━━━━';

  const msg = await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: `tkt_open_${ticketId}` }]] }
  });
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

async function promptSendMessage(ctx, ticketId) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const msg = await ctx.reply(
    `💬 *Send Message*\n\nTicket: \`${ticketId}\`\n\nSend your message (text, photo, document or voice):`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: `tkt_open_${ticketId}` }]] } }
  );
  await db.setSession(userId, STATES.WRITING_MESSAGE, { lastMsgId: msg.message_id, ticketId, isReply: true });
}

async function handleUserMessage(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);

  const msgText = ctx.message?.text || ctx.message?.caption || '';
  const photoId = ctx.message?.photo?.[ctx.message.photo.length - 1]?.file_id || null;
  const docId = ctx.message?.document?.file_id || null;
  const voiceId = ctx.message?.voice?.file_id || null;
  if (!msgText && !photoId && !docId && !voiceId) return;

  const { ticketId } = sess.data;
  await deleteUserMsg(ctx);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const ticket = await db.getTicket(ticketId);
  if (!ticket || ticket.status === 'CLOSED') {
    const msg = await ctx.reply('⚠️ This ticket is closed.', {
      reply_markup: { inline_keyboard: [[{ text: '📩 New Ticket', callback_data: 'tkt_new' }], [{ text: '🔙 Main Menu', callback_data: 'u_main' }]] }
    });
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  await db.addMessage(ticketId, userId, 'USER', msgText, photoId, docId, voiceId);

  const msg = await ctx.reply(
    `✅ *Message sent!*\n\nTicket: \`${ticketId}\`\nSupport will respond shortly.`,
    { parse_mode: 'Markdown', ...getMainKeyboard() }
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });

  // Forward to admin
  try {
    const user = await db.getUser(userId);
    const uName = getUserName(user);
    const replyText = `💬 *User Reply*\n\n🎫 \`${ticketId}\`\n👤 ${uName}\n\n${msgText || '(Media)'}`;
    const kb = { inline_keyboard: [[{ text: '💬 Reply', callback_data: `adm_reply_${ticketId}` }, { text: '✅ Resolve', callback_data: `adm_resolve_${ticketId}` }]] };
    if (photoId) { await ctx.telegram.sendPhoto(ADMIN_ID, photoId, { caption: replyText, parse_mode: 'Markdown', reply_markup: kb }); }
    else if (voiceId) { await ctx.telegram.sendMessage(ADMIN_ID, replyText, { parse_mode: 'Markdown', reply_markup: kb }); await ctx.telegram.sendVoice(ADMIN_ID, voiceId); }
    else if (docId) { await ctx.telegram.sendDocument(ADMIN_ID, docId, { caption: replyText, parse_mode: 'Markdown', reply_markup: kb }); }
    else { await ctx.telegram.sendMessage(ADMIN_ID, replyText, { parse_mode: 'Markdown', reply_markup: kb }); }
  } catch(e) {}
}

async function closeTicket(ctx, ticketId, fromUser = true) {
  const userId = ctx.from.id;
  await db.updateTicketStatus(ticketId, 'CLOSED');
  const ratingEnabled = await db.getSetting('rating_enabled');

  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const kb = { inline_keyboard: [] };
  // Show Rate Us after closing
  if (ratingEnabled === 'true' && fromUser) {
    kb.inline_keyboard.push([{ text: '⭐ Rate Your Experience', callback_data: `tkt_rate_${ticketId}` }]);
  }
  kb.inline_keyboard.push([{ text: '📩 New Ticket', callback_data: 'tkt_new' }, { text: '🔙 Main Menu', callback_data: 'u_main' }]);

  const msg = await ctx.reply(
    `⛔ *Ticket Closed*\n\n🎫 \`${ticketId}\`\n\nThank you for contacting HelpDesk! 👋${ratingEnabled === 'true' && fromUser ? '\n\n⭐ Please rate your experience below!' : ''}`,
    { parse_mode: 'Markdown', ...getMainKeyboard() }
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });

  // Send rating prompt as separate message
  if (ratingEnabled === 'true' && fromUser) {
    setTimeout(async () => {
      try {
        await ctx.telegram.sendMessage(userId,
          `⭐ *How was your support experience?*\n\nTicket: \`${ticketId}\``,
          { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
            [{ text: '⭐ 1', callback_data: `rat_${ticketId}_1` }, { text: '⭐⭐ 2', callback_data: `rat_${ticketId}_2` }, { text: '⭐⭐⭐ 3', callback_data: `rat_${ticketId}_3` }],
            [{ text: '⭐⭐⭐⭐ 4', callback_data: `rat_${ticketId}_4` }, { text: '⭐⭐⭐⭐⭐ 5', callback_data: `rat_${ticketId}_5` }],
            [{ text: '⏭ Skip', callback_data: 'u_main' }]
          ]}}
        );
      } catch(e) {}
    }, 1000);
  }

  if (fromUser) {
    try { await ctx.telegram.sendMessage(ADMIN_ID, `⛔ *Ticket closed by user*\n\n🎫 \`${ticketId}\``, { parse_mode: 'Markdown' }); } catch(e) {}
  }
}

async function promptRating(ctx, ticketId) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const msg = await ctx.reply(
    `⭐ *Rate Your Experience*\n\nTicket: \`${ticketId}\`\n\nHow would you rate our support?`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: '😞 1', callback_data: `rat_${ticketId}_1` }, { text: '😕 2', callback_data: `rat_${ticketId}_2` }, { text: '😐 3', callback_data: `rat_${ticketId}_3` }],
      [{ text: '😊 4', callback_data: `rat_${ticketId}_4` }, { text: '😍 5 - Excellent!', callback_data: `rat_${ticketId}_5` }],
      [{ text: '⏭ Skip', callback_data: 'u_main' }]
    ]}}
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

async function handleRating(ctx, ticketId, rating) {
  const userId = ctx.from.id;
  await db.addRating(ticketId, userId, rating, null);
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const stars = ['','😞','😕','😐','😊','😍'][rating] + ' ' + '⭐'.repeat(rating);
  const msg = await ctx.reply(
    `${stars}\n\n*Thank you for rating us ${rating}/5!*\n\nYour feedback helps us improve. 🙏`,
    { parse_mode: 'Markdown', ...getMainKeyboard() }
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });

  // Notify admin
  try {
    await ctx.telegram.sendMessage(ADMIN_ID, `⭐ *Rating Received*\n\n🎫 \`${ticketId}\`\n${'⭐'.repeat(rating)} (${rating}/5)\n👤 User: \`${userId}\``, { parse_mode: 'Markdown' });
  } catch(e) {}
}

module.exports = {
  startCreateTicket, askSubject, askMessage, submitTicket,
  showMyTickets, showTicketDetail, showTicketHistory,
  promptSendMessage, handleUserMessage, closeTicket, promptRating, handleRating, notifyAdmin
};
