import { getDb } from './db.js';
import { config } from '../config.js';

export const adminRepo = {
  /**
   * Adds an authorized admin / CR phone number.
   * Phone should be digits only (e.g. 88017xxxxxxxx).
   */
  addAdmin(phone, name = '', role = 'cr') {
    const db = getDb();
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    const stmt = db.prepare(`
      INSERT INTO admins (phone, name, role, is_active)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(phone) DO UPDATE SET
        name = COALESCE(excluded.name, admins.name),
        role = excluded.role,
        is_active = 1
    `);
    return stmt.run(cleanPhone, name, role);
  },

  /**
   * Removes an admin.
   */
  removeAdmin(phone) {
    const db = getDb();
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    return db.prepare('DELETE FROM admins WHERE phone = ?').run(cleanPhone);
  },

  setActive(phone, isActive) {
    const db = getDb();
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    return db.prepare('UPDATE admins SET is_active = ? WHERE phone = ?').run(isActive ? 1 : 0, cleanPhone);
  },

  /**
   * Lists all admins.
   */
  listAdmins() {
    const db = getDb();
    return db.prepare('SELECT * FROM admins ORDER BY added_at ASC').all();
  },

  /**
   * Checks whether a phone number or LID is an authorized CR / Admin.
   * @param {string|string[]} phoneOrIdentifiers
   * @param {boolean} [isFromMe=false]
   */
  isAuthorized(phoneOrIdentifiers, isFromMe = false) {
    if (isFromMe) {
      return true;
    }

    if (!phoneOrIdentifiers) return false;
    const candidates = (Array.isArray(phoneOrIdentifiers) ? phoneOrIdentifiers : [phoneOrIdentifiers])
      .map(p => String(p).replace(/[^0-9]/g, ''))
      .filter(Boolean);

    if (candidates.length === 0) return false;

    const db = getDb();
    const adminRows = db.prepare('SELECT phone FROM admins WHERE is_active = 1').all();
    const adminPhones = adminRows.map(a => a.phone.replace(/[^0-9]/g, ''));

    // Check each candidate identifier (phone number, LID, etc.)
    for (const cleanPhone of candidates) {
      // 1. Check against config owner numbers
      for (const owner of config.ownerNumbers) {
        if (cleanPhone === owner || cleanPhone.endsWith(owner) || owner.endsWith(cleanPhone)) {
          return true;
        }
      }

      // 2. Check against SQLite admin table
      for (const cleanAdmin of adminPhones) {
        if (cleanPhone === cleanAdmin || cleanPhone.endsWith(cleanAdmin) || cleanAdmin.endsWith(cleanPhone)) {
          return true;
        }
      }
    }

    // 3. If no owners are defined yet anywhere, allow by default
    if (config.ownerNumbers.length === 0 && adminPhones.length === 0) {
      return true;
    }

    return false;
  }
};
