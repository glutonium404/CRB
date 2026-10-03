import { config } from '../config.js';
import { adminRepo } from '../database/adminRepo.js';
import { groupRepo } from '../database/groupRepo.js';
import { eventRepo } from '../database/eventRepo.js';
import { sessionManager } from './sessionManager.js';
import { parseCommandLine } from './commandParser.js';
import { addHandler } from './handlers/addHandler.js';
import { listHandler } from './handlers/listHandler.js';
import { editHandler } from './handlers/editHandler.js';
import { cancelHandler } from './handlers/cancelHandler.js';
import { deleteHandler } from './handlers/deleteHandler.js';
import { triggerHandler } from './handlers/triggerHandler.js';
import { groupHandler } from './handlers/groupHandler.js';
import { adminHandler } from './handlers/adminHandler.js';
import { broadcastHandler } from './handlers/broadcastHandler.js';
import { helpHandler } from './handlers/helpHandler.js';
import { parseWithGemini } from '../ai/geminiParser.js';
import { parseWithLocalRules } from '../ai/localParser.js';
import { reminderEngine } from '../scheduler/reminderEngine.js';
import { parseDateTime, formatDisplayDate } from '../utils/dateUtils.js';
import { formatEventMessage } from '../templates/index.js';
import { logger } from '../utils/logger.js';

export async function routeMessage(rawText, senderPhoneOrIds, isGroup = false, sock = null, isFromMe = false) {
  if (!rawText || typeof rawText !== 'string') return null;
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const candidateIds = (Array.isArray(senderPhoneOrIds) ? senderPhoneOrIds : [senderPhoneOrIds])
    .map(p => String(p).replace(/[^0-9]/g, ''))
    .filter(Boolean);
  const primaryPhone = candidateIds[0] || 'unknown';

  // Authorization check (Only authorized CRs can control CRB)
  const authorized = adminRepo.isAuthorized(candidateIds, isFromMe);
  if (!authorized) {
    // In group, silently ignore unauthorized messages
    if (isGroup) return null;
    return `⛔ *Unauthorized Access*\nYour WhatsApp ID (\`${primaryPhone}\`) is not authorized to command CRB.\n\n👉 *To authorize this account, add it to .env:*\n\`OWNER_NUMBERS=${primaryPhone}\`\n\nOr have an admin run:\n\`crb admin add ${primaryPhone}\``;
  }

  // 1. Check for Active Draft Confirmation Session across all candidate IDs
  let activeSession = null;
  let sessionKey = primaryPhone;
  for (const id of candidateIds) {
    const s = sessionManager.getSession(id);
    if (s) {
      activeSession = s;
      sessionKey = id;
      break;
    }
  }

  if (activeSession && activeSession.type === 'draft_confirmation') {
    const reply = await handleDraftConfirmation(trimmed, activeSession.data, sessionKey, sock);
    if (reply !== undefined) {
      return reply;
    }
  }

  // 2. Check if it's a CLI Command (starts with 'crb', '/', '!', or known CLI verbs)
  const isCliPrefix = /^(?:crb|\/|!)/i.test(trimmed);
  let commandText = trimmed;
  if (isCliPrefix) {
    commandText = trimmed.replace(/^(?:crb|\/|!)\s*/i, '');
  }

  const { subcommands, flags } = parseCommandLine(commandText);
  const primaryVerb = subcommands[0]?.toLowerCase();

  // Known verbs: add, schedule, list, ls, info, edit, cancel, delete, rm, trigger, groups, group, admin, broadcast, ping, help
  const knownVerbs = ['add', 'schedule', 'list', 'ls', 'info', 'edit', 'cancel', 'delete', 'rm', 'trigger', 'groups', 'group', 'admin', 'broadcast', 'ping', 'status', 'help'];

  if (isCliPrefix || knownVerbs.includes(primaryVerb)) {
    switch (primaryVerb) {
      case 'add':
      case 'schedule':
        return addHandler.handle(subcommands, flags, primaryPhone, sock);

      case 'list':
      case 'ls':
        return listHandler.list(subcommands, flags);

      case 'info':
        return listHandler.info(subcommands);

      case 'edit':
        return editHandler.handle(subcommands, flags, sock);

      case 'cancel':
        return cancelHandler.handle(subcommands, sock);

      case 'delete':
      case 'rm':
        return deleteHandler.handle(subcommands);

      case 'trigger':
        return triggerHandler.handle(subcommands, sock);

      case 'groups':
      case 'group':
        return groupHandler.handle(subcommands, flags, sock);

      case 'admin':
        return adminHandler.handle(subcommands, flags);

      case 'broadcast':
        return broadcastHandler.handle(subcommands, flags, primaryPhone, sock);

      case 'ping':
      case 'status':
        return helpHandler.getPing();

      case 'help':
      default:
        return helpHandler.getHelp();
    }
  }

  // 3. Natural Language & Forwarded Notice Processing
  // Attempt to parse academic event via Gemini or local rules
  let parsed = null;
  if (config.geminiApiKey) {
    parsed = await parseWithGemini(trimmed);
  }
  if (!parsed) {
    parsed = parseWithLocalRules(trimmed);
  }

  if (parsed && parsed.is_event && parsed.title && parsed.date) {
    const eventDate = new Date(parsed.date);
    if (!isNaN(eventDate.getTime())) {
      const defaultGroup = groupRepo.getDefaultGroup();
      const draft = {
        type: parsed.type || 'ct',
        title: parsed.title,
        event_date: eventDate,
        venue: parsed.venue || null,
        syllabus: parsed.syllabus || null,
        link: parsed.link || null,
        notes: parsed.notes || null,
        target_group_jid: defaultGroup ? defaultGroup.jid : null
      };

      // If user explicitly requested "send now", finalize and dispatch immediately!
      if (parsed.send_now) {
        return finalizeDraft(draft, true, primaryPhone, sock);
      }

      // Store in session manager for confirmation
      sessionManager.setDraft(primaryPhone, draft);

      // Render Draft Confirmation Card
      let card = `📋 *Drafted Announcement for Confirmation:*\n\n`;
      card += `📌 *Type:* ${(draft.type || 'CT').toUpperCase()}\n`;
      card += `📚 *Course / Title:* ${draft.title}\n`;
      card += `📅 *Date & Time:* ${formatDisplayDate(draft.event_date)}\n`;
      if (draft.venue) card += `📍 *Venue:* ${draft.venue}\n`;
      if (draft.syllabus) card += `📝 *Syllabus:* ${draft.syllabus}\n`;
      if (draft.link) card += `🔗 *Link:* ${draft.link}\n`;
      card += `👥 *Target Group:* ${defaultGroup ? defaultGroup.name : '⚠️ No group set (use `crb groups`)'}\n\n`;

      card += `👉 *Reply "1" or "confirm"* to schedule reminders\n`;
      card += `👉 *Reply "1 now" or "send now"* to *Broadcast Immediately* + schedule reminders\n`;
      card += `👉 *Reply "edit <field> <value>"* to adjust (e.g., \`edit venue Room 502\`)\n`;
      card += `👉 *Reply "cancel"* to discard`;

      return card;
    }
  }

  // If not recognized and sent in DM, send friendly guidance
  if (!isGroup) {
    return `👋 *Hi! I am CRB (Class Representative Bot).*\n\nI couldn't quite understand that. You can:\n• Text/Forward an announcement naturally (e.g. *"CSE 311 CT on Oct 15 at 10am in Room 402"*)\n• Type \`crb help\` to see all CLI commands\n• Type \`crb list\` to view upcoming events`;
  }

  return null;
}

/**
 * Handles multi-turn draft confirmations (1, 1 now, edit, cancel).
 */
async function handleDraftConfirmation(input, draft, senderPhone, sock) {
  const lower = input.toLowerCase().trim();

  // 1. Confirm & Schedule Only ('1', 'confirm', 'yes')
  if (lower === '1' || lower === 'confirm' || lower === 'yes' || lower === 'ok') {
    return finalizeDraft(draft, false, senderPhone, sock);
  }

  // 2. Confirm, Send Now & Schedule ('1 now', 'now', 'send now', 'send')
  if (lower === '1 now' || lower === 'now' || lower === 'send now' || lower === 'broadcast now') {
    return finalizeDraft(draft, true, senderPhone, sock);
  }

  // 3. Cancel draft
  if (lower === 'cancel' || lower === 'discard' || lower === 'abort') {
    sessionManager.clearSession(senderPhone);
    return `🗑️ *Draft discarded.*`;
  }

  // 4. In-place edit of draft fields: "edit venue Room 502", "edit date tomorrow 10am", "edit syllabus ..."
  if (lower.startsWith('edit ') || lower.startsWith('set ')) {
    const withoutEdit = input.replace(/^(?:edit|set)\s+/i, '').trim();
    const spaceIdx = withoutEdit.indexOf(' ');
    if (spaceIdx > 0) {
      const field = withoutEdit.slice(0, spaceIdx).toLowerCase();
      const val = withoutEdit.slice(spaceIdx + 1).trim();

      if (field === 'venue' || field === 'room') draft.venue = val;
      else if (field === 'title' || field === 'subject' || field === 'course') draft.title = val;
      else if (field === 'syllabus' || field === 'topics') draft.syllabus = val;
      else if (field === 'link' || field === 'url') draft.link = val;
      else if (field === 'date' || field === 'time') {
        const parsed = parseDateTime(val);
        if (parsed) draft.event_date = parsed;
      } else if (field === 'group') {
        const grp = groupRepo.resolveGroup(val);
        if (grp) draft.target_group_jid = grp.jid;
      }

      sessionManager.setDraft(senderPhone, draft);
      const grp = groupRepo.getGroupByJid(draft.target_group_jid);

      let card = `✏️ *Updated Draft:*\n\n`;
      card += `📌 *Type:* ${draft.type.toUpperCase()}\n`;
      card += `📚 *Title:* ${draft.title}\n`;
      card += `📅 *Date & Time:* ${formatDisplayDate(draft.event_date)}\n`;
      if (draft.venue) card += `📍 *Venue:* ${draft.venue}\n`;
      if (draft.syllabus) card += `📝 *Syllabus:* ${draft.syllabus}\n`;
      card += `👥 *Group:* ${grp ? grp.name : 'Default'}\n\n`;
      card += `👉 Reply *"1"* to schedule | Reply *"1 now"* to send immediately + schedule`;
      return card;
    }
  }

  // Let through if it's another command
  return undefined;
}

/**
 * Saves draft to SQLite and triggers optional immediate broadcast.
 */
async function finalizeDraft(draft, sendImmediate, senderPhone, sock) {
  sessionManager.clearSession(senderPhone);

  const targetGroup = draft.target_group_jid
    ? groupRepo.getGroupByJid(draft.target_group_jid)
    : groupRepo.getDefaultGroup();

  if (!targetGroup) {
    return `❌ *No target WhatsApp group configured!* Please use \`crb group set-default 1\`.`;
  }

  const reminders = reminderEngine.generateReminders(draft.type, draft.event_date);

  const eventId = eventRepo.createEvent({
    type: draft.type,
    title: draft.title,
    event_date: draft.event_date,
    venue: draft.venue,
    syllabus: draft.syllabus,
    link: draft.link,
    notes: draft.notes,
    target_group_jid: targetGroup.jid,
    created_by: senderPhone
  }, reminders);

  const savedEvent = eventRepo.getEventById(eventId);
  let immediateSent = false;

  if (sendImmediate && sock) {
    try {
      const msgText = formatEventMessage(savedEvent, true);
      await sock.sendMessage(targetGroup.jid, { text: msgText });
      immediateSent = true;
    } catch (err) {
      logger.error('Failed to send immediate broadcast:', err);
    }
  }

  let reply = `✅ *Event Scheduled Successfully!*\n\n`;
  reply += `🆔 *Event ID:* #${eventId}\n`;
  reply += `📌 *Type:* ${draft.type.toUpperCase()}\n`;
  reply += `📚 *Title:* ${draft.title}\n`;
  reply += `📅 *Date & Time:* ${formatDisplayDate(draft.event_date)}\n`;
  if (draft.venue) reply += `📍 *Venue:* ${draft.venue}\n`;
  if (draft.syllabus) reply += `📝 *Syllabus:* ${draft.syllabus}\n`;
  reply += `👥 *Target Group:* ${targetGroup.name}\n\n`;

  if (immediateSent) {
    reply += `📢 *Immediate Notice:* Sent to group right now!\n`;
  }

  if (reminders.length > 0) {
    reply += `⏰ *Queued Automated Reminders (${reminders.length}):*\n`;
    for (const r of reminders) {
      reply += `  • ${r.label.replace('_', ' ')}: ${formatDisplayDate(r.scheduledFor)}\n`;
    }
  }

  reply += `\n💡 _Tip: You can edit this anytime using \`crb edit ${eventId} ...\` or trigger manually with \`crb trigger ${eventId}\`._`;

  return reply;
}
