CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  is_blocked BOOLEAN DEFAULT FALSE,
  is_temp_blocked BOOLEAN DEFAULT FALSE,
  block_reason TEXT,
  block_until TIMESTAMP,
  is_vip BOOLEAN DEFAULT FALSE,
  total_tickets INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sessions (
  telegram_id BIGINT PRIMARY KEY,
  state VARCHAR(100) DEFAULT 'IDLE',
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT DEFAULT '',
  emoji VARCHAR(20) DEFAULT '📂',
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  ticket_id VARCHAR(30) UNIQUE NOT NULL,
  user_id BIGINT NOT NULL,
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  subject TEXT,
  status VARCHAR(20) DEFAULT 'OPEN',
  priority VARCHAR(20) DEFAULT 'NORMAL',
  admin_id BIGINT,
  admin_msg_id BIGINT,
  live_chat_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ticket_messages (
  id SERIAL PRIMARY KEY,
  ticket_id VARCHAR(30) NOT NULL,
  sender_id BIGINT NOT NULL,
  sender_type VARCHAR(10) NOT NULL,
  message TEXT,
  photo_file_id TEXT,
  document_file_id TEXT,
  voice_file_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS broadcasts (
  id SERIAL PRIMARY KEY,
  message TEXT,
  photo_file_id TEXT,
  sent_by BIGINT,
  target_type VARCHAR(20) DEFAULT 'ALL',
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS faqs (
  id SERIAL PRIMARY KEY,
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  view_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS quick_replies (
  id SERIAL PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS user_notes (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  admin_id BIGINT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS ratings (
  id SERIAL PRIMARY KEY,
  ticket_id VARCHAR(30) UNIQUE NOT NULL,
  user_id BIGINT NOT NULL,
  rating INT NOT NULL,
  feedback TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);
INSERT INTO settings (key, value) VALUES
  ('auto_assist_enabled', 'false'),
  ('maintenance_mode', 'false'),
  ('max_active_tickets', '1'),
  ('ticket_auto_close_hours', '48'),
  ('auto_reply_message', 'Thank you for contacting HelpDesk! We will respond shortly.'),
  ('rating_enabled', 'true'),
  ('live_chat_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
INSERT INTO categories (name, description, emoji, sort_order) VALUES
  ('Shein', 'Shein voucher related support', '👗', 1),
  ('BigBasket', 'BigBasket voucher related support', '🛒', 2),
  ('General', 'General queries', '💬', 3),
  ('Technical', 'Technical issues', '🔧', 4),
  ('Payment', 'Payment issues', '💳', 5)
ON CONFLICT DO NOTHING;
INSERT INTO quick_replies (title, message) VALUES
  ('Welcome', 'Hello! Thank you for contacting HelpDesk. How can I help you today?'),
  ('Received', 'We received your message. We will respond within 24 hours.'),
  ('Resolved', 'Your issue has been resolved. Let us know if you need more help.'),
  ('Closing', 'Thank you for contacting HelpDesk! Have a great day!'),
  ('Processing', 'We are looking into your issue. Please wait.')
ON CONFLICT DO NOTHING;
INSERT INTO faqs (question, answer) VALUES
  ('How do I create a ticket?', 'Click Contact Support, select a category, and describe your issue.'),
  ('How long does support take?', 'We respond within 24 hours. VIP users get priority support.'),
  ('How do I close a ticket?', 'Go to My Tickets and close it once resolved.'),
  ('Can I have multiple tickets?', 'One active ticket at a time. Close current to create new.')
ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_msgs_ticket ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_users_tid ON users(telegram_id);
