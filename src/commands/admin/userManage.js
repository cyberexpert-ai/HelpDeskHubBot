const db = require('../../database/database');
const { ADMIN_ID, STATES } = require('../../utils/constants');
const { formatDate, safeDelete, getUserName } = require('../../utils/helpers');

async function showUsersMenu(ctx) {
  const count = await db.getUserCount();
  const opts = { parse_mode:'Markdown', reply_markup:{inline_keyboard:[
    [{text:'🔍 Search User',callback_data:'admu_search'},{text:'📋 All Users',callback_data:'admu_list_0'}],
    [{text:'🚫 Block User',callback_data:'admu_block_prompt'},{text:'✅ Unblock User',callback_data:'admu_unblock_prompt'}],
    [{text:'⏳ Temp Restrict',callback_data:'admu_temp_prompt'},{text:'👑 VIP List',callback_data:'admu_vip'}],
    [{text:'↩️ Back',callback_data:'adm_back'}]
  ]}};
  if (ctx.callbackQuery) { try { return await ctx.editMessageText(`👥 *User Management*\n\nTotal Users: *${count}*`, opts); } catch(e){} }
  await ctx.reply(`👥 *User Management*\n\nTotal: *${count}*`, opts);
}

async function promptSearchUser(ctx) {
  const opts = { parse_mode:'Markdown', reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_users'}]]} };
  let msgId;
  if (ctx.callbackQuery) { try{await ctx.editMessageText('🔍 *Search User*\n\nSend Telegram User ID:',opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply('Send User ID:',opts);msgId=m.message_id;} }
  else { const m=await ctx.reply('Send User ID:',opts);msgId=m.message_id; }
  await db.setSession(ADMIN_ID,'ADMIN_SEARCH_USER',{lastMsgId:msgId});
}

async function handleSearchInput(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const id = parseInt(ctx.message?.text?.trim());
  try { await ctx.deleteMessage(); } catch(e){}
  if (isNaN(id)) return ctx.reply('⚠️ Invalid ID.');
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch(e){}
  await db.clearSession(ADMIN_ID);
  await showUserProfile(ctx, id);
}

async function showUserProfile(ctx, userId, edit=false) {
  const user = await db.getUser(userId);
  if (!user) {
    const opts = { parse_mode:'Markdown', reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_users'}]]} };
    if(edit&&ctx.callbackQuery){try{await ctx.editMessageText(`⚠️ User \`${userId}\` not found.`,opts);}catch(e){}}
    else { const msg=await ctx.reply(`⚠️ User \`${userId}\` not found.`,opts); await db.setSession(ADMIN_ID,'IDLE',{lastMsgId:msg.message_id}); }
    return;
  }
  const tickets = await db.getTicketsByUser(userId);
  const notes = await db.getNotes(userId);
  const text = `👤 *User Profile*\n\n━━━━━━━━━━━━━━━━━\n🆔 \`${user.telegram_id}\`\n👤 ${user.first_name||''} ${user.last_name||''}\n📱 ${user.username?`@${user.username}`:'No username'}\n👑 VIP: ${user.is_vip?'✅':'❌'}\n🚫 Blocked: ${user.is_blocked?'✅':'❌'}\n⏳ Temp: ${user.is_temp_blocked?'✅':'❌'}\n🎫 Tickets: ${tickets.length}\n📝 Notes: ${notes.length}\n📅 Joined: ${formatDate(user.created_at)}\n━━━━━━━━━━━━━━━━━`;
  const opts = { parse_mode:'Markdown', reply_markup:{inline_keyboard:[
    [{text:'💬 Message',callback_data:`admu_msg_${userId}`},{text:'🎫 Tickets',callback_data:`admu_tickets_${userId}`}],
    user.is_vip?[{text:'👑 Remove VIP',callback_data:`admu_vip_off_${userId}`}]:[{text:'👑 Give VIP',callback_data:`admu_vip_on_${userId}`}],
    user.is_blocked?[{text:'✅ Unblock',callback_data:`admu_unblock_${userId}`}]:[{text:'🚫 Block',callback_data:`admu_block_${userId}`},{text:'⏳ Temp',callback_data:`admu_temp_${userId}`}],
    [{text:'📝 Add Note',callback_data:`admu_note_${userId}`},{text:'📋 View Notes',callback_data:`admu_notes_${userId}`}],
    [{text:'↩️ Back',callback_data:'adm_users'}]
  ]}};
  if (edit&&ctx.callbackQuery) { try{return await ctx.editMessageText(text,opts);}catch(e){} }
  const msg = await ctx.reply(text,opts);
  await db.setSession(ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function promptBlockUser(ctx, userId) {
  const opts = { parse_mode:'Markdown', reply_markup:{inline_keyboard:[[{text:'↩️ Cancel',callback_data:`admu_view_${userId}`}]]} };
  let msgId;
  if(ctx.callbackQuery){try{await ctx.editMessageText(`🚫 *Block User \`${userId}\`*\n\nSend reason:`,opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply('Send reason:',opts);msgId=m.message_id;}}
  else{const m=await ctx.reply('Send reason:',opts);msgId=m.message_id;}
  await db.setSession(ADMIN_ID,STATES.ADMIN_BLOCK_REASON,{targetUserId:userId,lastMsgId:msgId});
}

async function handleBlockReasonInput(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const reason = ctx.message?.text?.trim();
  try{await ctx.deleteMessage();}catch(e){}
  if(!reason) return;
  await db.blockUser(sess.data.targetUserId, reason);
  try{await ctx.telegram.sendMessage(sess.data.targetUserId,`🚫 *You have been blocked.*\n\nReason: ${reason}`,{parse_mode:'Markdown'});}catch(e){}
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  await db.clearSession(ADMIN_ID);
  const msg = await ctx.reply(`✅ User \`${sess.data.targetUserId}\` blocked.`,{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_users'}]]}});
  await db.setSession(ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function handleUnblock(ctx, userId) {
  await db.unblockUser(userId);
  try{await ctx.telegram.sendMessage(userId,'✅ You have been unblocked! Send /start to continue.');}catch(e){}
  await ctx.answerCbQuery('✅ Unblocked!');
  await showUserProfile(ctx, userId, true);
}

async function promptTempBlock(ctx, userId) {
  const opts = {parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Cancel',callback_data:`admu_view_${userId}`}]]}};
  let msgId;
  if(ctx.callbackQuery){try{await ctx.editMessageText(`⏳ *Temp Restrict \`${userId}\`*\n\nFormat: \`MINUTES REASON\`\nExample: \`30 Spam\``,opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply('Format: MINUTES REASON',opts);msgId=m.message_id;}}
  else{const m=await ctx.reply('Format: MINUTES REASON',opts);msgId=m.message_id;}
  await db.setSession(ADMIN_ID,STATES.ADMIN_TEMP_BLOCK_DUR,{targetUserId:userId,lastMsgId:msgId});
}

async function handleTempBlockInput(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const parts = ctx.message?.text?.trim().split(' ');
  try{await ctx.deleteMessage();}catch(e){}
  const minutes = parseInt(parts?.[0]);
  const reason = parts?.slice(1).join(' ')||'Temporary restriction';
  if(isNaN(minutes)||minutes<1) return ctx.reply('⚠️ Format: MINUTES REASON');
  await db.tempBlockUser(sess.data.targetUserId, reason, minutes);
  const until = new Date(Date.now()+minutes*60000).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
  try{await ctx.telegram.sendMessage(sess.data.targetUserId,`⏳ Temporarily restricted until ${until}\nReason: ${reason}`);}catch(e){}
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  await db.clearSession(ADMIN_ID);
  const msg=await ctx.reply(`✅ Restricted for ${minutes} minutes.`,{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_users'}]]}});
  await db.setSession(ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function setVIP(ctx, userId, vip) {
  await db.setVIP(userId, vip);
  try{await ctx.telegram.sendMessage(userId, vip?'👑 You have been granted VIP status!':'Your VIP status has been removed.');}catch(e){}
  await ctx.answerCbQuery(vip?'✅ VIP granted!':'✅ VIP removed!');
  await showUserProfile(ctx, userId, true);
}

async function showUserTickets(ctx, userId) {
  const tickets = await db.getTicketsByUser(userId);
  const buttons = tickets.slice(0,8).map(t=>[{text:`${t.ticket_id} | ${t.status}`,callback_data:`admt_view_${t.ticket_id}`}]);
  buttons.push([{text:'↩️ Back',callback_data:`admu_view_${userId}`}]);
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:buttons}};
  if(ctx.callbackQuery){try{return await ctx.editMessageText(`🎫 *Tickets for \`${userId}\`* (${tickets.length})`,opts);}catch(e){}}
  await ctx.reply(`🎫 Tickets (${tickets.length})`,opts);
}

async function promptAddNote(ctx, userId) {
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Cancel',callback_data:`admu_view_${userId}`}]]}};
  let msgId;
  if(ctx.callbackQuery){try{await ctx.editMessageText(`📝 *Add Note for \`${userId}\`*\n\nType your note:`,opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply('Type note:',opts);msgId=m.message_id;}}
  else{const m=await ctx.reply('Type note:',opts);msgId=m.message_id;}
  await db.setSession(ADMIN_ID,STATES.ADMIN_ADD_NOTE,{targetUserId:userId,lastMsgId:msgId});
}

async function handleNoteInput(ctx) {
  const sess=await db.getSession(ADMIN_ID);
  const note=ctx.message?.text?.trim();
  try{await ctx.deleteMessage();}catch(e){}
  if(!note) return;
  await db.addNote(sess.data.targetUserId,ADMIN_ID,note);
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  await db.clearSession(ADMIN_ID);
  const msg=await ctx.reply('✅ Note added.',{reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:`admu_view_${sess.data.targetUserId}`}]]}});
  await db.setSession(ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function showNotes(ctx, userId) {
  const notes=await db.getNotes(userId);
  let text=`📝 *Notes for \`${userId}\`*\n\n`;
  if(!notes.length) text+='_No notes._';
  else text+=notes.map((n,i)=>`${i+1}. ${n.note}\n_${formatDate(n.created_at)}_`).join('\n\n');
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:`admu_view_${userId}`}]]}};
  if(ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}}
  await ctx.reply(text,opts);
}

async function showUserList(ctx, page=0) {
  const users=await db.getAllUsers();
  const pageSize=10;
  const pageUsers=users.slice(page*pageSize,(page+1)*pageSize);
  let text=`👥 *All Users* (${users.length} total) — Page ${page+1}\n\n`;
  text+=pageUsers.map((u,i)=>`${page*pageSize+i+1}. \`${u.telegram_id}\` ${u.username?`@${u.username}`:u.first_name||'Unknown'} ${u.is_blocked?'🚫':''} ${u.is_vip?'👑':''}`).join('\n');
  const buttons=[];
  const nav=[];
  if(page>0) nav.push({text:'⬅️',callback_data:`admu_list_${page-1}`});
  if((page+1)*pageSize<users.length) nav.push({text:'➡️',callback_data:`admu_list_${page+1}`});
  if(nav.length) buttons.push(nav);
  buttons.push([{text:'↩️ Back',callback_data:'adm_users'}]);
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:buttons}};
  if(ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}}
  await ctx.reply(text,opts);
}

async function showVIPList(ctx) {
  const all=await db.getAllUsers();
  const vips=all.filter(u=>u.is_vip);
  let text=`👑 *VIP Users* (${vips.length})\n\n`;
  if(!vips.length) text+='_No VIP users._';
  else text+=vips.map((u,i)=>`${i+1}. \`${u.telegram_id}\` ${u.username?`@${u.username}`:u.first_name||'User'}`).join('\n');
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_users'}]]}};
  if(ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}}
  await ctx.reply(text,opts);
}

module.exports = {
  showUsersMenu, promptSearchUser, handleSearchInput, showUserProfile,
  promptBlockUser, handleBlockReasonInput, handleUnblock, promptTempBlock, handleTempBlockInput,
  setVIP, showUserTickets, promptAddNote, handleNoteInput, showNotes, showUserList, showVIPList
};
