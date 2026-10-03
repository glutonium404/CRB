# Implementation Plan: CRB (Class Representative Bot) for WhatsApp

## Goal Description
Build **CRB (Class Representative Bot)**, an intelligent WhatsApp bot powered by `@whiskeysockets/baileys` and `Express`. 

CRB serves as an automated digital co-pilot for Class Representatives (CRs). The CR can manage, schedule, and automate class announcements (Class Tests, Assignments, Lab Reports, Presentations, Make-up Classes, and custom notices) via WhatsApp Direct Messages (DM). 

CRB supports **Natural Language & Forwarded Notice parsing** (via free Gemini Flash with local fallback), **Interactive Wizards**, and **CLI commands**. CRB supports immediate broadcasting alongside multi-stage reminder scheduling (5d, 2d, 1d before), includes **Event IDs** in message footers for rapid updates, and provides a `/health` endpoint for 24/7 uptime monitoring.

---

## Key Features & User Requirements

### 1. Updated Reminder Interval Presets
Based on CR workflow needs:
- **Class Test (CT)**: 
  - 5 days before (09:00 AM)
  - 2 days before (09:00 AM)
  - 1 day / night before (08:00 PM)
  *(Exam day morning removed per request)*
- **Lab Report**: 
  - 3 days before (10:00 AM)
  - 1 day / night before (08:00 PM)
  *(3hr before class removed per request)*
- **Assignment**: 
  - 5 days before (10:00 AM)
  - 2 days before (10:00 AM)
  - 1 day / night before (08:00 PM)
  - 4 hours before deadline
- **Custom / Broadcast**: Custom `--remind "5d,2d,1d"` or exact one-off `--at "YYYY-MM-DD HH:MM"`.

---

### 2. Immediate Broadcast + Schedule Option (`--now`)
Often a CR learns of a new CT/Assignment and wants to announce it **right now** to the class group while also queueing future automated reminders.
- **In CLI**: `crb add ct "CSE 311 CT-2" -d "2026-10-15" -t "10:30 AM" -s "ER Diagrams" --now`
- **In Confirmation Card (Natural Language / Wizard)**:
  ```
  📋 Parsed Event:
  • Course: CSE 311 (CT)
  • Date: Thursday, Oct 15, 2026 @ 10:30 AM
  • Venue: Room 402
  • Syllabus: ER Diagrams, SQL

  👉 Reply "1" to Schedule Reminders only
  👉 Reply "1 now" (or "now") to Send Announcement Immediately + Schedule Reminders
  👉 Reply "edit <field> <value>" to modify
  👉 Reply "cancel" to abort
  ```

---

### 3. Embedded Event ID in Group Messages
Every message sent to a WhatsApp group includes the unique **Event ID** in the footer:
```
╔══════════════════════════════╗
   🚨 UPCOMING CLASS TEST (CT) 🚨
╚══════════════════════════════╝

⏳ Status: 2 DAYS REMAINING!

📚 Course: CSE 311 - Database Systems (CT-2)
📅 Date: Thursday, October 15, 2026
⏰ Time: 10:30 AM
📍 Venue: Room 402

📝 Syllabus:
  • ER Diagrams & Relational Mapping
  • SQL & Normalization

⚠️ Please be seated 10 minutes before start time.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🆔 Event ID: #104
🤖 Automated Reminder via CRB
```

**Instant CR Direct Actions via ID:**
- `crb edit 104 --venue "Room 501"`
- `crb edit 104 --date "2026-10-16"`
- `crb trigger 104` (instantly blast a fresh update to group)
- `crb cancel 104` (cancels event and all future reminders)

---

### 4. Express Server with `/health` Route for UptimeRobot
An Express server running on port `5340` (or `PORT` env) providing:
- `GET /health` : Returns `{ status: "ok", uptime: "...", bot_connected: true, active_events: 12 }` (HTTP 200) for ping services like UptimeRobot to keep the process awake.
- `GET /ping` : Lightweight health check.
- `GET /api/events` : JSON endpoint for inspection.

---

### 5. Group Management & Aliasing
- `crb groups` : Lists all joined groups with short numbers (`#1`, `#2`).
- `crb group set-default <#|alias>` : Configures default group so `--group` flag is optional.
- `crb group alias <#|jid> <alias>` : Sets short alias (e.g. `crb group alias 1 secA`).
- `crb group show` : Shows default group and current aliases.

---

## Proposed Project Structure

```
e:\Projects\CRB\
├── auth_info\                 # Baileys session credentials (persistent)
├── data\
│   └── crb.sqlite             # SQLite database file
├── src\
│   ├── config.js              # Environment variables, timezone, defaults, Gemini key
│   ├── database\
│   │   ├── db.js              # SQLite connection & schema initialization
│   │   ├── eventRepo.js       # Events & reminder triggers CRUD
│   │   ├── groupRepo.js       # Group registry, aliases, default group
│   │   ├── adminRepo.js       # Authorized CR whitelist
│   │   └── settingsRepo.js    # Key-value store
│   ├── ai\
│   │   ├── geminiParser.js    # Gemini Flash structured JSON extraction
│   │   └── localParser.js     # Chrono-node + regex rule fallback
│   ├── scheduler\
│   │   ├── reminderEngine.js  # Interval generator (CT: 5d, 2d, 1d; Lab: 3d, 1d; Assignment: 5d, 2d, 1d, 4h)
│   │   └── cronWorker.js      # 30-sec polling worker to trigger due reminders
│   ├── commands\
│   │   ├── commandParser.js   # CLI flag parser (minimist)
│   │   ├── commandRouter.js   # Routes messages (CLI, NLP prompt, Confirmation, Wizard)
│   │   ├── sessionManager.js  # Manages multi-step drafts and wizards in memory
│   │   └── handlers\
│   │       ├── addHandler.js       # Create event & schedule reminders (+ optional immediate send)
│   │       ├── listHandler.js      # List upcoming events with countdowns & IDs
│   │       ├── editHandler.js      # Edit event fields by ID
│   │       ├── cancelHandler.js    # Cancel event by ID
│   │       ├── triggerHandler.js   # Manually trigger reminder blast now
│   │       ├── groupHandler.js     # Manage groups, aliases, default
│   │       ├── adminHandler.js     # Manage authorized CR numbers
│   │       ├── broadcastHandler.js # Raw broadcast messages
│   │       └── helpHandler.js      # Interactive help menu & ping
│   ├── templates\
│   │   ├── ctTemplate.js           # Formatted CT notice with Event ID
│   │   ├── assignmentTemplate.js   # Formatted Assignment notice with Event ID
│   │   ├── labTemplate.js          # Formatted Lab notice with Event ID
│   │   └── broadcastTemplate.js    # Formatted generic broadcast notice with Event ID
│   ├── server\
│   │   └── app.js             # Express app with /health, /ping for UptimeRobot
│   ├── bot\
│   │   ├── socket.js          # Baileys socket connection, reconnect & QR auth
│   │   └── messageListener.js # WhatsApp message dispatcher
│   └── utils\
│       ├── dateUtils.js       # Date math, human formatting, countdowns
│       └── logger.js          # Clean console logger
├── index.js                   # Application entry point
├── .env.example               # Example config
├── package.json
└── README.md
```

---

## Implementation Steps

1. **Step 1**: Install required dependencies (`better-sqlite3`, `chrono-node`, `minimist`, `dotenv`, `@google/genai` or `@google/generative-ai`, `date-fns`).
2. **Step 2**: Implement SQLite Database layer (`db.js`, `eventRepo.js`, `groupRepo.js`, `adminRepo.js`, `settingsRepo.js`).
3. **Step 3**: Implement Express server with `/health` and `/ping` for UptimeRobot.
4. **Step 4**: Implement AI & Local NLP Parsers (`geminiParser.js`, `localParser.js`).
5. **Step 5**: Implement Reminder Calculation Engine & Background Polling Worker.
6. **Step 6**: Implement Message Formatter Templates (with Event IDs & status banners).
7. **Step 7**: Implement CLI Command Parser, Handlers, and Multi-turn Session Manager.
8. **Step 8**: Wire Baileys WhatsApp client, connect events & auto-sync groups.
9. **Step 9**: Verification and testing.
