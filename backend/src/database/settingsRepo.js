import { getDb } from './db.js';

export const settingsRepo = {
  get(key, defaultValue = null) {
    const db = getDb();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
  },

  set(key, value) {
    const db = getDb();
    const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
    const stmt = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    return stmt.run(key, strVal);
  },

  delete(key) {
    const db = getDb();
    return db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }
};
