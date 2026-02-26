/**
 * File: server\routes\contentRoutes.js
 * Purpose: Defines HTTP route handlers and request validation for contentRoutes operations.
 */
//server/routes/contentRoutes.js
import express from "express";
import path from "path";
import { promises as fsp } from "fs";
import { fileURLToPath } from "url";
import { enforceTrustedOrigin } from "../middleware/requestSecurity.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EVENTS_PATH = path.join(__dirname, "../content/events.json");

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

// [OK] Atomic write to prevent partial/corrupt JSON on crash
async function atomicWriteJson(filePath, dataObj) {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.tmp-${path.basename(filePath)}-${process.pid}-${Date.now()}`);

  const json = JSON.stringify(dataObj, null, 2);

  await fsp.writeFile(tmpPath, json, "utf8");
  await fsp.rename(tmpPath, filePath);
}

/* ======================================================
   ROUTES
====================================================== */

// 🟢 Publicly serve the events.json file (everyone can view)
router.get("/events.json", (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // If you update events often and want clients to always fetch fresh:
  // res.setHeader("Cache-Control", "no-store");
  res.sendFile(EVENTS_PATH);
});

// 🔒 Admin can edit events.json (only when logged in)
router.post(
  "/events.json",
  requireSameOrigin,
  validateEventsPayload,
  async (req, res) => {
    if (!req.session || !req.session.isAdmin) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    try {
      await atomicWriteJson(EVENTS_PATH, req.body);
      return res.json({ success: true });
    } catch (err) {
      console.error("[ERROR] Error writing events.json:", err);
      return res.status(500).json({ error: "Failed to save content" });
    }
  }
);

export default router;
