import { eventRepo } from '../../database/eventRepo.js';

export const deleteHandler = {
  /**
   * Permanently deletes an event and all its reminders from SQLite.
   */
  async handle(subcommands) {
    const cleanSubs = subcommands.filter(s => s.toLowerCase() !== 'crb');
    const idParam = cleanSubs[1];

    if (!idParam) {
      return `❌ *Missing Event ID!*\nUsage: \`crb delete 104\` (or \`crb rm 104\`)`;
    }

    const id = parseInt(String(idParam).replace('#', ''), 10);
    if (isNaN(id)) {
      return `❌ *Invalid Event ID:* "${idParam}"`;
    }

    const existing = eventRepo.getEventById(id);
    if (!existing) {
      return `❌ *Event #${id} not found!*`;
    }

    eventRepo.deleteEvent(id);

    return `🗑️ *Event #${id} ("${existing.title}") has been permanently DELETED from the database.*`;
  }
};
