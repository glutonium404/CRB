import { formatDateOnly, formatTimeOnly, getCountdownBanner } from '../utils/dateUtils.js';
import { formatBulletList, formatFooter } from './messageHelpers.js';

export function renderLabTemplate(event, isImmediate = false) {
  const status = isImmediate ? 'NEW LAB REPORT NOTICE' : getCountdownBanner(event.event_date);
  let message = `*LAB REPORT SUBMISSION*\n${status}\n\n`;
  message += `*Lab / experiment:* ${event.title}\n`;
  message += `*Submission date:* ${formatDateOnly(event.event_date)}\n`;
  message += `*Due time / class:* ${formatTimeOnly(event.event_date)}\n`;
  if (event.venue) message += `*Lab room:* ${event.venue}\n`;
  if (event.syllabus) message += `\n*Topics / tasks:*\n${formatBulletList(event.syllabus)}\n`;
  if (event.notes) message += `\n*Requirements:* ${event.notes}\n`;
  message += `\nPlease include all required pages, code, and plots.`;
  return message + formatFooter(event);
}
