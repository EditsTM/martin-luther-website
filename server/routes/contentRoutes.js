// ✅ server/routes/contentRoutes.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🟢 Publicly serve the events.json file (everyone can view)
router.get("/events.json", (req, res) => {
  const filePath = path.join(__dirname, "../content/events.json");
  res.sendFile(filePath);
});

// 🔒 Future: Admin can edit events.json (only when logged in)
router.post("/events.json", (req, res) => {
  if (!req.session || !req.session.isAdmin) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const filePath = path.join(__dirname, "../content/events.json");
  fs.writeFile(filePath, JSON.stringify(req.body, null, 2), (err) => {
    if (err) {
      console.error("❌ Error writing events.json:", err);
      return res.status(500).json({ error: "Failed to save content" });
    }
    res.json({ success: true });
  });
});

export default router;
