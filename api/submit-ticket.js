// api/submit-ticket.js
// Vercel serverless function — emails the tech inbox when a new ticket is submitted.
// Migrated from EmailJS → Resend. Request body contract unchanged (no App.jsx edits needed).

import { sendEmail, newTicketEmail } from "./_lib/email.js";

const TICKETS_TO = process.env.TICKETS_TO_EMAIL || "tech@godchasers.church";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, location, issue, contact, photoURL, firestoreId } = req.body;

  try {
    console.log("Sending new-ticket notification for:", firestoreId);

    const result = await sendEmail({
      to:      TICKETS_TO,
      subject: `[Harbix] New ticket — ${location || "Unknown location"}`,
      html:    newTicketEmail({ name, location, contact, issue, photoURL, ticketId: firestoreId }),
      // If the submitter left an email, replying to the notification reaches them directly
      replyTo: contact?.includes("@") ? contact : undefined,
    });

    console.log("New-ticket email sent:", result.id);
    return res.status(200).json({ success: true, emailId: result.id });

  } catch (err) {
    console.error("submit-ticket email error:", err.message);
    return res.status(500).json({ error: "Email send failed", detail: err.message });
  }
}
