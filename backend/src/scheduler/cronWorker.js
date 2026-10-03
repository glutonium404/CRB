import { eventRepo } from '../database/eventRepo.js';
import { formatEventMessage } from '../templates/index.js';
import { logger } from '../utils/logger.js';

let intervalId = null;
let isRunningCheck = false;

/**
 * Starts the 30-second reminder polling loop.
 * @param {Object} socketProvider Function returning the active Baileys socket
 */
export function startScheduler(getSocket) {
  if (intervalId) {
    clearInterval(intervalId);
  }

  logger.info('Starting background reminder scheduler worker (30s interval)...');

  intervalId = setInterval(async () => {
    if (isRunningCheck) return;
    isRunningCheck = true;

    try {
      const sock = getSocket();
      if (!sock) {
        return;
      }

      const dueReminders = eventRepo.getDueReminders(new Date());
      if (dueReminders.length === 0) {
        return;
      }

      logger.info(`Found ${dueReminders.length} due reminder(s) to dispatch.`);

      for (const item of dueReminders) {
        try {
          const messageText = formatEventMessage(item, false);
          
          await sock.sendMessage(item.target_group_jid, { text: messageText });
          eventRepo.markReminderSent(item.reminder_id);
          logger.success(`Sent reminder #${item.reminder_id} for Event #${item.id} ("${item.title}") to ${item.group_name || item.target_group_jid}`);
        } catch (err) {
          logger.error(`Failed to send reminder #${item.reminder_id}:`, err.message);
          eventRepo.markReminderFailed(item.reminder_id, err.message);
        }
      }
    } catch (err) {
      logger.error('Error in scheduler check loop:', err);
    } finally {
      isRunningCheck = false;
    }
  }, 30 * 1000);
}

export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Background scheduler stopped.');
  }
}
