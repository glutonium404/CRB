import { eventRepo } from '../../database/eventRepo.js';
import { groupRepo } from '../../database/groupRepo.js';
import { parseDateTime, formatDisplayDate } from '../../utils/dateUtils.js';
import { formatEventMessage } from '../../templates/index.js';

export const broadcastHandler = {
  /**
   * Handles immediate or scheduled announcements.
   */
  async handle(subcommands, flags, senderPhone, sock) {
    const cleanSubs = subcommands.filter(s => s.toLowerCase() !== 'crb');
    let messageText = flags.title || flags.text || flags.msg;

    if (!messageText && cleanSubs.length > 1) {
      messageText = cleanSubs.slice(1).join(' ');
    }

    if (!messageText) {
      return `❌ *Missing broadcast message!*\n\n*Usage:*\n• \`crb broadcast "Please submit lab fees by Friday" -g secA\`\n• \`crb broadcast "Picnic notice" --at "2026-10-10 18:00"\``;
    }

    const targetGroup = groupRepo.resolveGroup(flags.group);
    if (!targetGroup) {
      return `❌ *No target WhatsApp group found!* Set a default group with \`crb group set-default 1\`.`;
    }

    // 1. If scheduled for a future time
    if (flags.at || flags.date) {
      const atStr = flags.at || flags.date;
      const scheduledDate = parseDateTime(atStr);

      if (!scheduledDate || isNaN(scheduledDate.getTime())) {
        return `❌ *Could not parse scheduled time:* "${atStr}"`;
      }

      const reminders = [{ label: 'broadcast_trigger', scheduledFor: scheduledDate }];
      const eventId = eventRepo.createEvent({
        type: 'broadcast',
        title: messageText.slice(0, 50),
        event_date: scheduledDate,
        syllabus: messageText,
        target_group_jid: targetGroup.jid,
        created_by: senderPhone
      }, reminders);

      return `✅ *Broadcast Scheduled for ${formatDisplayDate(scheduledDate)}!*\n\n🆔 *Event ID:* #${eventId}\n👥 *Target:* ${targetGroup.name}\n💬 *Message:* "${messageText}"`;
    }

    // 2. Send immediately
    const eventId = eventRepo.createEvent({
      type: 'broadcast',
      title: messageText.slice(0, 50),
      event_date: new Date(),
      syllabus: messageText,
      target_group_jid: targetGroup.jid,
      created_by: senderPhone
    }, []);

    const savedEvent = eventRepo.getEventById(eventId);
    const broadcastMsg = formatEventMessage(savedEvent, true);

    if (sock) {
      try {
        await sock.sendMessage(targetGroup.jid, { text: broadcastMsg });
        return `🚀 *Broadcast Sent Immediately!*\n\n🆔 *Event ID:* #${eventId}\n👥 *Group:* ${targetGroup.name}\n💬 *Content:* "${messageText}"`;
      } catch (err) {
        return `❌ *Failed to broadcast:* ${err.message}`;
      }
    }

    return `⚠️ Socket not connected.`;
  }
};
