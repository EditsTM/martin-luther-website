// ✅ server/routes/admin.js
import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🟢 Load admin password securely
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "default123";
console.log("🧩 Loaded ADMIN_PASSWORD:", ADMIN_PASSWORD ? "[HIDDEN]" : "❌ Not Found");

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
router.post("/login", (req, res) => {
  const { password } = req.body;

  if (password === ADMIN_PASSWORD) {
    req.session.loggedIn = true;

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
   🧩 Update Event Title/Date/Image
------------------------------------------------------ */
router.post("/update-event", (req, res) => {
  if (!req.session.loggedIn)
    return res.status(403).json({ error: "Unauthorized" });

  const { index, title, date, image } = req.body;
  const filePath = path.resolve(process.cwd(), "server/content/events.json");

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "events.json not found" });
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!data.events || !data.events[index]) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (title) data.events[index].title = title;
    if (date) data.events[index].date = date;
    if (image) data.events[index].image = image;

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.json({ success: true, updated: data.events[index] });
  } catch (err) {
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
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${base}-${unique}${ext}`);
  },
});
const upload = multer({ storage });

router.post("/upload-image", upload.single("image"), (req, res) => {
  if (!req.session.loggedIn)
    return res.status(403).json({ error: "Unauthorized" });

  const { index } = req.body;
  const filePath = path.resolve(process.cwd(), "server/content/events.json");

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!data.events[index])
      return res.status(404).json({ error: "Event not found" });

    const rel = `images/events/${req.file.filename}`;
    data.events[index].image = rel;

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.json({ success: true, image: rel });
  } catch (err) {
    res.status(500).json({ error: "Failed to upload image" });
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

      // ⭐ ADDED
      admin: [],

      teachers: [],
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
router.post("/faculty/add", (req, res) => {
  if (!req.session.loggedIn)
    return res.status(403).json({ error: "Unauthorized" });

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
   ⭐ ADD ADMIN MEMBER (NEW)
------------------------------------------------------ */
router.post("/faculty/add-admin", (req, res) => {
  if (!req.session.loggedIn)
    return res.status(403).json({ error: "Unauthorized" });

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
   ✏️ Update Teacher / Principal
------------------------------------------------------ */
router.post("/faculty/update", (req, res) => {
  if (!req.session.loggedIn)
    return res.status(403).json({ error: "Unauthorized" });

  const { role, index, name, subject, image } = req.body;

  try {
    const data = readFacultyFile();

    if (role === "principal") {
      if (name) data.principal.name = name;
      if (subject) data.principal.subject = subject;
      if (image) data.principal.image = image;

      writeFacultyFile(data);
      return res.json({ success: true, principal: data.principal });
    }

    if (role === "teacher") {
      const i = Number(index);
      if (!data.teachers[i])
        return res.status(404).json({ error: "Teacher not found" });

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

    res.status(400).json({ error: "Invalid role" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update faculty" });
  }
});

/* ------------------------------------------------------
   ⭐ UPDATE ADMIN MEMBER (NEW)
------------------------------------------------------ */
router.post("/faculty/update-admin", (req, res) => {
  if (!req.session.loggedIn)
    return res.status(403).json({ error: "Unauthorized" });

  const { index, name, subject, image } = req.body;

  try {
    const data = readFacultyFile();

    if (!data.admin || !data.admin[index])
      return res.status(404).json({ error: "Admin not found" });

    if (name) data.admin[index].name = name;
    if (subject) data.admin[index].subject = subject;
    if (image) data.admin[index].image = image;

    writeFacultyFile(data);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update admin" });
  }
});

/* ------------------------------------------------------
   ❌ DELETE TEACHER (already exists)
------------------------------------------------------ */
router.post("/faculty/delete", (req, res) => {
  if (!req.session.loggedIn)
    return res.status(403).json({ error: "Unauthorized" });

  const { index } = req.body;

  try {
    const data = readFacultyFile();
    if (!data.teachers[index])
      return res.status(404).json({ error: "Teacher not found" });

    data.teachers.splice(index, 1);
    writeFacultyFile(data);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete teacher" });
  }
});

/* ------------------------------------------------------
   ⭐ DELETE ADMIN MEMBER (NEW)
------------------------------------------------------ */
router.post("/faculty/delete-admin", (req, res) => {
  if (!req.session.loggedIn)
    return res.status(403).json({ error: "Unauthorized" });

  const { index } = req.body;

  try {
    const data = readFacultyFile();
    if (!data.admin || !data.admin[index])
      return res.status(404).json({ error: "Admin not found" });

    data.admin.splice(index, 1);
    writeFacultyFile(data);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete admin" });
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
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    const unique = Date.now() + "-" + Math.random().toString(36).substring(2, 8);
    cb(null, `${base}-${unique}${ext}`);
  },
});
const uploadFaculty = multer({ storage: facultyStorage });

router.post("/faculty/upload-image", uploadFaculty.single("image"), (req, res) => {
  if (!req.session.loggedIn)
    return res.status(403).json({ error: "Unauthorized" });

  const { role, index } = req.body;

  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const data = readFacultyFile();
    const rel = `images/faculty/${req.file.filename}`;

    if (role === "principal") {
      data.principal.image = rel;
      writeFacultyFile(data);
      return res.json({ success: true, image: rel });
    }

    if (role === "teacher") {
      const i = Number(index);
      if (!data.teachers[i])
        return res.status(404).json({ error: "Teacher not found" });

      data.teachers[i].image = rel;
      writeFacultyFile(data);
      return res.json({ success: true, image: rel });
    }

    // ⭐ ADDED — admin image upload
    if (role === "admin") {
      const i = Number(index);
      if (!data.admin[i])
        return res.status(404).json({ error: "Admin not found" });

      data.admin[i].image = rel;
      writeFacultyFile(data);
      return res.json({ success: true, image: rel });
    }

    res.status(400).json({ error: "Invalid role" });
  } catch (err) {
    res.status(500).json({ error: "Failed to upload faculty image" });
  }
});

/* ------------------------------------------------------
   EXPORT ROUTER
------------------------------------------------------ */
export default router;
