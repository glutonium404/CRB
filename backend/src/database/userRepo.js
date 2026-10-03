import bcrypt from 'bcryptjs';
import { getDb } from './db.js';

const SALT_ROUNDS = 10;

export const userRepo = {
  /**
   * Creates a new dashboard user with hashed password.
   * @param {{ username: string, password: string, displayName: string, role?: string, phone?: string, createdBy?: number }} data
   * @returns {number} New user ID
   */
  createUser({ username, password, displayName, role = 'cr', phone = null, createdBy = null }) {
    const db = getDb();
    const hash = bcrypt.hashSync(password, SALT_ROUNDS);
    const stmt = db.prepare(`
      INSERT INTO web_users (username, password_hash, display_name, role, phone, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(username.toLowerCase().trim(), hash, displayName, role, phone, createdBy);
    return info.lastInsertRowid;
  },

  /**
   * Validates login credentials.
   * @returns {Object|null} User object (without password_hash) or null
   */
  validateLogin(username, password) {
    const db = getDb();
    const user = db.prepare('SELECT * FROM web_users WHERE LOWER(username) = LOWER(?) AND is_active = 1').get(username.trim());
    if (!user) return null;

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return null;

    // Update last_login
    db.prepare('UPDATE web_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    const { password_hash, ...safeUser } = user;
    return safeUser;
  },

  /**
   * Gets a user by ID (without password hash).
   */
  getUserById(id) {
    const db = getDb();
    const user = db.prepare('SELECT * FROM web_users WHERE id = ?').get(id);
    if (!user) return null;
    const { password_hash, ...safeUser } = user;
    return safeUser;
  },

  /**
   * Gets a user by username (without password hash).
   */
  getUserByUsername(username) {
    const db = getDb();
    const user = db.prepare('SELECT * FROM web_users WHERE LOWER(username) = LOWER(?)').get(username.trim());
    if (!user) return null;
    const { password_hash, ...safeUser } = user;
    return safeUser;
  },

  /**
   * Lists all users (without password hashes).
   * @param {string} [roleFilter] optional role filter
   */
  listUsers(roleFilter = null) {
    const db = getDb();
    let query = 'SELECT id, username, display_name, role, phone, created_by, is_active, created_at, last_login FROM web_users';
    const params = [];

    if (roleFilter) {
      query += ' WHERE role = ?';
      params.push(roleFilter);
    }

    query += ' ORDER BY created_at ASC';
    return db.prepare(query).all(...params);
  },

  /**
   * Updates a user's profile fields.
   */
  updateUser(id, updates) {
    const db = getDb();
    const fields = [];
    const values = [];

    if (updates.displayName !== undefined) { fields.push('display_name = ?'); values.push(updates.displayName); }
    if (updates.role !== undefined) { fields.push('role = ?'); values.push(updates.role); }
    if (updates.phone !== undefined) { fields.push('phone = ?'); values.push(updates.phone); }
    if (updates.isActive !== undefined) { fields.push('is_active = ?'); values.push(updates.isActive ? 1 : 0); }

    if (fields.length === 0) return null;

    values.push(id);
    db.prepare(`UPDATE web_users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getUserById(id);
  },

  /**
   * Changes a user's password.
   */
  changePassword(id, newPassword) {
    const db = getDb();
    const hash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
    return db.prepare('UPDATE web_users SET password_hash = ? WHERE id = ?').run(hash, id);
  },

  /**
   * Deactivates a user (soft delete).
   */
  deactivateUser(id) {
    const db = getDb();
    return db.prepare('UPDATE web_users SET is_active = 0 WHERE id = ?').run(id);
  },

  /**
   * Checks if any super_admin exists in the database.
   */
  hasSuperAdmin() {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as count FROM web_users WHERE role = 'super_admin'").get();
    return row.count > 0;
  },

  /**
   * Gets count of all active users.
   */
  getUserCount() {
    const db = getDb();
    return db.prepare("SELECT COUNT(*) as count FROM web_users WHERE is_active = 1").get().count;
  }
};
