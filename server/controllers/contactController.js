// server/controllers/contactController.js
import nodemailer from "nodemailer";
import { validationResult } from "express-validator";

export const sendContactEmail = async (req, res) => {
  console.log("📨 Contact form hit:", req.body);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, errors: errors.array() });
  }

  const { firstName, lastName, email, phone, reason, message } = req.body;

  // 🔑 Use ONLY SMTP_* (matches your .env)
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  console.log("🔐 Contact SMTP user:", smtpUser);
  console.log("🔐 Contact SMTP user len:", smtpUser ? smtpUser.length : 0);
  console.log("🔐 Contact SMTP pass defined:", !!smtpPass);
  console.log("🔐 Contact SMTP pass len:", smtpPass ? smtpPass.length : 0);

  if (!smtpUser || !smtpPass) {
    console.error("❌ Missing SMTP_USER / SMTP_PASS in env (contact).");
    return res
      .status(500)
      .json({ ok: false, error: "Email is not configured on the server." });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 465,
      secure: true,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const subject = `📬 New Contact Message from ${fullName || "Visitor"}`;

    await transporter.sendMail({
      from: `"ML Website" <${smtpUser}>`,
      to: process.env.CONTACT_TO,
      replyTo: email,
      subject,
      text: `
New message from the website:

Name: ${fullName}
Email: ${email}
Phone: ${phone}
Reason: ${reason || "Not specified"}

Message:
${message}
      `.trim(),
    });

    console.log("✅ Contact email sent successfully.");
    res.json({ ok: true });
  } catch (err) {
    console.error("💥 Contact email error:", err);
    res.status(500).json({ ok: false, error: "Failed to send message." });
  }
};
