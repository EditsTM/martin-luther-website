// server/db/suggestionsDb.js
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// ✅ Use Render persistent disk if available
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
`);