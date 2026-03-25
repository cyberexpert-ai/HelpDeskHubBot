const db = require('../../database/database');
const { ADMIN_ID, STATES } = require('../../utils/constants');

async function showBroadcastMenu(ctx) {
  const broadcasts = await db.getBroadcasts(5);
  let text = `📢 *Broadcast Menu*\n\n📋 Recent (last 5):\n`;
  if (!broadcasts.length) text += '_None yet._';
  else text += broadcasts.map((b,i) => `${i+1}. ${(b.message||'[Photo]').slice(0,40)} ✅${b.sent_count} ❌${b.failed_count}`).join('\n');
  const opts = { parse_mode:'Markdown', reply_markup:{inline_keyboard:[
    [{text:'📢 Broadcast All',callback_data:'admbr_all'}],
    [{text:'📸 Broadcast with Photo',callback_data:'admbr_photo'}],
    [{text:'💬 Message a User',callback_data:'admbr_user'}],
    [{text:'📂 Broadcast by Category',callback_data:'admbr_cat'}],
    [{text:'↩️ Back',callback_data:'adm_back'}]
  ]}};
  if(ctx.callbackQuery){try{return await ctx.editMessageText(text,opts);}catch(e){}}
  const msg=await ctx.reply(text,opts);
  await db.setSession(ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function promptBroadcast(ctx, withPhoto=false) {
  const text=withPhoto?'📸 *Broadcast with Photo*\n\nSend photo with caption:':'📢 *Broadcast to All*\n\nType your message:';
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_broadcast'}]]}};
  let msgId;
  if(ctx.callbackQuery){try{await ctx.editMessageText(text,opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply(text,opts);msgId=m.message_id;}}
  else{const m=await ctx.reply(text,opts);msgId=m.message_id;}
  await db.setSession(ADMIN_ID,withPhoto?STATES.ADMIN_BROADCAST_PHOTO:STATES.ADMIN_BROADCAST_MSG,{lastMsgId:msgId});
}

async function handleBroadcastInput(ctx) {
  const sess=await db.getSession(ADMIN_ID);
  const msgText=ctx.message?.text||ctx.message?.caption||'';
  const photoId=ctx.message?.photo?.[ctx.message.photo.length-1]?.file_id||null;
  try{await ctx.deleteMessage();}catch(e){}
  if(!msgText&&!photoId) return ctx.reply('⚠️ Send a message or photo.');
  const users=await db.getAllUsers();
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  const statusMsg=await ctx.reply(`📢 Broadcasting to ${users.length} users...`);
  let sent=0,failed=0;
  for(const user of users){
    try{
      if(photoId){await ctx.telegram.sendPhoto(user.telegram_id,photoId,{caption:msgText||'',parse_mode:'Markdown'});}
      else{await ctx.telegram.sendMessage(user.telegram_id,msgText,{parse_mode:'Markdown'});}
      sent++;
    }catch(e){failed++;}
    await new Promise(r=>setTimeout(r,50));
  }
  await db.saveBroadcast(msgText,photoId,ADMIN_ID,'ALL',sent,failed);
  try{await ctx.telegram.deleteMessage(ctx.chat.id,statusMsg.message_id);}catch(e){}
  await db.clearSession(ADMIN_ID);
  const msg=await ctx.reply(`✅ *Broadcast Done!*\n\n✅ Sent: ${sent}\n❌ Failed: ${failed}`,{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_broadcast'}]]}});
  await db.setSession(ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

async function promptMessageUser(ctx, prefillId=null) {
  const text=prefillId?`💬 *Message User \`${prefillId}\`*\n\nSend the message:`:'💬 *Message a User*\n\nSend the User ID:';
  const opts={parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_broadcast'}]]}};
  let msgId;
  if(ctx.callbackQuery){try{await ctx.editMessageText(text,opts);msgId=ctx.callbackQuery.message.message_id;}catch(e){const m=await ctx.reply(text,opts);msgId=m.message_id;}}
  else{const m=await ctx.reply(text,opts);msgId=m.message_id;}
  if(prefillId){await db.setSession(ADMIN_ID,STATES.ADMIN_MSG_USER_TEXT,{targetUserId:prefillId,lastMsgId:msgId});}
  else{await db.setSession(ADMIN_ID,STATES.ADMIN_MSG_USER_ID,{lastMsgId:msgId});}
}

async function handleMsgUserIdInput(ctx) {
  const sess=await db.getSession(ADMIN_ID);
  const id=parseInt(ctx.message?.text?.trim());
  try{await ctx.deleteMessage();}catch(e){}
  if(isNaN(id)) return ctx.reply('⚠️ Invalid ID.');
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  const msg=await ctx.reply(`💬 Send message for user \`${id}\`:`,{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Cancel',callback_data:'adm_broadcast'}]]}});
  await db.setSession(ADMIN_ID,STATES.ADMIN_MSG_USER_TEXT,{targetUserId:id,lastMsgId:msg.message_id});
}

async function handleMsgUserTextInput(ctx) {
  const sess=await db.getSession(ADMIN_ID);
  const msgText=ctx.message?.text||ctx.message?.caption||'';
  const photoId=ctx.message?.photo?.[ctx.message.photo.length-1]?.file_id||null;
  try{await ctx.deleteMessage();}catch(e){}
  if(!msgText&&!photoId) return ctx.reply('⚠️ Send a message or photo.');
  try{
    if(photoId){await ctx.telegram.sendPhoto(sess.data.targetUserId,photoId,{caption:`📨 *Message from Admin:*\n\n${msgText||''}`,parse_mode:'Markdown'});}
    else{await ctx.telegram.sendMessage(sess.data.targetUserId,`📨 *Message from Admin:*\n\n${msgText}`,{parse_mode:'Markdown'});}
  }catch(e){
    const msg=await ctx.reply('❌ Failed. User may have blocked the bot.',{reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_broadcast'}]]}});
    await db.setSession(ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});return;
  }
  try{await ctx.telegram.deleteMessage(ctx.chat.id,sess.data.lastMsgId);}catch(e){}
  await db.clearSession(ADMIN_ID);
  const msg=await ctx.reply(`✅ Message sent to \`${sess.data.targetUserId}\`!`,{parse_mode:'Markdown',reply_markup:{inline_keyboard:[[{text:'↩️ Back',callback_data:'adm_broadcast'}]]}});
  await db.setSession(ADMIN_ID,'IDLE',{lastMsgId:msg.message_id});
}

module.exports = { showBroadcastMenu, promptBroadcast, handleBroadcastInput, promptMessageUser, handleMsgUserIdInput, handleMsgUserTextInput };
