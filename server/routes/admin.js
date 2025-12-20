// ✅ server/routes/admin.js
import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import crypto from "crypto";

dotenv.config();

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ======================================================
   ✅ SECURITY HELPERS
====================================================== */

// ✅ Fail closed if ADMIN_PASSWORD isn't set (no insecure fallback)
if (!process.env.ADMIN_PASSWORD) {
  throw new Error("❌ ADMIN_PASSWORD is missing. Refusing to start for safety.");
}
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// ✅ Rate-limit login attempts (basic brute-force protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
});

// ✅ Timing-safe password compare (reduces timing leakage)
function timingSafeEqualString(a, b) {
  const aBuf = Buffer.from(String(a ?? ""), "utf8");
  const bBuf = Buffer.from(String(b ?? ""), "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// ✅ Simple same-origin CSRF guard for POSTs (works well with cookie sessions)
// Note: This assumes your site runs over https in production.
function requireSameOrigin(req, res, next) {
  const origin = req.get("origin");
  const host = req.get("host");

  // If no Origin header (some same-origin requests), allow.
  if (!origin) return next();

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: "Bad Origin" });
  }

  if (originHost !== host) {
    return res.status(403).json({ error: "CSRF blocked (origin mismatch)" });
  }

  next();
}

// ✅ Auth guard
function requireAdmin(req, res, next) {
  if (!req.session?.loggedIn) return res.status(403).json({ error: "Unauthorized" });
  next();
}

// ✅ Strict index parsing (prevents weird keys like "__proto__")
function parseIndex(val) {
  const i = Number(val);
  if (!Number.isInteger(i) || i < 0) return null;
  return i;
}

// ✅ Basic string length limits to prevent abuse / huge payloads
function clampString(val, maxLen) {
  if (val == null) return null;
  const s = String(val);
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/* ======================================================
   ✅ UPLOAD HARDENING (EVENTS + FACULTY)
====================================================== */

const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function imageFileFilter(req, file, cb) {
  // ✅ Block SVG (common XSS vector if served as image/svg+xml)
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

/* ------------------------------------------------------
   🏠 Admin Login Page
------------------------------------------------------ */
router.get("/login", (req, res) => {
  if (req.session.loggedIn) {
    return res.redirect("/admin/dashboard");
  }
  res.sendFile(path.join(__dirname, "../../public/html/school/admin.html"));
});

/* ------------------------------------------------------
   🔐 Handle Login
------------------------------------------------------ */
router.post("/login", loginLimiter, (req, res) => {
  const { password } = req.body;

  if (timingSafeEqualString(password, ADMIN_PASSWORD)) {
    req.session.loggedIn = true;

    // ✅ (Keeps your existing UX behavior)
    return res.send(`
      <script>
        localStorage.setItem('isAdmin', 'true');
        window.location.href = '/admin/dashboard';
      </script>
    `);
  }

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
          <input type="password" name="password" placeholder="Enter Password" required />
          <button type="submit">Login</button>
        </form>

        <div class="error-msg">❌ Incorrect password. Please try again.</div>
        <a href="/html/home.html" class="back-link">← Back to Home</a>
      </div>
    </div>
  </section>

  <div id="footer"></div>
  <script src="/js/header.js"></script>
  <script src="/js/footer.js"></script>
</body>
</html>
  `;

  res.status(401).send(errorHTML);
});

/* ------------------------------------------------------
   🧩 Protected Dashboard
------------------------------------------------------ */
router.get("/dashboard", (req, res) => {
  if (!req.session.loggedIn) return res.redirect("/admin/login");

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Dashboard</title>
  <link rel="stylesheet" href="/css/school/admin.css" />
  <link rel="stylesheet" href="/css/header.css" />
  <link rel="stylesheet" href="/css/footer.css" />
</head>
<body>
  <div id="header"></div>

  <section class="admin-hero">
    <div class="admin-overlay">
      <div class="login-card">
        <h1>Welcome, Admin!</h1>
        <p>Use the options below to manage website content.</p>

        <a href="/html/school/faculty.html" class="btn">Manage Faculty</a>
        <br><br>
        <a href="/html/church/team.html" class="btn">Manage Pastors</a>
        <br><br>
        <a href="/html/church/events.html" class="btn">Manage Events</a>
        <br><br>
        <a href="/admin/logout" class="btn logout-btn">Logout</a>

      </div>
    </div>
  </section>

  <div id="footer"></div>
  <script src="/js/header.js"></script>
  <script src="/js/footer.js"></script>
  <script src="/js/adminSession.js"></script>
</body>
</html>
  `);
});

/* ------------------------------------------------------
   🚪 Logout (POST) — for fetch() / idle timeout
------------------------------------------------------ */
router.post("/logout", requireSameOrigin, (req, res) => {
  if (!req.session) return res.status(200).json({ ok: true });

  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

/* ------------------------------------------------------
   🚪 Logout
------------------------------------------------------ */
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.send(`
      <script>
        localStorage.removeItem('isAdmin');
        window.location.href = '/admin/login';
      </script>
    `);
  });
});

/* ------------------------------------------------------
   🧠 Session Check Endpoint
------------------------------------------------------ */
router.get("/check", (req, res) => {
  res.json({ loggedIn: !!req.session.loggedIn });
});

/* ------------------------------------------------------
   🧩 Update Event Title/Date/Image/Notes
------------------------------------------------------ */
router.post("/update-event", requireSameOrigin, requireAdmin, (req, res) => {
  const filePath = path.resolve(process.cwd(), "server/content/events.json");

  const i = parseIndex(req.body?.index);
  if (i === null) return res.status(400).json({ error: "Invalid index" });

  // ✅ Allow empty strings if you ever want to clear a field.
  // clampString() returns null for empty string, so for notes we handle separately.
  const title = clampString(req.body?.title, 120);
  const date = clampString(req.body?.date, 80);
  const image = clampString(req.body?.image, 300);

  // ✅ NEW: Notes can be long and can be empty; keep it exactly as sent
  let notes = req.body?.notes;
  if (notes !== undefined) {
    notes = String(notes).replace(/\r\n/g, "\n"); // normalize newlines
    // basic size cap so nobody posts a 50MB notes payload
    if (notes.length > 12000) notes = notes.slice(0, 12000);
  }

  // ✅ If image is provided, force it to be site-relative under /images/
  if (image && !image.startsWith("/images/")) {
    return res.status(400).json({ error: "Invalid image path" });
  }

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "events.json not found" });
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(data.events) || !data.events[i]) {
      return res.status(404).json({ error: "Event not found" });
    }

    // ✅ only update fields that were actually provided
    if (title !== null) data.events[i].title = title;
    if (date !== null) data.events[i].date = date;
    if (image !== null) data.events[i].image = image;

    // ✅ NEW: save notes (even if empty string)
    if (notes !== undefined) data.events[i].notes = notes;

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.json({ success: true, updated: data.events[i] });
  } catch (err) {
    console.error("update-event failed:", err);
    res.status(500).json({ error: "Failed to update event" });
  }
});


/* ------------------------------------------------------
   📸 Upload Event Image
------------------------------------------------------ */
const uploadDir = path.resolve(process.cwd(), "public/images/events");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, safeRandomFilename(file.originalname)),
});

const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 3 * 1024 * 1024 }, // ✅ 3MB
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

    const filePath = path.resolve(process.cwd(), "server/content/events.json");

    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!Array.isArray(data.events) || !data.events[i]) {
        return res.status(404).json({ error: "Event not found" });
      }

      const rel = `/images/events/${req.file.filename}`;
      data.events[i].image = rel;

      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      res.json({ success: true, image: rel });
    } catch (err) {
      res.status(500).json({ error: "Failed to upload image" });
    }
  }
);

/* ------------------------------------------------------
   📥 Serve events.json for homepage
------------------------------------------------------ */
router.get("/events.json", (req, res) => {
  const filePath = path.resolve(process.cwd(), "server/content/events.json");

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "events.json not found" });
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    res.set("Cache-Control", "no-store");
    res.json(data);
  } catch (err) {
    console.error("Failed to load events.json:", err);
    res.status(500).json({ error: "Failed to load events.json" });
  }
});

/* ======================================================
   📚📚📚  FACULTY SYSTEM
====================================================== */

const facultyFilePath = path.resolve(process.cwd(), "server/content/faculty.json");

function readFacultyFile() {
  if (!fs.existsSync(facultyFilePath)) {
    const defaultData = {
      principal: {
        name: "Name",
        subject: "Principal",
        image: "/images/PlaceHolder.jpg",
      },

      // ⭐ ADMIN
      admin: [],

      // ⭐ FACULTY (TEACHERS)
      teachers: [],

      // ⭐ STAFF (NEW)
      staff: [],
    };
    fs.writeFileSync(facultyFilePath, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  return JSON.parse(fs.readFileSync(facultyFilePath, "utf8"));
}

function writeFacultyFile(data) {
  fs.writeFileSync(facultyFilePath, JSON.stringify(data, null, 2));
}

/* ------------------------------------------------------
   📤 Serve faculty.json
------------------------------------------------------ */
router.get("/faculty.json", (req, res) => {
  try {
    const data = readFacultyFile();
    res.set("Cache-Control", "no-store");
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to load faculty.json" });
  }
});

/* ------------------------------------------------------
   ➕ Add Teacher
------------------------------------------------------ */
router.post("/faculty/add", requireSameOrigin, requireAdmin, (req, res) => {
  try {
    const data = readFacultyFile();

    const newTeacher = {
      name: "Name",
      subject: "Subject",
      image: "/images/faculty/PlaceHolder.jpg",
    };

    data.teachers.push(newTeacher);
    writeFacultyFile(data);

    res.json({
      success: true,
      index: data.teachers.length - 1,
      teacher: newTeacher,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to add teacher" });
  }
});

/* ------------------------------------------------------
   ⭐ ADD ADMIN MEMBER
------------------------------------------------------ */
router.post("/faculty/add-admin", requireSameOrigin, requireAdmin, (req, res) => {
  try {
    const data = readFacultyFile();

    const newAdmin = {
      name: "Name",
      subject: "Administrator",
      image: "/images/faculty/PlaceHolder.jpg",
    };

    if (!data.admin) data.admin = [];
    data.admin.push(newAdmin);
    writeFacultyFile(data);

    res.json({
      success: true,
      index: data.admin.length - 1,
      admin: newAdmin,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to add admin" });
  }
});

/* ------------------------------------------------------
   ⭐ ADD STAFF MEMBER (NEW)
------------------------------------------------------ */
router.post("/faculty/add-staff", requireSameOrigin, requireAdmin, (req, res) => {
  try {
    const data = readFacultyFile();

    const newStaff = {
      name: "Name",
      subject: "Staff",
      image: "/images/faculty/PlaceHolder.jpg",
    };

    if (!data.staff) data.staff = [];
    data.staff.push(newStaff);
    writeFacultyFile(data);

    res.json({
      success: true,
      index: data.staff.length - 1,
      staff: newStaff,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to add staff" });
  }
});

/* ------------------------------------------------------
   ✏️ Update Teacher / Principal / Staff
------------------------------------------------------ */
router.post("/faculty/update", requireSameOrigin, requireAdmin, (req, res) => {
  const role = String(req.body?.role || "");
  const name = clampString(req.body?.name, 120);
  const subject = clampString(req.body?.subject, 120);
  const image = clampString(req.body?.image, 300);

  // ✅ Only allow site-relative image paths under /images/
  if (image && !image.startsWith("/images/")) {
    return res.status(400).json({ error: "Invalid image path" });
  }

  try {
    const data = readFacultyFile();

    // PRINCIPAL
    if (role === "principal") {
      if (name) data.principal.name = name;
      if (subject) data.principal.subject = subject;
      if (image) data.principal.image = image;

      writeFacultyFile(data);
      return res.json({ success: true, principal: data.principal });
    }

    // TEACHER
    if (role === "teacher") {
      const i = parseIndex(req.body?.index);
      if (i === null) return res.status(400).json({ error: "Invalid index" });
      if (!data.teachers[i]) return res.status(404).json({ error: "Teacher not found" });

      if (name) data.teachers[i].name = name;
      if (subject) data.teachers[i].subject = subject;
      if (image) data.teachers[i].image = image;

      writeFacultyFile(data);
      return res.json({
        success: true,
        teacher: data.teachers[i],
        index: i,
      });
    }

    // STAFF (NEW)
    if (role === "staff") {
      const i = parseIndex(req.body?.index);
      if (i === null) return res.status(400).json({ error: "Invalid index" });
      if (!data.staff || !data.staff[i]) return res.status(404).json({ error: "Staff not found" });

      if (name) data.staff[i].name = name;
      if (subject) data.staff[i].subject = subject;
      if (image) data.staff[i].image = image;

      writeFacultyFile(data);
      return res.json({
        success: true,
        staff: data.staff[i],
        index: i,
      });
    }

    res.status(400).json({ error: "Invalid role" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update faculty" });
  }
});

/* ------------------------------------------------------
   ⭐ UPDATE ADMIN MEMBER
------------------------------------------------------ */
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
    const data = readFacultyFile();

    if (!data.admin || !data.admin[i]) return res.status(404).json({ error: "Admin not found" });

    if (name) data.admin[i].name = name;
    if (subject) data.admin[i].subject = subject;
    if (image) data.admin[i].image = image;

    writeFacultyFile(data);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update admin" });
  }
});

/* ------------------------------------------------------
   ❌ DELETE TEACHER
------------------------------------------------------ */
router.post("/faculty/delete", requireSameOrigin, requireAdmin, (req, res) => {
  const i = parseIndex(req.body?.index);
  if (i === null) return res.status(400).json({ error: "Invalid index" });

  try {
    const data = readFacultyFile();
    if (!data.teachers[i]) return res.status(404).json({ error: "Teacher not found" });

    data.teachers.splice(i, 1);
    writeFacultyFile(data);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete teacher" });
  }
});

/* ------------------------------------------------------
   ⭐ DELETE ADMIN MEMBER
------------------------------------------------------ */
router.post("/faculty/delete-admin", requireSameOrigin, requireAdmin, (req, res) => {
  const i = parseIndex(req.body?.index);
  if (i === null) return res.status(400).json({ error: "Invalid index" });

  try {
    const data = readFacultyFile();
    if (!data.admin || !data.admin[i]) return res.status(404).json({ error: "Admin not found" });

    data.admin.splice(i, 1);
    writeFacultyFile(data);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete admin" });
  }
});

/* ------------------------------------------------------
   ⭐ DELETE STAFF MEMBER (NEW)
------------------------------------------------------ */
router.post("/faculty/delete-staff", requireSameOrigin, requireAdmin, (req, res) => {
  const i = parseIndex(req.body?.index);
  if (i === null) return res.status(400).json({ error: "Invalid index" });

  try {
    const data = readFacultyFile();
    if (!data.staff || !data.staff[i]) return res.status(404).json({ error: "Staff not found" });

    data.staff.splice(i, 1);
    writeFacultyFile(data);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete staff" });
  }
});

/* ------------------------------------------------------
   📸 Faculty image upload
------------------------------------------------------ */
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
  limits: { fileSize: 3 * 1024 * 1024 }, // ✅ 3MB
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
      const data = readFacultyFile();
      const rel = `/images/faculty/${req.file.filename}`;

      if (role === "principal") {
        data.principal.image = rel;
        writeFacultyFile(data);
        return res.json({ success: true, image: rel });
      }

      if (role === "teacher") {
        if (!data.teachers[idx]) return res.status(404).json({ error: "Teacher not found" });
        data.teachers[idx].image = rel;
        writeFacultyFile(data);
        return res.json({ success: true, image: rel });
      }

      if (role === "admin") {
        if (!data.admin || !data.admin[idx]) return res.status(404).json({ error: "Admin not found" });
        data.admin[idx].image = rel;
        writeFacultyFile(data);
        return res.json({ success: true, image: rel });
      }

      if (role === "staff") {
        if (!data.staff || !data.staff[idx]) return res.status(404).json({ error: "Staff not found" });
        data.staff[idx].image = rel;
        writeFacultyFile(data);
        return res.json({ success: true, image: rel });
      }

      res.status(400).json({ error: "Invalid role" });
    } catch (err) {
      res.status(500).json({ error: "Failed to upload faculty image" });
    }
  }
);

/* ------------------------------------------------------
   EXPORT ROUTER
------------------------------------------------------ */
export default router;
