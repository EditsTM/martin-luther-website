// server/controllers/contactController.js
import nodemailer from "nodemailer";
import { validationResult } from "express-validator";

export const sendContactEmail = async (req, res) => {
  console.log("📨 Contact form hit:", { hasBody: !!req.body, keys: Object.keys(req.body || {}) });

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, errors: errors.array() });
  }

  const { firstName, lastName, email, phone, message } = req.body;

  // Normalize env var names so it works both locally & on Render
  const SMTP_HOST = process.env.SMTP_HOST || process.env.EMAIL_HOST || "smtp.gmail.com";
  const SMTP_PORT = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 465);
  const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER;
  const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASS;

  const TO_ADDRESS = process.env.CONTACT_TO || process.env.PRAYER_TO || SMTP_USER;

  try {
    if (!SMTP_USER || !SMTP_PASS) {
      console.error("❌ Missing SMTP credentials. Check Render env vars.");
      return res.status(500).json({ ok: false, error: "Email not configured on server." });
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // true for 465, false for 587
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: false },
    }, {
      logger: true, // logs to console (visible in Render logs)
      debug: false, // set true if you want even more detail
    });

    console.log("🔧 SMTP config check:", {
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      userSet: !!SMTP_USER,
      passSet: !!SMTP_PASS,
      toSet: !!TO_ADDRESS,
    });

    await transporter.verify();
    console.log("✅ SMTP verified.");

    const subject = `📬 New Contact Message from ${firstName || "Visitor"}`;
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    await transporter.sendMail({
      from: `"ML Website" <${SMTP_USER}>`, // must align with authenticated user for DMARC
      to: TO_ADDRESS,
      replyTo: email, // so you can reply directly to the sender
      subject,
      text: `
New message from the website:

Name: ${fullName}
Email: ${email}
Phone: ${phone}

Message:
${message}
      `.trim(),
    });

    console.log("✉️ Contact email sent successfully.");
    res.json({ ok: true });
  } catch (err) {
    console.error("💥 Contact email error:", {
      message: err.message,
      code: err.code,
      command: err.command,
      response: err.response && err.response.toString ? err.response.toString() : undefined,
    });
    res.status(500).json({ ok: false, error: "Failed to send message." });
  }
};
