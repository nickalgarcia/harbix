// api/notify-submitter.js
// Emails the submitter when an agent replies or resolves their ticket.
// Migrated from EmailJS → Resend. Request body contract unchanged.

import { sendEmail, submitterReplyEmail, submitterResolvedEmail } from "./_lib/email.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    type, // "reply" | "resolved"
    submitter_email, location, issue,
    agent_name, message,  // reply only
    status,               // resolved only
    ticket_id,
  } = req.body;

  // Only send if contact looks like an email
  if (!submitter_email || !submitter_email.includes("@")) {
    console.log("Contact is not an email — skipping submitter notification");
    return res.status(200).json({ success: true, skipped: true });
  }

  if (type !== "reply" && type !== "resolved") {
    return res.status(400).json({ error: `Unknown notification type: ${type}` });
  }

  const subject = type === "reply"
    ? `[Harbix] Reply to your request — ${location || ""}`
    : `[Harbix] Your request has been resolved`;

  const html = type === "reply"
    ? submitterReplyEmail({ location, issue, agentName: agent_name, message, ticketId: ticket_id })
    : submitterResolvedEmail({ location, issue, status, ticketId: ticket_id });

  try {
    const result = await sendEmail({ to: submitter_email, subject, html });
    console.log(`Submitter ${type} email sent:`, result.id);
    return res.status(200).json({ success: true, emailId: result.id });

  } catch (err) {
    console.error("notify-submitter error:", err.message);
    return res.status(500).json({ error: "Email send failed", detail: err.message });
  }
}
