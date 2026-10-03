import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

let genAI = null;

function getClient() {
  if (!config.geminiApiKey) return null;
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return genAI;
}

/**
 * Extracts structured event details from raw natural language or forwarded notices.
 * @param {string} text 
 * @param {Date} [referenceDate]
 * @returns {Promise<Object|null>}
 */
export async function parseWithGemini(text, referenceDate = new Date()) {
  const client = getClient();
  if (!client) {
    return null;
  }

  const modelsToTry = [config.geminiModel, 'gemini-1.5-flash', 'gemini-1.5-pro'].filter(Boolean);

  for (const modelName of [...new Set(modelsToTry)]) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json'
        }
      });

      const nowIso = referenceDate.toISOString();
      const systemPrompt = `
You are an intelligent Class Representative assistant (CRB).
Extract academic event details from the user's message or forwarded teacher announcement.
The current reference time is: ${nowIso} (Timezone: ${config.timezone}).

You MUST return a valid JSON object matching this schema:
{
  "is_event": boolean (true if the text describes a class test, assignment, lab report, presentation, class reschedule, or notice; false if it's general conversation/command),
  "type": "ct" | "assignment" | "lab" | "presentation" | "broadcast",
  "title": string (e.g. "DBMS CT" or "Algorithms Assignment 3"),
  "date": string (ISO 8601 YYYY-MM-DD or readable date string in the near future),
  "time": string (e.g. "10:30 AM" or "14:00" or "2:00 PM"),
  "venue": string or null (e.g. "Room 402", "Lab 3"),
  "syllabus": string or null (summary of topics, chapters, or guidelines),
  "link": string or null (e.g. Google Classroom / Google Drive / form link if mentioned),
  "send_now": boolean (true if the user mentions "send now", "broadcast now", "now", "post now", "send immediately" or wants immediate announcement; false otherwise),
  "notes": string or null,
  "confidence": number (between 0.0 and 1.0)
}

If a field is not mentioned, use null.
If relative dates like "next Thursday", "tomorrow", "this Sunday", "10 october 2026" are used, calculate the exact upcoming date relative to current reference time.
`;
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: `Analyze and extract from this message:\n"""\n${text}\n"""` }
      ]);

      const responseText = result.response.text();
      const parsed = JSON.parse(responseText);

      if (parsed && parsed.is_event && parsed.title && parsed.date) {
        return parsed;
      }

      return null;
    } catch (err) {
      logger.warn(`Gemini error with model ${modelName}:`, err.message);
      // Try next fallback model in loop
    }
  }

  return null;
}
