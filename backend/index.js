import { config } from './src/config.js';
import { getDb } from './src/database/db.js';
import { createServer } from './src/server/app.js';
import { connectToWhatsApp, getActiveSocket, isBotConnected } from './src/bot/socket.js';
import { startScheduler } from './src/scheduler/cronWorker.js';
import { logger } from './src/utils/logger.js';

async function main() {
  console.log(`
╔═══════════════════════════════════════════╗
║      🤖 CRB - Class Representative Bot    ║
║     Automated WhatsApp Notice System      ║
╚═══════════════════════════════════════════╝
  `);

  // 1. Initialize SQLite Database
  getDb();

  // 2. Start Express Web & Health Server
  const app = createServer(isBotConnected, getActiveSocket);
  app.listen(config.port, () => {
    logger.success(`Web & Health server running on http://localhost:${config.port}`);
    logger.info(`UptimeRobot health endpoint: http://localhost:${config.port}/health`);
    logger.info(`Dashboard API: http://localhost:${config.port}/api/stats`);
  });

  // 3. Start Background Scheduler Worker (30s polling loop)
  startScheduler(getActiveSocket);

  // 4. Connect to WhatsApp via Baileys
  logger.info('Connecting to WhatsApp...');
  await connectToWhatsApp((sock) => {
    logger.success('CRB is live, listening for commands and scheduling reminders!');
  });
}

main().catch((err) => {
  logger.error('Fatal startup error:', err);
  process.exit(1);
});
