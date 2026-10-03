import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

let db = null;

export function getDb() {
  if (db) return db;

  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initTables(db);
  logger.info(`SQLite database initialized at: ${config.dbPath}`);
  return db;
}

function initTables(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      jid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      alias TEXT UNIQUE,
      is_default INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admins (
      phone TEXT PRIMARY KEY,
      name TEXT,
      role TEXT DEFAULT 'cr',
      is_active INTEGER DEFAULT 1,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      event_date DATETIME NOT NULL,
      venue TEXT,
      syllabus TEXT,
      link TEXT,
      notes TEXT,
      target_group_jid TEXT NOT NULL,
      created_by TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(target_group_jid) REFERENCES groups(jid)
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      scheduled_for DATETIME NOT NULL,
      label TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      sent_at DATETIME,
      error_message TEXT,
      FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS web_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cr',
      phone TEXT,
      created_by INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );

    CREATE TABLE IF NOT EXISTS web_user_groups (
      user_id INTEGER NOT NULL,
      group_jid TEXT NOT NULL,
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, group_jid),
      FOREIGN KEY(user_id) REFERENCES web_users(id) ON DELETE CASCADE,
      FOREIGN KEY(group_jid) REFERENCES groups(jid) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_reminders_status_time ON reminders(status, scheduled_for);
    CREATE INDEX IF NOT EXISTS idx_events_status_date ON events(status, event_date);
    CREATE INDEX IF NOT EXISTS idx_web_users_username ON web_users(username);
  `);

  // Add columns to databases created before account suspension was introduced.
  const adminColumns = database.prepare('PRAGMA table_info(admins)').all();
  if (!adminColumns.some(column => column.name === 'is_active')) {
    database.exec('ALTER TABLE admins ADD COLUMN is_active INTEGER DEFAULT 1');
  }
}
