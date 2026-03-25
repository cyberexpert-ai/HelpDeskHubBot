const db = require('../../database/database');
const { safeDelete } = require('../../utils/helpers');
const { getMainKeyboard } = require('./index');

async function showFAQMenu(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const categories = await db.getCategories(true);
  const allFaqs = await db.getFAQs(null, true);

  const buttons = [
    [{ text: `📋 All FAQs (${allFaqs.length})`, callback_data: 'faq_all' }],
    ...categories.map(c => [{ text: `${c.emoji} ${c.name}`, callback_data: `faq_cat_${c.id}` }]),
    [{ text: '🔍 Search FAQ', callback_data: 'faq_search' }],
    [{ text: '🔙 Main Menu', callback_data: 'u_main' }]
  ];

  const msg = await ctx.reply(
    `❓ *Frequently Asked Questions*\n\nSelect a category or view all FAQs:`,
    { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true, inline_keyboard: buttons } }
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

async function showFAQList(ctx, categoryId = null) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const faqs = await db.getFAQs(categoryId, true);
  if (!faqs.length) {
    const msg = await ctx.reply('❌ No FAQs in this category.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'u_faq' }]] }
    });
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  const buttons = faqs.map(f => [{ text: `❓ ${f.question.slice(0, 60)}`, callback_data: `faq_view_${f.id}` }]);
  buttons.push([{ text: '🔙 Back', callback_data: 'u_faq' }]);

  const msg = await ctx.reply(`❓ *FAQs* (${faqs.length}):\n\nTap a question to see the answer:`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

async function showFAQAnswer(ctx, faqId) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const faq = await db.getFAQ(faqId);
  if (!faq) {
    const msg = await ctx.reply('❌ FAQ not found.', { reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'u_faq' }]] } });
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  await db.incrementFAQView(faqId);

  const msg = await ctx.reply(
    `❓ *Question:*\n${faq.question}\n\n💡 *Answer:*\n${faq.answer}\n\n👁 Viewed ${faq.view_count + 1} times`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: '✅ This helped!', callback_data: 'faq_helpful' }, { text: '❌ Not helpful', callback_data: 'faq_not_helpful' }],
      [{ text: '❓ More FAQs', callback_data: 'faq_all' }],
      [{ text: '📩 Still need help?', callback_data: 'tkt_new' }],
      [{ text: '🔙 Back', callback_data: 'u_faq' }]
    ]}}
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

async function showHelp(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const msg = await ctx.reply(
    `ℹ️ *How to Use HelpDesk*\n\n━━━━━━━━━━━━━━━━━\n\n📩 *Contact Support*\nCreate a new support ticket. Select category → write subject → describe issue.\n\n🎫 *My Tickets*\nView all your tickets, chat history and status.\n\n❓ *FAQ*\nInstant answers to common questions.\n\n📢 *Announcements*\nLatest updates from support team.\n\n⭐ *Rate Us*\nRate support after ticket resolved.\n\n━━━━━━━━━━━━━━━━━\n\n*Ticket Status:*\n🟢 OPEN — Waiting for support\n🔵 IN_PROGRESS — Being handled\n🟡 WAITING — Waiting your reply\n✅ RESOLVED — Issue resolved\n⛔ CLOSED — Ticket closed\n\n━━━━━━━━━━━━━━━━━\n\n💡 *Tips:*\n• Be specific about your issue\n• Include screenshots if needed\n• One active ticket at a time\n• Reply within 48h to keep ticket open`,
    { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true, inline_keyboard: [
      [{ text: '📩 Create Ticket', callback_data: 'tkt_new' }],
      [{ text: '❓ View FAQs', callback_data: 'u_faq' }],
      [{ text: '🔙 Main Menu', callback_data: 'u_main' }]
    ]}}
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

async function showAnnouncements(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const broadcasts = await db.getBroadcasts(5);
  let text = `📢 *Announcements*\n\n━━━━━━━━━━━━━━━━━\n`;
  if (!broadcasts.length) {
    text += '_No announcements yet._';
  } else {
    text += broadcasts.map((b, i) => `*${i + 1}.* ${(b.message || '[Media]').slice(0, 150)}`).join('\n\n');
  }
  text += '\n━━━━━━━━━━━━━━━━━';

  const msg = await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: { remove_keyboard: true, inline_keyboard: [[{ text: '🔙 Main Menu', callback_data: 'u_main' }]] }
  });
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

async function showRateUs(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  // Get last resolved/closed ticket
  const tickets = await db.getTicketsByUser(userId);
  const ratable = tickets.find(t => t.status === 'RESOLVED' || t.status === 'CLOSED');

  if (!ratable) {
    const msg = await ctx.reply(
      `⭐ *Rate Us*\n\nYou don't have any completed tickets to rate yet.\n\nCreate a support ticket to experience our service!`,
      { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true, inline_keyboard: [
        [{ text: '📩 Contact Support', callback_data: 'tkt_new' }],
        [{ text: '🔙 Main Menu', callback_data: 'u_main' }]
      ]}}
    );
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  const { promptRating } = require('./ticket');
  await promptRating(ctx, ratable.ticket_id);
}

module.exports = { showFAQMenu, showFAQList, showFAQAnswer, showHelp, showAnnouncements, showRateUs };
