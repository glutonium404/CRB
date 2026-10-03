import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  origin: process.env.ORIGIN_URL || "",
  // Server configuration
  port: parseInt(process.env.PORT || '5340', 10),
  
  // Database configuration
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'crb.sqlite'),
  
  // WhatsApp & Bot configuration
  authDir: process.env.AUTH_DIR || path.join(__dirname, '..', 'auth_info'),
  prefix: process.env.BOT_PREFIX || 'crb',
  ownerNumbers: (process.env.OWNER_NUMBERS || '')
    .split(',')
    .map(s => s.trim().replace(/[^0-9]/g, ''))
    .filter(Boolean),
  
  // AI & NLP
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  jwtSecret: process.env.JWT_SECRET || 'crb-dashboard-secret-change-me',

  // Timezone (Default: Asia/Dhaka or system timezone)
  timezone: process.env.TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Dhaka',

  // Reminder Engine Default Offsets (in milliseconds / descriptors)
  reminderPresets: {
    ct: [
      { type: '5d_before', daysBefore: 5, targetTime: '09:00' },
      { type: '2d_before', daysBefore: 2, targetTime: '09:00' },
      { type: '1d_before', daysBefore: 1, targetTime: '20:00' } // 8 PM night before
    ],
    lab: [
      { type: '3d_before', daysBefore: 3, targetTime: '10:00' },
      { type: '1d_before', daysBefore: 1, targetTime: '20:00' } // 8 PM night before
    ],
    assignment: [
      { type: '5d_before', daysBefore: 5, targetTime: '10:00' },
      { type: '2d_before', daysBefore: 2, targetTime: '10:00' },
      { type: '1d_before', daysBefore: 1, targetTime: '20:00' },
      { type: '4h_before', hoursBefore: 4 }
    ],
    presentation: [
      { type: '3d_before', daysBefore: 3, targetTime: '10:00' },
      { type: '1d_before', daysBefore: 1, targetTime: '20:00' }
    ]
  }
};
