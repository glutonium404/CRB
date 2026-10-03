import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import { config } from '../config.js';
import { groupRepo } from '../database/groupRepo.js';
import { logger } from '../utils/logger.js';
import { setupMessageListener } from './messageListener.js';

let activeSocket = null;
let isConnected = false;

export function getActiveSocket() {
  return activeSocket;
}

export function isBotConnected() {
  return isConnected;
}

export async function connectToWhatsApp(onReadyCallback = null) {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info(`Starting Baileys v${version.join('.')}, isLatest: ${isLatest}`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false, // We'll handle QR explicitly
    defaultQueryTimeoutMs: 60000,
    syncFullHistory: false
  });

  activeSocket = sock;

  // Save authentication credentials whenever updated
  sock.ev.on('creds.update', saveCreds);

  // Connection update event
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n================ QR CODE FOR WHATSAPP LOGIN ================');
      qrcode.generate(qr, { small: true });
      console.log('============================================================\n');
      logger.info('Scan the QR code above with your WhatsApp app.');
    }

    if (connection === 'close') {
      isConnected = false;
      const statusCode = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode
        : null;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn(`Connection closed due to: ${lastDisconnect?.error?.message || 'Unknown'}, shouldReconnect: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(() => connectToWhatsApp(onReadyCallback), 3000);
      } else {
        logger.error('Session logged out. Please restart and scan a new QR code.');
      }
    } else if (connection === 'open') {
      isConnected = true;
      logger.success('WhatsApp connection established successfully!');

      // Sync participating groups to database
      try {
        const groups = await sock.groupFetchAllParticipating();
        const groupCount = Object.keys(groups).length;
        logger.info(`Fetched ${groupCount} participating WhatsApp groups.`);

        for (const [jid, groupInfo] of Object.entries(groups)) {
          groupRepo.upsertGroup(jid, groupInfo.subject);
        }
      } catch (err) {
        logger.error('Error fetching participating groups:', err.message);
      }

      if (onReadyCallback) {
        onReadyCallback(sock);
      }
    }
  });

  // Setup message ingestion
  setupMessageListener(sock);

  return sock;
}
