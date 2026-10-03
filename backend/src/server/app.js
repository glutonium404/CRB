import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { eventRepo } from '../database/eventRepo.js';
import { groupRepo } from '../database/groupRepo.js';
import { createApiRoutes } from './apiRoutes.js';
import { seedOwnerAccount } from './seedOwner.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Creates and configures the Express server.
 * @param {Function} getSocketStatus Function returning current Baileys connection state
 * @param {Function} [getSocket] Function returning the active Baileys socket
 */
export function createServer(getSocketStatus, getSocket = null) {
  const app = express();
  let allowedOrigins = ['http://localhost:5173', 'http://localhost:5340', 'http://localhost:3000'];

  if (config.origin && config.origin.trim() !== "") {
    const productionOrigins = config.origin.split(',').map(o => o.trim());
    allowedOrigins = [...allowedOrigins, ...productionOrigins];
  }

  const uniqueOrigins = [...new Set(allowedOrigins)];

  app.use(
    cors({
      origin: uniqueOrigins,
      credentials: true
    })
  );

  app.use(express.json());

  // Seed owner account on first boot
  seedOwnerAccount();

  // ═══════════════════════════════════════════
  //  PUBLIC HEALTH / PING ENDPOINTS (unchanged)
  // ═══════════════════════════════════════════

  // 1. Health endpoint for UptimeRobot (Keeps app alive 24/7)
  app.get('/health', (req, res) => {
    const stats = eventRepo.getStats();
    const uptimeSec = Math.floor(process.uptime());

    res.status(200).json({
      status: 'ok',
      service: 'CRB (Class Representative Bot)',
      uptime_seconds: uptimeSec,
      bot_connected: getSocketStatus ? getSocketStatus() : false,
      timestamp: new Date().toISOString(),
      uniqueOrigins: uniqueOrigins,
      stats: {
        active_events: stats.activeEvents,
        pending_reminders: stats.pendingReminders,
        sent_reminders: stats.sentReminders
      }
    });
  });

  // 2. Simple Ping endpoint
  app.get('/ping', (req, res) => {
    res.status(200).send('pong');
  });

  // ═══════════════════════════════════════════
  //  DASHBOARD API ROUTES (New)
  // ═══════════════════════════════════════════
  const apiRoutes = createApiRoutes(getSocket, getSocketStatus);
  app.use('/api', apiRoutes);

  // ═══════════════════════════════════════════
  //  STATIC FRONTEND (Production)
  // ═══════════════════════════════════════════
  const frontendDist = path.join(__dirname, '..', '..', '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));

  // SPA fallback: serve index.html for any non-API route
  app.get('/{*splat}', (req, res, next) => {
    // Don't intercept API routes
    if (req.path.startsWith('/api') || req.path === '/health' || req.path === '/ping') {
      return next();
    }
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
      if (err) {
        // Frontend not built yet — that's okay in dev mode
        res.status(200).json({ message: 'CRB API is running. Frontend not built yet.' });
      }
    });
  });


  return app;
}
