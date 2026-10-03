import { eventRepo } from '../../database/eventRepo.js';

export const helpHandler = {
  getHelp() {
    return `╔══════════════════════════════╗
       🤖 CRB (Class Representative Bot) 🤖
╚══════════════════════════════╝

*CRB is your automated co-pilot for managing class notices and reminders.*

🌟 *1. Easiest: Natural Chat / Forward Notices*
Just text or forward any teacher notice:
👉 _"CSE 311 CT on Oct 15 at 10:30 AM in Room 402, Syllabus: ER Diagrams, SQL"_
CRB will extract details & send a 1-tap confirmation card!

───────────────
⚡ *2. Quick CLI Commands*
• \`crb add ct "CSE 311 CT-2" -d "2026-10-15" -t "10:30 AM" -s "Ch 1-3" --now\`
• \`crb add assignment "Algo HW 3" -d "2026-10-18 23:59" -l "https://..."\`
• \`crb add lab "Microprocessor Lab 4" -d "2026-10-12 14:00"\`
• \`crb broadcast "Please clear your lab fees" -g secA\`

───────────────
📋 *3. Manage Events & Instant Edits*
• \`crb list\` : View all upcoming events & countdowns
• \`crb info <id>\` : View syllabus & queued reminder times
• \`crb edit <id> -v "Room 501"\` : Edit venue/date/syllabus (notifies group)
• \`crb trigger <id>\` : Instantly blast reminder notice right now
• \`crb cancel <id>\` : Cancel event (notifies group & stops reminders)
• \`crb delete <id>\` : Permanently remove event from database

───────────────
👥 *4. Group Management*
• \`crb groups\` : List all groups with short # numbers
• \`crb group set-default 1\` : Set default group for reminders
• \`crb group alias 1 secA\` : Create shortcut nickname

───────────────
⚙️ *5. System & Health*
• \`crb ping\` : Bot uptime & database status
• \`crb admin add <phone> <name>\` : Whitelist a co-CR
• \`crb admin list\` : View authorized CRs`;
  },

  getPing() {
    const stats = eventRepo.getStats();
    const uptimeSec = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSec / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    const secs = uptimeSec % 60;

    return `🏓 *CRB Bot Status: ONLINE*

⏱️ *Uptime:* ${hours}h ${mins}m ${secs}s
📅 *Server Time:* ${new Date().toLocaleString()}
📊 *Active Events:* ${stats.activeEvents}
⏰ *Pending Reminders:* ${stats.pendingReminders}
✅ *Sent Reminders:* ${stats.sentReminders}
🌐 *Health Route:* \`/health\` (Active for UptimeRobot)`;
  }
};
