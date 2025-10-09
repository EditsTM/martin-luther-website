// server/controllers/contactController.js
import nodemailer from "nodemailer";
import { validationResult } from "express-validator";

export const sendContactEmail = async (req, res) => {
  console.log("📩 Incoming contact form:", req.body);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.warn("❌ Validation failed:", errors.array());
    return res.status(400).json({ ok: false, errors: errors.array() });
  }

  const { firstName, lastName, phone, email, message } = req.body;

  try {
    // ✅ Create secure Gmail transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465, // true for SSL (465)
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: { rejectUnauthorized: false },
    });

    // Optional check
    console.log("SMTP_USER =", process.env.SMTP_USER);
    console.log("SMTP_PASS loaded?", !!process.env.SMTP_PASS);

    await transporter.verify();

    // ✅ Send email
    await transporter.sendMail({
      from: `"ML Contact Form" <${process.env.SMTP_USER}>`,
      to: process.env.CONTACT_TO,
      replyTo: email,
      subject: `📩 New Contact from ${firstName} ${lastName || ""}`,
      text: `
New contact form submission:

Name: ${firstName} ${lastName || ""}
Email: ${email}
Phone: ${phone}

Message:
${message}
      `.trim(),
    });

    console.log("✅ Contact email sent successfully");
    res.json({ ok: true });
  } catch (err) {
    console.error("💥 Contact email error:", err);
    res.status(500).json({ ok: false, error: "Failed to send contact message." });
  }
};
