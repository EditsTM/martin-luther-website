/**
 * File: server\routes\teamRoutes.js
 * Purpose: Defines HTTP route handlers and request validation for teamRoutes operations.
 */
// server/routes/teamRoutes.js
import express from "express";
import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";
import multer from "multer";
import { enforceTrustedOrigin } from "../middleware/requestSecurity.js";
import { hasValidImageSignature } from "../middleware/uploadValidation.js";
import { db } from "../db/suggestionsDb.js";

const router = express.Router();

// Upload directory for team images (public/images/team)
const publicDir = path.join(process.cwd(), "public");
const uploadDir = path.join(publicDir, "images", "team");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.isAdmin) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  next();
}

const requireSameOrigin = enforceTrustedOrigin({ allowNoOrigin: false });

const LIMITS = {
  name: 80,
  subject: 120,
  bioTotal: 24000,
};

function cleanString(v, max) {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  if (s.length === 0) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeBioText(bio) {
  if (bio === undefined) return undefined;
  const raw = Array.isArray(bio)
    ? bio.map((p) => String(p ?? "")).join("\n\n")
    : String(bio ?? "");
  const normalized = raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "");
  return normalized.length > LIMITS.bioTotal
    ? normalized.slice(0, LIMITS.bioTotal)
    : normalized;
}

function listTeamRows() {
  return db
    .prepare(
      `
      SELECT id, name, subject, image, bio, sortOrder
      FROM team_members
      ORDER BY sortOrder ASC, id ASC
    `
    )
    .all();
}

function teamPayloadFromDb() {
  const team = listTeamRows().map((row) => ({
    name: String(row?.name ?? "Name"),
    subject: String(row?.subject ?? "Pastor"),
    image: String(row?.image ?? "/images/Placeholder.jpg"),
    bio: String(row?.bio ?? ""),
  }));
  return { team };
}

function getTeamRowByIndex(index) {
  const rows = listTeamRows();
  if (!Number.isInteger(index) || index < 0 || index >= rows.length) return null;
  return rows[index];
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = String(file.originalname || "upload")
      .toLowerCase()
      .replace(/[^a-z0-9.\-_]/g, "_")
      .slice(0, 120);

    const timestamp = Date.now();
    cb(null, `${timestamp}_${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    if (!allowed.has(file.mimetype)) {
      return cb(new Error("Invalid file type"));
    }
    cb(null, true);
  },
});

function multerErrorHandler(err, req, res, next) {
  if (!err) return next();
  return res.status(400).json({ success: false, error: err.message || "Upload failed" });
}

router.get("/", (req, res) => {
  try {
    const data = teamPayloadFromDb();
    res.json(data);
  } catch (err) {
    console.error("Error reading team data", err);
    res.status(500).json({ error: "Failed to read team data" });
  }
});

router.post("/", requireSameOrigin, requireAdmin, (req, res) => {
  try {
    const name = cleanString(req.body?.name, LIMITS.name);
    const subject = cleanString(req.body?.subject, LIMITS.subject);
    const image = cleanString(req.body?.image, 300);
    const bio = normalizeBioText(req.body?.bio);

    if (!name || !subject) {
      return res.status(400).json({ error: "name and subject are required fields" });
    }
    if (image && !image.startsWith("/images/")) {
      return res.status(400).json({ error: "Invalid image path" });
    }

    const count = db.prepare("SELECT COUNT(*) AS count FROM team_members").get()?.count;
    const sortOrder = Number(count || 0);

    db.prepare(
      `
      INSERT INTO team_members (name, subject, image, bio, sortOrder, updatedAt)
      VALUES (@name, @subject, @image, @bio, @sortOrder, datetime('now'))
    `
    ).run({
      name,
      subject,
      image: image || "/images/Placeholder.jpg",
      bio: bio ?? "",
      sortOrder,
    });

    res.json(teamPayloadFromDb());
  } catch (err) {
    console.error("Error adding team member", err);
    res.status(500).json({ error: "Failed to add team member" });
  }
});

router.put("/:index", requireSameOrigin, requireAdmin, (req, res) => {
  try {
    const idx = Number.parseInt(req.params.index, 10);
    const row = getTeamRowByIndex(idx);

    if (!row) return res.status(400).json({ error: "Invalid member index" });

    const next = {
      id: Number(row.id),
      name: req.body?.name !== undefined ? cleanString(req.body.name, LIMITS.name) : String(row.name ?? ""),
      subject:
        req.body?.subject !== undefined
          ? cleanString(req.body.subject, LIMITS.subject)
          : String(row.subject ?? ""),
      image: String(row.image ?? "/images/Placeholder.jpg"),
      bio: req.body?.bio !== undefined ? normalizeBioText(req.body.bio) ?? "" : String(row.bio ?? ""),
    };

    if (req.body?.image !== undefined) {
      const img = cleanString(req.body.image, 300);
      if (img && !img.startsWith("/images/")) {
        return res.status(400).json({ error: "Invalid image path" });
      }
      next.image = img || "/images/Placeholder.jpg";
    }

    db.prepare(
      `
      UPDATE team_members
      SET name = @name,
          subject = @subject,
          image = @image,
          bio = @bio,
          updatedAt = datetime('now')
      WHERE id = @id
    `
    ).run(next);

    res.json(teamPayloadFromDb());
  } catch (err) {
    console.error("Error updating team member", err);
    res.status(500).json({ error: "Failed to update team member" });
  }
});

router.delete("/:index", requireSameOrigin, requireAdmin, (req, res) => {
  try {
    const idx = Number.parseInt(req.params.index, 10);
    const row = getTeamRowByIndex(idx);

    if (!row) return res.status(400).json({ error: "Invalid member index" });

    db.prepare("DELETE FROM team_members WHERE id = ?").run(Number(row.id));
    res.json(teamPayloadFromDb());
  } catch (err) {
    console.error("Error deleting team member", err);
    res.status(500).json({ error: "Failed to delete team member" });
  }
});

router.post(
  "/upload-image",
  requireSameOrigin,
  requireAdmin,
  upload.single("image"),
  multerErrorHandler,
  async (req, res) => {
    try {
      const idx = Number.parseInt(req.body?.index, 10);

      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded" });
      }

      if (!hasValidImageSignature(req.file.path, req.file.mimetype)) {
        try { await fsp.unlink(req.file.path); } catch {}
        return res.status(400).json({ success: false, error: "Invalid image content" });
      }

      const row = getTeamRowByIndex(idx);
      if (!row) {
        try { await fsp.unlink(req.file.path); } catch {}
        return res.status(400).json({ success: false, error: "Invalid member index" });
      }

      const relPath = `images/team/${req.file.filename}`;
      db.prepare(
        `
        UPDATE team_members
        SET image = ?,
            updatedAt = datetime('now')
        WHERE id = ?
      `
      ).run("/" + relPath, Number(row.id));

      res.json({ success: true, image: relPath });
    } catch (err) {
      console.error("Error uploading team image:", err);
      res.status(500).json({ success: false, error: "Failed to upload team image" });
    }
  }
);

export default router;
