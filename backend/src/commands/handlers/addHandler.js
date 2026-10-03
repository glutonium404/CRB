import { eventRepo } from '../../database/eventRepo.js';
import { groupRepo } from '../../database/groupRepo.js';
import { reminderEngine } from '../../scheduler/reminderEngine.js';
import { parseDateTime, formatDisplayDate } from '../../utils/dateUtils.js';
import { formatEventMessage } from '../../templates/index.js';

export const addHandler = {
  /**
   * Executes event creation from CLI flags or positional parameters.
   */
  async handle(subcommands, flags, senderPhone, sock) {
    // subcommands might look like: ['crb', 'add', 'ct', 'CSE 311 CT-2'] or ['add', 'ct', ...]
    const cleanSubs = subcommands.filter(s => s.toLowerCase() !== 'crb');
    // cleanSubs: ['add', 'ct', ...] or ['schedule', 'ct', ...]
    
    let type = 'ct';
    if (cleanSubs.length > 1) {
      type = cleanSubs[1].toLowerCase();
    } else if (flags.type) {
      type = flags.type.toLowerCase();
    }

    // Determine title: from flags.title or first positional argument after type
    let title = flags.title;
    if (!title && cleanSubs.length > 2) {
      title = cleanSubs.slice(2).join(' ');
    }

    if (!title) {
      return `❌ *Missing Title / Course Name!*\n\n*Usage:*\n• \`crb add ct "CSE 311 CT-2" -d "2026-10-15" -t "10:30 AM" -s "ER Diagrams" --now\`\n• Or just type your announcement naturally!`;
    }

    // Determine date/time
    let dateStr = flags.date || flags.due || flags.at;
    let timeStr = flags.time || '';
    if (!dateStr) {
      return `❌ *Missing Date!*\nPlease specify a date with \`-d "YYYY-MM-DD"\` or \`--date "tomorrow 10am"\``;
    }

    const combinedDateStr = timeStr ? `${dateStr} ${timeStr}` : dateStr;
    const eventDate = parseDateTime(combinedDateStr);
    if (!eventDate || isNaN(eventDate.getTime())) {
      return `❌ *Could not parse date/time:* "${combinedDateStr}". Please use a format like "2026-10-15 10:30 AM" or "next Monday 2pm".`;
    }

    // Resolve target group
    const targetGroup = groupRepo.resolveGroup(flags.group);
    if (!targetGroup) {
      return `❌ *No target WhatsApp group found!*\nPlease use \`crb groups\` to view joined groups, or set a default with \`crb group set-default 1\`.`;
    }

    // Generate reminders
    const reminders = reminderEngine.generateReminders(type, eventDate, flags.remind);

    // Save event & reminders atomically
    const eventId = eventRepo.createEvent({
      type,
      title,
      event_date: eventDate,
      venue: flags.venue || null,
      syllabus: flags.syllabus || null,
      link: flags.link || null,
      notes: flags.notes || null,
      target_group_jid: targetGroup.jid,
      created_by: senderPhone
    }, reminders);

    const savedEvent = eventRepo.getEventById(eventId);
    let immediateSent = false;

    // If --now flag was provided, dispatch announcement immediately to group
    if (flags.now && sock) {
      try {
        const msgText = formatEventMessage(savedEvent, true);
        await sock.sendMessage(targetGroup.jid, { text: msgText });
        immediateSent = true;
      } catch (err) {
        console.error('Failed to send immediate notice to group:', err);
      }
    }

    // Build success response for the CR
    let reply = `✅ *Event Scheduled Successfully!*\n\n`;
    reply += `🆔 *Event ID:* #${eventId}\n`;
    reply += `📌 *Type:* ${type.toUpperCase()}\n`;
    reply += `📚 *Title:* ${title}\n`;
    reply += `📅 *Date & Time:* ${formatDisplayDate(eventDate)}\n`;
    if (flags.venue) reply += `📍 *Venue:* ${flags.venue}\n`;
    if (flags.syllabus) reply += `📝 *Syllabus:* ${flags.syllabus}\n`;
    reply += `👥 *Target Group:* ${targetGroup.name} (${targetGroup.alias ? '@' + targetGroup.alias : targetGroup.jid.slice(0, 10) + '...'})\n\n`;

    if (immediateSent) {
      reply += `📢 *Immediate Notice:* Sent to group right now!\n`;
    }

    if (reminders.length > 0) {
      reply += `⏰ *Queued Automated Reminders (${reminders.length}):*\n`;
      for (const r of reminders) {
        reply += `  • ${r.label.replace('_', ' ')}: ${formatDisplayDate(r.scheduledFor)}\n`;
      }
    } else {
      reply += `ℹ️ _Event date is too soon for multi-stage advance reminders._\n`;
    }

    reply += `\n💡 _Tip: You can edit this anytime using \`crb edit ${eventId} ...\` or trigger manually with \`crb trigger ${eventId}\`._`;

    return reply;
  }
};
