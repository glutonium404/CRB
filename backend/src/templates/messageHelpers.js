export function formatBulletList(value) {
  return String(value)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => `- ${line}`)
    .join('\n');
}

export function formatFooter(event, label = 'Automated reminder via CRB') {
  return `\n\n──────────────\n🆔 *Event ID:* #${event.id}\n_${label}_`;
}
