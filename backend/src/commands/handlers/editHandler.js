import { eventRepo } from '../../database/eventRepo.js';
import { reminderEngine } from '../../scheduler/reminderEngine.js';
import { parseDateTime, formatDisplayDate } from '../../utils/dateUtils.js';
import { renderUpdateTemplate } from '../../templates/updateTemplate.js';
import { logger } from '../../utils/logger.js';

export const editHandler = {
  /**
   * Modifies fields of an existing event by ID and broadcasts an update notice to the group.
   */
  async handle(subcommands, flags, sock = null) {
    // Expected: ['crb', 'edit', '104'] or ['edit', '104']
    const cleanSubs = subcommands.filter(s => s.toLowerCase() !== 'crb');
    const idParam = cleanSubs[1] || flags._?.[1];
    
    if (!idParam) {
      return `❌ *Missing Event ID!*\n\n*Usage:*\n• \`crb edit 104 --venue "Room 501"\`\n• \`crb edit 104 --date "2026-10-16 10:00 AM"\`\n• \`crb edit 104 --syllabus "Chapters 1, 2 and 3"\``;
    }

    const id = parseInt(String(idParam).replace('#', ''), 10);
    if (isNaN(id)) {
      return `❌ *Invalid Event ID:* "${idParam}"`;
    }

    const existing = eventRepo.getEventById(id);
    if (!existing) {
      return `❌ *Event #${id} not found!*`;
    }

    const updates = {};
    let newReminders = null;

    if (flags.title) updates.title = flags.title;
    if (flags.venue !== undefined) updates.venue = flags.venue;
    if (flags.syllabus !== undefined) updates.syllabus = flags.syllabus;
    if (flags.link !== undefined) updates.link = flags.link;
    if (flags.notes !== undefined) updates.notes = flags.notes;

    if (flags.date || flags.time) {
      const datePart = flags.date || existing.event_date;
      const timePart = flags.time || '';
      const combined = timePart ? `${datePart} ${timePart}` : datePart;
      const parsed = parseDateTime(combined);

      if (!parsed || isNaN(parsed.getTime())) {
        return `❌ *Could not parse new date/time:* "${combined}"`;
      }

      updates.event_date = parsed;
      // Recalculate reminders for the new date
      newReminders = reminderEngine.generateReminders(existing.type, parsed);
    }

    if (Object.keys(updates).length === 0 && !newReminders) {
      return `ℹ️ *No changes specified! Provide flags to update:*\n• \`--title\`, \`--date\`, \`--time\`, \`--venue\`, \`--syllabus\`, \`--link\``;
    }

    const updated = eventRepo.updateEvent(id, updates, newReminders);
    let broadcastSent = false;

    // Dispatch update notification directly to the class group!
    if (sock && updated.target_group_jid) {
      try {
        const updateMsg = renderUpdateTemplate(updated);
        await sock.sendMessage(updated.target_group_jid, { text: updateMsg });
        broadcastSent = true;
      } catch (err) {
        logger.error(`Failed to send update notice for #${id} to group:`, err.message);
      }
    }

    let reply = `✅ *Event #${id} Successfully Updated!*\n\n`;
    reply += `📌 *Type:* ${updated.type.toUpperCase()}\n`;
    reply += `📚 *Title:* ${updated.title}\n`;
    reply += `📅 *Date & Time:* ${formatDisplayDate(updated.event_date)}\n`;
    reply += `📍 *Venue:* ${updated.venue || 'TBA / Regular Classroom'}\n`;
    if (updated.syllabus) reply += `📝 *Syllabus:* ${updated.syllabus}\n`;

    if (broadcastSent) {
      reply += `\n📢 *Group Notification:* Update notice sent to *${updated.group_name || updated.target_group_jid}*!`;
    }

    if (newReminders) {
      reply += `\n⏰ *Reminders Rescheduled (${newReminders.length}):*\n`;
      for (const r of newReminders) {
        reply += `  • ${r.label.replace('_', ' ')}: ${formatDisplayDate(r.scheduledFor)}\n`;
      }
    }

    return reply;
  }
};
