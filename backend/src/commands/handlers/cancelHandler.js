import { eventRepo } from '../../database/eventRepo.js';
import { renderCancelTemplate } from '../../templates/cancelTemplate.js';
import { logger } from '../../utils/logger.js';

export const cancelHandler = {
  /**
   * Cancels an event, stops all pending reminders, and notifies the group.
   */
  async handle(subcommands, sock = null) {
    const cleanSubs = subcommands.filter(s => s.toLowerCase() !== 'crb');
    const idParam = cleanSubs[1];

    if (!idParam) {
      return `❌ *Missing Event ID!*\nUsage: \`crb cancel 104\``;
    }

    const id = parseInt(String(idParam).replace('#', ''), 10);
    if (isNaN(id)) {
      return `❌ *Invalid Event ID:* "${idParam}"`;
    }

    const existing = eventRepo.getEventById(id);
    if (!existing) {
      return `❌ *Event #${id} not found!*`;
    }

    if (existing.status === 'cancelled') {
      return `ℹ️ *Event #${id} is already cancelled.*`;
    }

    eventRepo.cancelEvent(id);
    let notified = false;

    // Send cancellation notice to target group
    if (sock && existing.target_group_jid) {
      try {
        const cancelNotice = renderCancelTemplate(existing);
        await sock.sendMessage(existing.target_group_jid, { text: cancelNotice });
        notified = true;
      } catch (err) {
        logger.error(`Failed to send cancellation notice for #${id} to group:`, err.message);
      }
    }

    let reply = `🗑️ *Event #${id} ("${existing.title}") has been CANCELLED.*\nAll future pending automated reminders have been stopped.`;
    if (notified) {
      reply += `\n\n📢 *Group Notification:* Cancellation notice sent to *${existing.group_name || existing.target_group_jid}*!`;
    }
    return reply;
  }
};
