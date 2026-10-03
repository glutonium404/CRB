import { getDb } from './db.js';

export const groupRepo = {
  /**
   * Syncs or updates a WhatsApp group in the database.
   */
  upsertGroup(jid, name) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO groups (jid, name, updated_at)
      VALUES (@jid, @name, CURRENT_TIMESTAMP)
      ON CONFLICT(jid) DO UPDATE SET
        name = @name,
        updated_at = CURRENT_TIMESTAMP
    `);
    return stmt.run({ jid, name });
  },

  /**
   * Returns all known WhatsApp groups sorted deterministically by rowid.
   * This guarantees short numbers (#1, #2, #3) never shift when default is changed.
   */
  listGroups() {
    const db = getDb();
    return db.prepare('SELECT rowid, * FROM groups ORDER BY rowid ASC').all();
  },

  /**
   * Gets a group by its full JID.
   */
  getGroupByJid(jid) {
    const db = getDb();
    return db.prepare('SELECT rowid, * FROM groups WHERE jid = ?').get(jid);
  },

  /**
   * Gets a group by its alias.
   */
  getGroupByAlias(alias) {
    const db = getDb();
    return db.prepare('SELECT rowid, * FROM groups WHERE LOWER(alias) = LOWER(?)').get(alias);
  },

  /**
   * Resolves a group identifier which could be:
   * 1. A short number (e.g. "1", "#1", 1, 2)
   * 2. An alias (e.g. "secA", "main")
   * 3. A full JID (e.g. "120363048593@g.us")
   */
  resolveGroup(identifier) {
    if (!identifier) return this.getDefaultGroup();

    const str = String(identifier).trim();
    const db = getDb();

    // 1. Direct JID
    if (str.includes('@g.us')) {
      return this.getGroupByJid(str);
    }

    // 2. Alias match
    const byAlias = this.getGroupByAlias(str);
    if (byAlias) return byAlias;

    // 3. Short index match (#1, #2, 1, 2)
    const cleanNum = str.replace('#', '');
    const num = parseInt(cleanNum, 10);
    if (!isNaN(num) && num > 0) {
      const all = this.listGroups();
      if (num <= all.length) {
        return all[num - 1];
      }
    }

    // 4. Fuzzy Name match
    const byName = db.prepare('SELECT rowid, * FROM groups WHERE LOWER(name) LIKE LOWER(?) LIMIT 1').get(`%${str}%`);
    if (byName) return byName;

    return null;
  },

  /**
   * Sets the default group.
   */
  setDefaultGroup(jid) {
    const db = getDb();
    const updateAll = db.prepare('UPDATE groups SET is_default = 0');
    const updateOne = db.prepare('UPDATE groups SET is_default = 1 WHERE jid = ?');

    const tx = db.transaction(() => {
      updateAll.run();
      const res = updateOne.run(jid);
      return res.changes > 0;
    });

    return tx();
  },

  /**
   * Gets the designated default group.
   */
  getDefaultGroup() {
    const db = getDb();
    const def = db.prepare('SELECT rowid, * FROM groups WHERE is_default = 1 LIMIT 1').get();
    if (def) return def;

    // Fallback: return the first group if none marked as default
    return db.prepare('SELECT rowid, * FROM groups ORDER BY rowid ASC LIMIT 1').get() || null;
  },

  /**
   * Sets or replaces an alias for a group.
   */
  setGroupAlias(jid, alias) {
    const db = getDb();
    const cleanAlias = alias.trim().toLowerCase();
    
    // Clear alias if already used by another group
    db.prepare('UPDATE groups SET alias = NULL WHERE LOWER(alias) = ?').run(cleanAlias);

    const stmt = db.prepare('UPDATE groups SET alias = ? WHERE jid = ?');
    return stmt.run(cleanAlias, jid);
  },

  /**
   * Removes dummy test groups and associated test events from the database.
   */
  cleanDummyGroups() {
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare(`
        DELETE FROM reminders 
        WHERE event_id IN (SELECT id FROM events WHERE target_group_jid LIKE '%111111%' OR target_group_jid LIKE '%222222%')
      `).run();
      db.prepare(`DELETE FROM events WHERE target_group_jid LIKE '%111111%' OR target_group_jid LIKE '%222222%'`).run();
      db.prepare(`DELETE FROM groups WHERE jid LIKE '%111111%' OR jid LIKE '%222222%'`).run();
    });
    tx();
  }
};
