import { adminRepo } from '../../database/adminRepo.js';

export const adminHandler = {
  /**
   * Manages authorized CR phone numbers.
   */
  async handle(subcommands, flags) {
    const cleanSubs = subcommands.filter(s => s.toLowerCase() !== 'crb');
    const action = cleanSubs[1] ? cleanSubs[1].toLowerCase() : 'list';

    if (action === 'add') {
      const phone = cleanSubs[2] || flags.phone;
      const name = flags.name || cleanSubs.slice(3).join(' ') || 'Co-CR';

      if (!phone) {
        return `❌ *Usage:* \`crb admin add <phone_number> [name]\`\nExample: \`crb admin add 8801700000000 "John"\``;
      }

      adminRepo.addAdmin(phone, name, 'cr');
      return `✅ *Admin added:* ${name} (\`${phone}\`) is now authorized to command CRB!`;
    }

    if (action === 'remove' || action === 'rm') {
      const phone = cleanSubs[2] || flags.phone;
      if (!phone) {
        return `❌ *Usage:* \`crb admin remove <phone_number>\``;
      }

      adminRepo.removeAdmin(phone);
      return `🗑️ *Admin removed:* \`${phone}\``;
    }

    // List admins
    const admins = adminRepo.listAdmins();
    let reply = `👑 *Authorized CRs & Admins:*\n\n`;
    if (admins.length === 0) {
      reply += `_No extra admins added in database (Using .env OWNER_NUMBERS)._\n`;
    } else {
      admins.forEach(a => {
        reply += `• *${a.name || 'Admin'}* (\`${a.phone}\`) - [${a.role}]\n`;
      });
    }
    reply += `\n💡 _Add more CRs with \`crb admin add <phone> <name>\`_`;
    return reply;
  }
};
