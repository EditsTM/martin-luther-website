// server/controllers/prayerController.js
import nodemailer from "nodemailer";
import { validationResult } from "express-validator";

export const sendPrayerRequest = async (req, res) => {
  console.log("📩 Prayer request incoming:", req.body);

  // ✅ Validate the incoming data
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, errors: errors.array() });
  }

  const { name, email, prayer, share } = req.body;

  try {
    // ✅ Ensure SendGrid API key exists
    if (!process.env.SENDGRID_API_KEY) {
      console.error("❌ Missing SENDGRID_API_KEY in environment variables.");
      return res.status(500).json({ ok: false, error: "Email service not configured." });
    }

    // ✅ Create a SendGrid transporter
    const transporter = nodemailer.createTransport({
      service: "SendGrid",
      auth: {
        user: "apikey", // SendGrid requires this literal string
        pass: process.env.SENDGRID_API_KEY,
      },
    });

    const subject = `🙏 New Prayer Request from ${name}`;
    const mailOptions = {
      from: `"ML Prayer Request" <${process.env.TO_EMAIL}>`, // Verified sender in SendGrid
      to: process.env.TO_EMAIL, // Recipient of prayer requests
      replyTo: email, // So replies go back to the requester
      subject,
      text: `
New Prayer Request Submitted:

Name: ${name}
Email: ${email}
Share with congregation: ${share.toUpperCase()}

Prayer Request:
${prayer}
      `.trim(),
    };

    // ✅ Send the email
    await transporter.sendMail(mailOptions);

    console.log("✅ Prayer request sent successfully!");
    res.json({ ok: true });
  } catch (err) {
    console.error("💥 Prayer request error:", {
      message: err.message,
      code: err.code,
      command: err.command,
      response: err.response && err.response.toString ? err.response.toString() : undefined,
    });
    res.status(500).json({ ok: false, error: "Failed to send prayer request." });
  }
};
