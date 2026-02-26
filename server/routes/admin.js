// ✅ server/routes/admin.js
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
  throw new Error("❌ ADMIN_PASSWORD is missing. Refusing to start for safety.");
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

//Basic string length limits to prevent abuse / huge payloads
function clampString(val, maxLen) {
  if (val === null || val === undefined) return null;
  const s = String(val);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/* TRUSTED DEVICE (Remember for 30 days) */

if (!process.env.ADMIN_TOTP_SECRET) {
  throw new Error("❌ ADMIN_TOTP_SECRET is missing. Refusing to start for safety.");
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
    const { password, token, rememberDevice } = req.body;

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
      return req.session.regenerate((err) => {
        if (err) return res.status(500).send("Session error");

        req.session.loggedIn = true;
        req.session.isAdmin = true;

        //4) If they checked "Remember this device", set 30-day trusted cookie
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

        return res.redirect(303, "/admin/dashboard");
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
          <input type="password" name="password" placeholder="Enter Password" required />

          <input
            type="text"
            name="token"
            placeholder="6-digit code"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9]{6}"
            required
          />

          <!-- add checkbox here too, otherwise it disappears on error -->
          <label class="remember-device">
            <input type="checkbox" name="rememberDevice" />
            Remember this device for 30 days
          </label>

          <button type="submit">Login</button>
        </form>

        <div class="error-msg">❌ Invalid credentials. Please try again.</div>
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
  const filePath = path.resolve(process.cwd(), "server/content/events.json");

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
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "events.json not found" });
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(data.events) || !data.events[i]) {
      return res.status(404).json({ error: "Event not found" });
    }

    //only update fields that were actually provided
    if (title !== null) data.events[i].title = title;
    if (date !== null) data.events[i].date = date;
    if (image !== null) data.events[i].image = image;

    //save notes (even if empty string)
    if (notes !== undefined) data.events[i].notes = notes;

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.json({ success: true, updated: data.events[i] });
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

    const filePath = path.resolve(process.cwd(), "server/content/events.json");

    try {
      if (!hasValidImageSignature(req.file.path, req.file.mimetype)) {
        try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(400).json({ error: "Invalid image content" });
      }

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

/*Serve events.json for homepage */
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

/*FACULTY SYSTEM*/

const facultyFilePath = path.resolve(process.cwd(), "server/content/faculty.json");

function readFacultyFile() {
  if (!fs.existsSync(facultyFilePath)) {
    const defaultData = {
      principal: {
        name: "Name",
        subject: "Principal",
        image: "/images/PlaceHolder.jpg",
      },

      
      admin: [],

      
      teachers: [],

     
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

/*Serve faculty.json */
router.get("/faculty.json", (req, res) => {
  try {
    const data = readFacultyFile();
    res.set("Cache-Control", "no-store");
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to load faculty.json" });
  }
});

/* Add Teacher */
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

/* Reorder Events (drag & drop)*/
router.post("/reorder-events", requireSameOrigin, requireAdmin, (req, res) => {
  const filePath = path.resolve(process.cwd(), "server/content/events.json");

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
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "events.json not found" });
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const events = Array.isArray(data.events) ? data.events : [];

    if (clean.length !== events.length) {
      return res.status(400).json({ error: "Order length mismatch" });
    }
    if (!clean.every((i) => i >= 0 && i < events.length)) {
      return res.status(400).json({ error: "Order contains out-of-range index" });
    }

    data.events = clean.map((i) => events[i]);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error("reorder-events failed:", err);
    res.status(500).json({ error: "Failed to reorder events" });
  }
});


/* ADD ADMIN MEMBER */
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

/* ADD STAFF MEMBER (NEW) */
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

/*DELETE TEACHER */
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

/* DELETE ADMIN MEMBER*/
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

/* DELETE STAFF MEMBER (NEW) */
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
