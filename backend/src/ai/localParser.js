import * as chrono from 'chrono-node';
import { parseDateTime } from '../utils/dateUtils.js';

/**
 * Fallback local NLP & regex extractor for academic announcements when AI key is absent or offline.
 * @param {string} text 
 * @param {Date} [referenceDate]
 * @returns {Object|null}
 */
export function parseWithLocalRules(text, referenceDate = new Date()) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  // 1. Determine Event Type
  let type = 'ct';
  if (lower.includes('assignment') || lower.includes('homework') || lower.includes('hw ') || lower.includes('project')) {
    type = 'assignment';
  } else if (lower.includes('lab report') || lower.includes('lab evaluation') || lower.includes('experiment')) {
    type = 'lab';
  } else if (lower.includes('presentation') || lower.includes('defense') || lower.includes('slide')) {
    type = 'presentation';
  } else if (lower.includes('ct') || lower.includes('class test') || lower.includes('quiz') || lower.includes('exam')) {
    type = 'ct';
  } else if (lower.includes('notice') || lower.includes('announcement') || lower.includes('broadcast')) {
    type = 'broadcast';
  } else {
    return null;
  }

  // 2. Parse Date & Time using Chrono
  const parsedDate = parseDateTime(text, referenceDate);
  if (!parsedDate) {
    return null;
  }

  // 3. Extract Links
  const linkMatch = text.match(/https?:\/\/[^\s]+/i);
  const link = linkMatch ? linkMatch[0] : null;

  // 4. Extract Venue / Room
  const roomMatch = text.match(/(?:room|lab|hall|venue|auditorium|audi)\s*(?:no\.?|#)?\s*([0-9a-z\-]+)/i);
  const venue = roomMatch ? roomMatch[0] : null;

  // 5. Extract Course Code / Subject
  const courseCodeMatch = text.match(/([a-z]{2,4}\s*-?\s*\d{3}[a-z]?)/i);
  const courseWordMatch = text.match(/(?:for|in|course|subject)\s+([a-z0-9\s]{2,20}?)(?=\s+(?:on|at|in|syllabus|topics?|room|send|tomorrow|next|\d{1,2}|$))/i);

  let courseName = '';
  if (courseCodeMatch) {
    courseName = courseCodeMatch[1].toUpperCase();
  } else if (courseWordMatch) {
    courseName = courseWordMatch[1].trim().toUpperCase();
  }

  let title = courseName;
  if (type === 'ct') {
    title = title ? `${title} CT` : 'Class Test';
  } else if (type === 'assignment') {
    title = title ? `${title} Assignment` : 'Assignment';
  } else if (type === 'lab') {
    title = title ? `${title} Lab Report` : 'Lab Report';
  } else if (!title) {
    title = 'Academic Notice';
  }

  // 6. Extract Syllabus / Topics if present
  let syllabus = null;
  const sylMatch = text.match(/(?:syllabus|topics?|chapters?|ch)\s*[:\-]?\s*([^\n\.]*?)(?=\s+(?:send\s+now|broadcast\s+now|now|venue|room|link|$))/i);
  if (sylMatch) {
    syllabus = sylMatch[1].trim();
  }

  // 7. Extract send_now intent
  const sendNow = lower.includes('send now') || lower.includes('broadcast now') || lower.includes('post now') || lower.includes('send immediately');

  return {
    is_event: true,
    type,
    title,
    date: parsedDate.toISOString(),
    time: parsedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    venue,
    syllabus,
    link,
    send_now: sendNow,
    notes: null,
    confidence: 0.7
  };
}
