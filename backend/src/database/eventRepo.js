import { getDb } from './db.js';

export const eventRepo = {
  /**
   * Creates an academic event and all calculated reminder rows in a single atomic transaction.
   * @param {Object} eventData
   * @param {Array<{ label: string, scheduledFor: Date }>} [reminders]
   * @returns {number} The generated event ID
   */
  createEvent(eventData, reminders = []) {
    const db = getDb();

    const insertEvent = db.prepare(`
      INSERT INTO events (
        type, title, event_date, venue, syllabus, link, notes, target_group_jid, created_by, status
      ) VALUES (
        @type, @title, @event_date, @venue, @syllabus, @link, @notes, @target_group_jid, @created_by, 'active'
      )
    `);

    const insertReminder = db.prepare(`
      INSERT INTO reminders (event_id, scheduled_for, label, status)
      VALUES (?, ?, ?, 'pending')
    `);

    const tx = db.transaction(() => {
      const info = insertEvent.run({
        type: eventData.type || 'ct',
        title: eventData.title,
        event_date: new Date(eventData.event_date).toISOString(),
        venue: eventData.venue || null,
        syllabus: eventData.syllabus || null,
        link: eventData.link || null,
        notes: eventData.notes || null,
        target_group_jid: eventData.target_group_jid,
        created_by: eventData.created_by || 'system'
      });

      const eventId = info.lastInsertRowid;

      for (const r of reminders) {
        insertReminder.run(eventId, new Date(r.scheduledFor).toISOString(), r.label);
      }

      return eventId;
    });

    return tx();
  },

  /**
   * Retrieves an event by its ID with group details.
   */
  getEventById(id) {
    const db = getDb();
    return db.prepare(`
      SELECT e.*, g.name AS group_name, g.alias AS group_alias
      FROM events e
      LEFT JOIN groups g ON e.target_group_jid = g.jid
      WHERE e.id = ?
    `).get(id);
  },

  /**
   * Lists upcoming active events ordered by event_date ASC.
   * @param {string} [type] Filter by 'ct', 'assignment', 'lab', etc.
   */
  listUpcomingEvents(type = null, groupJids = null) {
    const db = getDb();
    let query = `
      SELECT e.*, g.name AS group_name, g.alias AS group_alias
      FROM events e
      LEFT JOIN groups g ON e.target_group_jid = g.jid
      WHERE e.status = 'active' AND datetime(e.event_date) >= datetime('now', '-2 hours')
    `;
    const params = [];

    if (type) {
      query += ` AND LOWER(e.type) = LOWER(?)`;
      params.push(type);
    }

    if (Array.isArray(groupJids)) {
      if (groupJids.length === 0) return [];
      query += ` AND e.target_group_jid IN (${groupJids.map(() => '?').join(',')})`;
      params.push(...groupJids);
    }

    query += ` ORDER BY e.event_date ASC`;
    return db.prepare(query).all(...params);
  },

  /**
   * Updates an existing event. If new reminders are provided, cancels old pending ones and inserts new ones.
   */
  updateEvent(id, updates, newReminders = null) {
    const db = getDb();
    const existing = this.getEventById(id);
    if (!existing) return null;

    const fields = [];
    const values = [];

    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
    if (updates.event_date !== undefined) { fields.push('event_date = ?'); values.push(new Date(updates.event_date).toISOString()); }
    if (updates.venue !== undefined) { fields.push('venue = ?'); values.push(updates.venue); }
    if (updates.syllabus !== undefined) { fields.push('syllabus = ?'); values.push(updates.syllabus); }
    if (updates.link !== undefined) { fields.push('link = ?'); values.push(updates.link); }
    if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes); }
    if (updates.target_group_jid !== undefined) { fields.push('target_group_jid = ?'); values.push(updates.target_group_jid); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }

    if (fields.length === 0 && !newReminders) return existing;

    const tx = db.transaction(() => {
      if (fields.length > 0) {
        values.push(id);
        db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      }

      if (newReminders && Array.isArray(newReminders)) {
        // Remove old pending reminders
        db.prepare(`DELETE FROM reminders WHERE event_id = ? AND status = 'pending'`).run(id);

        const insertReminder = db.prepare(`
          INSERT INTO reminders (event_id, scheduled_for, label, status)
          VALUES (?, ?, ?, 'pending')
        `);

        for (const r of newReminders) {
          insertReminder.run(id, new Date(r.scheduledFor).toISOString(), r.label);
        }
      }

      return this.getEventById(id);
    });

    return tx();
  },

  /**
   * Cancels an active event and marks its pending reminders as cancelled.
   */
  cancelEvent(id) {
    const db = getDb();
    const tx = db.transaction(() => {
      const res = db.prepare(`UPDATE events SET status = 'cancelled' WHERE id = ?`).run(id);
      db.prepare(`UPDATE reminders SET status = 'cancelled' WHERE event_id = ? AND status = 'pending'`).run(id);
      return res.changes > 0;
    });
    return tx();
  },

  /**
   * Permanently deletes an event and all its reminders from the database.
   */
  deleteEvent(id) {
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM reminders WHERE event_id = ?`).run(id);
      const res = db.prepare(`DELETE FROM events WHERE id = ?`).run(id);
      return res.changes > 0;
    });
    return tx();
  },

  /**
   * Retrieves all pending reminders that are due to be sent.
   * @param {Date} [now]
   */
  getDueReminders(now = new Date()) {
    const db = getDb();
    const isoNow = now.toISOString();

    return db.prepare(`
      SELECT 
        r.id AS reminder_id,
        r.label AS reminder_label,
        r.scheduled_for,
        e.*,
        g.name AS group_name
      FROM reminders r
      JOIN events e ON r.event_id = e.id
      JOIN groups g ON e.target_group_jid = g.jid
      WHERE r.status = 'pending'
        AND e.status = 'active'
        AND datetime(r.scheduled_for) <= datetime(?)
      ORDER BY r.scheduled_for ASC
    `).all(isoNow);
  },

  /**
   * Marks a reminder trigger as sent.
   */
  markReminderSent(reminderId) {
    const db = getDb();
    return db.prepare(`
      UPDATE reminders
      SET status = 'sent', sent_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reminderId);
  },

  /**
   * Marks a reminder trigger as failed.
   */
  markReminderFailed(reminderId, errorMessage) {
    const db = getDb();
    return db.prepare(`
      UPDATE reminders
      SET status = 'failed', error_message = ?
      WHERE id = ?
    `).run(errorMessage, reminderId);
  },

  /**
   * Gets all reminder records for a specific event.
   */
  getRemindersForEvent(eventId) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM reminders WHERE event_id = ? ORDER BY scheduled_for ASC
    `).all(eventId);
  },

  /**
   * Total counts for status/stats reporting.
   */
  getStats() {
    const db = getDb();
    const totalActiveEvents = db.prepare(`SELECT COUNT(*) as count FROM events WHERE status = 'active'`).get().count;
    const totalPendingReminders = db.prepare(`SELECT COUNT(*) as count FROM reminders WHERE status = 'pending'`).get().count;
    const totalSentReminders = db.prepare(`SELECT COUNT(*) as count FROM reminders WHERE status = 'sent'`).get().count;
    return {
      activeEvents: totalActiveEvents,
      pendingReminders: totalPendingReminders,
      sentReminders: totalSentReminders
    };
  }
};
