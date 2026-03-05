/**
 * File: server\db\suggestionsDb.js
 * Purpose: Provides database access helpers for suggestionsDb data operations.
 */
// server/db/suggestionsDb.js
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// [OK] Use Render persistent disk if available
const baseDir =
  process.env.DB_DIR ||
  (process.env.RENDER ? "/var/data" : path.resolve(process.cwd(), "server/db"));

if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

const dbPath = path.join(baseDir, "ml.sqlite");
export const db = new Database(dbPath);

// Create table if missing
db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page TEXT NOT NULL,
    changeType TEXT NOT NULL,
    fromText TEXT DEFAULT '',
    toText TEXT DEFAULT '',
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_suggestions_createdAt
    ON suggestions(createdAt DESC);

  CREATE INDEX IF NOT EXISTS idx_suggestions_status
    ON suggestions(status);

  CREATE TABLE IF NOT EXISTS service_times (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    title TEXT NOT NULL,
    firstLabel TEXT NOT NULL,
    firstTime TEXT NOT NULL,
    secondLabel TEXT NOT NULL,
    secondTime TEXT NOT NULL,
    note TEXT NOT NULL,
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS service_time_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    isAdminOnly INTEGER NOT NULL DEFAULT 0,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS service_time_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cardId INTEGER NOT NULL,
    label TEXT NOT NULL,
    timeText TEXT NOT NULL,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(cardId) REFERENCES service_time_cards(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_service_time_cards_sort
    ON service_time_cards(sortOrder, id);

  CREATE INDEX IF NOT EXISTS idx_service_time_sections_card
    ON service_time_sections(cardId, sortOrder, id);

  CREATE TABLE IF NOT EXISTS footer_time_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    note TEXT NOT NULL DEFAULT '',
    lineOne TEXT NOT NULL DEFAULT '',
    lineTwo TEXT NOT NULL DEFAULT '',
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_events_sort
    ON events(sortOrder, id);

  CREATE TABLE IF NOT EXISTS faculty_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_faculty_role_sort
    ON faculty_entries(role, sortOrder, id);

  CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_team_members_sort
    ON team_members(sortOrder, id);
`);

function tableHasColumn(tableName, columnName) {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return cols.some((c) => String(c.name) === String(columnName));
}

function ensureColumn(tableName, columnName, sqlType) {
  if (tableHasColumn(tableName, columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlType}`);
}

// Backward-compatible migration for older local DB files.
ensureColumn("service_time_cards", "note", "TEXT");
ensureColumn("service_time_cards", "isAdminOnly", "INTEGER");
ensureColumn("service_time_cards", "sortOrder", "INTEGER");
ensureColumn("service_time_cards", "createdAt", "TEXT");
ensureColumn("service_time_cards", "updatedAt", "TEXT");

ensureColumn("service_time_sections", "sortOrder", "INTEGER");
ensureColumn("service_time_sections", "createdAt", "TEXT");
ensureColumn("service_time_sections", "updatedAt", "TEXT");

ensureColumn("footer_time_settings", "note", "TEXT");
ensureColumn("footer_time_settings", "lineOne", "TEXT");
ensureColumn("footer_time_settings", "lineTwo", "TEXT");
ensureColumn("footer_time_settings", "updatedAt", "TEXT");

ensureColumn("events", "title", "TEXT");
ensureColumn("events", "date", "TEXT");
ensureColumn("events", "description", "TEXT");
ensureColumn("events", "image", "TEXT");
ensureColumn("events", "notes", "TEXT");
ensureColumn("events", "sortOrder", "INTEGER");
ensureColumn("events", "createdAt", "TEXT");
ensureColumn("events", "updatedAt", "TEXT");

ensureColumn("faculty_entries", "role", "TEXT");
ensureColumn("faculty_entries", "name", "TEXT");
ensureColumn("faculty_entries", "subject", "TEXT");
ensureColumn("faculty_entries", "image", "TEXT");
ensureColumn("faculty_entries", "sortOrder", "INTEGER");
ensureColumn("faculty_entries", "createdAt", "TEXT");
ensureColumn("faculty_entries", "updatedAt", "TEXT");

ensureColumn("team_members", "name", "TEXT");
ensureColumn("team_members", "subject", "TEXT");
ensureColumn("team_members", "image", "TEXT");
ensureColumn("team_members", "bio", "TEXT");
ensureColumn("team_members", "sortOrder", "INTEGER");
ensureColumn("team_members", "createdAt", "TEXT");
ensureColumn("team_members", "updatedAt", "TEXT");

db.exec(`
  UPDATE service_time_cards
  SET
    note = COALESCE(note, ''),
    isAdminOnly = COALESCE(isAdminOnly, 0),
    sortOrder = COALESCE(sortOrder, 0),
    createdAt = COALESCE(createdAt, datetime('now')),
    updatedAt = COALESCE(updatedAt, datetime('now'));

  UPDATE service_time_sections
  SET
    sortOrder = COALESCE(sortOrder, 0),
    createdAt = COALESCE(createdAt, datetime('now')),
    updatedAt = COALESCE(updatedAt, datetime('now'));

  UPDATE footer_time_settings
  SET
    note = COALESCE(note, ''),
    lineOne = COALESCE(lineOne, ''),
    lineTwo = COALESCE(lineTwo, ''),
    updatedAt = COALESCE(updatedAt, datetime('now'));

  UPDATE events
  SET
    title = COALESCE(title, ''),
    date = COALESCE(date, ''),
    description = COALESCE(description, ''),
    image = COALESCE(image, ''),
    notes = COALESCE(notes, ''),
    sortOrder = COALESCE(sortOrder, 0),
    createdAt = COALESCE(createdAt, datetime('now')),
    updatedAt = COALESCE(updatedAt, datetime('now'));

  UPDATE faculty_entries
  SET
    role = COALESCE(role, 'teacher'),
    name = COALESCE(name, ''),
    subject = COALESCE(subject, ''),
    image = COALESCE(image, ''),
    sortOrder = COALESCE(sortOrder, 0),
    createdAt = COALESCE(createdAt, datetime('now')),
    updatedAt = COALESCE(updatedAt, datetime('now'));

  UPDATE team_members
  SET
    name = COALESCE(name, ''),
    subject = COALESCE(subject, ''),
    image = COALESCE(image, ''),
    bio = COALESCE(bio, ''),
    sortOrder = COALESCE(sortOrder, 0),
    createdAt = COALESCE(createdAt, datetime('now')),
    updatedAt = COALESCE(updatedAt, datetime('now'));
`);

function seedFacultyFromJsonIfNeeded() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM faculty_entries").get()?.count ?? 0;
  if (Number(count) > 0) return;

  const facultyPath = path.resolve(process.cwd(), "server/content/faculty.json");
  if (!fs.existsSync(facultyPath)) return;

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(facultyPath, "utf8"));
  } catch {
    return;
  }

  const principal = raw?.principal
    ? [{
        role: "principal",
        name: String(raw.principal?.name ?? "Name"),
        subject: String(raw.principal?.subject ?? "Principal"),
        image: String(raw.principal?.image ?? "/images/faculty/PlaceHolder.jpg"),
        sortOrder: 0,
      }]
    : [];

  const admins = (Array.isArray(raw?.admin) ? raw.admin : []).map((x, idx) => ({
    role: "admin",
    name: String(x?.name ?? "Name"),
    subject: String(x?.subject ?? "Administrator"),
    image: String(x?.image ?? "/images/faculty/PlaceHolder.jpg"),
    sortOrder: idx,
  }));

  const teachers = (Array.isArray(raw?.teachers) ? raw.teachers : []).map((x, idx) => ({
    role: "teacher",
    name: String(x?.name ?? "Name"),
    subject: String(x?.subject ?? "Subject"),
    image: String(x?.image ?? "/images/faculty/PlaceHolder.jpg"),
    sortOrder: idx,
  }));

  const staff = (Array.isArray(raw?.staff) ? raw.staff : []).map((x, idx) => ({
    role: "staff",
    name: String(x?.name ?? "Name"),
    subject: String(x?.subject ?? "Staff"),
    image: String(x?.image ?? "/images/faculty/PlaceHolder.jpg"),
    sortOrder: idx,
  }));

  const rows = [...principal, ...admins, ...teachers, ...staff];
  if (!rows.length) return;

  const insert = db.prepare(
    `
    INSERT INTO faculty_entries (role, name, subject, image, sortOrder, updatedAt)
    VALUES (@role, @name, @subject, @image, @sortOrder, datetime('now'))
  `
  );
  const tx = db.transaction((items) => {
    items.forEach((row) => insert.run(row));
  });
  tx(rows);
}

function seedTeamFromJsonIfNeeded() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM team_members").get()?.count ?? 0;
  if (Number(count) > 0) return;

  const teamPath = path.resolve(process.cwd(), "server/content/team.json");
  if (!fs.existsSync(teamPath)) return;

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(teamPath, "utf8"));
  } catch {
    return;
  }

  const rows = (Array.isArray(raw?.team) ? raw.team : []).map((x, idx) => ({
    name: String(x?.name ?? "Name"),
    subject: String(x?.subject ?? "Pastor"),
    image: String(x?.image ?? "/images/Placeholder.jpg"),
    bio: Array.isArray(x?.bio)
      ? x.bio.map((p) => String(p ?? "")).join("\n\n")
      : String(x?.bio ?? ""),
    sortOrder: idx,
  }));
  if (!rows.length) return;

  const insert = db.prepare(
    `
    INSERT INTO team_members (name, subject, image, bio, sortOrder, updatedAt)
    VALUES (@name, @subject, @image, @bio, @sortOrder, datetime('now'))
  `
  );
  const tx = db.transaction((items) => {
    items.forEach((row) => insert.run(row));
  });
  tx(rows);
}

function seedEventsFromJsonIfNeeded() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM events").get()?.count ?? 0;
  if (Number(count) > 0) return;

  const eventsSeedPath = path.resolve(process.cwd(), "server/content/events.seed.json");
  if (!fs.existsSync(eventsSeedPath)) return;

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(eventsSeedPath, "utf8"));
  } catch {
    return;
  }

  const rows = (Array.isArray(raw?.events) ? raw.events : [])
    .map((x, idx) => ({
      title: String(x?.title ?? ""),
      date: String(x?.date ?? ""),
      description: String(x?.description ?? ""),
      image: String(x?.image ?? ""),
      notes: String(x?.notes ?? ""),
      sortOrder: idx,
    }))
    .filter(
      (x) =>
        x.title.trim() ||
        x.date.trim() ||
        x.description.trim() ||
        x.image.trim() ||
        x.notes.trim()
    );

  if (!rows.length) return;

  const insert = db.prepare(
    `
    INSERT INTO events (title, date, description, image, notes, sortOrder, updatedAt)
    VALUES (@title, @date, @description, @image, @notes, @sortOrder, datetime('now'))
  `
  );
  const tx = db.transaction((items) => {
    items.forEach((row) => insert.run(row));
  });
  tx(rows);
}

seedFacultyFromJsonIfNeeded();
seedTeamFromJsonIfNeeded();
seedEventsFromJsonIfNeeded();

db.prepare(
  `
  INSERT INTO service_times (id, title, firstLabel, firstTime, secondLabel, secondTime, note)
  SELECT 1, @title, @firstLabel, @firstTime, @secondLabel, @secondTime, @note
  WHERE NOT EXISTS (SELECT 1 FROM service_times WHERE id = 1)
`
).run({
  title: "Service Times",
  firstLabel: "Sunday Mornings",
  firstTime: "8:00am & 10:30am",
  secondLabel: "Monday Evenings",
  secondTime: "6:00pm",
  note: "*Summer hours will differ",
});

const existingCardCount = db
  .prepare("SELECT COUNT(*) AS count FROM service_time_cards")
  .get()?.count;

if (!existingCardCount) {
  const legacy = db
    .prepare(
      `
      SELECT title, firstLabel, firstTime, secondLabel, secondTime, note
      FROM service_times
      WHERE id = 1
    `
    )
    .get();

  const seed = legacy || {
    title: "Service Times",
    firstLabel: "Sunday Mornings",
    firstTime: "8:00am & 10:30am",
    secondLabel: "Monday Evenings",
    secondTime: "6:00pm",
    note: "*Summer hours will differ",
  };

  const tx = db.transaction((data) => {
    const insertCard = db.prepare(
      `
      INSERT INTO service_time_cards (title, note, isAdminOnly, sortOrder, updatedAt)
      VALUES (@title, @note, 0, 0, datetime('now'))
    `
    );
    const cardInfo = insertCard.run({
      title: data.title,
      note: data.note,
    });

    const cardId = Number(cardInfo.lastInsertRowid);
    const insertSection = db.prepare(
      `
      INSERT INTO service_time_sections (cardId, label, timeText, sortOrder, updatedAt)
      VALUES (@cardId, @label, @timeText, @sortOrder, datetime('now'))
    `
    );

    insertSection.run({
      cardId,
      label: data.firstLabel,
      timeText: data.firstTime,
      sortOrder: 0,
    });
    insertSection.run({
      cardId,
      label: data.secondLabel,
      timeText: data.secondTime,
      sortOrder: 1,
    });
  });

  tx(seed);
}

db.prepare(
  `
  INSERT INTO footer_time_settings (id, note, lineOne, lineTwo, updatedAt)
  SELECT 1, @note, @lineOne, @lineTwo, datetime('now')
  WHERE NOT EXISTS (SELECT 1 FROM footer_time_settings WHERE id = 1)
`
).run({
  note: "*Summer hours vary*",
  lineOne: "Sundays - 8am & 10:30am",
  lineTwo: "Mondays - 6pm",
});
