import { formatDateOnly, formatTimeOnly, getCountdownBanner } from '../utils/dateUtils.js';
import { formatBulletList, formatFooter } from './messageHelpers.js';

export function renderAssignmentTemplate(event, isImmediate = false) {
  const status = isImmediate ? 'NEW ASSIGNMENT' : getCountdownBanner(event.event_date);
  let message = `*ASSIGNMENT DEADLINE*\n${status}\n\n`;
  message += `*Title / subject:* ${event.title}\n`;
  message += `*Deadline:* ${formatDateOnly(event.event_date)}\n`;
  message += `*Due time:* ${formatTimeOnly(event.event_date)}\n`;
  if (event.link) message += `*Submission link:* ${event.link}\n`;
  if (event.syllabus) message += `\n*Instructions:*\n${formatBulletList(event.syllabus)}\n`;
  if (event.notes) message += `\n*Notes:* ${event.notes}\n`;
  message += `\nPlease avoid last-minute submission.`;
  return message + formatFooter(event);
}
