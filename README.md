# HelpDesk Bot 🤖

Full-featured Telegram support bot with ticket system, live chat, FAQ, and admin panel.

## Features
- 🎫 Ticket System with unique IDs
- 💬 Live Chat (admin ↔ user real-time)
- 🤖 Auto-Assist with FAQ matching
- ❓ FAQ Management
- 📢 Broadcast to all users
- ⚡ Quick Replies for admin
- 👑 VIP User system
- 📊 Statistics dashboard
- 📂 Category management (Shein, BigBasket, General, etc.)
- ⭐ Rating system
- 🚫 Block/Temp-block users
- ⚙️ Full settings panel

## Setup

### 1. Create Bot
- Message @BotFather → /newbot
- Name: HelpDesk
- Username: HelpDesk_Bot
- Copy token

### 2. Create PostgreSQL on Render
- Render → New → PostgreSQL
- Copy External Database URL

### 3. Deploy on Render
Push to GitHub, connect repo, set env vars:

| Key | Value |
|-----|-------|
| BOT_TOKEN | Your bot token |
| ADMIN_ID | 8004114088 |
| DATABASE_URL | PostgreSQL URL |
| NODE_ENV | production |
| WEBHOOK_URL | https://your-app.onrender.com |

### 4. Commands
- /start — Start bot
- /admin — Admin panel
- /help — Help menu

## Admin Panel
- 🎫 Tickets — View/manage all tickets
- 👥 Users — Manage users, VIP, block
- 📂 Categories — Add/edit support categories
- ❓ FAQs — Manage FAQ entries
- ⚡ Quick Replies — Saved reply templates
- 📢 Broadcast — Send messages to all users
- 📊 Statistics — View metrics
- ⚙️ Settings — Toggle features
