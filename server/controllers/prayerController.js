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

  try {
    // ✅ Use the same Gmail SMTP credentials
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: { rejectUnauthorized: false },
    });

    console.log("SMTP_USER =", process.env.SMTP_USER);
    console.log("SMTP_PASS loaded?", !!process.env.SMTP_PASS);

    await transporter.verify();

    await transporter.sendMail({
      from: `"ML Prayer Request" <${process.env.SMTP_USER}>`,
      to: process.env.PRAYER_TO,
      replyTo: email,
      subject: `🙏 New Prayer Request from ${name}`,
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
    res.status(500).json({ ok: false, error: "Failed to send prayer request." });
  }
};
