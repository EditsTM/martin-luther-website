// ✅ server/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

import contactRoutes from "./routes/contactRoutes.js";
import prayerRoutes from "./routes/prayerRoutes.js";

dotenv.config();

// Setup __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log the active server file
console.log("🚀 SERVER FILE RELOADED:", new Date().toISOString());
console.log("🔥 ACTIVE SERVER FILE:", import.meta.url);

const app = express();
const PORT = process.env.PORT || 3000;

/* ------------------------------------------------------
   🛡️ Security & Core Middleware
------------------------------------------------------ */
app.use(
  helmet({
    contentSecurityPolicy: false, // disable Helmet’s internal CSP
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "no-referrer" },
  })
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ------------------------------------------------------
   ✅ Custom CSP (Applied BEFORE Static Files)
------------------------------------------------------ */
app.use((req, res, next) => {
  // Remove any prior CSP set by middleware
  res.removeHeader("Content-Security-Policy");

  // Apply your complete custom CSP
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

  console.log("🔒 Custom CSP applied to:", req.path);
  next();
});

/* ------------------------------------------------------
   🌐 Static Files
------------------------------------------------------ */
app.use(express.static(path.join(__dirname, "../public")));

/* ------------------------------------------------------
   📩 Routes
------------------------------------------------------ */
app.use("/contact", contactRoutes);
app.use("/prayer", prayerRoutes);

/* ------------------------------------------------------
   🎥 YouTube API Proxy
------------------------------------------------------ */
app.get("/api/youtube", async (req, res) => {
  try {
    const { YOUTUBE_API_KEY, CHANNEL_ID } = process.env;

    if (!YOUTUBE_API_KEY || !CHANNEL_ID) {
      return res.status(500).json({ error: "Missing YouTube API configuration." });
    }

    const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}&key=${YOUTUBE_API_KEY}`;
    const channelRes = await fetch(channelUrl);
    const channelData = await channelRes.json();

    if (!channelData.items?.length)
      throw new Error("Invalid channel or API key.");

    const uploadsId = channelData.items[0].contentDetails.relatedPlaylists.uploads;

    const videosUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=4&key=${YOUTUBE_API_KEY}`;
    const videosRes = await fetch(videosUrl);
    const videosData = await videosRes.json();

    res.json(videosData);
  } catch (err) {
    console.error("❌ YouTube API error:", err);
    res.status(500).json({ error: "Failed to load YouTube videos." });
  }
});

/* ------------------------------------------------------
   🏠 Home & 404
------------------------------------------------------ */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/html/index.html"));
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "../public/html/404.html"));
});

/* ------------------------------------------------------
   🚀 Start Server
------------------------------------------------------ */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running at: http://localhost:${PORT}`);
});
