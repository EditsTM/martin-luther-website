/**
 * File: server\routes\contentRoutes.js
 * Purpose: Defines HTTP route handlers and request validation for contentRoutes operations.
 */
//server/routes/contentRoutes.js
import express from "express";
import { enforceTrustedOrigin } from "../middleware/requestSecurity.js";
import { db } from "../db/suggestionsDb.js";

const router = express.Router();

const requireSameOrigin = enforceTrustedOrigin({ allowNoOrigin: false });

//Minimal schema-ish validation to prevent saving garbage / huge content
function validateEventsPayload(req, res, next) {
  const body = req.body;

  // Must be an object
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  // Optional: expect body.events to be an array (common structure)
  if ("events" in body && !Array.isArray(body.events)) {
    return res.status(400).json({ error: "Invalid events format" });
  }

  //Prevent very large saves (DoS-ish) without changing your functionality
  // (If you have bigger files, bump this number)
  const jsonString = JSON.stringify(body);
  const MAX_BYTES = 200 * 1024; // 200KB
  if (Buffer.byteLength(jsonString, "utf8") > MAX_BYTES) {
    return res.status(413).json({ error: "Payload too large" });
  }

  return next();
}

function normalizeEventRow(row) {
  return {
    title: String(row?.title ?? ""),
    date: String(row?.date ?? ""),
    description: String(row?.description ?? ""),
    image: String(row?.image ?? ""),
    notes: String(row?.notes ?? ""),
  };
}

function fetchEventsOrdered() {
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

function defaultFooterTimeSettings() {
  return {
    note: "*Summer hours vary*",
    lineOne: "Sundays - 8am & 10:30am",
    lineTwo: "Mondays - 6pm",
  };
}

/* ======================================================
   ROUTES
====================================================== */

// 🟢 Publicly serve events in the same JSON shape as before.
router.get("/events.json", (req, res) => {
  try {
    const events = fetchEventsOrdered().map((row) => normalizeEventRow(row));
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.json({ events });
  } catch (err) {
    console.error("Failed to load events:", err);
    return res.status(500).json({ error: "Failed to load events" });
  }
});

router.get("/service-times.json", (req, res) => {
  try {
    const cards = db
      .prepare(
        `
        SELECT id, title, note, isAdminOnly, sortOrder
        FROM service_time_cards
        ORDER BY sortOrder ASC, id ASC
      `
      )
      .all();

    if (!Array.isArray(cards) || cards.length === 0) {
      return res.json({ cards: [] });
    }

    const sections = db
      .prepare(
        `
        SELECT id, cardId, label, timeText, sortOrder
        FROM service_time_sections
        ORDER BY cardId ASC, sortOrder ASC, id ASC
      `
      )
      .all();

    const cardsOut = cards.map((card) => ({
      id: Number(card.id),
      title: String(card.title || "Service Times"),
      note: String(card.note || ""),
      isAdminOnly: !!Number(card.isAdminOnly),
      sections: sections
        .filter((s) => Number(s.cardId) === Number(card.id))
        .map((s) => ({
          id: Number(s.id),
          label: String(s.label || ""),
          timeText: String(s.timeText || ""),
        })),
    }));

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.json({ cards: cardsOut });
  } catch (err) {
    console.error("Failed to load service times:", err);
    return res.status(500).json({ error: "Failed to load service times" });
  }
});

router.get("/footer-time.json", (req, res) => {
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

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.json(out);
  } catch (err) {
    console.error("Failed to load footer time:", err);
    return res.status(500).json({ error: "Failed to load footer time" });
  }
});

// 🔒 Admin can replace full events payload in DB (legacy endpoint kept same).
router.post(
  "/events.json",
  requireSameOrigin,
  validateEventsPayload,
  (req, res) => {
    if (!req.session || !req.session.isAdmin) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const listIn = Array.isArray(req.body?.events) ? req.body.events : [];
    const rows = listIn.map((ev, idx) => ({
      title: String(ev?.title ?? "").slice(0, 120),
      date: String(ev?.date ?? "").slice(0, 80),
      description: String(ev?.description ?? "").slice(0, 2000),
      image: String(ev?.image ?? "").slice(0, 300),
      notes: String(ev?.notes ?? "").slice(0, 12000),
      sortOrder: idx,
    }));

    try {
      db.transaction(() => {
        db.prepare("DELETE FROM events").run();
        if (!rows.length) return;

        const insert = db.prepare(
          `
          INSERT INTO events (title, date, description, image, notes, sortOrder, updatedAt)
          VALUES (@title, @date, @description, @image, @notes, @sortOrder, datetime('now'))
        `
        );
        rows.forEach((row) => insert.run(row));
      })();
      return res.json({ success: true });
    } catch (err) {
      console.error("[ERROR] Error writing events:", err);
      return res.status(500).json({ error: "Failed to save content" });
    }
  }
);

export default router;
