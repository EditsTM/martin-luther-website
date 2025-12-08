// server/routes/teamRoutes.js
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer"; // ✅ requires `npm install multer`

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Path to server/content/team.json
const TEAM_PATH = path.join(__dirname, "../content/team.json");

// ✅ Upload directory for team images (public/images/team)
const publicDir = path.join(process.cwd(), "public");
const uploadDir = path.join(publicDir, "images", "team");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ✅ Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname
      .toLowerCase()
      .replace(/[^a-z0-9.\-_]/g, "_");
    const timestamp = Date.now();
    cb(null, `${timestamp}_${safeName}`);
  },
});

const upload = multer({ storage });

// Helpers
function readTeam() {
  const raw = fs.readFileSync(TEAM_PATH, "utf8");
  return JSON.parse(raw);
}

function writeTeam(data) {
  fs.writeFileSync(TEAM_PATH, JSON.stringify(data, null, 2), "utf8");
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
router.post("/", (req, res) => {
  try {
    const { name, subject, image, bio } = req.body;

    if (!name || !subject) {
      return res
        .status(400)
        .json({ error: "name and subject are required fields" });
    }

    const data = readTeam();
    const newMember = {
      name,
      subject,
      image: image || "/images/Placeholder.jpg",
      bio: Array.isArray(bio)
        ? bio
        : (bio || "")
            .split("\n\n")
            .map((p) => p.trim())
            .filter((p) => p.length > 0),
    };

    data.team.push(newMember);
    writeTeam(data);

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
router.put("/:index", (req, res) => {
  try {
    const idx = parseInt(req.params.index, 10);
    const { name, subject, image, bio } = req.body;

    const data = readTeam();

    if (Number.isNaN(idx) || idx < 0 || idx >= data.team.length) {
      return res.status(400).json({ error: "Invalid member index" });
    }

    const member = data.team[idx];

    if (name !== undefined) member.name = name;
    if (subject !== undefined) member.subject = subject;
    if (image !== undefined) member.image = image;
    if (bio !== undefined) {
      member.bio = Array.isArray(bio)
        ? bio
        : (bio || "")
            .split("\n\n")
            .map((p) => p.trim())
            .filter((p) => p.length > 0);
    }

    writeTeam(data);
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
router.delete("/:index", (req, res) => {
  try {
    const idx = parseInt(req.params.index, 10);
    const data = readTeam();

    if (Number.isNaN(idx) || idx < 0 || idx >= data.team.length) {
      return res.status(400).json({ error: "Invalid member index" });
    }

    data.team.splice(idx, 1);
    writeTeam(data);

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
router.post("/upload-image", upload.single("image"), (req, res) => {
  try {
    const idx = parseInt(req.body.index, 10);

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, error: "No file uploaded" });
    }

    const data = readTeam();

    if (Number.isNaN(idx) || idx < 0 || idx >= data.team.length) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid member index" });
    }

    const relPath = `images/team/${req.file.filename}`;
    data.team[idx].image = "/" + relPath;

    writeTeam(data);

    res.json({ success: true, image: relPath });
  } catch (err) {
    console.error("Error uploading team image:", err);
    res
      .status(500)
      .json({ success: false, error: "Failed to upload team image" });
  }
});

export default router;
