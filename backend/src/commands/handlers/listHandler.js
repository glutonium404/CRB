import { eventRepo } from '../../database/eventRepo.js';
import { formatDisplayDate, getCountdownBanner } from '../../utils/dateUtils.js';

export const listHandler = {
  /**
   * Lists upcoming active events.
   */
  async list(subcommands, flags) {
    const typeFilter = flags.type || (subcommands.length > 2 ? subcommands[2] : null);
    const events = eventRepo.listUpcomingEvents(typeFilter);

    if (events.length === 0) {
      return `📅 *No Upcoming Academic Events Found!* ${typeFilter ? `(Filtered by: ${typeFilter})` : ''}\n\nSchedule one by saying:\n• \`crb add ct "CSE 311 CT-2" -d "2026-10-15" -t "10:30 AM"\`\n• Or text the notice naturally!`;
    }

    let message = `╔══════════════════════════════╗\n`;
    message += `   📋 UPCOMING ACADEMIC EVENTS 📋\n`;
    message += `╚══════════════════════════════╝\n\n`;

    for (const ev of events) {
      const banner = getCountdownBanner(ev.event_date);
      message += `🔹 *#${ev.id}* [${ev.type.toUpperCase()}] *${ev.title}*\n`;
      message += `   📅 ${formatDisplayDate(ev.event_date)}\n`;
      message += `   ⏳ ${banner}\n`;
      if (ev.venue) message += `   📍 Venue: ${ev.venue}\n`;
      message += `   👥 Group: ${ev.group_alias ? '@' + ev.group_alias : ev.group_name || 'Main'}\n`;
      message += `   ─────────────────────────\n`;
    }

    message += `\n💡 _To view details & reminder schedules: \`crb info <id>\`_\n`;
    message += `💡 _To edit: \`crb edit <id> --date ...\` | To cancel: \`crb cancel <id>\`_`;

    return message;
  },

  /**
   * Shows detailed info of a single event by ID.
   */
  async info(subcommands) {
    const idStr = subcommands[subcommands.length - 1];
    const id = parseInt(idStr.replace('#', ''), 10);

    if (isNaN(id)) {
      return `❌ *Invalid ID!*\nUsage: \`crb info 104\``;
    }

    const event = eventRepo.getEventById(id);
    if (!event) {
      return `❌ *Event #${id} not found!*`;
    }

    const reminders = eventRepo.getRemindersForEvent(id);

    let message = `📋 *Event Details: #${event.id}*\n\n`;
    message += `📌 *Type:* ${event.type.toUpperCase()}\n`;
    message += `📚 *Title:* ${event.title}\n`;
    message += `📅 *Date & Time:* ${formatDisplayDate(event.event_date)}\n`;
    message += `⏳ *Status Banner:* ${getCountdownBanner(event.event_date)}\n`;
    message += `📍 *Venue:* ${event.venue || 'Not specified'}\n`;
    if (event.syllabus) message += `📝 *Syllabus:* ${event.syllabus}\n`;
    if (event.link) message += `🔗 *Link:* ${event.link}\n`;
    if (event.notes) message += `📌 *Notes:* ${event.notes}\n`;
    message += `👥 *Target Group:* ${event.group_name} (${event.group_alias ? '@' + event.group_alias : ''})\n`;
    message += `⚙️ *Event Status:* ${event.status.toUpperCase()}\n\n`;

    message += `⏰ *Reminder Schedules (${reminders.length}):*\n`;
    if (reminders.length === 0) {
      message += `  _No reminders queued._\n`;
    } else {
      for (const r of reminders) {
        const icon = r.status === 'sent' ? '✅' : (r.status === 'cancelled' ? '❌' : '⏳');
        message += `  ${icon} *${r.label.replace('_', ' ')}:* ${formatDisplayDate(r.scheduled_for)} [${r.status}]\n`;
      }
    }

    return message;
  }
};
