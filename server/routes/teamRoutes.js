/**
 * File: server\routes\teamRoutes.js
 * Purpose: Defines HTTP route handlers and request validation for teamRoutes operations.
 */
//server/routes/teamRoutes.js
import express from "express";
import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { enforceTrustedOrigin } from "../middleware/requestSecurity.js";
import { hasValidImageSignature } from "../middleware/uploadValidation.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//Path to server/content/team.json
const TEAM_PATH = path.join(__dirname, "../content/team.json");

//Upload directory for team images (public/images/team)
const publicDir = path.join(process.cwd(), "public");
const uploadDir = path.join(publicDir, "images", "team");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}


//Admin guard (same concept as your other routes)
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

  // [OK] CHANGE: store bio as ONE string; cap total size only
  bioTotal: 24000,
};

// [OK] Normalize/validate strings (prevents huge payloads + downstream XSS risk)
function cleanString(v, max) {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  if (s.length === 0) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeBio(bio) {
  if (bio === undefined) return undefined;

  const keepIndent = (s) =>
    String(s ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+$/gm, "");

  let parts = [];
  if (Array.isArray(bio)) {
    parts = bio.map((p) => keepIndent(p));
  } else {
    parts = String(bio ?? "")
      .replace(/\r\n/g, "\n")
      .split("\n\n")
      .map((p) => keepIndent(p));
  }

  parts = parts.filter((p) => p.length > 0).slice(0, LIMITS.bioParagraphs);
  parts = parts.map((p) =>
    p.length > LIMITS.bioParagraphLen ? p.slice(0, LIMITS.bioParagraphLen) : p
  );

  // keep your total limit logic the same
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  if (total > LIMITS.bioTotal) {
    let remaining = LIMITS.bioTotal;
    const trimmed = [];
    for (const p of parts) {
      if (remaining <= 0) break;
      const take = Math.min(p.length, remaining);
      trimmed.push(p.slice(0, take));
      remaining -= take;
    }
    return trimmed.filter((p) => p.length > 0);
  }

  return parts;
}


// [OK] Atomic JSON write to avoid partial/corrupt file
async function atomicWriteJson(filePath, dataObj) {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(
    dir,
    `.tmp-${path.basename(filePath)}-${process.pid}-${Date.now()}`
  );
  const json = JSON.stringify(dataObj, null, 2);
  await fsp.writeFile(tmpPath, json, "utf8");
  await fsp.rename(tmpPath, filePath);
}

// [OK] Read team.json safely
function readTeam() {
  const raw = fs.readFileSync(TEAM_PATH, "utf8");
  const parsed = JSON.parse(raw);
  // Ensure shape doesn't explode your code
  if (!parsed || typeof parsed !== "object") return { team: [] };
  if (!Array.isArray(parsed.team)) parsed.team = [];
  return parsed;
}

// [OK] Multer storage config (safe filenames)
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

// [OK] Upload restrictions (blocks dangerous types + disk fill)
const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    // Block SVG (common stored XSS vector) + only allow common raster formats
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    if (!allowed.has(file.mimetype)) {
      return cb(new Error("Invalid file type"));
    }
    cb(null, true);
  },
});

// [OK] Friendly multer error handler (so invalid files don't crash / leak stack)
function multerErrorHandler(err, req, res, next) {
  if (!err) return next();
  return res.status(400).json({ success: false, error: err.message || "Upload failed" });
}

/* =========================
   PUBLIC: GET TEAM
   GET /api/team  (mounted in server.js)
========================= */
router.get("/", (req, res) => {
  try {
    const data = readTeam();
    res.json(data);
  } catch (err) {
    console.error("Error reading team.json", err);
    res.status(500).json({ error: "Failed to read team data" });
  }
});

/* =========================
   ADMIN: ADD MEMBER
   POST /api/team
   body: { name, subject, image, bio }
========================= */
router.post("/", requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const name = cleanString(req.body?.name, LIMITS.name);
    const subject = cleanString(req.body?.subject, LIMITS.subject);
    const image = cleanString(req.body?.image, 300);
    const bio = normalizeBio(req.body?.bio);

    if (!name || !subject) {
      return res.status(400).json({ error: "name and subject are required fields" });
    }

    const data = readTeam();

    const newMember = {
      name,
      subject,
      image: image || "/images/Placeholder.jpg",

      // [OK] CHANGE: bio is a STRING now (not an array)
      bio: bio ?? "",
    };

    data.team.push(newMember);
    await atomicWriteJson(TEAM_PATH, data);

    res.json(data);
  } catch (err) {
    console.error("Error adding team member", err);
    res.status(500).json({ error: "Failed to add team member" });
  }
});

/* =========================
   ADMIN: UPDATE MEMBER
   PUT /api/team/:index
========================= */
router.put("/:index", requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const idx = parseInt(req.params.index, 10);
    const data = readTeam();

    if (Number.isNaN(idx) || idx < 0 || idx >= data.team.length) {
      return res.status(400).json({ error: "Invalid member index" });
    }

    const member = data.team[idx];

    if (req.body?.name !== undefined) member.name = cleanString(req.body.name, LIMITS.name);
    if (req.body?.subject !== undefined) member.subject = cleanString(req.body.subject, LIMITS.subject);

    // Only allow local image paths (prevents javascript: / weird schemes)
    if (req.body?.image !== undefined) {
      const img = cleanString(req.body.image, 300);
      if (img && !img.startsWith("/images/")) {
        return res.status(400).json({ error: "Invalid image path" });
      }
      member.image = img || "/images/Placeholder.jpg";
    }

    if (req.body?.bio !== undefined) {
      // [OK] CHANGE: store as STRING
      member.bio = normalizeBio(req.body.bio) ?? "";
    }

    await atomicWriteJson(TEAM_PATH, data);
    res.json(data);
  } catch (err) {
    console.error("Error updating team member", err);
    res.status(500).json({ error: "Failed to update team member" });
  }
});

/* =========================
   ADMIN: DELETE MEMBER
   DELETE /api/team/:index
========================= */
router.delete("/:index", requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const idx = parseInt(req.params.index, 10);
    const data = readTeam();

    if (Number.isNaN(idx) || idx < 0 || idx >= data.team.length) {
      return res.status(400).json({ error: "Invalid member index" });
    }

    data.team.splice(idx, 1);
    await atomicWriteJson(TEAM_PATH, data);

    res.json(data);
  } catch (err) {
    console.error("Error deleting team member", err);
    res.status(500).json({ error: "Failed to delete team member" });
  }
});

/* =========================
   ADMIN: UPLOAD IMAGE
   POST /api/team/upload-image
   form-data: image (file), index (number)
========================= */
router.post(
  "/upload-image",
  requireSameOrigin,
  requireAdmin,
  upload.single("image"),
  multerErrorHandler,
  async (req, res) => {
    try {
      const idx = parseInt(req.body?.index, 10);

      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded" });
      }

      if (!hasValidImageSignature(req.file.path, req.file.mimetype)) {
        try { await fsp.unlink(req.file.path); } catch {}
        return res.status(400).json({ success: false, error: "Invalid image content" });
      }

      const data = readTeam();

      if (Number.isNaN(idx) || idx < 0 || idx >= data.team.length) {
        // Cleanup uploaded file if index is invalid
        try { await fsp.unlink(req.file.path); } catch {}
        return res.status(400).json({ success: false, error: "Invalid member index" });
      }

      const relPath = `images/team/${req.file.filename}`;
      data.team[idx].image = "/" + relPath;

      await atomicWriteJson(TEAM_PATH, data);

      res.json({ success: true, image: relPath });
    } catch (err) {
      console.error("Error uploading team image:", err);
      res.status(500).json({ success: false, error: "Failed to upload team image" });
    }
  }
);

export default router;
