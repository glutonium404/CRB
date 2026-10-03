import minimist from 'minimist';

/**
 * Tokenizes a command string into arguments while preserving quotes.
 * e.g., 'crb add ct "CSE 311 CT-2" -d "2026-10-15"' -> ['crb', 'add', 'ct', 'CSE 311 CT-2', '-d', '2026-10-15']
 * @param {string} text 
 * @returns {string[]}
 */
export function splitArgs(text) {
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  const args = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    // match[1] is double-quoted text, match[2] is single-quoted, match[0] is unquoted
    args.push(match[1] ?? match[2] ?? match[0]);
  }
  return args;
}

/**
 * Parses a CLI-like string into structured options and subcommands.
 * @param {string} text
 */
export function parseCommandLine(text) {
  const rawArgs = splitArgs(text);
  if (rawArgs.length === 0) {
    return { _: [], flags: {} };
  }

  const parsed = minimist(rawArgs, {
    string: ['_', 'title', 'date', 'time', 'syllabus', 'venue', 'group', 'link', 'notes', 'remind', 'type', 'alias', 'at', 'name', 'phone'],
    boolean: ['now', 'force', 'help'],
    alias: {
      d: 'date',
      t: 'time',
      s: 'syllabus',
      v: 'venue',
      g: 'group',
      n: 'now',
      l: 'link',
      r: 'remind',
      h: 'help'
    }
  });

  return {
    subcommands: parsed._.map(x => String(x)),
    flags: parsed
  };
}
