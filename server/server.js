// ✅ server/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import fetch from "node-fetch";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import session from "express-session";
import rateLimit from "express-rate-limit"; // ✅ added (for /api/youtube)

import contactRoutes from "./routes/contactRoutes.js";
import prayerRoutes from "./routes/prayerRoutes.js";
import adminRoutes from "./routes/admin.js";
import contentRoutes from "./routes/contentRoutes.js";
import teamRoutes from "./routes/teamRoutes.js";

// ------------------------------------------------------
// 🔐 Resolve __dirname and load .env from project root
// ------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ------------------------------------------------------
   ✅ SECURITY FAIL-CLOSED (prevents insecure defaults)
------------------------------------------------------ */
if (process.env.NODE_ENV === "production") {
  if (!process.env.SESSION_SECRET) {
    throw new Error("❌ SESSION_SECRET is missing in production. Refusing to start.");
  }
}

// 🔍 Debug – safe (do NOT print secrets)
console.log("🚀 SERVER FILE RELOADED:", new Date().toISOString());
console.log("🔥 ACTIVE SERVER FILE:", import.meta.url);

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;

/* ------------------------------------------------------
   🛡️ Security & Middleware
------------------------------------------------------ */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "no-referrer" },
  })
);

// ✅ Tighten CORS (keep functionality: allow same-origin + no-origin tools)
const allowedOrigins = [
  process.env.SITE_ORIGIN,              // e.g. https://martinlutheroshkosh.com
  process.env.SITE_ORIGIN_2,            // e.g. https://mloshkosh.org
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // allow same-origin/no-origin (curl/postman)
      if (allowedOrigins.length === 0) return cb(null, true); // if not configured, don't break
      return allowedOrigins.includes(origin)
        ? cb(null, true)
        : cb(new Error("Not allowed by CORS"));
    },
  })
);

// ✅ Add explicit body size limits (prevents large-payload abuse)
app.use(express.json({ limit: "25kb" }));
app.use(express.urlencoded({ extended: true, limit: "25kb" }));

/* ------------------------------------------------------
   🧩 Session Configuration (Persistent 15-minute Login)
------------------------------------------------------ */
app.use(
  session({
    name: "ml.sid", // ✅ avoid default connect.sid
    secret: process.env.SESSION_SECRET || "ml-secret",
    resave: false,
    saveUninitialized: false,
    rolling: true, // ✅ refresh cookie expiration on activity
    cookie: {
      maxAge: 15 * 60 * 1000, // 🕒 15 minutes
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  })
);

// 🕓 Extend session if user stays active
// ✅ rolling:true already refreshes expiration, keep this for compatibility (won't break anything)
app.use((req, res, next) => {
  if (req.session && req.session.loggedIn) {
    req.session._garbage = Date();
    req.session.touch();
  }
  next();
});

/* ------------------------------------------------------
   ✅ CSP Policy
------------------------------------------------------ */
app.use((req, res, next) => {
  res.removeHeader("Content-Security-Policy");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://www.youtube.com https://i.ytimg.com https://calendar.google.com https://www.google.com https://secure.myvanco.com",
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://calendar.google.com https://www.google.com https://secure.myvanco.com",
      "connect-src 'self' https://www.googleapis.com https://calendar.google.com https://www.google.com https://accounts.google.com https://secure.myvanco.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; ")
  );
  next();
});

/* ------------------------------------------------------
   🧭 Redirect static admin.html to session-aware route
------------------------------------------------------ */
app.get("/html/school/admin.html", (req, res) => {
  res.redirect("/admin/login");
});

/* ------------------------------------------------------
   📩 API ROUTES
------------------------------------------------------ */
app.use("/contact", contactRoutes);
app.use("/prayer", prayerRoutes);
app.use("/admin", adminRoutes);
app.use("/content", contentRoutes);
app.use("/api/team", teamRoutes);

/* ------------------------------------------------------
   🎥 YouTube Proxy (✅ add rate limiting to protect API quota)
------------------------------------------------------ */
const youtubeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,             // 30 req/min per IP
  standardHeaders: true,
  legacyHeaders: false,
});

app.get("/api/youtube", youtubeLimiter, async (req, res) => {
  try {
    const { YOUTUBE_API_KEY, CHANNEL_ID } = process.env;
    if (!YOUTUBE_API_KEY || !CHANNEL_ID)
      return res.status(500).json({ error: "Missing YouTube configuration" });

    const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}&key=${YOUTUBE_API_KEY}`;
    const channelRes = await fetch(channelUrl);
    const channelData = await channelRes.json();

    if (!channelData.items?.length) throw new Error("Invalid channel ID or key");

    const uploadsId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
    const videosUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=4&key=${YOUTUBE_API_KEY}`;
    const videosRes = await fetch(videosUrl);
    const videosData = await videosRes.json();

    res.json(videosData);
  } catch (err) {
    console.error("❌ YouTube API error:", err);
    res.status(500).json({ error: "Failed to load YouTube videos" });
  }
});

/* ------------------------------------------------------
   🌐 STATIC FILES
------------------------------------------------------ */
app.use(express.static(path.join(process.cwd(), "public")));
app.use(express.static(path.join(__dirname, "../public")));

/* ------------------------------------------------------
   🏠 Home Route
------------------------------------------------------ */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/html/index.html"));
});

/* ------------------------------------------------------
   👤 Simple Admin Session Check
------------------------------------------------------ */
app.get("/api/admin-session", (req, res) => {
  res.json({ loggedIn: !!req.session.loggedIn });
});

/* ------------------------------------------------------
   ❌ 404 Handler
------------------------------------------------------ */
app.use((req, res) => {
  const notFoundPage = path.join(__dirname, "../public/html/404.html");
  fs.existsSync(notFoundPage)
    ? res.status(404).sendFile(notFoundPage)
    : res.status(404).send("<h1>404 - Page Not Found</h1>");
});

/* ------------------------------------------------------
   🚀 Start Server
------------------------------------------------------ */
app.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Server running at: http://localhost:${PORT}`)
);
