import { Router } from 'express';
import { authMiddleware, requireRole, generateToken, isAdminOrAbove } from './auth.js';
import { userRepo } from '../database/userRepo.js';
import { getDb } from '../database/db.js';
import { eventRepo } from '../database/eventRepo.js';
import { groupRepo } from '../database/groupRepo.js';
import { adminRepo } from '../database/adminRepo.js';
import { reminderEngine } from '../scheduler/reminderEngine.js';
import { formatEventMessage } from '../templates/index.js';
import { renderCancelTemplate } from '../templates/cancelTemplate.js';
import { parseDateTime, formatDisplayDate } from '../utils/dateUtils.js';
import { logger } from '../utils/logger.js';

/**
 * Creates all dashboard API routes.
 * @param {Function} getSocket Returns the active Baileys WhatsApp socket
 * @param {Function} getSocketStatus Returns bot connection status
 */
export function createApiRoutes(getSocket, getSocketStatus) {
  const router = Router();

  // ═══════════════════════════════════════════
  //  AUTH ROUTES
  // ═══════════════════════════════════════════

  /**
   * POST /api/auth/login
   * Body: { username, password }
   */
  router.post('/auth/login', (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username and password are required' });
      }

      const user = userRepo.validateLogin(username, password);
      if (!user) {
        return res.status(401).json({ success: false, error: 'Invalid username or password' });
      }

      const token = generateToken(user);
      res.json({ success: true, token, user });
    } catch (err) {
      logger.error('Login error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  /**
   * GET /api/auth/me
   * Returns the currently authenticated user profile.
   */
  router.get('/auth/me', authMiddleware, (req, res) => {
    res.json({ success: true, user: req.user });
  });

  router.get('/preferences/message-template', authMiddleware, (req, res) => {
    res.json({ success: true, data: { messageTemplate: req.user.message_template || 'standard' } });
  });

  router.put('/preferences/message-template', authMiddleware, (req, res) => {
    const allowed = ['standard', 'compact', 'minimal'];
    if (!allowed.includes(req.body.messageTemplate)) {
      return res.status(400).json({ success: false, error: 'Invalid message template' });
    }
    const user = userRepo.updateUser(req.user.id, { messageTemplate: req.body.messageTemplate });
    res.json({ success: true, data: { messageTemplate: user.message_template } });
  });

  /**
   * POST /api/auth/change-password
   * Body: { currentPassword, newPassword }
   */
  router.post('/auth/change-password', authMiddleware, (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ success: false, error: 'Current and new passwords are required' });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });
      }

      // Verify current password
      const valid = userRepo.validateLogin(req.user.username, currentPassword);
      if (!valid) {
        return res.status(401).json({ success: false, error: 'Current password is incorrect' });
      }

      userRepo.changePassword(req.user.id, newPassword);
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
      logger.error('Change password error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // ═══════════════════════════════════════════
  //  EVENT ROUTES
  // ═══════════════════════════════════════════

  /**
   * GET /api/events
   * Query: ?type=ct|assignment|lab&status=active|cancelled
   */
  router.get('/events', authMiddleware, (req, res) => {
    try {
      const type = req.query.type || null;
      const events = eventRepo.listUpcomingEvents(type, req.user.role === 'cr' ? groupRepo.listAssignedGroupJids(req.user.id) : null);
      res.json({ success: true, count: events.length, data: events });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/events/all
   * Returns all events including cancelled ones
   */
  router.get('/events/all', authMiddleware, (req, res) => {
    try {
      const db = getDb();
      let events = db.prepare(`
        SELECT e.*, g.name AS group_name, g.alias AS group_alias
        FROM events e
        LEFT JOIN groups g ON e.target_group_jid = g.jid
        ORDER BY e.event_date DESC
      `).all();
      if (req.user.role === 'cr') {
        const allowed = new Set(groupRepo.listAssignedGroupJids(req.user.id));
        events = events.filter(event => allowed.has(event.target_group_jid));
      }
      res.json({ success: true, count: events.length, data: events });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/events/:id
   * Returns a single event with its reminders.
   */
  router.get('/events/:id', authMiddleware, (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const event = eventRepo.getEventById(id);
      if (!event) {
        return res.status(404).json({ success: false, error: `Event #${id} not found` });
      }
      if (req.user.role === 'cr' && !groupRepo.isGroupAssignedToUser(req.user.id, event.target_group_jid)) {
        return res.status(403).json({ success: false, error: 'You are not assigned to this group' });
      }

      const reminders = eventRepo.getRemindersForEvent(id);
      res.json({ success: true, data: { ...event, reminders } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/events
   * Body: { type, title, event_date, venue?, syllabus?, link?, notes?, target_group_jid?, sendNow? }
   */
  router.post('/events', authMiddleware, (req, res) => {
    try {
      const { type, title, event_date, venue, syllabus, link, notes, custom_message, target_group_jid, sendNow } = req.body;

      if (!title && !custom_message) {
        return res.status(400).json({ success: false, error: 'Title is required' });
      }
      if (custom_message && !String(custom_message).trim()) {
        return res.status(400).json({ success: false, error: 'Raw message cannot be empty' });
      }
      if (!event_date && !custom_message) {
        return res.status(400).json({ success: false, error: 'Event date is required' });
      }

      const eventDate = parseDateTime(event_date || new Date().toISOString());
      if (!eventDate || isNaN(eventDate.getTime())) {
        return res.status(400).json({ success: false, error: `Could not parse date: "${event_date}"` });
      }

      // Resolve target group
      const targetGroup = target_group_jid
        ? groupRepo.getGroupByJid(target_group_jid)
        : groupRepo.getDefaultGroup();

      if (!targetGroup) {
        return res.status(400).json({ success: false, error: 'No target group configured. Set a default group first.' });
      }
      if (req.user.role === 'cr' && !groupRepo.isGroupAssignedToUser(req.user.id, targetGroup.jid)) {
        return res.status(403).json({ success: false, error: 'You are not assigned to this group' });
      }

      // Generate reminders
      const reminders = custom_message ? [] : reminderEngine.generateReminders(type || 'ct', eventDate);

      // Save event
      const eventId = eventRepo.createEvent({
        type: type || 'ct',
        title: title || 'Custom announcement',
        event_date: eventDate,
        venue: venue || null,
        syllabus: syllabus || null,
        link: link || null,
        notes: notes || null,
        custom_message: custom_message ? String(custom_message).trim() : null,
        message_template: req.user.message_template || 'standard',
        target_group_jid: targetGroup.jid,
        created_by: `web:${req.user.username}`
      }, reminders);

      const savedEvent = eventRepo.getEventById(eventId);
      let immediateSent = false;

      // Optionally send immediate broadcast
      if (sendNow) {
        const sock = getSocket();
        if (sock) {
          try {
            const msgText = formatEventMessage(savedEvent, true);
            sock.sendMessage(targetGroup.jid, { text: msgText });
            immediateSent = true;
          } catch (err) {
            logger.error('Failed to send immediate broadcast from dashboard:', err);
          }
        }
      }

      res.status(201).json({
        success: true,
        data: {
          ...savedEvent,
          reminders: eventRepo.getRemindersForEvent(eventId),
          immediateSent
        }
      });
    } catch (err) {
      logger.error('Create event error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * PUT /api/events/:id
   * Body: { title?, event_date?, venue?, syllabus?, link?, notes?, status? }
   */
  router.put('/events/:id', authMiddleware, (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const existing = eventRepo.getEventById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: `Event #${id} not found` });
      }
      if (req.user.role === 'cr' && !groupRepo.isGroupAssignedToUser(req.user.id, existing.target_group_jid)) {
        return res.status(403).json({ success: false, error: 'You are not assigned to this group' });
      }
      const updates = {};
      let newReminders = null;

      if (req.body.title !== undefined) updates.title = req.body.title;
      if (req.body.venue !== undefined) updates.venue = req.body.venue;
      if (req.body.syllabus !== undefined) updates.syllabus = req.body.syllabus;
      if (req.body.link !== undefined) updates.link = req.body.link;
      if (req.body.notes !== undefined) updates.notes = req.body.notes;
      if (req.body.custom_message !== undefined) updates.custom_message = req.body.custom_message || null;
      if (req.body.status !== undefined) updates.status = req.body.status;

      if (req.body.event_date) {
        const parsed = parseDateTime(req.body.event_date);
        if (!parsed || isNaN(parsed.getTime())) {
          return res.status(400).json({ success: false, error: `Could not parse date: "${req.body.event_date}"` });
        }
        updates.event_date = parsed;
        newReminders = reminderEngine.generateReminders(existing.type, parsed);
      }

      if (Object.keys(updates).length === 0 && !newReminders) {
        return res.status(400).json({ success: false, error: 'No changes specified' });
      }

      const updated = eventRepo.updateEvent(id, updates, newReminders);
      res.json({ success: true, data: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/events/:id/cancel
   */
  router.post('/events/:id/cancel', authMiddleware, (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const existing = eventRepo.getEventById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: `Event #${id} not found` });
      }
      if (req.user.role === 'cr' && !groupRepo.isGroupAssignedToUser(req.user.id, existing.target_group_jid)) {
        return res.status(403).json({ success: false, error: 'You are not assigned to this group' });
      }

      if (existing.status === 'cancelled') {
        return res.status(400).json({ success: false, error: `Event #${id} is already cancelled` });
      }

      eventRepo.cancelEvent(id);

      // Send cancellation notice to group
      const sock = getSocket();
      if (sock && existing.target_group_jid) {
        try {
          const cancelNotice = renderCancelTemplate(existing);
          sock.sendMessage(existing.target_group_jid, { text: cancelNotice });
        } catch (err) {
          logger.error('Failed to send cancel notice from dashboard:', err);
        }
      }

      res.json({ success: true, message: `Event #${id} cancelled` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * DELETE /api/events/:id
   * Hard delete — admin+ only
   */
  router.delete('/events/:id', authMiddleware, (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const existing = eventRepo.getEventById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: `Event #${id} not found` });
      }
      if (req.user.role === 'cr' && !groupRepo.isGroupAssignedToUser(req.user.id, existing.target_group_jid)) {
        return res.status(403).json({ success: false, error: 'You are not assigned to this group' });
      }
      const deleted = eventRepo.deleteEvent(id);
      if (!deleted) {
        return res.status(404).json({ success: false, error: `Event #${id} not found` });
      }
      res.json({ success: true, message: `Event #${id} permanently deleted` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/events/:id/trigger
   * Immediately sends event notice to WhatsApp group.
   */
  router.post('/events/:id/trigger', authMiddleware, (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const event = eventRepo.getEventById(id);
      if (!event) {
        return res.status(404).json({ success: false, error: `Event #${id} not found` });
      }
      if (req.user.role === 'cr' && !groupRepo.isGroupAssignedToUser(req.user.id, event.target_group_jid)) {
        return res.status(403).json({ success: false, error: 'You are not assigned to this group' });
      }

      if (event.status === 'cancelled') {
        return res.status(400).json({ success: false, error: `Cannot trigger a cancelled event` });
      }

      const sock = getSocket();
      if (!sock) {
        return res.status(503).json({ success: false, error: 'WhatsApp bot is not connected' });
      }

      const messageText = formatEventMessage(event, true);
      sock.sendMessage(event.target_group_jid, { text: messageText })
        .then(() => {
          res.json({ success: true, message: `Notice for Event #${id} sent to ${event.group_name || event.target_group_jid}` });
        })
        .catch(err => {
          res.status(500).json({ success: false, error: `Failed to send: ${err.message}` });
        });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ═══════════════════════════════════════════
  //  GROUP ROUTES
  // ═══════════════════════════════════════════

  /**
   * GET /api/groups
   */
  router.get('/groups', authMiddleware, (req, res) => {
    try {
      const groups = req.user.role === 'cr'
        ? groupRepo.listAssignedGroups(req.user.id)
        : groupRepo.listGroups();
      res.json({ success: true, count: groups.length, data: groups });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * PUT /api/groups/:jid/default
   */
  router.put('/groups/:jid/default', authMiddleware, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const jid = decodeURIComponent(req.params.jid);
      const group = groupRepo.getGroupByJid(jid);
      if (!group) {
        return res.status(404).json({ success: false, error: 'Group not found' });
      }

      groupRepo.setDefaultGroup(jid);
      res.json({ success: true, message: `Default group set to: ${group.name}` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * PUT /api/groups/:jid/alias
   * Body: { alias }
   */
  router.put('/groups/:jid/alias', authMiddleware, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const jid = decodeURIComponent(req.params.jid);
      const { alias } = req.body;
      if (!alias) {
        return res.status(400).json({ success: false, error: 'Alias is required' });
      }

      const group = groupRepo.getGroupByJid(jid);
      if (!group) {
        return res.status(404).json({ success: false, error: 'Group not found' });
      }

      groupRepo.setGroupAlias(jid, alias);
      res.json({ success: true, message: `Alias "@${alias}" set for ${group.name}` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/groups/sync
   * Force re-sync participating groups from WhatsApp.
   */
  router.post('/groups/sync', authMiddleware, requireRole('admin', 'super_admin'), async (req, res) => {
    try {
      const sock = getSocket();
      if (!sock) {
        return res.status(503).json({ success: false, error: 'WhatsApp bot is not connected' });
      }

      const liveGroups = await sock.groupFetchAllParticipating();
      let synced = 0;
      for (const [jid, info] of Object.entries(liveGroups)) {
        groupRepo.upsertGroup(jid, info.subject);
        synced++;
      }

      const groups = groupRepo.listGroups();
      res.json({ success: true, message: `Synced ${synced} groups from WhatsApp`, data: groups });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ═══════════════════════════════════════════
  //  USER MANAGEMENT ROUTES (Dashboard Accounts)
  // ═══════════════════════════════════════════

  /**
   * GET /api/users
   */
  router.get('/users', authMiddleware, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const role = req.user.role === 'super_admin' && req.query.role !== 'cr' ? 'admin' : 'cr';
      const users = userRepo.listUsers(role).map(user => ({
        ...user,
        assigned_groups: groupRepo.listAssignedGroups(user.id)
      }));
      res.json({ success: true, count: users.length, data: users });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * PUT /api/users/:id/groups
   * Body: { groupJids: string[] }
   */
  router.put('/users/:id/groups', authMiddleware, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const target = userRepo.getUserById(id);
      if (!target || target.role !== 'cr') {
        return res.status(404).json({ success: false, error: 'CR account not found' });
      }
      if (!Array.isArray(req.body.groupJids)) {
        return res.status(400).json({ success: false, error: 'groupJids must be an array' });
      }
      const known = new Set(groupRepo.listGroups().map(group => group.jid));
      const groupJids = [...new Set(req.body.groupJids.map(String))];
      if (groupJids.some(jid => !known.has(jid))) {
        return res.status(400).json({ success: false, error: 'One or more groups do not exist' });
      }
      groupRepo.setAssignedGroups(id, groupJids);
      res.json({ success: true, data: groupRepo.listAssignedGroups(id) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/users
   * Body: { username, password, displayName, role, phone? }
   * 
   * Role creation rules:
   * - super_admin can create admins and CRs
   * - admin can only create CRs
   * - CR cannot create anyone
   */
  router.post('/users', authMiddleware, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const { username, password, displayName, role, phone } = req.body;

      if (!username || !password || !displayName || !phone) {
        return res.status(400).json({ success: false, error: 'Username, password, display name, and phone are required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      }

      const targetRole = role || 'cr';

      // Super admins create dashboard admins; admins create CR accounts.
      if (targetRole === 'super_admin') {
        return res.status(403).json({ success: false, error: 'Cannot create super_admin accounts' });
      }

      if (req.user.role === 'super_admin' && targetRole !== 'admin') {
        return res.status(403).json({ success: false, error: 'Super admins can only create admin accounts here' });
      }

      if (req.user.role === 'admin' && targetRole !== 'cr') {
        return res.status(403).json({ success: false, error: 'Admins can only create CR accounts' });
      }

      // Check if username already exists
      const existing = userRepo.getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ success: false, error: 'Username already exists' });
      }

      const userId = userRepo.createUser({
        username,
        password,
        displayName,
        role: targetRole,
        phone: String(phone).trim(),
        createdBy: req.user.id
      });
      adminRepo.addAdmin(phone, displayName, targetRole);

      const newUser = userRepo.getUserById(userId);
      res.status(201).json({ success: true, data: newUser });
    } catch (err) {
      logger.error('Create user error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * PUT /api/users/:id
   * Body: { displayName?, role?, phone?, isActive? }
   */
  router.put('/users/:id', authMiddleware, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const target = userRepo.getUserById(id);
      if (!target) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      // Prevent admins from modifying other admins or super_admins
      if (req.user.role === 'admin' && (target.role === 'admin' || target.role === 'super_admin')) {
        return res.status(403).json({ success: false, error: 'Admins cannot modify other admins' });
      }

      // Prevent changing role to super_admin
      if (req.body.role === 'super_admin') {
        return res.status(403).json({ success: false, error: 'Cannot promote to super_admin' });
      }

      const previousPhone = target.phone;
      const updated = userRepo.updateUser(id, req.body);
      if (req.body.phone !== undefined && req.body.phone !== previousPhone) {
        adminRepo.removeAdmin(previousPhone);
        adminRepo.addAdmin(req.body.phone, updated.display_name, updated.role);
      } else if (req.body.isActive !== undefined) {
        adminRepo.setActive(updated.phone, Boolean(req.body.isActive));
      }
      res.json({ success: true, data: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * DELETE /api/users/:id/permanent
   * Permanently removes a managed dashboard account.
   */
  router.delete('/users/:id/permanent', authMiddleware, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const target = userRepo.getUserById(id);
      if (!target) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      if (target.role === 'super_admin') {
        return res.status(403).json({ success: false, error: 'Cannot delete super admin' });
      }
      if (req.user.role === 'admin' && target.role === 'admin') {
        return res.status(403).json({ success: false, error: 'Admins cannot delete other admins' });
      }
      if (req.user.id === id) {
        return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
      }
      const db = getDb();
      const result = db.transaction(() => {
        // Explicitly remove assignments so databases created before the
        // web_user_groups foreign-key migration can still delete accounts.
        db.prepare('DELETE FROM web_user_groups WHERE user_id = ?').run(id);
        const deleted = db.prepare('DELETE FROM web_users WHERE id = ?').run(id);
        if (deleted.changes) adminRepo.removeAdmin(target.phone);
        return deleted;
      })();
      if (!result.changes) return res.status(404).json({ success: false, error: 'User not found' });
      res.json({ success: true, message: `User "${target.username}" permanently deleted` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * DELETE /api/users/:id
   * Suspends a user account.
   */
  router.delete('/users/:id', authMiddleware, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const target = userRepo.getUserById(id);
      if (!target) return res.status(404).json({ success: false, error: 'User not found' });
      if (target.role === 'super_admin') return res.status(403).json({ success: false, error: 'Cannot suspend super admin' });
      if (req.user.id === id) return res.status(400).json({ success: false, error: 'Cannot suspend your own account' });
      if (req.user.role === 'admin' && target.role === 'admin') {
        return res.status(403).json({ success: false, error: 'Admins cannot suspend other admins' });
      }
      userRepo.deactivateUser(id);
      adminRepo.setActive(target.phone, false);
      res.json({ success: true, message: `User "${target.username}" suspended` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/users/:id/reset-password
   * Body: { newPassword }
   * Admin+ can reset any managed user's password.
   */
  router.post('/users/:id/reset-password', authMiddleware, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });
      }

      const target = userRepo.getUserById(id);
      if (!target) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      // Admins can't reset other admin/super_admin passwords
      if (req.user.role === 'admin' && (target.role === 'admin' || target.role === 'super_admin')) {
        return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      }

      userRepo.changePassword(id, newPassword);
      res.json({ success: true, message: `Password reset for "${target.username}"` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ═══════════════════════════════════════════
  //  WHATSAPP ADMIN ROUTES (Bot Phone Whitelist)
  // ═══════════════════════════════════════════

  /**
   * GET /api/admins
   */
  router.get('/admins', authMiddleware, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const admins = adminRepo.listAdmins();
      res.json({ success: true, count: admins.length, data: admins });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/admins
   * Body: { phone, name?, role? }
   */
  router.post('/admins', authMiddleware, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const { phone, name, role } = req.body;
      if (!phone) {
        return res.status(400).json({ success: false, error: 'Phone number is required' });
      }

      adminRepo.addAdmin(phone, name || 'CR', role || 'cr');
      res.status(201).json({ success: true, message: `Admin "${name || phone}" added` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * DELETE /api/admins/:phone
   */
  router.delete('/admins/:phone', authMiddleware, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const phone = req.params.phone;
      adminRepo.removeAdmin(phone);
      res.json({ success: true, message: `Admin "${phone}" removed` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * PUT /api/admins/:phone/status
   * Body: { isActive: boolean }
   */
  router.put('/admins/:phone/status', authMiddleware, requireRole('admin', 'super_admin'), (req, res) => {
    try {
      const phone = decodeURIComponent(req.params.phone);
      const isActive = req.body.isActive === true;
      const result = adminRepo.setActive(phone, isActive);
      if (!result.changes) return res.status(404).json({ success: false, error: 'WhatsApp admin not found' });
      res.json({ success: true, message: isActive ? `Admin "${phone}" restored` : `Admin "${phone}" suspended` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ═══════════════════════════════════════════
  //  SYSTEM / STATS ROUTES
  // ═══════════════════════════════════════════

  /**
   * GET /api/stats
   * Dashboard statistics overview.
   */
  router.get('/stats', authMiddleware, (req, res) => {
    try {
      const eventStats = eventRepo.getStats();
      const groups = groupRepo.listGroups();
      const defaultGroup = groupRepo.getDefaultGroup();
      const userCount = userRepo.getUserCount();

      res.json({
        success: true,
        data: {
          activeEvents: eventStats.activeEvents,
          pendingReminders: eventStats.pendingReminders,
          sentReminders: eventStats.sentReminders,
          totalGroups: groups.length,
          defaultGroup: defaultGroup ? { name: defaultGroup.name, alias: defaultGroup.alias } : null,
          totalUsers: userCount,
          botConnected: getSocketStatus ? getSocketStatus() : false,
          uptime: Math.floor(process.uptime()),
          serverTime: new Date().toISOString()
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
