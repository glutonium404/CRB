import { eventRepo } from '../../database/eventRepo.js';
import { formatEventMessage } from '../../templates/index.js';

export const triggerHandler = {
  /**
   * Immediately dispatches an event reminder to its target group on-demand.
   */
  async handle(subcommands, sock) {
    const cleanSubs = subcommands.filter(s => s.toLowerCase() !== 'crb');
    const idParam = cleanSubs[1];

    if (!idParam) {
      return `❌ *Missing Event ID!*\nUsage: \`crb trigger 104\``;
    }

    const id = parseInt(String(idParam).replace('#', ''), 10);
    if (isNaN(id)) {
      return `❌ *Invalid Event ID:* "${idParam}"`;
    }

    const event = eventRepo.getEventById(id);
    if (!event) {
      return `❌ *Event #${id} not found!*`;
    }

    if (event.status === 'cancelled') {
      return `❌ *Event #${id} is CANCELLED!* You cannot trigger a reminder for a cancelled event.\n\n💡 _If you want to reactivate it, run \`crb edit ${id} --status active\`._`;
    }

    if (!sock) {
      return `❌ *WhatsApp socket not connected!*`;
    }

    try {
      const messageText = formatEventMessage(event, true);
      await sock.sendMessage(event.target_group_jid, { text: messageText });
      return `🚀 *Notice for Event #${id} ("${event.title}") was sent immediately to ${event.group_name || event.target_group_jid}!*`;
    } catch (err) {
      return `❌ *Failed to send message to group:* ${err.message}`;
    }
  }
};
