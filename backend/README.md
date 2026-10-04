# 🤖 CRB (Class Representative Bot) for WhatsApp

CRB is an automated, intelligent WhatsApp bot designed to help Class Representatives (CRs) manage, schedule, and automate class announcements, CT notices, assignment deadlines, and lab report reminders effortlessly.

---

## ✨ Features

- **🧠 Multi-Modal Input (AI Natural Notice + CLI + Confirmation Cards)**:
  - Text naturally or forward messy teacher announcements.
  - Full CLI command flags (`crb add ct -d "2026-10-15" -t "10:30 AM" -s "ER Diagrams" --now`).
  - Interactive preview confirmation cards with 1-tap confirmation.
- **⏰ Smart Multi-Stage Reminders**:
  - **Class Test (CT)**: 5 days before (9 AM), 2 days before (9 AM), 1 day before (8 PM).
  - **Assignment**: 5 days before (10 AM), 2 days before (10 AM), 1 day before (8 PM), 4 hours before deadline.
  - **Lab Report**: 3 days before (10 AM), 1 day before (8 PM).
  - **Custom Intervals**: `--remind "5d,2d,1d,4h"` or exact timestamps.
- **📢 Immediate Send Option (`--now`)**:
  - Announce to the class group right now while simultaneously queueing all future reminders!
- **🆔 Embedded Event IDs in Group Messages**:
  - Every reminder sent to the WhatsApp group has `🆔 Event ID: #104` in the footer.
  - Instant direct edits: `crb edit 104 --venue "Room 501"`, `crb trigger 104`, or `crb cancel 104`.
- **👥 Smart Group Management**:
  - `crb groups` lists joined groups with easy `#1`, `#2` index numbers.
  - `crb group set-default 1` sets default group so you don't need `--group` every time.
  - `crb group alias 1 secA` creates short nicknames.
- **💾 SQLite Persistence**:
  - All events and queued reminders survive restarts and bot disconnections.
- **🌐 24/7 Uptime Monitoring**:
  - Express server with `GET /health` endpoint ready for [UptimeRobot](https://uptimerobot.com/) to prevent host spin-downs.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure `.env`
Open `.env` and fill in your WhatsApp phone number (with country code, digits only):
```env
PORT=5340
BOT_PREFIX=crb
OWNER_NUMBERS=8801700000000

# Optional: Free Gemini API Key from https://aistudio.google.com/
GEMINI_API_KEY=
```

### 3. Run the Bot
```bash
npm run dev
```
By default, scan the QR code printed in the terminal using WhatsApp (**Linked Devices** -> **Link a Device**).

To use a pairing code instead, configure the backend before starting it:

```env
AUTH_MODE=code
AUTH_PHONE_NUMBER=8801700000000
```

The number must include the country code and contain digits only. The backend prints a pairing code; in WhatsApp, open **Linked Devices** and choose **Link with phone number instead**. Set `AUTH_MODE=qr` (or remove it) to return to QR login. These settings are read from the deployment environment, so changing the deployment variable and restarting/redeploying does not require a code change.

---

## 📖 Command Reference

### 1. Scheduling Events
```bash
# Add a Class Test (CT)
crb add ct "CSE 311 CT-2" -d "2026-10-15" -t "10:30 AM" -s "ER Diagrams, SQL" -v "Room 402" --now

# Add an Assignment
crb add assignment "Algorithms HW 3" -d "2026-10-18 23:59" -l "https://classroom.google.com/..."

# Add a Lab Report
crb add lab "Microprocessor Lab 4" -d "2026-10-12 14:00" -s "8086 Assembly"

# Schedule a Custom Broadcast
crb broadcast "Please clear your departmental fees" --at "2026-10-10 18:00" -g secA
```

### 2. Event Management
```bash
crb list                 # View all upcoming events with countdowns & IDs
crb list --type ct       # Filter events by type
crb info 104             # View full details, syllabus, and queued reminder times
crb edit 104 --venue "Room 501"   # Edit venue, date, time, or syllabus
crb trigger 104          # Instantly send reminder to group right now
crb cancel 104           # Cancel event and stop all future reminders
```

### 3. Group Management
```bash
crb groups                     # List all WhatsApp groups with short # numbers
crb group set-default 1        # Set default broadcast group
crb group alias 1 secA         # Assign shortcut alias
crb group show                 # Show current default group
```

### 4. Admin & Health
```bash
crb admin add 8801800000000 "Co-CR"   # Authorize another CR
crb admin list                        # List authorized numbers
crb ping                              # Check bot status & SQLite stats
crb help                              # Interactive command guide
```

---

## 🌐 UptimeRobot Keep-Alive

To keep your bot running 24/7 on free cloud services:
1. Create a free monitor on [UptimeRobot](https://uptimerobot.com/).
2. Select **HTTP(s)** monitor type.
3. Enter your URL: `http://<your-server-domain>/health`.
4. Set interval to **5 minutes**.
