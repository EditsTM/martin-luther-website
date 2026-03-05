/**
 * File: server\routes\admin.js
 * Purpose: Defines HTTP route handlers and request validation for admin operations.
 */
// [OK] server/routes/admin.js
import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import speakeasy from "speakeasy";
import { db } from "../db/suggestionsDb.js"; 
import { enforceTrustedOrigin } from "../middleware/requestSecurity.js";
import { hasValidImageSignature } from "../middleware/uploadValidation.js";

dotenv.config();

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* SECURITY HELPERS*/

//Fail closed if ADMIN_PASSWORD isn't set (no insecure fallback)
if (!process.env.ADMIN_PASSWORD) {
  throw new Error("[ERROR] ADMIN_PASSWORD is missing. Refusing to start for safety.");
}
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

//Rate-limit login attempts (basic brute-force protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
});

//Timing-safe password compare (reduces timing leakage)
function timingSafeEqualString(a, b) {
  const aBuf = Buffer.from(String(a ?? ""), "utf8");
  const bBuf = Buffer.from(String(b ?? ""), "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

const requireSameOrigin = enforceTrustedOrigin({ allowNoOrigin: false });

//Auth guard
function requireAdmin(req, res, next) {
  if (!req.session?.loggedIn) return res.status(403).json({ error: "Unauthorized" });
  next();
}

//Strict index parsing (prevents weird keys like "__proto__")
function parseIndex(val) {
  const i = Number(val);
  if (!Number.isInteger(i) || i < 0) return null;
  return i;
}

function parseIdList(values) {
  if (!Array.isArray(values)) return null;
  const list = values.map((v) => Number(v));
  if (!list.length) return [];
  if (!list.every((v) => Number.isInteger(v) && v > 0)) return null;
  if (new Set(list).size !== list.length) return null;
  return list;
}

//Basic string length limits to prevent abuse / huge payloads
function clampString(val, maxLen) {
  if (val === null || val === undefined) return null;
  const s = String(val);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function defaultServiceTimesCard() {
  return {
    title: "Service Times",
    note: "*Summer hours will differ",
    sections: [
      { label: "Sunday Mornings", timeText: "8:00am & 10:30am" },
      { label: "Monday Evenings", timeText: "6:00pm" },
    ],
  };
}

function normalizeServiceTimesCardPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  const fallback = defaultServiceTimesCard();
  const sectionsIn = Array.isArray(body.sections) ? body.sections : fallback.sections;
  const sections = sectionsIn
    .map((s) => ({
      label: clampString(s?.label, 120) ?? "",
      timeText: clampString(s?.timeText, 120) ?? "",
    }))
    .map((s) => ({
      label: s.label.trim() || "Service Label",
      timeText: s.timeText.trim() || "Service Time",
    }))
    .slice(0, 12);

  if (!sections.length) {
    sections.push({ label: "Service Label", timeText: "Service Time" });
  }

  return {
    title: (clampString(body.title, 80) ?? fallback.title).trim() || fallback.title,
    note: clampString(body.note, 200) ?? fallback.note,
    sections,
  };
}

function defaultFooterTimeSettings() {
  return {
    note: "*Summer hours vary*",
    lineOne: "Sundays - 8am & 10:30am",
    lineTwo: "Mondays - 6pm",
  };
}

function normalizeFooterTimePayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  const fallback = defaultFooterTimeSettings();

  return {
    note: (clampString(body.note, 200) ?? fallback.note).trim() || fallback.note,
    lineOne: (clampString(body.lineOne, 120) ?? fallback.lineOne).trim() || fallback.lineOne,
    lineTwo: (clampString(body.lineTwo, 120) ?? fallback.lineTwo).trim() || fallback.lineTwo,
  };
}

function normalizeEventRecord(row) {
  return {
    title: String(row?.title ?? ""),
    date: String(row?.date ?? ""),
    description: String(row?.description ?? ""),
    image: String(row?.image ?? ""),
    notes: String(row?.notes ?? ""),
  };
}

function listEventsOrdered() {
  return db
    .prepare(
      `
      SELECT id, title, date, description, image, notes, sortOrder
      FROM events
      ORDER BY sortOrder ASC, id ASC
    `
    )
    .all();
}

function getEventIdByIndex(index) {
  const row = db
    .prepare(
      `
      SELECT id
      FROM events
      ORDER BY sortOrder ASC, id ASC
      LIMIT 1 OFFSET ?
    `
    )
    .get(index);
  return row ? Number(row.id) : null;
}

/* TRUSTED DEVICE (Remember for 30 days) */

if (!process.env.ADMIN_TOTP_SECRET) {
  throw new Error("[ERROR] ADMIN_TOTP_SECRET is missing. Refusing to start for safety.");
}

function resolveWritableAdminDataDir() {
  const candidates = [
    process.env.ADMIN_DATA_DIR,
    process.env.DB_DIR,
    "/var/data",
    path.resolve(process.cwd(), "server/content"),
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

  return path.resolve(process.cwd(), "server/content");
}

// Store hashed tokens + expiry in a writable path.
const adminDataDir = resolveWritableAdminDataDir();
if (!fs.existsSync(adminDataDir)) fs.mkdirSync(adminDataDir, { recursive: true });
const trustedDevicesPath = path.join(adminDataDir, "trusted-devices.json");

function readTrustedDevices() {
  try {
    if (!fs.existsSync(trustedDevicesPath)) {
      fs.mkdirSync(path.dirname(trustedDevicesPath), { recursive: true });
      fs.writeFileSync(trustedDevicesPath, JSON.stringify({ devices: [] }, null, 2));
    }
    const data = JSON.parse(fs.readFileSync(trustedDevicesPath, "utf8"));
    if (!data || !Array.isArray(data.devices)) return { devices: [] };
    return data;
  } catch {
    return { devices: [] };
  }
}

function writeTrustedDevices(data) {
  fs.mkdirSync(path.dirname(trustedDevicesPath), { recursive: true });
  fs.writeFileSync(trustedDevicesPath, JSON.stringify(data, null, 2));
}

function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

function cleanupExpiredDevices(data) {
  const now = Date.now();
  data.devices = (data.devices || []).filter((d) => d && d.expires > now);
  return data;
}

function completeLogin(req, res, { rememberDevice, deviceTrusted }) {
  req.session.loggedIn = true;
  req.session.isAdmin = true;

  // If they checked "Remember this device", set 30-day trusted cookie.
  if (rememberDevice && !deviceTrusted) {
    try {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashed = hashToken(rawToken);

      const data = cleanupExpiredDevices(readTrustedDevices());
      data.devices.push({
        token: hashed,
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
      });
      writeTrustedDevices(data);

      res.cookie("ml_trusted", rawToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: "/admin",
      });
    } catch (err) {
      console.warn("Trusted-device save failed; login continues:", err?.message || err);
    }
  }

  // Persist session; if store write fails we still return a clear error.
  return req.session.save((saveErr) => {
    if (saveErr) {
      console.error("Session save failed after login:", saveErr);
      return res.status(500).send("Session error");
    }
    return res.redirect(303, "/admin/dashboard");
  });
}


/*  UPLOAD HARDENING (EVENTS + FACULTY) */

const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function imageFileFilter(req, file, cb) {
  //Block SVG (common XSS vector if served as image/svg+xml)
  if (file.mimetype === "image/svg+xml") {
    return cb(new Error("SVG uploads are not allowed."), false);
  }
  if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
    return cb(new Error("Only JPG, PNG, WEBP, GIF allowed."), false);
  }
  cb(null, true);
}

function safeRandomFilename(originalname) {
  const ext = path.extname(originalname || "").toLowerCase();
  const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : "";
  const unique = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  return `${unique}${safeExt}`;
}

/* 🏠 Admin Login Page */
router.get("/login", (req, res) => {
  if (req.session.loggedIn) {
    return res.redirect("/admin/dashboard");
  }
  res.sendFile(path.join(__dirname, "../../public/html/school/admin.html"));
});

/* Handle Login (Password + 2FA + Remember Device) */
router.post("/login", loginLimiter, (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { password, token, rememberDevice } = body;

    // 1) Check if this browser is already trusted
    let deviceTrusted = false;
    const trustedCookie = req.cookies?.ml_trusted;

    if (trustedCookie) {
      try {
        const data = cleanupExpiredDevices(readTrustedDevices());
        const hashed = hashToken(trustedCookie);

        if (data.devices.some((d) => d.token === hashed)) {
          deviceTrusted = true;
        } else {
          // keep file clean
          writeTrustedDevices(data);
        }
      } catch (err) {
        console.warn("Trusted-device read/write failed; continuing without trust:", err?.message || err);
      }
    }

    // 2) Password check
    const passwordOk = timingSafeEqualString(password, ADMIN_PASSWORD);

    // 3) 2FA check (skip if trusted)
    let tokenOk = deviceTrusted;
    if (!deviceTrusted) {
      try {
        tokenOk = speakeasy.totp.verify({
          secret: process.env.ADMIN_TOTP_SECRET,
          encoding: "base32",
          token: String(token || ""),
          window: 1,
        });
      } catch (err) {
        console.error("TOTP verification failed:", err);
        tokenOk = false;
      }
    }

    if (passwordOk && tokenOk) {
      if (!req.session) {
        console.error("POST /admin/login failed: req.session is missing");
        return res.status(500).send("Session error");
      }
      return req.session.regenerate((err) => {
        if (err) {
          // Fallback path: keep current session object instead of hard-failing login.
          console.error("Session regenerate failed; falling back to current session:", err);
        }
        try {
          return completeLogin(req, res, { rememberDevice, deviceTrusted });
        } catch (completeErr) {
          console.error("completeLogin failed:", completeErr);
          return res.status(500).send("Session error");
        }
      });
    }

  //eneric error 
  const errorHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin Login | Error</title>
  <link rel="stylesheet" href="/css/school/admin.css" />
  <link rel="stylesheet" href="/css/header.css" />
  <link rel="stylesheet" href="/css/footer.css" />

  <style>
    .error-msg {
      color: #b30000;
      font-weight: 700;
      margin-top: 15px;
      font-size: 1rem;
      background: #ffeaea;
      border: 1px solid #b30000;
      padding: 10px;
      border-radius: 6px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div id="header"></div>

  <section class="admin-hero">
    <div class="admin-overlay">
      <div class="login-card">
        <h1>Admin Portal</h1>
        <p>Sign in to manage website content</p>

        <form action="/admin/login" method="POST" class="login-form">
          <div class="password-field">
            <input
              id="admin-password"
              type="password"
              name="password"
              placeholder="Enter Password"
              required
            />
            <button
              type="button"
              class="password-toggle"
              data-password-toggle
              data-target="admin-password"
              aria-label="Show password"
              aria-pressed="false"
            >
              <span class="password-toggle__icon" aria-hidden="true"></span>
            </button>
          </div>

          <input
            type="text"
            name="token"
            placeholder="6-digit code"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9]{6}"
            required
          />

          <button type="submit">Login</button>
        </form>

        <div class="error-msg">[ERROR] Invalid credentials. Please try again.</div>
        <a href="/html/home.html" class="back-link">← Back to Home</a>
      </div>
    </div>
  </section>

  <div id="footer"></div>
  <script src="/js/header.js"></script>
  <script src="/js/footer.js"></script>
  <script src="/js/admin-login.js"></script>
</body>
</html>
  `;

    return res.status(401).send(errorHTML);
  } catch (err) {
    console.error("POST /admin/login failed:", err);
    return res.status(500).send("Internal Server Error");
  }
});
/* Protected Dashboard */
router.get("/dashboard", (req, res) => {
  if (!req.session.loggedIn) return res.redirect("/admin/login");

  // Prevent caching so you always see latest changes
  res.set("Cache-Control", "no-store");

  // Serve your actual dashboard file
  res.sendFile(
    path.join(__dirname, "../../public/html/school/dashboard.html")
  );
});

/* Logout (POST) — for fetch() / idle timeout */
router.post("/logout", (req, res) => {
  const done = () => {
    // clear session cookie (your session name is ml.sid)
    res.clearCookie("ml.sid", { path: "/" });

    // optional trusted device cookie
    res.clearCookie("ml_trusted", { path: "/admin" });
    res.clearCookie("ml_trusted", { path: "/" });

    // send them to login
    return res.redirect(303, "/admin/login");
  };

  if (!req.session) return done();

  // also flip flags just in case
  req.session.loggedIn = false;
  req.session.isAdmin = false;

  req.session.destroy(() => done());
});
/* Session Check Endpoint */
router.get("/check", (req, res) => {
  res.json({ loggedIn: !!req.session.loggedIn });
});

/* Update Event Title/Date/Image/Notes*/
router.post("/update-event", requireSameOrigin, requireAdmin, (req, res) => {
  const i = parseIndex(req.body?.index);
  if (i === null) return res.status(400).json({ error: "Invalid index" });

  //Allow empty strings if you ever want to clear a field.
  const title = clampString(req.body?.title, 120);
  const date = clampString(req.body?.date, 80);
  const image = clampString(req.body?.image, 300);

  //Notes can be long and can be empty; keep it exactly as sent
  let notes = req.body?.notes;
  if (notes !== undefined) {
    notes = String(notes).replace(/\r\n/g, "\n"); // normalize newlines
    // basic size cap so nobody posts a 50MB notes payload
    if (notes.length > 12000) notes = notes.slice(0, 12000);
  }

  //If image is provided, force it to be site-relative under /images/
  if (image && !image.startsWith("/images/")) {
    return res.status(400).json({ error: "Invalid image path" });
  }

  try {
    const eventId = getEventIdByIndex(i);
    if (!eventId) return res.status(404).json({ error: "Event not found" });

    const current = db
      .prepare(
        `
        SELECT id, title, date, description, image, notes
        FROM events
        WHERE id = ?
      `
      )
      .get(eventId);
    if (!current) return res.status(404).json({ error: "Event not found" });

    const next = {
      title: title !== null ? title : String(current.title ?? ""),
      date: date !== null ? date : String(current.date ?? ""),
      description: String(current.description ?? ""),
      image: image !== null ? image : String(current.image ?? ""),
      notes: notes !== undefined ? notes : String(current.notes ?? ""),
    };

    db.prepare(
      `
      UPDATE events
      SET title = @title,
          date = @date,
          description = @description,
          image = @image,
          notes = @notes,
          updatedAt = datetime('now')
      WHERE id = @id
    `
    ).run({
      id: eventId,
      ...next,
    });

    res.json({ success: true, updated: normalizeEventRecord(next) });
  } catch (err) {
    console.error("update-event failed:", err);
    res.status(500).json({ error: "Failed to update event" });
  }
});


/* -Upload Event Image */
const uploadDir = path.resolve(process.cwd(), "public/images/events");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, safeRandomFilename(file.originalname)),
});

const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 3 * 1024 * 1024 }, //3MB
});

router.post(
  "/upload-image",
  requireSameOrigin,
  requireAdmin,
  upload.single("image"),
  (req, res) => {
    const i = parseIndex(req.body?.index);
    if (i === null) return res.status(400).json({ error: "Invalid index" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      if (!hasValidImageSignature(req.file.path, req.file.mimetype)) {
        try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(400).json({ error: "Invalid image content" });
      }

      const eventId = getEventIdByIndex(i);
      if (!eventId) return res.status(404).json({ error: "Event not found" });

      const rel = `/images/events/${req.file.filename}`;
      db.prepare(
        `
        UPDATE events
        SET image = ?,
            updatedAt = datetime('now')
        WHERE id = ?
      `
      ).run(rel, eventId);
      res.json({ success: true, image: rel });
    } catch (err) {
      res.status(500).json({ error: "Failed to upload image" });
    }
  }
);

/*Serve events.json for homepage */
router.get("/events.json", (req, res) => {
  try {
    const events = listEventsOrdered().map((row) => normalizeEventRecord(row));
    res.set("Cache-Control", "no-store");
    res.json({ events });
  } catch (err) {
    console.error("Failed to load events.json:", err);
    res.status(500).json({ error: "Failed to load events.json" });
  }
});

router.post("/service-times/card", requireSameOrigin, requireAdmin, (req, res) => {
  try {
    const count = db
      .prepare("SELECT COUNT(*) AS count FROM service_time_cards")
      .get()?.count;
    const sortOrder = Number(count || 0);

    const seed = {
      title: "Service Times",
      note: "",
      sections: [{ label: "Service Label", timeText: "Service Time" }],
    };

    const out = db.transaction(() => {
      const cardInfo = db
        .prepare(
          `
          INSERT INTO service_time_cards (title, note, isAdminOnly, sortOrder, updatedAt)
          VALUES (@title, @note, 1, @sortOrder, datetime('now'))
        `
        )
        .run({
          title: seed.title,
          note: seed.note,
          sortOrder,
        });

      const cardId = Number(cardInfo.lastInsertRowid);

      db.prepare(
        `
        INSERT INTO service_time_sections (cardId, label, timeText, sortOrder, updatedAt)
        VALUES (@cardId, @label, @timeText, 0, datetime('now'))
      `
      ).run({
        cardId,
        label: seed.sections[0].label,
        timeText: seed.sections[0].timeText,
      });

      return {
        id: cardId,
        title: seed.title,
        note: seed.note,
        isAdminOnly: true,
        sections: seed.sections,
      };
    })();

    return res.json({ success: true, card: out });
  } catch (err) {
    console.error("Failed to create service time card:", err);
    return res.status(500).json({ error: "Failed to create service time card" });
  }
});

router.post("/service-times/card/:id", requireSameOrigin, requireAdmin, (req, res) => {
  const cardId = parseIndex(req.params.id);
  if (cardId === null) return res.status(400).json({ error: "Invalid card id" });

  const payload = normalizeServiceTimesCardPayload(req.body);
  if (!payload) return res.status(400).json({ error: "Invalid payload" });

  try {
    const existing = db
      .prepare(
        `
        SELECT id, isAdminOnly
        FROM service_time_cards
        WHERE id = ?
      `
      )
      .get(cardId);
    if (!existing) return res.status(404).json({ error: "Card not found" });

    db.transaction(() => {
      db.prepare(
        `
        UPDATE service_time_cards
        SET title = @title,
            note = @note,
            updatedAt = datetime('now')
        WHERE id = @id
      `
      ).run({
        id: cardId,
        title: payload.title,
        note: payload.note,
      });

      db.prepare("DELETE FROM service_time_sections WHERE cardId = ?").run(cardId);
      const insertSection = db.prepare(
        `
        INSERT INTO service_time_sections (cardId, label, timeText, sortOrder, updatedAt)
        VALUES (@cardId, @label, @timeText, @sortOrder, datetime('now'))
      `
      );
      payload.sections.forEach((section, idx) => {
        insertSection.run({
          cardId,
          label: section.label,
          timeText: section.timeText,
          sortOrder: idx,
        });
      });
    })();

    return res.json({
      success: true,
      card: {
        id: cardId,
        title: payload.title,
        note: payload.note,
        isAdminOnly: !!Number(existing.isAdminOnly),
        sections: payload.sections,
      },
    });
  } catch (err) {
    console.error("Failed to update service time card:", err);
    return res.status(500).json({ error: "Failed to update service time card" });
  }
});

router.delete("/service-times/card/:id", requireSameOrigin, requireAdmin, (req, res) => {
  const cardId = parseIndex(req.params.id);
  if (cardId === null) return res.status(400).json({ error: "Invalid card id" });

  try {
    const card = db
      .prepare(
        `
        SELECT id, isAdminOnly
        FROM service_time_cards
        WHERE id = ?
      `
      )
      .get(cardId);

    if (!card) return res.status(404).json({ error: "Card not found" });
    if (!Number(card.isAdminOnly)) {
      return res.status(400).json({ error: "Default service times card cannot be deleted" });
    }

    db.transaction(() => {
      db.prepare("DELETE FROM service_time_sections WHERE cardId = ?").run(cardId);
      db.prepare("DELETE FROM service_time_cards WHERE id = ?").run(cardId);
    })();

    return res.json({ success: true });
  } catch (err) {
    console.error("Failed to delete service time card:", err);
    return res.status(500).json({ error: "Failed to delete service time card" });
  }
});

router.post("/service-times/reorder", requireSameOrigin, requireAdmin, (req, res) => {
  const adminCardIds = parseIdList(req.body?.cardIds);
  if (!adminCardIds) return res.status(400).json({ error: "Invalid cardIds payload" });

  try {
    const allCards = db
      .prepare(
        `
        SELECT id, isAdminOnly
        FROM service_time_cards
        ORDER BY sortOrder ASC, id ASC
      `
      )
      .all();

    const baseCards = allCards.filter((card) => !Number(card.isAdminOnly));
    const existingAdminIds = allCards
      .filter((card) => Number(card.isAdminOnly))
      .map((card) => Number(card.id));

    if (adminCardIds.length !== existingAdminIds.length) {
      return res.status(400).json({ error: "cardIds length mismatch" });
    }

    const requested = new Set(adminCardIds);
    const sameIds =
      existingAdminIds.length === adminCardIds.length &&
      existingAdminIds.every((id) => requested.has(id));
    if (!sameIds) {
      return res.status(400).json({ error: "cardIds must match existing admin-only cards" });
    }

    db.transaction(() => {
      const updateSort = db.prepare(
        `
        UPDATE service_time_cards
        SET sortOrder = @sortOrder,
            updatedAt = datetime('now')
        WHERE id = @id
      `
      );

      baseCards.forEach((card, idx) => {
        updateSort.run({
          id: Number(card.id),
          sortOrder: idx,
        });
      });

      adminCardIds.forEach((id, idx) => {
        updateSort.run({
          id,
          sortOrder: baseCards.length + idx,
        });
      });
    })();

    return res.json({ success: true });
  } catch (err) {
    console.error("Failed to reorder service time cards:", err);
    return res.status(500).json({ error: "Failed to reorder service time cards" });
  }
});

router.get("/footer-time", requireAdmin, (req, res) => {
  try {
    const row = db
      .prepare(
        `
        SELECT note, lineOne, lineTwo
        FROM footer_time_settings
        WHERE id = 1
      `
      )
      .get();

    const fallback = defaultFooterTimeSettings();
    const out = {
      note: String(row?.note ?? fallback.note),
      lineOne: String(row?.lineOne ?? fallback.lineOne),
      lineTwo: String(row?.lineTwo ?? fallback.lineTwo),
    };

    res.set("Cache-Control", "no-store");
    return res.json(out);
  } catch (err) {
    console.error("Failed to load footer time settings:", err);
    return res.status(500).json({ error: "Failed to load footer time settings" });
  }
});

router.post("/footer-time", requireSameOrigin, requireAdmin, (req, res) => {
  const payload = normalizeFooterTimePayload(req.body);
  if (!payload) return res.status(400).json({ error: "Invalid payload" });

  try {
    db.prepare(
      `
      INSERT INTO footer_time_settings (id, note, lineOne, lineTwo, updatedAt)
      VALUES (1, @note, @lineOne, @lineTwo, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        note = excluded.note,
        lineOne = excluded.lineOne,
        lineTwo = excluded.lineTwo,
        updatedAt = datetime('now')
    `
    ).run(payload);

    return res.json({ success: true, ...payload });
  } catch (err) {
    console.error("Failed to save footer time settings:", err);
    return res.status(500).json({ error: "Failed to save footer time settings" });
  }
});

/*FACULTY SYSTEM*/
const FACULTY_DEFAULT_IMAGE = "/images/faculty/PlaceHolder.jpg";

function listFacultyRowsByRole(role) {
  return db
    .prepare(
      `
      SELECT id, role, name, subject, image, sortOrder
      FROM faculty_entries
      WHERE role = ?
      ORDER BY sortOrder ASC, id ASC
    `
    )
    .all(role);
}

function normalizeFacultyCard(row, fallbackSubject = "Subject") {
  return {
    name: String(row?.name ?? "Name"),
    subject: String(row?.subject ?? fallbackSubject),
    image: String(row?.image ?? FACULTY_DEFAULT_IMAGE),
  };
}

function facultyPayloadFromDb() {
  const principalRows = listFacultyRowsByRole("principal");
  const adminRows = listFacultyRowsByRole("admin");
  const teacherRows = listFacultyRowsByRole("teacher");
  const staffRows = listFacultyRowsByRole("staff");

  return {
    principal: normalizeFacultyCard(principalRows[0], "Principal"),
    admin: adminRows.map((r) => normalizeFacultyCard(r, "Administrator")),
    teachers: teacherRows.map((r) => normalizeFacultyCard(r, "Subject")),
    staff: staffRows.map((r) => normalizeFacultyCard(r, "Staff")),
  };
}

function getFacultyRowByRoleIndex(role, index) {
  const rows = listFacultyRowsByRole(role);
  if (!Number.isInteger(index) || index < 0 || index >= rows.length) return null;
  return rows[index];
}

function insertFacultyRow(role, defaults) {
  const count = db
    .prepare("SELECT COUNT(*) AS count FROM faculty_entries WHERE role = ?")
    .get(role)?.count;
  const sortOrder = Number(count || 0);

  const info = db
    .prepare(
      `
      INSERT INTO faculty_entries (role, name, subject, image, sortOrder, updatedAt)
      VALUES (@role, @name, @subject, @image, @sortOrder, datetime('now'))
    `
    )
    .run({
      role,
      name: String(defaults?.name ?? "Name"),
      subject: String(defaults?.subject ?? "Subject"),
      image: String(defaults?.image ?? FACULTY_DEFAULT_IMAGE),
      sortOrder,
    });

  return {
    id: Number(info.lastInsertRowid),
    role,
    name: String(defaults?.name ?? "Name"),
    subject: String(defaults?.subject ?? "Subject"),
    image: String(defaults?.image ?? FACULTY_DEFAULT_IMAGE),
    sortOrder,
  };
}

function ensurePrincipalRow() {
  const principal = listFacultyRowsByRole("principal")[0];
  if (principal) return principal;
  return insertFacultyRow("principal", {
    name: "Name",
    subject: "Principal",
    image: FACULTY_DEFAULT_IMAGE,
  });
}

/*Serve faculty.json */
router.get("/faculty.json", (req, res) => {
  try {
    const data = facultyPayloadFromDb();
    res.set("Cache-Control", "no-store");
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to load faculty.json" });
  }
});

/* Add Teacher */
router.post("/faculty/add", requireSameOrigin, requireAdmin, (req, res) => {
  try {
    const created = insertFacultyRow("teacher", {
      name: "Name",
      subject: "Subject",
      image: FACULTY_DEFAULT_IMAGE,
    });
    const newTeacher = normalizeFacultyCard(created, "Subject");

    res.json({
      success: true,
      index: Number(created.sortOrder),
      teacher: newTeacher,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to add teacher" });
  }
});

router.post("/faculty/reorder", requireSameOrigin, requireAdmin, (req, res) => {
  const role = String(req.body?.role || "").trim();
  const allowedRoles = new Set(["admin", "teacher", "staff"]);
  if (!allowedRoles.has(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  const order = req.body?.order;
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: "Invalid order" });
  }

  const clean = order.map(Number);
  if (!clean.every(Number.isInteger)) {
    return res.status(400).json({ error: "Order must be integer indices" });
  }
  if (new Set(clean).size !== clean.length) {
    return res.status(400).json({ error: "Order has duplicates" });
  }

  try {
    const rows = listFacultyRowsByRole(role);
    if (clean.length !== rows.length) {
      return res.status(400).json({ error: "Order length mismatch" });
    }
    if (!clean.every((i) => i >= 0 && i < rows.length)) {
      return res.status(400).json({ error: "Order contains out-of-range index" });
    }

    const orderedIds = clean.map((i) => Number(rows[i].id));
    const updateStmt = db.prepare(
      `
      UPDATE faculty_entries
      SET sortOrder = ?,
          updatedAt = datetime('now')
      WHERE id = ?
    `
    );
    const tx = db.transaction((ids) => {
      ids.forEach((id, idx) => updateStmt.run(idx, id));
    });
    tx(orderedIds);

    return res.json({ success: true });
  } catch (err) {
    console.error("faculty/reorder failed:", err);
    return res.status(500).json({ error: "Failed to reorder faculty" });
  }
});

/* Reorder Events (drag & drop)*/
router.post("/reorder-events", requireSameOrigin, requireAdmin, (req, res) => {
  const order = req.body?.order;
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: "Invalid order" });
  }

  // Must be integers and unique
  const clean = order.map(Number);
  if (!clean.every(Number.isInteger)) {
    return res.status(400).json({ error: "Order must be integer indices" });
  }
  const uniq = new Set(clean);
  if (uniq.size !== clean.length) {
    return res.status(400).json({ error: "Order has duplicates" });
  }

  try {
    const events = listEventsOrdered();

    if (clean.length !== events.length) {
      return res.status(400).json({ error: "Order length mismatch" });
    }
    if (!clean.every((i) => i >= 0 && i < events.length)) {
      return res.status(400).json({ error: "Order contains out-of-range index" });
    }

    const orderedIds = clean.map((i) => Number(events[i].id));
    const updateStmt = db.prepare(
      `
      UPDATE events
      SET sortOrder = ?,
          updatedAt = datetime('now')
      WHERE id = ?
    `
    );
    const tx = db.transaction((ids) => {
      ids.forEach((id, idx) => updateStmt.run(idx, id));
    });
    tx(orderedIds);

    res.json({ success: true });
  } catch (err) {
    console.error("reorder-events failed:", err);
    res.status(500).json({ error: "Failed to reorder events" });
  }
});


/* ADD ADMIN MEMBER */
router.post("/faculty/add-admin", requireSameOrigin, requireAdmin, (req, res) => {
  try {
    const created = insertFacultyRow("admin", {
      name: "Name",
      subject: "Administrator",
      image: FACULTY_DEFAULT_IMAGE,
    });
    const newAdmin = normalizeFacultyCard(created, "Administrator");

    res.json({
      success: true,
      index: Number(created.sortOrder),
      admin: newAdmin,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to add admin" });
  }
});

/* ADD STAFF MEMBER (NEW) */
router.post("/faculty/add-staff", requireSameOrigin, requireAdmin, (req, res) => {
  try {
    const created = insertFacultyRow("staff", {
      name: "Name",
      subject: "Staff",
      image: FACULTY_DEFAULT_IMAGE,
    });
    const newStaff = normalizeFacultyCard(created, "Staff");

    res.json({
      success: true,
      index: Number(created.sortOrder),
      staff: newStaff,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to add staff" });
  }
});

/* Update Teacher / Principal / Staff*/
router.post("/faculty/update", requireSameOrigin, requireAdmin, (req, res) => {
  const role = String(req.body?.role || "");
  const name = clampString(req.body?.name, 120);
  const subject = clampString(req.body?.subject, 120);
  const image = clampString(req.body?.image, 300);

  //Only allow site-relative image paths under /images/
  if (image && !image.startsWith("/images/")) {
    return res.status(400).json({ error: "Invalid image path" });
  }

  try {
    if (role === "principal") {
      const principal = ensurePrincipalRow();
      const next = {
        id: Number(principal.id),
        name: name || String(principal.name || "Name"),
        subject: subject || String(principal.subject || "Principal"),
        image: image || String(principal.image || FACULTY_DEFAULT_IMAGE),
      };
      db.prepare(
        `
        UPDATE faculty_entries
        SET name = @name,
            subject = @subject,
            image = @image,
            updatedAt = datetime('now')
        WHERE id = @id
      `
      ).run(next);
      return res.json({ success: true, principal: normalizeFacultyCard(next, "Principal") });
    }

    if (role === "teacher") {
      const i = parseIndex(req.body?.index);
      if (i === null) return res.status(400).json({ error: "Invalid index" });
      const row = getFacultyRowByRoleIndex("teacher", i);
      if (!row) return res.status(404).json({ error: "Teacher not found" });
      const next = {
        id: Number(row.id),
        name: name || String(row.name || "Name"),
        subject: subject || String(row.subject || "Subject"),
        image: image || String(row.image || FACULTY_DEFAULT_IMAGE),
      };
      db.prepare(
        `
        UPDATE faculty_entries
        SET name = @name,
            subject = @subject,
            image = @image,
            updatedAt = datetime('now')
        WHERE id = @id
      `
      ).run(next);
      return res.json({
        success: true,
        teacher: normalizeFacultyCard(next, "Subject"),
        index: i,
      });
    }

    if (role === "staff") {
      const i = parseIndex(req.body?.index);
      if (i === null) return res.status(400).json({ error: "Invalid index" });
      const row = getFacultyRowByRoleIndex("staff", i);
      if (!row) return res.status(404).json({ error: "Staff not found" });
      const next = {
        id: Number(row.id),
        name: name || String(row.name || "Name"),
        subject: subject || String(row.subject || "Staff"),
        image: image || String(row.image || FACULTY_DEFAULT_IMAGE),
      };
      db.prepare(
        `
        UPDATE faculty_entries
        SET name = @name,
            subject = @subject,
            image = @image,
            updatedAt = datetime('now')
        WHERE id = @id
      `
      ).run(next);
      return res.json({
        success: true,
        staff: normalizeFacultyCard(next, "Staff"),
        index: i,
      });
    }

    res.status(400).json({ error: "Invalid role" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update faculty" });
  }
});

/* UPDATE ADMIN MEMBER*/
router.post("/faculty/update-admin", requireSameOrigin, requireAdmin, (req, res) => {
  const i = parseIndex(req.body?.index);
  if (i === null) return res.status(400).json({ error: "Invalid index" });

  const name = clampString(req.body?.name, 120);
  const subject = clampString(req.body?.subject, 120);
  const image = clampString(req.body?.image, 300);

  if (image && !image.startsWith("/images/")) {
    return res.status(400).json({ error: "Invalid image path" });
  }

  try {
    const row = getFacultyRowByRoleIndex("admin", i);
    if (!row) return res.status(404).json({ error: "Admin not found" });
    const next = {
      id: Number(row.id),
      name: name || String(row.name || "Name"),
      subject: subject || String(row.subject || "Administrator"),
      image: image || String(row.image || FACULTY_DEFAULT_IMAGE),
    };
    db.prepare(
      `
      UPDATE faculty_entries
      SET name = @name,
          subject = @subject,
          image = @image,
          updatedAt = datetime('now')
      WHERE id = @id
    `
    ).run(next);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update admin" });
  }
});

/*DELETE TEACHER */
router.post("/faculty/delete", requireSameOrigin, requireAdmin, (req, res) => {
  const i = parseIndex(req.body?.index);
  if (i === null) return res.status(400).json({ error: "Invalid index" });

  try {
    const row = getFacultyRowByRoleIndex("teacher", i);
    if (!row) return res.status(404).json({ error: "Teacher not found" });
    db.prepare("DELETE FROM faculty_entries WHERE id = ?").run(Number(row.id));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete teacher" });
  }
});

/* DELETE ADMIN MEMBER*/
router.post("/faculty/delete-admin", requireSameOrigin, requireAdmin, (req, res) => {
  const i = parseIndex(req.body?.index);
  if (i === null) return res.status(400).json({ error: "Invalid index" });

  try {
    const row = getFacultyRowByRoleIndex("admin", i);
    if (!row) return res.status(404).json({ error: "Admin not found" });
    db.prepare("DELETE FROM faculty_entries WHERE id = ?").run(Number(row.id));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete admin" });
  }
});

/* DELETE STAFF MEMBER (NEW) */
router.post("/faculty/delete-staff", requireSameOrigin, requireAdmin, (req, res) => {
  const i = parseIndex(req.body?.index);
  if (i === null) return res.status(400).json({ error: "Invalid index" });

  try {
    const row = getFacultyRowByRoleIndex("staff", i);
    if (!row) return res.status(404).json({ error: "Staff not found" });
    db.prepare("DELETE FROM faculty_entries WHERE id = ?").run(Number(row.id));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete staff" });
  }
});

/* Faculty image upload */
const facultyUploadDir = path.resolve(process.cwd(), "public/images/faculty");
if (!fs.existsSync(facultyUploadDir))
  fs.mkdirSync(facultyUploadDir, { recursive: true });

const facultyStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, facultyUploadDir),
  filename: (req, file, cb) => cb(null, safeRandomFilename(file.originalname)),
});

const uploadFaculty = multer({
  storage: facultyStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 3 * 1024 * 1024 }, //3MB
});

router.post(
  "/faculty/upload-image",
  requireSameOrigin,
  requireAdmin,
  uploadFaculty.single("image"),
  (req, res) => {
    const role = String(req.body?.role || "");
    const idx = role === "principal" ? 0 : parseIndex(req.body?.index);
    if (role !== "principal" && idx === null) {
      return res.status(400).json({ error: "Invalid index" });
    }

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      if (!hasValidImageSignature(req.file.path, req.file.mimetype)) {
        try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(400).json({ error: "Invalid image content" });
      }

      const rel = `/images/faculty/${req.file.filename}`;

      if (role === "principal") {
        const principal = ensurePrincipalRow();
        db.prepare(
          `
          UPDATE faculty_entries
          SET image = ?,
              updatedAt = datetime('now')
          WHERE id = ?
        `
        ).run(rel, Number(principal.id));
        return res.json({ success: true, image: rel });
      }

      if (role === "teacher") {
        const row = getFacultyRowByRoleIndex("teacher", Number(idx));
        if (!row) return res.status(404).json({ error: "Teacher not found" });
        db.prepare(
          `
          UPDATE faculty_entries
          SET image = ?,
              updatedAt = datetime('now')
          WHERE id = ?
        `
        ).run(rel, Number(row.id));
        return res.json({ success: true, image: rel });
      }

      if (role === "admin") {
        const row = getFacultyRowByRoleIndex("admin", Number(idx));
        if (!row) return res.status(404).json({ error: "Admin not found" });
        db.prepare(
          `
          UPDATE faculty_entries
          SET image = ?,
              updatedAt = datetime('now')
          WHERE id = ?
        `
        ).run(rel, Number(row.id));
        return res.json({ success: true, image: rel });
      }

      if (role === "staff") {
        const row = getFacultyRowByRoleIndex("staff", Number(idx));
        if (!row) return res.status(404).json({ error: "Staff not found" });
        db.prepare(
          `
          UPDATE faculty_entries
          SET image = ?,
              updatedAt = datetime('now')
          WHERE id = ?
        `
        ).run(rel, Number(row.id));
        return res.json({ success: true, image: rel });
      }

      res.status(400).json({ error: "Invalid role" });
    } catch (err) {
      res.status(500).json({ error: "Failed to upload faculty image" });
    }
  }
);



function normalizeSuggestion(body) {
  const page = clampString(body?.page, 60);
  const changeType = clampString(body?.changeType, 30);

  let fromText = clampString(body?.fromText, 400) ?? "";
  let toText = clampString(body?.toText, 400) ?? "";
  let description = clampString(body?.description, 2000) ?? "";

  // Basic allow-list for changeType
  const allowedTypes = new Set(["wording", "content", "design", "fix", "other"]);
  if (!allowedTypes.has(String(changeType || ""))) return { error: "Invalid changeType" };

  // If wording, require from/to; else require description
  if (changeType === "wording") {
    description = "";
    if (!fromText.trim() || !toText.trim()) return { error: "Wording changes require From and To" };
  } else {
    fromText = "";
    toText = "";
    if (!description.trim()) return { error: "Description is required" };
  }

  if (!page || !page.trim()) return { error: "Page is required" };

  return { page: page.trim(), changeType, fromText, toText, description };
}

/* GET /admin/suggestions  (admin-only)*/
router.get("/suggestions", requireAdmin, (req, res) => {
  try {
    res.set("Cache-Control", "no-store");

    const rows = db
      .prepare(
        `
        SELECT id, page, changeType, fromText, toText, description, status, createdAt
        FROM suggestions
        ORDER BY datetime(createdAt) DESC
        `
      )
      .all();

    res.json(rows);
  } catch (err) {
    console.error("GET /admin/suggestions failed:", err);
    res.status(500).json({ error: "Failed to load suggestions" });
  }
});

/*  PATCH /admin/suggestions/:id  (status: new / in_progress / done) */
router.patch("/suggestions/:id", requireSameOrigin, requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Bad id" });

    const status = String(req.body?.status || "").trim();
    const allowed = new Set(["new", "in_progress", "done"]);
    if (!allowed.has(status)) return res.status(400).json({ error: "Bad status" });

    const info = db.prepare(`UPDATE suggestions SET status = ? WHERE id = ?`).run(status, id);
    if (info.changes === 0) return res.status(404).json({ error: "Not found" });

    res.json({ success: true });
  } catch (err) {
    console.error("PATCH /admin/suggestions/:id failed:", err);
    res.status(500).json({ error: "Failed to update suggestion" });
  }
});

/* DELETE /admin/suggestions/:id*/
router.delete("/suggestions/:id", requireSameOrigin, requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Bad id" });

    const info = db.prepare(`DELETE FROM suggestions WHERE id = ?`).run(id);
    if (info.changes === 0) return res.status(404).json({ error: "Not found" });

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /admin/suggestions/:id failed:", err);
    res.status(500).json({ error: "Failed to delete suggestion" });
  }
});

/* /admin/suggestions  (admin-only)*/
router.post("/suggestions", requireSameOrigin, requireAdmin, (req, res) => {
  try {
    const cleaned = normalizeSuggestion(req.body);
    if (cleaned.error) return res.status(400).json({ error: cleaned.error });

    const stmt = db.prepare(`
      INSERT INTO suggestions (page, changeType, fromText, toText, description, status)
      VALUES (@page, @changeType, @fromText, @toText, @description, 'new')
    `);

    const info = stmt.run(cleaned);

    res.json({ success: true, id: info.lastInsertRowid });
  } catch (err) {
    console.error("POST /admin/suggestions failed:", err);
    res.status(500).json({ error: "Failed to save suggestion" });
  }
});

/* ------------------------------------------------------
   EXPORT ROUTER
------------------------------------------------------ */
export default router;
