const crypto = require('crypto');
function generateTicketId() {
  const d = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const r = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TKT-${d}-${r}`;
}
function formatDate(date) {
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
  });
}
async function safeDelete(ctx, chatId, msgId) {
  try { if (msgId) await ctx.telegram.deleteMessage(chatId, msgId); } catch (e) {}
}
async function deleteUserMsg(ctx) {
  try { if (ctx.message) await ctx.deleteMessage(ctx.message.message_id); } catch (e) {}
}
function truncate(text, len = 50) {
  if (!text) return '';
  return text.length > len ? text.slice(0, len) + '...' : text;
}
function getUserName(user) {
  if (!user) return 'Unknown';
  return user.username ? `@${user.username}` : (user.first_name || 'User');
}
module.exports = { generateTicketId, formatDate, safeDelete, deleteUserMsg, truncate, getUserName };
