require('dotenv').config();
const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 3000
});
pool.on('error', err => logger.error('PG error: ' + err.message));

async function query(text, params) {
  try { return await pool.query(text, params); }
  catch (err) { logger.error(`DB: ${err.message}`); throw err; }
}

// Sessions
async function getSession(id) {
  const r = await query('SELECT state,data FROM sessions WHERE telegram_id=$1', [id]);
  return r.rows[0] || { state: 'IDLE', data: {} };
}
async function setSession(id, state, data = {}) {
  await query(
    `INSERT INTO sessions(telegram_id,state,data,updated_at) VALUES($1,$2,$3,NOW())
     ON CONFLICT(telegram_id) DO UPDATE SET state=$2,data=$3,updated_at=NOW()`,
    [id, state, JSON.stringify(data)]
  );
}
async function clearSession(id) { await setSession(id, 'IDLE', {}); }

// Users
async function upsertUser(tid, username, firstName, lastName) {
  const r = await query(
    `INSERT INTO users(telegram_id,username,first_name,last_name)
     VALUES($1,$2,$3,$4) ON CONFLICT(telegram_id) DO UPDATE
     SET username=$2,first_name=$3,last_name=$4,updated_at=NOW() RETURNING *`,
    [tid, username||null, firstName||null, lastName||null]
  );
  return r.rows[0];
}
async function getUser(tid) {
  const r = await query('SELECT * FROM users WHERE telegram_id=$1', [tid]);
  return r.rows[0] || null;
}
async function getAllUsers() {
  const r = await query('SELECT * FROM users ORDER BY created_at DESC');
  return r.rows;
}
async function getUserCount() {
  const r = await query('SELECT COUNT(*) FROM users');
  return parseInt(r.rows[0].count);
}
async function blockUser(tid, reason, until=null) {
  await query('UPDATE users SET is_blocked=true,block_reason=$2,block_until=$3,updated_at=NOW() WHERE telegram_id=$1',[tid,reason,until]);
}
async function unblockUser(tid) {
  await query('UPDATE users SET is_blocked=false,block_reason=null,block_until=null,is_temp_blocked=false,updated_at=NOW() WHERE telegram_id=$1',[tid]);
}
async function tempBlockUser(tid, reason, minutes) {
  const until = new Date(Date.now() + minutes*60000);
  await query('UPDATE users SET is_temp_blocked=true,block_reason=$2,block_until=$3,updated_at=NOW() WHERE telegram_id=$1',[tid,reason,until]);
}
async function setVIP(tid, vip) {
  await query('UPDATE users SET is_vip=$2,updated_at=NOW() WHERE telegram_id=$1',[tid,vip]);
}
async function incrementTickets(tid) {
  await query('UPDATE users SET total_tickets=total_tickets+1 WHERE telegram_id=$1',[tid]);
}
async function addNote(userId, adminId, note) {
  await query('INSERT INTO user_notes(user_id,admin_id,note) VALUES($1,$2,$3)',[userId,adminId,note]);
}
async function getNotes(userId) {
  const r = await query('SELECT * FROM user_notes WHERE user_id=$1 ORDER BY created_at DESC',[userId]);
  return r.rows;
}

// Categories
async function getCategories(activeOnly=true) {
  const q = activeOnly
    ? 'SELECT * FROM categories WHERE is_active=true ORDER BY sort_order,id'
    : 'SELECT * FROM categories ORDER BY sort_order,id';
  return (await query(q)).rows;
}
async function getCategory(id) {
  const r = await query('SELECT * FROM categories WHERE id=$1',[id]);
  return r.rows[0]||null;
}
async function addCategory(name, emoji='📂', description='') {
  const r = await query('INSERT INTO categories(name,emoji,description) VALUES($1,$2,$3) RETURNING *',[name,emoji,description]);
  return r.rows[0];
}
async function updateCategory(id, name) {
  await query('UPDATE categories SET name=$1 WHERE id=$2',[name,id]);
}
async function toggleCategory(id, active) {
  await query('UPDATE categories SET is_active=$1 WHERE id=$2',[active,id]);
}
async function deleteCategory(id) {
  await query('DELETE FROM categories WHERE id=$1',[id]);
}

// Tickets
async function createTicket(ticketId, userId, categoryId, subject) {
  const r = await query(
    `INSERT INTO tickets(ticket_id,user_id,category_id,subject)
     VALUES($1,$2,$3,$4) RETURNING *`,
    [ticketId, userId, categoryId, subject]
  );
  await incrementTickets(userId);
  return r.rows[0];
}
async function getTicket(ticketId) {
  const r = await query('SELECT * FROM tickets WHERE ticket_id=$1',[ticketId]);
  return r.rows[0]||null;
}
async function getTicketsByUser(userId) {
  const r = await query('SELECT t.*,c.name as cat_name,c.emoji as cat_emoji FROM tickets t LEFT JOIN categories c ON t.category_id=c.id WHERE t.user_id=$1 ORDER BY t.created_at DESC',[userId]);
  return r.rows;
}
async function getActiveTicket(userId) {
  const r = await query("SELECT * FROM tickets WHERE user_id=$1 AND status NOT IN ('CLOSED','RESOLVED') ORDER BY created_at DESC LIMIT 1",[userId]);
  return r.rows[0]||null;
}
async function getTicketsByStatus(status, limit=20, offset=0) {
  const r = await query(
    `SELECT t.*,u.username,u.first_name,c.name as cat_name,c.emoji as cat_emoji
     FROM tickets t LEFT JOIN users u ON t.user_id=u.telegram_id
     LEFT JOIN categories c ON t.category_id=c.id
     WHERE t.status=$1 ORDER BY t.updated_at DESC LIMIT $2 OFFSET $3`,
    [status, limit, offset]
  );
  return r.rows;
}
async function getAllTickets(limit=20, offset=0) {
  const r = await query(
    `SELECT t.*,u.username,u.first_name,c.name as cat_name,c.emoji as cat_emoji
     FROM tickets t LEFT JOIN users u ON t.user_id=u.telegram_id
     LEFT JOIN categories c ON t.category_id=c.id
     ORDER BY t.updated_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return r.rows;
}
async function updateTicketStatus(ticketId, status) {
  const closed = status==='CLOSED'||status==='RESOLVED' ? 'NOW()' : 'NULL';
  await query(`UPDATE tickets SET status=$1,closed_at=${closed},updated_at=NOW() WHERE ticket_id=$2`,[status,ticketId]);
}
async function updateTicketPriority(ticketId, priority) {
  await query('UPDATE tickets SET priority=$1,updated_at=NOW() WHERE ticket_id=$2',[priority,ticketId]);
}
async function setTicketAdmin(ticketId, adminId, msgId) {
  await query('UPDATE tickets SET admin_id=$2,admin_msg_id=$3,updated_at=NOW() WHERE ticket_id=$1',[ticketId,adminId,msgId]);
}
async function setLiveChat(ticketId, active) {
  await query('UPDATE tickets SET live_chat_active=$1,updated_at=NOW() WHERE ticket_id=$2',[active,ticketId]);
}
async function getTicketCount() {
  const r = await query("SELECT COUNT(*) FILTER(WHERE status='OPEN') as open, COUNT(*) FILTER(WHERE status='IN_PROGRESS') as in_progress, COUNT(*) FILTER(WHERE status='RESOLVED') as resolved, COUNT(*) FILTER(WHERE status='CLOSED') as closed, COUNT(*) as total FROM tickets");
  return r.rows[0];
}

// Messages
async function addMessage(ticketId, senderId, senderType, message, photoId=null, docId=null, voiceId=null) {
  await query(
    'INSERT INTO ticket_messages(ticket_id,sender_id,sender_type,message,photo_file_id,document_file_id,voice_file_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [ticketId, senderId, senderType, message, photoId, docId, voiceId]
  );
  await query('UPDATE tickets SET updated_at=NOW() WHERE ticket_id=$1',[ticketId]);
}
async function getMessages(ticketId, limit=20) {
  const r = await query('SELECT * FROM ticket_messages WHERE ticket_id=$1 ORDER BY created_at ASC LIMIT $2',[ticketId,limit]);
  return r.rows;
}

// FAQs
async function getFAQs(categoryId=null, activeOnly=true) {
  let q = 'SELECT f.*,c.name as cat_name FROM faqs f LEFT JOIN categories c ON f.category_id=c.id WHERE 1=1';
  const params = [];
  if (activeOnly) q += ' AND f.is_active=true';
  if (categoryId) { params.push(categoryId); q += ` AND f.category_id=$${params.length}`; }
  q += ' ORDER BY f.id ASC';
  return (await query(q, params)).rows;
}
async function getFAQ(id) {
  const r = await query('SELECT * FROM faqs WHERE id=$1',[id]);
  return r.rows[0]||null;
}
async function addFAQ(categoryId, question, answer) {
  const r = await query('INSERT INTO faqs(category_id,question,answer) VALUES($1,$2,$3) RETURNING *',[categoryId,question,answer]);
  return r.rows[0];
}
async function deleteFAQ(id) { await query('DELETE FROM faqs WHERE id=$1',[id]); }
async function toggleFAQ(id, active) { await query('UPDATE faqs SET is_active=$1 WHERE id=$2',[active,id]); }
async function incrementFAQView(id) { await query('UPDATE faqs SET view_count=view_count+1 WHERE id=$1',[id]); }

// Quick Replies
async function getQuickReplies() {
  return (await query('SELECT * FROM quick_replies ORDER BY id ASC')).rows;
}
async function addQuickReply(title, message) {
  const r = await query('INSERT INTO quick_replies(title,message) VALUES($1,$2) RETURNING *',[title,message]);
  return r.rows[0];
}
async function deleteQuickReply(id) { await query('DELETE FROM quick_replies WHERE id=$1',[id]); }

// Ratings
async function addRating(ticketId, userId, rating, feedback) {
  await query(
    'INSERT INTO ratings(ticket_id,user_id,rating,feedback) VALUES($1,$2,$3,$4) ON CONFLICT(ticket_id) DO UPDATE SET rating=$3,feedback=$4',
    [ticketId, userId, rating, feedback]
  );
}
async function getRatingStats() {
  const r = await query('SELECT AVG(rating) as avg, COUNT(*) as total FROM ratings');
  return r.rows[0];
}

// Broadcasts
async function saveBroadcast(message, photoId, sentBy, targetType, sentCount, failedCount) {
  const r = await query(
    'INSERT INTO broadcasts(message,photo_file_id,sent_by,target_type,sent_count,failed_count) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [message,photoId,sentBy,targetType,sentCount,failedCount]
  );
  return r.rows[0];
}
async function getBroadcasts(limit=10) {
  return (await query('SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT $1',[limit])).rows;
}

// Settings
async function getSetting(key) {
  const r = await query('SELECT value FROM settings WHERE key=$1',[key]);
  return r.rows[0]?.value || null;
}
async function setSetting(key, value) {
  await query('INSERT INTO settings(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=NOW()',[key,value]);
}

async function initDatabase() {
  const fs = require('fs');
  const path = require('path');
  const sql = fs.readFileSync(path.join(__dirname,'init.sql'),'utf8');
  await pool.query(sql);
  logger.info('Database initialized');
}

module.exports = {
  query, pool,
  getSession, setSession, clearSession,
  upsertUser, getUser, getAllUsers, getUserCount, blockUser, unblockUser, tempBlockUser, setVIP, incrementTickets, addNote, getNotes,
  getCategories, getCategory, addCategory, updateCategory, toggleCategory, deleteCategory,
  createTicket, getTicket, getTicketsByUser, getActiveTicket, getTicketsByStatus, getAllTickets,
  updateTicketStatus, updateTicketPriority, setTicketAdmin, setLiveChat, getTicketCount,
  addMessage, getMessages,
  getFAQs, getFAQ, addFAQ, deleteFAQ, toggleFAQ, incrementFAQView,
  getQuickReplies, addQuickReply, deleteQuickReply,
  addRating, getRatingStats,
  saveBroadcast, getBroadcasts,
  getSetting, setSetting,
  initDatabase
};
