import session from "express-session";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function resolveWritableBaseDir(customBaseDir) {
  const candidates = [
    customBaseDir,
    process.env.DB_DIR,
    process.env.ADMIN_DATA_DIR,
    "/var/data",
    path.resolve(process.cwd(), "server/db"),
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probePath = path.join(dir, ".write-test");
      fs.writeFileSync(probePath, "ok");
      fs.unlinkSync(probePath);
      return dir;
    } catch {
      // Try next candidate.
    }
  }

  return path.resolve(process.cwd(), "server/db");
}

export function createSqliteSessionStore(options = {}) {
  const baseDir = resolveWritableBaseDir(options.baseDir);
  const dbPath = options.dbPath || path.join(baseDir, "sessions.sqlite");
  const cleanupIntervalMs = Number(options.cleanupIntervalMs) || ONE_DAY_MS;

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expire INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
  `);

  const getStmt = db.prepare(
    "SELECT sess FROM sessions WHERE sid = ? AND expire > ?"
  );
  const setStmt = db.prepare(
    "INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess, expire=excluded.expire"
  );
  const destroyStmt = db.prepare("DELETE FROM sessions WHERE sid = ?");
  const touchStmt = db.prepare("UPDATE sessions SET expire = ? WHERE sid = ?");
  const cleanupStmt = db.prepare("DELETE FROM sessions WHERE expire <= ?");

  class SqliteSessionStore extends session.Store {
    get(sid, cb) {
      try {
        const row = getStmt.get(sid, Date.now());
        if (!row) return cb(null, null);
        return cb(null, JSON.parse(row.sess));
      } catch (err) {
        return cb(err);
      }
    }

    set(sid, sess, cb) {
      try {
        const cookieExpires = sess?.cookie?.expires
          ? new Date(sess.cookie.expires).getTime()
          : Date.now() + ONE_DAY_MS;
        setStmt.run(sid, JSON.stringify(sess), cookieExpires);
        return cb && cb(null);
      } catch (err) {
        return cb && cb(err);
      }
    }

    destroy(sid, cb) {
      try {
        destroyStmt.run(sid);
        return cb && cb(null);
      } catch (err) {
        return cb && cb(err);
      }
    }

    touch(sid, sess, cb) {
      try {
        const cookieExpires = sess?.cookie?.expires
          ? new Date(sess.cookie.expires).getTime()
          : Date.now() + ONE_DAY_MS;
        touchStmt.run(cookieExpires, sid);
        return cb && cb(null);
      } catch (err) {
        return cb && cb(err);
      }
    }
  }

  if (cleanupIntervalMs > 0) {
    setInterval(() => {
      try {
        cleanupStmt.run(Date.now());
      } catch {
        // Cleanup failure should not crash the server.
      }
    }, cleanupIntervalMs).unref();
  }

  return new SqliteSessionStore();
}
