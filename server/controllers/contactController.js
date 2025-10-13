// server/controllers/contactController.js
import nodemailer from "nodemailer";
import { validationResult } from "express-validator";

export const sendContactEmail = async (req, res) => {
  console.log("📨 Contact form hit:", req.body);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, errors: errors.array() });
  }

  // ✅ added reason
  const { firstName, lastName, email, phone, reason, message } = req.body;

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const subject = `📬 New Contact Message from ${fullName || "Visitor"}`;

    await transporter.sendMail({
      from: `"ML Website" <${process.env.EMAIL_USER}>`,
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
