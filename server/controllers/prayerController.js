/**
 * File: server\controllers\prayerController.js
 * Purpose: Contains controller logic used by prayerController workflows.
 */
// server/controllers/prayerController.js
import nodemailer from "nodemailer";
import { validationResult } from "express-validator";

const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const prayerTo = process.env.PRAYER_TO;

if (!smtpUser || !smtpPass) {
  console.error("[ERROR] Missing SMTP_USER / SMTP_PASS in env (prayer).");
}
if (!prayerTo) {
  console.error("[ERROR] Missing PRAYER_TO in env (prayer).");
}

// Create transporter once (reuse)
const transporter =
  smtpUser && smtpPass
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT) || 465,
        secure: true,
        auth: { user: smtpUser, pass: smtpPass },
      })
    : null;

//Simple CRLF strip to prevent header injection attempts
function stripCRLF(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function isValidEmail(value) {
  const v = String(value ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export const sendPrayerRequest = async (req, res) => {
  //Don’t log full body (contains sensitive prayer text). Log minimal metadata.
  console.log("📩 Prayer request hit:", {
    ip: req.ip,
    hasBody: !!req.body,
    time: new Date().toISOString(),
  });

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, errors: errors.array() });
  }

  const { name, email, prayer, share } = req.body;

  //Fail closed if email isn't configured
  if (!smtpUser || !smtpPass || !transporter) {
    return res
      .status(500)
      .json({ ok: false, error: "Email is not configured on the server." });
  }

  if (!prayerTo) {
    return res
      .status(500)
      .json({ ok: false, error: "Email destination is not configured on the server." });
  }

  try {
    const safeName = stripCRLF(name);
    const safeEmail = stripCRLF(email);
    const safeShare = stripCRLF(share);

    const subject = `🙏 New Prayer Request from ${safeName || "Visitor"}`;
    const replyTo = isValidEmail(safeEmail) ? safeEmail : undefined;

    await transporter.sendMail({
      from: `"ML Prayer Request" <${smtpUser}>`,
      to: prayerTo,
      ...(replyTo ? { replyTo } : {}),
      subject: stripCRLF(subject),
      text: `
New Prayer Request Submitted:

Name: ${safeName}
Email: ${safeEmail}
Share with congregation: ${(safeShare || "no").toUpperCase()}

Prayer Request:
${String(prayer ?? "").trim()}
      `.trim(),
    });

    console.log("[OK] Prayer request sent successfully!");
    return res.json({ ok: true });
  } catch (err) {
    console.error("💥 Prayer request error:", err?.message || err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to send prayer request." });
  }
};
