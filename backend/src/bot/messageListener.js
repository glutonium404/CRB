import { routeMessage } from '../commands/commandRouter.js';
import { logger } from '../utils/logger.js';

export function setupMessageListener(sock) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;

      const isFromMe = msg.key.fromMe;
      const remoteJid = msg.key.remoteJid;
      const isGroup = remoteJid.endsWith('@g.us');

      // Extract all candidate sender IDs (LID, Phone Number JID, Alternate JID)
      const candidateJids = [
        isGroup ? msg.key.participant : remoteJid,
        msg.key.remoteJidAlt,
        msg.key.participantPn,
        msg.key.senderPn,
        msg.participant,
        isFromMe ? sock.user?.id : null
      ].filter(Boolean);

      const candidateIds = [...new Set(
        candidateJids.map(j => String(j).replace(/@.*$/, '').replace(/[^0-9]/g, '')).filter(Boolean)
      )];

      const primaryPhone = candidateIds[0] || 'unknown';

      // Extract message text content
      const messageContent = msg.message;
      let text = '';

      if (messageContent.conversation) {
        text = messageContent.conversation;
      } else if (messageContent.extendedTextMessage?.text) {
        text = messageContent.extendedTextMessage.text;
      } else if (messageContent.imageMessage?.caption) {
        text = messageContent.imageMessage.caption;
      } else if (messageContent.videoMessage?.caption) {
        text = messageContent.videoMessage.caption;
      }

      if (!text || typeof text !== 'string') continue;
      const trimmedText = text.trim();

      // If in a group, only process if explicitly prefixed with 'crb', '/', '!'
      if (isGroup && !/^(?:crb|\/|!)/i.test(trimmedText)) {
        continue;
      }

      logger.debug(`Received message from [${candidateIds.join(', ')}] (${isGroup ? 'Group' : 'DM'}, fromMe: ${isFromMe}): ${trimmedText}`);

      try {
        const reply = await routeMessage(trimmedText, candidateIds, isGroup, sock, isFromMe);
        if (reply) {
          // Send response back to the sender / chat
          const targetJid = remoteJid;
          await sock.sendMessage(targetJid, { text: reply }, { quoted: msg });
        }
      } catch (err) {
        logger.error(`Error handling message from [${candidateIds.join(', ')}]:`, err);
        if (!isGroup) {
          try {
            await sock.sendMessage(remoteJid, { text: `⚠️ *Command error:* Please check your command syntax or type \`crb help\`.` }, { quoted: msg });
          } catch (sendErr) {
            // ignore
          }
        }
      }
    }
  });
}
