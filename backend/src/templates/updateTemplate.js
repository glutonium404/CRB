import { formatDateOnly, formatTimeOnly } from '../utils/dateUtils.js';
import { formatBulletList, formatFooter } from './messageHelpers.js';

export function renderUpdateTemplate(event, updatedFields = []) {
  let message = `*EVENT DETAILS UPDATED*\n\n`;
  message += `*Course / title:* ${event.title}\n`;
  message += `*Date:* ${formatDateOnly(event.event_date)}\n`;
  message += `*Time:* ${formatTimeOnly(event.event_date)}\n`;
  message += `*Venue:* ${event.venue || 'To be announced'}\n`;
  if (event.syllabus) message += `\n*Topics / syllabus:*\n${formatBulletList(event.syllabus)}\n`;
  if (event.notes) message += `\n*Notes:* ${event.notes}\n`;
  return message + formatFooter(event, 'Update notice via CRB');
}
