// server/controllers/contactController.js
import nodemailer from "nodemailer";
import { validationResult } from "express-validator";

const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const contactTo = process.env.CONTACT_TO;

if (!smtpUser || !smtpPass) {
  console.error("❌ Missing SMTP_USER / SMTP_PASS in env (contact).");
}
if (!contactTo) {
  console.error("❌ Missing CONTACT_TO in env (contact).");
}

// ✅ Create transporter once (reuse)
const transporter =
  smtpUser && smtpPass
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT) || 465,
        secure: true,
        auth: { user: smtpUser, pass: smtpPass },
      })
    : null;

// ✅ Simple CRLF strip to prevent header injection attempts
function stripCRLF(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

export const sendContactEmail = async (req, res) => {
  // ✅ Don’t log full body (contains PII). Log minimal metadata.
  console.log("📨 Contact form hit:", {
    ip: req.ip,
    hasBody: !!req.body,
    time: new Date().toISOString(),
  });

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, errors: errors.array() });
  }

  const { firstName, lastName, email, phone, reason, message } = req.body;

  // ✅ Fail closed if email isn't configured
  if (!smtpUser || !smtpPass || !transporter) {
    return res
      .status(500)
      .json({ ok: false, error: "Email is not configured on the server." });
  }

  if (!contactTo) {
    return res
      .status(500)
      .json({ ok: false, error: "Email destination is not configured on the server." });
  }

  try {
    const safeFirst = stripCRLF(firstName);
    const safeLast = stripCRLF(lastName);
    const safeEmail = stripCRLF(email);
    const safePhone = stripCRLF(phone);
    const safeReason = stripCRLF(reason);

    const fullName = [safeFirst, safeLast].filter(Boolean).join(" ").trim();
    const subject = `📬 New Contact Message from ${fullName || "Visitor"}`;

    await transporter.sendMail({
      from: `"ML Website" <${smtpUser}>`,
      to: contactTo,
      replyTo: safeEmail, // ✅ stripped of CR/LF defensively
      subject: stripCRLF(subject),
      text: `
New message from the website:

Name: ${fullName}
Email: ${safeEmail}
Phone: ${safePhone}
Reason: ${safeReason || "Not specified"}

Message:
${String(message ?? "").trim()}
      `.trim(),
    });

    console.log("✅ Contact email sent successfully.");
    return res.json({ ok: true });
  } catch (err) {
    console.error("💥 Contact email error:", err);
    return res.status(500).json({ ok: false, error: "Failed to send message." });
  }
};
