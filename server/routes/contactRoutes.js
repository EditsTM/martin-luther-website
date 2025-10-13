// server/routes/contactRoutes.js
import express from "express";
import rateLimit from "express-rate-limit";
import { body } from "express-validator";
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

router.post(
  "/send",
  contactLimiter,
  [
    body("firstName").trim().notEmpty().withMessage("First name required"),
    body("lastName").optional().trim().isLength({ max: 50 }),
    body("email").isEmail().withMessage("Valid email required"),
    body("phone").trim().matches(/^[0-9]{7,15}$/).withMessage("Phone must be 7–15 digits"),
    body("reason").notEmpty().withMessage("Please select a reason"), // ✅ added
    body("message").trim().isLength({ min: 10 }).withMessage("Message too short"),
    body("website").custom((value) => {
      if (value && value.trim() !== "") throw new Error("Bot detected");
      return true;
    }),
  ],
  sendContactEmail
);

export default router;
