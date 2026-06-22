// api/notify-submitter.js
// Emails the submitter when an agent replies or resolves their ticket.
// Auth required: caller must be a signed-in @godchasers.church agent.
// Recipient and content are derived server-side from the stored ticket — the
// client passes only ticket_id + type so it cannot relay to arbitrary addresses.

import { sendEmail, submitterReplyEmail, submitterResolvedEmail } from "./_lib/email.js";
import { verifyChurchAgent, getAdminDb }                          from "./_lib/admin.js";

const STATUS_LABELS = {
  waiting: "Waiting",
  "on-it": "On It",
  done:    "Done",
  closed:  "Closed",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Verify the caller is an authenticated church agent
  try {
    await verifyChurchAgent(req);
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }

  const { ticket_id, type } = req.body || {};
  if (!ticket_id || typeof ticket_id !== "string" || ticket_id.trim() === "") {
    return res.status(400).json({ error: "Missing ticket_id" });
  }
  if (type !== "reply" && type !== "resolved") {
    return res.status(400).json({ error: `Unknown notification type: ${type}` });
  }

  // Load ticket — all content and recipient from the trusted Firestore record
  let ticket;
  try {
    const snap = await getAdminDb().collection("tickets").doc(ticket_id).get();
    if (!snap.exists) return res.status(400).json({ error: "Ticket not found" });
    ticket = snap.data();
  } catch (e) {
    console.error("notify-submitter Firestore read error:", e.message);
    return res.status(500).json({ error: "Failed to load ticket" });
  }

  const submitterEmail = ticket.contact;
  if (!submitterEmail || !submitterEmail.includes("@")) {
    console.log("Contact is not an email — skipping submitter notification");
    return res.status(200).json({ success: true, skipped: true });
  }

  const subject = type === "reply"
    ? `[Harbix] Reply to your request — ${ticket.location || ""}`
    : `[Harbix] Your request has been resolved`;

  let html;
  if (type === "reply") {
    // Find the most recent reply comment saved to the ticket
    const comments    = Array.isArray(ticket.comments) ? ticket.comments : [];
    const latestReply = [...comments].reverse().find(c => c.type === "reply");
    if (!latestReply) {
      console.log("No reply comment found on ticket — skipping submitter reply notification");
      return res.status(200).json({ success: true, skipped: "No reply comment found" });
    }
    html = submitterReplyEmail({
      location:  ticket.location  || "",
      issue:     ticket.issue     || "",
      agentName: latestReply.author || "The Help Desk",
      message:   latestReply.text   || "",
      ticketId:  ticket_id,
    });
  } else {
    html = submitterResolvedEmail({
      location: ticket.location || "",
      issue:    ticket.issue    || "",
      status:   STATUS_LABELS[ticket.status] || ticket.status || "Resolved",
      ticketId: ticket_id,
    });
  }

  try {
    const result = await sendEmail({ to: submitterEmail, subject, html });
    console.log(`Submitter ${type} email sent:`, result.id);
    return res.status(200).json({ success: true, emailId: result.id });

  } catch (err) {
    console.error("notify-submitter error:", err.message);
    return res.status(500).json({ error: "Email send failed", detail: err.message });
  }
}
