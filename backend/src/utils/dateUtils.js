import * as chrono from 'chrono-node';
import { format, formatDistanceToNow, isAfter, isBefore, addDays, setHours, setMinutes, subDays, subHours } from 'date-fns';

/**
 * Parses natural date/time strings into a JS Date object.
 * Supports "2026-10-15 10:30 AM", "tomorrow at 10am", "next sunday 2pm", "in 3 days 10:00", etc.
 * @param {string} input 
 * @param {Date} [referenceDate]
 * @returns {Date|null}
 */
export function parseDateTime(input, referenceDate = new Date()) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // Try standard ISO / Date constructor first if formatted like YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  // Use Chrono for natural language parsing
  const parsed = chrono.parseDate(trimmed, referenceDate, { forwardDate: true });
  return parsed || null;
}

/**
 * Formats a Date object for display in messages.
 * @param {Date|string|number} date 
 * @returns {string} e.g. "Thursday, Oct 15, 2026 @ 10:30 AM"
 */
export function formatDisplayDate(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid Date';
  return format(d, 'EEEE, MMM dd, yyyy @ hh:mm a');
}

/**
 * Formats date only
 * @param {Date|string|number} date 
 * @returns {string} e.g. "Oct 15, 2026"
 */
export function formatDateOnly(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid Date';
  return format(d, 'MMM dd, yyyy');
}

/**
 * Formats time only
 * @param {Date|string|number} date 
 * @returns {string} e.g. "10:30 AM"
 */
export function formatTimeOnly(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid Time';
  return format(d, 'hh:mm a');
}

/**
 * Generates an eye-catching countdown status banner for reminders.
 * @param {Date|string|number} targetDate 
 * @param {Date} [now]
 * @returns {string} A short, readable reminder status.
 */
export function getCountdownBanner(targetDate, now = new Date()) {
  const target = new Date(targetDate);
  const diffMs = target.getTime() - now.getTime();
  
  if (diffMs <= 0) {
    return 'DUE NOW / DEADLINE PASSED';
  }

  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.ceil(diffHours / 24);

  if (diffHours <= 2) {
    return 'URGENT: LESS THAN 2 HOURS REMAINING';
  }
  if (diffHours <= 6) {
    return `URGENT: DUE IN ABOUT ${Math.round(diffHours)} HOURS`;
  }
  if (diffHours <= 24) {
    return 'DUE TOMORROW / WITHIN 24 HOURS';
  }
  if (diffDays === 1) {
    return 'DUE TOMORROW';
  }
  return `${diffDays} DAYS REMAINING`;
}

/**
 * Calculates scheduled reminder trigger times based on event date and preset rules.
 * @param {Date} eventDate 
 * @param {Array<{ type: string, daysBefore?: number, hoursBefore?: number, targetTime?: string }>} presets 
 * @param {Date} [now]
 * @returns {Array<{ label: string, scheduledFor: Date }>}
 */
export function calculateReminders(eventDate, presets, now = new Date()) {
  const triggers = [];
  const eventD = new Date(eventDate);

  for (const preset of presets) {
    let triggerDate = new Date(eventD);

    if (preset.daysBefore) {
      triggerDate = subDays(triggerDate, preset.daysBefore);
      if (preset.targetTime) {
        const [hours, minutes] = preset.targetTime.split(':').map(Number);
        triggerDate = setHours(setMinutes(triggerDate, minutes || 0), hours || 0);
      }
    } else if (preset.hoursBefore) {
      triggerDate = subHours(triggerDate, preset.hoursBefore);
    }

    // Only schedule if the trigger time is in the future
    if (isAfter(triggerDate, now) && isBefore(triggerDate, eventD)) {
      triggers.push({
        label: preset.type,
        scheduledFor: triggerDate
      });
    }
  }

  // Sort triggers chronologically
  triggers.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
  return triggers;
}
