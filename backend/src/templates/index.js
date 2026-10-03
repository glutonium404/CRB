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
  if (event.custom_message) return event.custom_message;
  const type = (event.type || 'broadcast').toLowerCase();
  const render = () => {
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
      default:
        return renderBroadcastTemplate(event, isImmediate);
    }
  };
  const message = render();
  if (event.message_template === 'compact') return message.replace(/\n{2,}/g, '\n').replace(/\n──────────────\n/g, '\n');
  if (event.message_template === 'minimal') return message.replace(/\*([^*]+)\*/g, '$1').replace(/_([^_]+)_/g, '$1').replace(/\n──────────────\n[\s\S]*$/, '');
  return message;
}
