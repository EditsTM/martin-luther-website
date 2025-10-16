// ✅ server/routes/admin.js
import express from "express";
import path from "path";
import fs from "fs"; // 🟢 added for reading/writing events.json
import multer from "multer"; // 🟢 added for image uploads
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config(); // 🟢 Ensure .env variables load

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

  // 🟢 Fixed path: step up 2 levels to reach /public
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
  </html>`;
  res.status(401).send(errorHTML);
});

/* ------------------------------------------------------
   🧩 Protected Dashboard
------------------------------------------------------ */
router.get("/dashboard", (req, res) => {
  if (!req.session.loggedIn) {
    return res.redirect("/admin/login");
  }

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
            <p>Edit tools coming soon.</p>
            <a href="/admin/logout" class="btn">Logout</a>
          </div>
        </div>
      </section>
      <div id="footer"></div>
      <script src="/js/header.js"></script>
      <script src="/js/footer.js"></script>
      <script src="/js/adminSession.js"></script> <!-- 🕒 auto-logout timer -->
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
  if (!req.session.loggedIn) {
    return res.status(403).json({ error: "Unauthorized" });
  }

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

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    res.json({ success: true, updated: data.events[index] });
  } catch (err) {
    console.error("❌ Update failed:", err.message);
    res.status(500).json({ error: "Failed to update event" });
  }
});

/* ------------------------------------------------------
   📸 Upload Event Image via Drag-and-Drop
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
  if (!req.session.loggedIn) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { index } = req.body;
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });

  const filePath = path.resolve(process.cwd(), "server/content/events.json");
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!data.events[index]) return res.status(404).json({ error: "Event not found" });

    const relativePath = `images/events/${req.file.filename}`;
    data.events[index].image = relativePath;

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.json({ success: true, image: relativePath });
  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).json({ error: "Failed to update events.json" });
  }
});

/* ------------------------------------------------------
   📤 Serve Writable events.json for Frontend Fetch
------------------------------------------------------ */
router.get("/events.json", (req, res) => {
  const filePath = path.resolve(process.cwd(), "server/content/events.json");
  console.log("📤 Serving events.json from:", filePath);

  if (!fs.existsSync(filePath)) {
    console.error("❌ events.json missing at:", filePath);
    return res.status(404).json({ error: "events.json not found" });
  }

  res.set("Cache-Control", "no-store");
  res.sendFile(filePath);
});

/* ------------------------------------------------------
   ✅ Export Router
------------------------------------------------------ */
export default router;
