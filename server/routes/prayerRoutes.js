/**
 * File: server\routes\prayerRoutes.js
 * Purpose: Defines HTTP route handlers and request validation for prayerRoutes operations.
 */
// server/routes/prayerRoutes.js
import express from "express";
import rateLimit from "express-rate-limit";
import { body } from "express-validator";
import { sendPrayerRequest } from "../controllers/prayerController.js";

const router = express.Router();

// Specific limiter for prayer requests
const prayerLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    let retryAfter = 600;
    if (req.rateLimit?.resetTime instanceof Date) {
      retryAfter = Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000);
    }
    if (retryAfter < 0 || isNaN(retryAfter)) retryAfter = 600;
    return res.status(429).json({
      ok: false,
      error: "⏳ You can only send 3 prayer requests every 10 minutes.",
      retryAfter,
    });
  },
});

router.post(
  "/send",
  prayerLimiter,
  [
    body("name").trim().isLength({ min: 1, max: 100 }).withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email required"),
    body("prayer").trim().isLength({ min: 10, max: 2000 }).withMessage("Prayer must be 10–2000 characters"),
    body("share").isIn(["yes", "no"]).withMessage("Please select Yes or No"),
    body("website").custom((value) => {
      if (value && value.trim() !== "") throw new Error("Bot detected");
      return true;
    }),
  ],
  sendPrayerRequest
);

export default router;
