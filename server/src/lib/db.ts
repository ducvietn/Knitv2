import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const DB_PATH = resolve(process.env.KNIT_DB ?? './data/knit.db')

mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new Database(DB_PATH)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

/**
 * Lược đồ CSDL. Chỉ những gì phiên bản đầu cần:
 * tài khoản + phân quyền, câu hỏi, câu trả lời (kèm biến thể ẩn danh),
 * nguồn chính thức, theo dõi, thông báo nội bộ và báo cáo nội dung.
 */
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  faculty_vi    TEXT NOT NULL,
  faculty_en    TEXT NOT NULL,
  cohort        TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('student','contributor','staff','admin')),
  verified      INTEGER NOT NULL DEFAULT 0,
  avatar_seed   TEXT NOT NULL,
  avatar_url    TEXT,
  avatar_tone   TEXT NOT NULL DEFAULT 'brand',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  title_en     TEXT NOT NULL,
  body         TEXT NOT NULL,
  body_en      TEXT NOT NULL,
  topic        TEXT NOT NULL,
  author_id    TEXT NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL,
  also_need    INTEGER NOT NULL DEFAULT 0,
  views        INTEGER NOT NULL DEFAULT 0,
  anonymous    INTEGER NOT NULL DEFAULT 0,
  tags         TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS answers (
  id            TEXT PRIMARY KEY,
  question_id   TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  author_id     TEXT NOT NULL REFERENCES users(id),
  body          TEXT NOT NULL,
  body_en       TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  accepted      INTEGER NOT NULL DEFAULT 0,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  -- biến thể "Trường hợp của mình khác"
  variant_context    TEXT,
  variant_context_en TEXT,
  variant_anonymous  INTEGER,
  referral_office    TEXT,
  referral_office_en TEXT,
  referral_note      TEXT,
  referral_note_en   TEXT
);

CREATE TABLE IF NOT EXISTS answer_sources (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  answer_id  TEXT NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  url        TEXT NOT NULL,
  publisher  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS helpful_votes (
  answer_id TEXT NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (answer_id, user_id)
);

CREATE TABLE IF NOT EXISTS also_need_votes (
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, user_id)
);

CREATE TABLE IF NOT EXISTS follows (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, question_id)
);

CREATE TABLE IF NOT EXISTS topic_follows (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic   TEXT NOT NULL,
  PRIMARY KEY (user_id, topic)
);

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  title_en    TEXT NOT NULL,
  body        TEXT NOT NULL,
  body_en     TEXT NOT NULL,
  at          TEXT NOT NULL,
  read        INTEGER NOT NULL DEFAULT 0,
  question_id TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_id   TEXT,
  reason      TEXT NOT NULL,
  detail      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
`)

export const nowIso = () => new Date().toISOString()

/**
 * Thêm cột mới nếu bảng chưa có — để database cũ vẫn dùng được sau khi
 * thêm tính năng mà không cần xoá dữ liệu.
 */
function addColumnIfMissing(table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (cols.some((c) => c.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

addColumnIfMissing('users', 'avatar_url', 'TEXT')
addColumnIfMissing('users', 'avatar_tone', "TEXT DEFAULT 'brand'")
