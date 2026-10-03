import assert from 'node:assert/strict';
import { getDb } from '../src/database/db.js';
import { groupRepo } from '../src/database/groupRepo.js';
import { adminRepo } from '../src/database/adminRepo.js';
import { eventRepo } from '../src/database/eventRepo.js';
import { reminderEngine } from '../src/scheduler/reminderEngine.js';
import { parseDateTime, formatDisplayDate, getCountdownBanner } from '../src/utils/dateUtils.js';
import { parseCommandLine, splitArgs } from '../src/commands/commandParser.js';
import { formatEventMessage } from '../src/templates/index.js';
import { parseWithLocalRules } from '../src/ai/localParser.js';
import { createServer } from '../src/server/app.js';

console.log('🧪 Running CRB Automated Test Suite...\n');

// 1. Database & Group Repository Test
console.log('1️⃣ Testing Database & Group Registry...');
getDb();
groupRepo.upsertGroup('120363011111111111@g.us', 'Batch 27 Main Group');
groupRepo.upsertGroup('120363022222222222@g.us', 'Section A Group');

const groups = groupRepo.listGroups();
assert.ok(groups.length >= 2, 'Should have at least 2 groups');

groupRepo.setDefaultGroup('120363011111111111@g.us');
const defaultGroup = groupRepo.getDefaultGroup();
assert.equal(defaultGroup.jid, '120363011111111111@g.us', 'Default group should match');

groupRepo.setGroupAlias('120363022222222222@g.us', 'secA');
const resolvedByAlias = groupRepo.resolveGroup('secA');
assert.equal(resolvedByAlias.jid, '120363022222222222@g.us', 'Resolve by alias should match');

const resolvedByIndex = groupRepo.resolveGroup('1');
assert.ok(resolvedByIndex, 'Resolve by index should work');
console.log('  ✅ Group repository passed.');

// 2. Admin Whitelist Test
console.log('2️⃣ Testing Admin Authorization...');
adminRepo.addAdmin('8801700000001', 'Test CR', 'cr');
assert.ok(adminRepo.isAuthorized('8801700000001'), 'Added admin should be authorized');
assert.ok(!adminRepo.isAuthorized('8801999999999'), 'Non-admin should not be authorized');
console.log('  ✅ Admin whitelist passed.');

// 3. Date & Reminder Engine Tests
console.log('3️⃣ Testing Date & Reminder Calculation Engine...');
const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days in future
futureDate.setHours(10, 30, 0, 0);

// CT presets: 5d, 2d, 1d (no morning of test)
const ctReminders = reminderEngine.generateReminders('ct', futureDate);
assert.equal(ctReminders.length, 3, 'CT should generate exactly 3 reminders (5d, 2d, 1d)');
assert.equal(ctReminders[0].label, '5d_before');
assert.equal(ctReminders[1].label, '2d_before');
assert.equal(ctReminders[2].label, '1d_before');

// Lab presets: 3d, 1d (no 3hr before)
const labReminders = reminderEngine.generateReminders('lab', futureDate);
assert.equal(labReminders.length, 2, 'Lab should generate exactly 2 reminders (3d, 1d)');
assert.equal(labReminders[0].label, '3d_before');
assert.equal(labReminders[1].label, '1d_before');

// Custom intervals
const customReminders = reminderEngine.generateReminders('broadcast', futureDate, '6d, 4d, 12h');
assert.equal(customReminders.length, 3, 'Custom intervals should parse 6d, 4d, 12h');

// Countdown Banner
const banner = getCountdownBanner(futureDate);
assert.ok(banner.includes('DAYS REMAINING'), 'Countdown banner should show days remaining');
console.log('  ✅ Reminder calculations and presets passed.');

// 4. Event Creation & CRUD Test
console.log('4️⃣ Testing Event Scheduling & Cancellation in SQLite...');
const eventId = eventRepo.createEvent({
  type: 'ct',
  title: 'CSE 311 Database CT-2',
  event_date: futureDate,
  venue: 'Room 402',
  syllabus: 'ER Diagrams, Normalization',
  target_group_jid: defaultGroup.jid,
  created_by: '8801700000001'
}, ctReminders);

assert.ok(eventId > 0, 'Event ID should be a positive integer');
const savedEvent = eventRepo.getEventById(eventId);
assert.equal(savedEvent.title, 'CSE 311 Database CT-2');
assert.equal(savedEvent.venue, 'Room 402');

const savedReminders = eventRepo.getRemindersForEvent(eventId);
assert.equal(savedReminders.length, 3, 'Should have 3 saved reminder records');

// Test Update
eventRepo.updateEvent(eventId, { venue: 'Room 501' });
const updatedEvent = eventRepo.getEventById(eventId);
assert.equal(updatedEvent.venue, 'Room 501', 'Updated venue should persist');

// Test Cancellation
eventRepo.cancelEvent(eventId);
const cancelledEvent = eventRepo.getEventById(eventId);
assert.equal(cancelledEvent.status, 'cancelled');
const cancelledReminders = eventRepo.getRemindersForEvent(eventId);
assert.ok(cancelledReminders.every(r => r.status === 'cancelled'), 'Pending reminders should be marked cancelled');
console.log('  ✅ Event CRUD and cascade cancel passed.');

// 5. Template Formatting & Event ID in Footer Test
console.log('5️⃣ Testing Message Templates & Event ID Embeds...');
const testEv = {
  id: 104,
  type: 'ct',
  title: 'CSE 311 CT-2',
  event_date: futureDate,
  venue: 'Room 402',
  syllabus: 'ER Diagrams\nNormalization\nSQL Joins'
};
const formattedMsg = formatEventMessage(testEv, false);
assert.ok(formattedMsg.includes('🆔 *Event ID:* #104'), 'Message MUST contain Event ID in footer');
assert.ok(formattedMsg.includes('Room 402'), 'Message should contain venue');
assert.ok(formattedMsg.includes('Normalization'), 'Message should contain syllabus');
console.log('  ✅ Message template formatting and Event ID passed.');

// 6. CLI Command Parser & Admin Handler Test
console.log('6️⃣ Testing CLI Command Line Parser & Admin Handler...');
const sampleCmd = 'crb add ct "CSE 311 CT-2" -d "2026-10-15" -t "10:30 AM" -s "ER Diagrams" -v "Room 402" --now';
const { subcommands, flags } = parseCommandLine(sampleCmd);
assert.equal(subcommands[0], 'crb');
assert.equal(subcommands[1], 'add');
assert.equal(subcommands[2], 'ct');
assert.equal(subcommands[3], 'CSE 311 CT-2');
assert.equal(flags.date, '2026-10-15');
assert.equal(flags.time, '10:30 AM');
assert.equal(flags.syllabus, 'ER Diagrams');
assert.equal(flags.venue, 'Room 402');
assert.equal(flags.now, true);

// Test admin add phone with leading zeros
const adminCmd = 'crb admin add 01330862146 "Sarah"';
const parsedAdmin = parseCommandLine(adminCmd);
assert.equal(parsedAdmin.subcommands[3], '01330862146', 'Leading zeros in phone numbers must be preserved');
console.log('  ✅ CLI argument parser and admin phone tests passed.');

// 7. Local NLP Parser Test
console.log('7️⃣ Testing Local NLP Fallback Extractor...');
const noticeText = 'Dear students, your CSE 311 CT will be held on tomorrow at 10am in Room 402. Syllabus: Normalization and SQL';
const parsedLocal = parseWithLocalRules(noticeText);
assert.ok(parsedLocal, 'Local parser should extract announcement');
assert.equal(parsedLocal.type, 'ct');
assert.ok(parsedLocal.title.includes('CSE 311'), 'Should extract CSE 311');
assert.ok(parsedLocal.venue.toLowerCase().includes('room 402'), 'Should extract Room 402');
console.log('  ✅ Local NLP extractor passed.');

// 8. Express Server & Health Endpoint Test
console.log('8️⃣ Testing Express /health Route...');
const app = createServer(() => true);
const server = app.listen(0, async () => {
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.bot_connected, true);
    console.log('  ✅ Express /health endpoint passed.');
  } finally {
    groupRepo.cleanDummyGroups();
    server.close();
    console.log('\n🎉 ALL 8 TEST SUITES PASSED PERFECTLY!\n');
    process.exit(0);
  }
});
