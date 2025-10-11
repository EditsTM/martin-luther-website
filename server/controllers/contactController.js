// server/controllers/contactController.js
import nodemailer from "nodemailer";
import { validationResult } from "express-validator";

export const sendContactEmail = async (req, res) => {
  console.log("📨 Contact form hit:", req.body);

  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, errors: errors.array() });
  }

  const { firstName, lastName, email, phone, message } = req.body;

  try {
    // ✅ Gmail SMTP transporter
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true, // true = use SSL
      auth: {
        user: process.env.EMAIL_USER, // your Gmail
        pass: process.env.EMAIL_PASS, // your Gmail App Password
      },
    });

    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const subject = `📬 New Contact Message from ${fullName || "Visitor"}`;

    await transporter.sendMail({
      from: `"ML Website" <${process.env.EMAIL_USER}>`, // sender (your Gmail)
      to: process.env.CONTACT_TO,                       // recipient inbox
      replyTo: email,                                   // visitor's email
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
