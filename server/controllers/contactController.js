import nodemailer from "nodemailer";
import { validationResult } from "express-validator";

export const sendContactEmail = async (req, res) => {
  console.log("📨 Contact form hit:", { hasBody: !!req.body, keys: Object.keys(req.body || {}) });

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, errors: errors.array() });
  }

  const { firstName, lastName, email, phone, message } = req.body;

  try {
    if (!process.env.SENDGRID_API_KEY) {
      console.error("❌ Missing SENDGRID_API_KEY in env.");
      return res.status(500).json({ ok: false, error: "Email service not configured." });
    }

    const transporter = nodemailer.createTransport({
      service: "SendGrid",
      auth: {
        user: "apikey", // SendGrid requires literal 'apikey' here
        pass: process.env.SENDGRID_API_KEY,
      },
    });

    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const subject = `📬 New Contact Message from ${fullName || "Visitor"}`;

    await transporter.sendMail({
      from: `"Martin Luther Website" <${process.env.TO_EMAIL}>`,
      to: process.env.TO_EMAIL,
      replyTo: email,
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

    console.log("✅ Contact email sent successfully.");
    res.json({ ok: true });
  } catch (err) {
    console.error("💥 Contact email error:", err);
    res.status(500).json({ ok: false, error: "Failed to send message." });
  }
};
