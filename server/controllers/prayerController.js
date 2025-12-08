// server/controllers/prayerController.js
import nodemailer from "nodemailer";
import { validationResult } from "express-validator";

export const sendPrayerRequest = async (req, res) => {
  console.log("📩 Prayer request incoming:", req.body);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, errors: errors.array() });
  }

  const { name, email, prayer, share } = req.body;

  // 🔑 Use ONLY SMTP_* (matches your .env)
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  console.log("🔐 Prayer SMTP user:", smtpUser);
  console.log("🔐 Prayer SMTP user len:", smtpUser ? smtpUser.length : 0);
  console.log("🔐 Prayer SMTP pass defined:", !!smtpPass);
  console.log("🔐 Prayer SMTP pass len:", smtpPass ? smtpPass.length : 0);

  if (!smtpUser || !smtpPass) {
    console.error("❌ Missing SMTP_USER / SMTP_PASS in env (prayer).");
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

    const subject = `🙏 New Prayer Request from ${name}`;

    await transporter.sendMail({
      from: `"ML Prayer Request" <${smtpUser}>`,
      to: process.env.PRAYER_TO,
      replyTo: email,
      subject,
      text: `
New Prayer Request Submitted:

Name: ${name}
Email: ${email}
Share with congregation: ${share.toUpperCase()}

Prayer Request:
${prayer}
      `.trim(),
    });

    console.log("✅ Prayer request sent successfully!");
    res.json({ ok: true });
  } catch (err) {
    console.error("💥 Prayer request error:", err);
    res
      .status(500)
      .json({ ok: false, error: "Failed to send prayer request." });
  }
};
