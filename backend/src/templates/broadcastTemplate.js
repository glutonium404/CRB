import { formatDisplayDate, getCountdownBanner } from '../utils/dateUtils.js';
import { formatFooter } from './messageHelpers.js';

export function renderBroadcastTemplate(event, isImmediate = false) {
  const status = isImmediate ? 'CLASS ANNOUNCEMENT' : getCountdownBanner(event.event_date);
  let message = `*CLASS NOTICE*\n${status}\n\n`;
  message += `*Subject:* ${event.title}\n`;
  message += `*Time:* ${formatDisplayDate(event.event_date)}\n`;
  if (event.venue) message += `*Venue:* ${event.venue}\n`;
  if (event.syllabus) message += `\n*Details:*\n${event.syllabus}\n`;
  if (event.link) message += `\n*Link:* ${event.link}\n`;
  if (event.notes) message += `\n*Notes:* ${event.notes}\n`;
  return message + formatFooter(event);
}
