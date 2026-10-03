import { renderCtTemplate } from './ctTemplate.js';
import { renderAssignmentTemplate } from './assignmentTemplate.js';
import { renderLabTemplate } from './labTemplate.js';
import { renderBroadcastTemplate } from './broadcastTemplate.js';

/**
 * Dispatches an event to the appropriate template renderer based on its type.
 * @param {Object} event
 * @param {boolean} [isImmediate=false]
 * @returns {string} Formatted WhatsApp message string
 */
export function formatEventMessage(event, isImmediate = false) {
  const type = (event.type || 'broadcast').toLowerCase();

  switch (type) {
    case 'ct':
    case 'quiz':
    case 'exam':
    case 'test':
      return renderCtTemplate(event, isImmediate);

    case 'assignment':
    case 'hw':
    case 'homework':
    case 'project':
      return renderAssignmentTemplate(event, isImmediate);

    case 'lab':
    case 'report':
    case 'lab_report':
      return renderLabTemplate(event, isImmediate);

    case 'presentation':
    case 'broadcast':
    case 'notice':
    default:
      return renderBroadcastTemplate(event, isImmediate);
  }
}
