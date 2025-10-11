// server/controllers/prayerController.js
import nodemailer from "nodemailer";
import { validationResult } from "express-validator";

export const sendPrayerRequest = async (req, res) => {
  console.log("📩 Prayer request incoming:", req.body);

  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, errors: errors.array() });
  }

  const { name, email, prayer, share } = req.body;

  try {
    // ✅ Gmail SMTP transporter
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER, // your Gmail
        pass: process.env.EMAIL_PASS, // your Gmail App Password
      },
    });

    const subject = `🙏 New Prayer Request from ${name}`;

    await transporter.sendMail({
      from: `"ML Prayer Request" <${process.env.EMAIL_USER}>`,
      to: process.env.PRAYER_TO, // destination inbox for prayer requests
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
    res.status(500).json({ ok: false, error: "Failed to send prayer request." });
  }
};
