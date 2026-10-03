import { formatDisplayDate } from '../utils/dateUtils.js';
import { formatFooter } from './messageHelpers.js';

export function renderCancelTemplate(event) {
  let message = `*EVENT CANCELLED*\n\n`;
  message += `*Event:* ${event.title} [${(event.type || 'CT').toUpperCase()}]\n`;
  message += `*Originally scheduled:* ${formatDisplayDate(event.event_date)}\n`;
  if (event.venue) message += `*Venue:* ${event.venue}\n`;
  return message + formatFooter(event, 'Cancellation notice via CRB');
}
