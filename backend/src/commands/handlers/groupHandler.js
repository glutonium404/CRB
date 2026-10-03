import { groupRepo } from '../../database/groupRepo.js';

export const groupHandler = {
  /**
   * Handles all group management subcommands.
   */
  async handle(subcommands, flags, sock) {
    const cleanSubs = subcommands.filter(s => s.toLowerCase() !== 'crb');
    const action = cleanSubs[1] ? cleanSubs[1].toLowerCase() : 'list';

    // 1. If 'crb groups' or 'crb group list'
    if (cleanSubs[0] === 'groups' || action === 'list') {
      return this.listGroups(sock);
    }

    // 2. 'crb group set-default <#|alias>'
    if (action === 'set-default' || action === 'setdefault' || action === 'default') {
      const target = cleanSubs[2] || flags.group;
      if (!target) {
        return `❌ *Missing group identifier!*\nUsage: \`crb group set-default 1\` or \`crb group set-default secA\``;
      }

      const group = groupRepo.resolveGroup(target);
      if (!group) {
        return `❌ *Group not found:* "${target}". Use \`crb groups\` to see the list.`;
      }

      groupRepo.setDefaultGroup(group.jid);
      return `🌟 *Default group set to:* *${group.name}* (${group.alias ? '@' + group.alias : group.jid})\nAll future reminders will post here unless specified with \`--group\`.`;
    }

    // 3. 'crb group alias <#|jid> <alias>'
    if (action === 'alias') {
      const target = cleanSubs[2];
      const alias = cleanSubs[3] || flags.alias;

      if (!target || !alias) {
        return `❌ *Usage:* \`crb group alias <# or JID> <alias_name>\`\nExample: \`crb group alias 1 secA\``;
      }

      const group = groupRepo.resolveGroup(target);
      if (!group) {
        return `❌ *Group not found:* "${target}". Use \`crb groups\` to see the list.`;
      }

      groupRepo.setGroupAlias(group.jid, alias);
      return `🏷️ *Alias '@${alias}' assigned to:* *${group.name}*!`;
    }

    // 4. 'crb group show'
    if (action === 'show') {
      const def = groupRepo.getDefaultGroup();
      if (!def) {
        return `ℹ️ *No default group configured.* Use \`crb group set-default <#>\` to set one.`;
      }
      return `🌟 *Current Default Group:*\n• *Name:* ${def.name}\n• *Alias:* ${def.alias ? '@' + def.alias : 'None'}\n• *JID:* ${def.jid}`;
    }

    return `❓ *Unknown group command.* Available:\n• \`crb groups\`\n• \`crb group set-default <#|alias>\`\n• \`crb group alias <#> <name>\`\n• \`crb group show\``;
  },

  async listGroups(sock) {
    // Refresh participating groups from Baileys if connected
    if (sock) {
      try {
        const liveGroups = await sock.groupFetchAllParticipating();
        for (const [jid, info] of Object.entries(liveGroups)) {
          groupRepo.upsertGroup(jid, info.subject);
        }
      } catch (err) {
        // ignore if offline
      }
    }

    const groups = groupRepo.listGroups();
    if (groups.length === 0) {
      return `ℹ️ *No WhatsApp groups found!*\nEnsure the bot is added to your class groups.`;
    }

    let message = `╔══════════════════════════════╗\n`;
    message += `   👥 JOINED WHATSAPP GROUPS 👥\n`;
    message += `╚══════════════════════════════╝\n\n`;

    groups.forEach((g, idx) => {
      const num = idx + 1;
      const defaultBadge = g.is_default ? ' 🌟 [DEFAULT]' : '';
      const aliasBadge = g.alias ? ` (@${g.alias})` : '';

      message += `*#${num}* ${g.name}${aliasBadge}${defaultBadge}\n`;
      message += `   🆔 \`${g.jid}\`\n\n`;
    });

    message += `💡 *Quick Tips:*\n`;
    message += `• Set default: \`crb group set-default 1\`\n`;
    message += `• Create alias: \`crb group alias 1 secA\`\n`;
    message += `• Target in command: \`--group secA\` or \`-g 1\``;

    return message;
  }
};
