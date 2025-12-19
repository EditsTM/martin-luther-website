// server/routes/contactRoutes.js
import express from "express";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";
import { sendContactEmail } from "../controllers/contactController.js";

const router = express.Router();

const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    let retryAfter = 600;
    if (req.rateLimit?.resetTime instanceof Date) {
      retryAfter = Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000);
    }
    return res.status(429).json({
      ok: false,
      error: "⏳ You can only send 3 messages every 10 minutes.",
      retryAfter,
    });
  },
});

// ✅ Actually enforce express-validator results (this is the big missing piece)
function enforceValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, error: "Invalid form submission" });
  }
  next();
}

router.post(
  "/send",
  contactLimiter,
  [
    body("firstName").trim().notEmpty().isLength({ max: 50 }).withMessage("First name required"),
    body("lastName").optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
    body("email").trim().isEmail().normalizeEmail().isLength({ max: 254 }).withMessage("Valid email required"),
    body("phone").optional({ checkFalsy: true }).trim().matches(/^[0-9]{7,15}$/).withMessage("Phone must be 7–15 digits"),
    body("reason").trim().notEmpty().isLength({ max: 60 }).withMessage("Please select a reason"),
    body("message").trim().isLength({ min: 10, max: 2000 }).withMessage("Message too short"),

    // ✅ Honeypot 
    body("website").optional({ checkFalsy: true }).custom((value) => {
      if (value && value.trim() !== "") throw new Error("Bot detected");
      return true;
    }),
  ],
  enforceValidation, // ✅ stops bad input before your controller runs
  sendContactEmail
);

export default router;
