import { sql, nowIso } from './sql'
import { POSTGRES_SCHEMA } from '../db/schema.generated'

/**
 * Lớp truy cập dữ liệu của KNIT.
 *
 * Backend được chọn ở `server/src/lib/sql.ts`:
 *
 * - **SQLite** (mặc định ở local) — file `./data/knit.db`, không cần server.
 * - **Postgres** (khi có `DATABASE_URL`) — dùng cho Supabase khi deploy.
 *
 * Lược đồ SQLite nằm trong hàm `initSchema` bên dưới; bản Postgres tương
 * ứng nằm ở `server/db/schema.sql`. Hai bản phải giữ cùng tên bảng/cột.
 */
export { sql, nowIso }
export const db = sql

/**
 * Lược đồ CSDL SQLite. Chỉ những gì phiên bản đầu cần:
 * tài khoản + phân quyền, câu hỏi, câu trả lời (kèm biến thể ẩn danh),
 * nguồn chính thức, theo dõi, thông báo nội bộ và báo cáo nội dung.
 */
const SQLITE_SCHEMA = `
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
`

/**
 * Tạo lược đồ nếu chưa có.
 *
 * Gọi từ `index.ts` trước khi server bắt đầu lắng nghe — nhờ vậy các route
 * không bao giờ gặp bảng chưa tồn tại.
 *
 * - **SQLite**: chạy lược đồ SQLite nhúng sẵn.
 * - **Postgres**: chạy lược đồ Postgres nhúng sẵn (sinh từ
 *   `server/db/schema.sql`). Tất cả câu lệnh đều dùng `IF NOT EXISTS` nên
 *   chạy lại nhiều lần vẫn an toàn — không ghi đè dữ liệu đã có.
 */
export const initSchema = async (): Promise<void> => {
  if (sql.name === 'sqlite') {
    await sql.exec(SQLITE_SCHEMA)

    /**
     * Thêm cột mới nếu bảng chưa có — để database cũ vẫn dùng được sau khi
     * thêm tính năng mà không cần xoá dữ liệu.
     */
    const addColumnIfMissing = async (table: string, column: string, definition: string) => {
      const cols = await sql.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()
      if (cols.some((c) => c.name === column)) return
      await sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }

    await addColumnIfMissing('users', 'avatar_url', 'TEXT')
    await addColumnIfMissing('users', 'avatar_tone', "TEXT DEFAULT 'brand'")
    return
  }

  await sql.exec(POSTGRES_SCHEMA)
}
