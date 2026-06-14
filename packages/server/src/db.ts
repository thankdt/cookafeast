/**
 * SQLite (better-sqlite3) — nguồn sự thật cho trạng thái do người dùng tạo:
 * mâm cỗ đã chốt, tiến độ nấu, ký ức gia đình. Catalog (dịp/món/nguyên liệu)
 * là dữ liệu seed read-only, load từ JSON vào bộ nhớ (xem catalog.ts).
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DB_PATH = process.env.COOKAFEAST_DB ?? join(DATA_DIR, 'cookafeast.db');

export type DB = Database.Database;

let _db: DB | null = null;

export function getDb(): DB {
  if (_db) return _db;
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  _db = db;
  return db;
}

function addColumnIfMissing(db: DB, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS menu_instance (
      id          TEXT PRIMARY KEY,
      data        TEXT NOT NULL,            -- MenuInstance dạng JSON
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cook_task_state (
      menu_id     TEXT NOT NULL,
      task_id     TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'TODO',
      progress    INTEGER NOT NULL DEFAULT 0,
      person_id   TEXT,                     -- = memberId của người nhận việc (Phase 2)
      version     INTEGER NOT NULL DEFAULT 0,  -- khoá CAS
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (menu_id, task_id)
    );

    CREATE TABLE IF NOT EXISTS family_memory (
      id          TEXT PRIMARY KEY,
      data        TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );

    -- Cộng tác đa thiết bị (Phase 2)
    CREATE TABLE IF NOT EXISTS cook_session (
      id             TEXT PRIMARY KEY,
      menu_id        TEXT NOT NULL,
      room_code      TEXT NOT NULL UNIQUE,
      host_member_id TEXT,
      status         TEXT NOT NULL DEFAULT 'LOBBY',
      created_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cook_session_member (
      id             TEXT PRIMARY KEY,
      session_id     TEXT NOT NULL,
      name           TEXT NOT NULL,
      skill          INTEGER NOT NULL DEFAULT 2,
      avoid          TEXT NOT NULL DEFAULT '[]',  -- JSON CookAvoid[]
      role           TEXT NOT NULL DEFAULT 'MEMBER',
      joined_at      INTEGER NOT NULL,
      last_heartbeat INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_member_session ON cook_session_member(session_id);

    -- Event-log để client reconnect replay (đánh số seq tăng dần theo menu)
    CREATE TABLE IF NOT EXISTS cook_event_log (
      menu_id    TEXT NOT NULL,
      seq        INTEGER NOT NULL,
      kind       TEXT NOT NULL,
      data       TEXT NOT NULL,            -- JSON CookEvent payload
      created_at INTEGER NOT NULL,
      PRIMARY KEY (menu_id, seq)
    );
  `);

  // cộng dồn cột cho cook_task_state (idempotent)
  addColumnIfMissing(db, 'cook_task_state', 'claimed_at', 'claimed_at INTEGER');
  addColumnIfMissing(db, 'cook_task_state', 'server_seq', 'server_seq INTEGER');

  // Tầng linh hồn (Phase 6): family_memory lưu mọi loại ký ức, phân loại bằng type + ref.
  addColumnIfMissing(db, 'family_memory', 'type', "type TEXT NOT NULL DEFAULT 'note'");
  addColumnIfMissing(db, 'family_memory', 'ref', 'ref TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_memory_type ON family_memory(type, ref)');
}
