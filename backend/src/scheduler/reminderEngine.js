import { config } from '../config.js';
import { calculateReminders, parseDateTime } from '../utils/dateUtils.js';

export const reminderEngine = {
  /**
   * Generates reminder trigger jobs for an event based on its type or custom flags.
   * @param {string} type 'ct' | 'assignment' | 'lab' | 'presentation' | 'broadcast'
   * @param {Date} eventDate
   * @param {string} [customIntervals] e.g. "5d, 2d, 1d, 4h" or exact timestamp
   * @param {Date} [now]
   * @returns {Array<{ label: string, scheduledFor: Date }>}
   */
  generateReminders(type, eventDate, customIntervals = null, now = new Date()) {
    const d = new Date(eventDate);
    if (isNaN(d.getTime())) return [];

    // If custom interval specified
    if (customIntervals) {
      return this.parseCustomIntervals(customIntervals, d, now);
    }

    const cleanType = (type || 'broadcast').toLowerCase();
    const presets = config.reminderPresets[cleanType] || [];

    if (presets.length === 0) {
      // Default fallback: 1 day before 8pm
      return calculateReminders(d, [{ type: '1d_before', daysBefore: 1, targetTime: '20:00' }], now);
    }

    return calculateReminders(d, presets, now);
  },

  /**
   * Parses custom strings like "5d,2d,1d,4h" or specific dates.
   */
  parseCustomIntervals(str, eventDate, now = new Date()) {
    const parts = str.split(',').map(s => s.trim()).filter(Boolean);
    const triggers = [];

    for (const part of parts) {
      const dayMatch = part.match(/^(\d+)\s*d(?:ays?)?$/i);
      const hourMatch = part.match(/^(\d+)\s*h(?:ours?)?$/i);

      if (dayMatch) {
        const days = parseInt(dayMatch[1], 10);
        const list = calculateReminders(eventDate, [{ type: `${days}d_before`, daysBefore: days, targetTime: '09:00' }], now);
        triggers.push(...list);
      } else if (hourMatch) {
        const hours = parseInt(hourMatch[1], 10);
        const list = calculateReminders(eventDate, [{ type: `${hours}h_before`, hoursBefore: hours }], now);
        triggers.push(...list);
      } else {
        // Try parsing as absolute datetime
        const parsed = parseDateTime(part, now);
        if (parsed && parsed.getTime() > now.getTime() && parsed.getTime() < eventDate.getTime()) {
          triggers.push({ label: 'custom_time', scheduledFor: parsed });
        }
      }
    }

    // Sort chronologically
    triggers.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
    return triggers;
  }
};
