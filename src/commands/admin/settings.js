const db = require('../../database/database');
const { ADMIN_ID, STATES } = require('../../utils/constants');

async function showSettingsMenu(ctx) {
  const [autoAssist,maintenance,ratingEnabled,liveChat,autoReply,maxTickets,autoClose] = await Promise.all([
    db.getSetting('auto_assist_enabled'), db.getSetting('maintenance_mode'),
    db.getSetting('rating_enabled'), db.getSetting('live_chat_enabled'),
    db.getSetting('auto_reply_message'), db.getSetting('max_active_tickets'),
    db.getSetting('ticket_auto_close_hours')
  ]);
  const text = `⚙️ *Settings*\n\n🤖 Auto-Assist: *${autoAssist==='true'?'✅ ON':'❌ OFF'}*\n🔧 Maintenance: *${maintenance==='true'?'✅ ON':'❌ OFF'}*\n⭐ Ratings: *${ratingEnabled==='true'?'✅ ON':'❌ OFF'}*\n💬 Live Chat: *${liveChat==='true'?'✅ ON':'❌ OFF'}*\n📨 Max Tickets: *${maxTickets||1}*\n⌛ Auto-Close: *${autoClose||48}h*`;
  const opts = { parse_mode:'Markdown', reply_markup:{ inline_keyboard:[
    [{text:`🤖 Auto-Assist: ${autoAssist==='true'?'ON':'OFF'}`,callback_data:`adms_toggle_auto_assist_enabled_${autoAssist==='true'?'false':'true'}`}],
    [{text:`🔧 Maintenance: ${maintenance==='true'?'ON':'OFF'}`,callback_data:`adms_toggle_maintenance_mode_${maintenance==='true'?'false':'true'}`}],
    [{text:`⭐ Ratings: ${ratingEnabled==='true'?'ON':'OFF'}`,callback_data:`adms_toggle_rating_enabled_${ratingEnabled==='true'?'false':'true'}`}],
    [{text:`💬 Live Chat: ${liveChat==='true'?'ON':'OFF'}`,callback_data:`adms_toggle_live_chat_enabled_${liveChat==='true'?'false':'true'}`}],
    [{text:'📨 Set Auto Reply',callback_data:'adms_set_autoreply'}],
    [{text:'↩️ Back',callback_data:'adm_back'}]
  ]}};
  if(ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}}
  const msg=await ctx.reply(text,opts);
  await db.setSession(ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function handleToggleSetting(ctx, key, value) {
  await db.setSetting(key, value);
  await ctx.answerCbQuery(`✅ ${key} → ${value}`);
  await showSettingsMenu(ctx);
}

async function promptSetAutoReply(ctx) {
  const current = await db.getSetting('auto_reply_message');
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_settings'}]]}};
  let msgId;
  if(ctx.callbackQuery){try{await ctx.editMessageText(`📨 *Set Auto Reply Message*\n\nCurrent:\n_${current}_\n\nSend new message:`,opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply('Send new auto reply:',opts);msgId=m.message_id;}}
  else{const m=await ctx.reply('Send new auto reply:',opts);msgId=m.message_id;}
  await db.setSession(ADMIN_ID,STATES.ADMIN_SET_AUTO_REPLY,{lastMsgId:msgId});
}

async function handleAutoReplyInput(ctx) {
  const sess=await db.getSession(ADMIN_ID);
  const msg=ctx.message?.text?.trim();
  try{await ctx.deleteMessage();}catch(e){}
  if(!msg) return;
  await db.setSetting('auto_reply_message',msg);
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  await db.clearSession(ADMIN_ID);
  const m=await ctx.reply('✅ Auto reply message updated!',{reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_settings'}]]}});
  await db.setSession(ADMIN_ID,'IDLE',{lastMsgId:m.message_id});
}

async function showStats(ctx) {
  const [tickets, users, ratings] = await Promise.all([db.getTicketCount(), db.getUserCount(), db.getRatingStats()]);
  const broadcasts = await db.getBroadcasts(1);
  const text = `📊 *Statistics*\n\n━━━━━━━━━━━━━━━━━\n👥 *Users*\n├ Total: *${users}*\n\n🎫 *Tickets*\n├ Total: *${tickets?.total||0}*\n├ 🟢 Open: *${tickets?.open||0}*\n├ 🔵 In Progress: *${tickets?.in_progress||0}*\n├ ✅ Resolved: *${tickets?.resolved||0}*\n└ ⛔ Closed: *${tickets?.closed||0}*\n\n⭐ *Ratings*\n├ Avg: *${ratings?.avg?parseFloat(ratings.avg).toFixed(2):'N/A'}/5*\n└ Total: *${ratings?.total||0}*\n━━━━━━━━━━━━━━━━━`;
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'🔄 Refresh',callback_data:'adm_stats'},{text:'↩️ Back',callback_data:'adm_back'}]]}};
  if(ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}}
  const msg=await ctx.reply(text,opts);
  await db.setSession(ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function showCategoryManage(ctx) {
  const cats=await db.getCategories(false);
  const text=`📂 *Categories* (${cats.length})\n\n${cats.map((c,i)=>`${i+1}. ${c.is_active?'✅':'❌'} ${c.emoji} *${c.name}*`).join('\n')||'_None_'}`;
  const buttons=[
    [{text:'➕ Add Category',callback_data:'admc_add'}],
    ...cats.map(c=>[
      {text:`✏️ ${c.name}`,callback_data:`admc_rename_${c.id}`},
      {text:c.is_active?'🔴 Disable':'🟢 Enable',callback_data:`admc_toggle_${c.id}`},
      {text:'🗑',callback_data:`admc_del_${c.id}`}
    ]),
    [{text:'↩️ Back',callback_data:'adm_back'}]
  ];
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:buttons}};
  if(ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}}
  const msg=await ctx.reply(text,opts);
  await db.setSession(ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function promptAddCategory(ctx) {
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_cats'}]]}};
  let msgId;
  if(ctx.callbackQuery){try{await ctx.editMessageText('📂 *Add Category*\n\nFormat: `EMOJI NAME`\nExample: `🛒 BigBasket`',opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply('Format: EMOJI NAME',opts);msgId=m.message_id;}}
  else{const m=await ctx.reply('Format: EMOJI NAME',opts);msgId=m.message_id;}
  await db.setSession(ADMIN_ID,STATES.ADMIN_ADD_CATEGORY,{lastMsgId:msgId});
}

async function handleAddCategoryInput(ctx) {
  const sess=await db.getSession(ADMIN_ID);
  const text=ctx.message?.text?.trim();
  try{await ctx.deleteMessage();}catch(e){}
  if(!text) return;
  const parts=text.split(' ');
  const emoji=parts[0];
  const name=parts.slice(1).join(' ')||emoji;
  const cat=await db.addCategory(name,emoji);
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  await db.clearSession(ADMIN_ID);
  const msg=await ctx.reply(`✅ Category *${cat.emoji} ${cat.name}* added!`,{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_cats'}]]}});
  await db.setSession(ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function handleToggleCategory(ctx, id) {
  const cat=await db.getCategory(id);
  await db.toggleCategory(id,!cat?.is_active);
  await ctx.answerCbQuery(`✅ ${!cat?.is_active?'Enabled':'Disabled'}!`);
  await showCategoryManage(ctx);
}

async function handleDeleteCategory(ctx, id) {
  await db.deleteCategory(id);
  await ctx.answerCbQuery('✅ Deleted!');
  await showCategoryManage(ctx);
}

async function showFAQManage(ctx) {
  const faqs=await db.getFAQs(null,false);
  let text=`❓ *FAQ Management* (${faqs.length})\n\n`;
  if(!faqs.length) text+='_No FAQs._';
  else text+=faqs.slice(0,8).map((f,i)=>`${i+1}. ${f.is_active?'✅':'❌'} ${f.question.slice(0,50)}`).join('\n');
  const buttons=[
    [{text:'➕ Add FAQ',callback_data:'admf_add'}],
    ...faqs.slice(0,5).map(f=>[{text:`🗑 ${f.question.slice(0,40)}`,callback_data:`admf_del_${f.id}`},{text:f.is_active?'🔴':'🟢',callback_data:`admf_tog_${f.id}`}]),
    [{text:'↩️ Back',callback_data:'adm_back'}]
  ];
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:buttons}};
  if(ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}}
  const msg=await ctx.reply(text,opts);
  await db.setSession(ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function promptAddFAQ(ctx) {
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_faqs'}]]}};
  let msgId;
  if(ctx.callbackQuery){try{await ctx.editMessageText('❓ *Add FAQ*\n\nSend the *question*:',opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply('Send question:',opts);msgId=m.message_id;}}
  else{const m=await ctx.reply('Send question:',opts);msgId=m.message_id;}
  await db.setSession(ADMIN_ID,STATES.ADMIN_ADD_FAQ_Q,{lastMsgId:msgId});
}

async function handleFAQQuestionInput(ctx) {
  const sess=await db.getSession(ADMIN_ID);
  const q=ctx.message?.text?.trim();
  try{await ctx.deleteMessage();}catch(e){}
  if(!q) return;
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  const msg=await ctx.reply('✏️ Now send the *answer*:',{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_faqs'}]]}});
  await db.setSession(ADMIN_ID,STATES.ADMIN_ADD_FAQ_A,{question:q,lastMsgId:msg.message_id});
}

async function handleFAQAnswerInput(ctx) {
  const sess=await db.getSession(ADMIN_ID);
  const a=ctx.message?.text?.trim();
  try{await ctx.deleteMessage();}catch(e){}
  if(!a) return;
  await db.addFAQ(null,sess.data.question,a);
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  await db.clearSession(ADMIN_ID);
  const msg=await ctx.reply('✅ FAQ added!',{reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_faqs'}]]}});
  await db.setSession(ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function showQuickRepliesManage(ctx) {
  const qrs=await db.getQuickReplies();
  let text=`⚡ *Quick Replies* (${qrs.length})\n\n`;
  if(!qrs.length) text+='_None._';
  else text+=qrs.map((q,i)=>`${i+1}. *${q.title}*: ${q.message.slice(0,50)}`).join('\n');
  const buttons=[
    [{text:'➕ Add Quick Reply',callback_data:'admqr_add'}],
    ...qrs.slice(0,5).map(q=>[{text:`🗑 ${q.title}`,callback_data:`admqr_del_${q.id}`}]),
    [{text:'↩️ Back',callback_data:'adm_back'}]
  ];
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:buttons}};
  if(ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}}
  const msg=await ctx.reply(text,opts);
  await db.setSession(ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function promptAddQR(ctx) {
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_qr'}]]}};
  let msgId;
  if(ctx.callbackQuery){try{await ctx.editMessageText('⚡ *Add Quick Reply*\n\nSend the *title*:',opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply('Send title:',opts);msgId=m.message_id;}}
  else{const m=await ctx.reply('Send title:',opts);msgId=m.message_id;}
  await db.setSession(ADMIN_ID,STATES.ADMIN_ADD_QR_TITLE,{lastMsgId:msgId});
}

async function handleQRTitleInput(ctx) {
  const sess=await db.getSession(ADMIN_ID);
  const t=ctx.message?.text?.trim();
  try{await ctx.deleteMessage();}catch(e){}
  if(!t) return;
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  const msg=await ctx.reply('✏️ Now send the *message*:',{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_qr'}]]}});
  await db.setSession(ADMIN_ID,STATES.ADMIN_ADD_QR_MSG,{title:t,lastMsgId:msg.message_id});
}

async function handleQRMsgInput(ctx) {
  const sess=await db.getSession(ADMIN_ID);
  const m=ctx.message?.text?.trim();
  try{await ctx.deleteMessage();}catch(e){}
  if(!m) return;
  await db.addQuickReply(sess.data.title,m);
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  await db.clearSession(ADMIN_ID);
  const msg=await ctx.reply('✅ Quick reply added!',{reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_qr'}]]}});
  await db.setSession(ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function deleteQuickReply(ctx, id) {
  await db.deleteQuickReply(id);
  await ctx.answerCbQuery('✅ Deleted!');
  await showQuickRepliesManage(ctx);
}

module.exports = {
  showSettingsMenu, handleToggleSetting, promptSetAutoReply, handleAutoReplyInput, showStats,
  showCategoryManage, promptAddCategory, handleAddCategoryInput, handleToggleCategory, handleDeleteCategory,
  showFAQManage, promptAddFAQ, handleFAQQuestionInput, handleFAQAnswerInput,
  showQuickRepliesManage, promptAddQR, handleQRTitleInput, handleQRMsgInput, deleteQuickReply
};
