import { formatDateOnly, formatTimeOnly, getCountdownBanner } from '../utils/dateUtils.js';
import { formatBulletList, formatFooter } from './messageHelpers.js';

export function renderCtTemplate(event, isImmediate = false) {
  const status = isImmediate ? 'NEW ANNOUNCEMENT' : getCountdownBanner(event.event_date);
  let message = `*CLASS TEST (CT)*\n${status}\n\n`;
  message += `*Course / title:* ${event.title}\n`;
  message += `*Date:* ${formatDateOnly(event.event_date)}\n`;
  message += `*Time:* ${formatTimeOnly(event.event_date)}\n`;
  message += `*Venue:* ${event.venue || 'To be announced'}\n`;

  if (event.syllabus) message += `\n*Topics / syllabus:*\n${formatBulletList(event.syllabus)}\n`;
  if (event.notes) message += `\n*Notes:* ${event.notes}\n`;
  message += `\nPlease be present and seated on time.`;
  return message + formatFooter(event);
}
