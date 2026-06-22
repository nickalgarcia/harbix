// api/notify-agent.js
// Emails an agent when they're assigned a ticket.
// Auth required: caller must be a signed-in @godchasers.church agent.
// Recipient and content are derived server-side from the stored ticket — the
// client passes only the ticket_id so it cannot relay to arbitrary addresses.

import { sendEmail, agentAssignedEmail } from "./_lib/email.js";
import { verifyChurchAgent, getAdminDb } from "./_lib/admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Verify the caller is an authenticated church agent
  let caller;
  try {
    caller = await verifyChurchAgent(req);
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }

  const { ticket_id } = req.body || {};
  if (!ticket_id || typeof ticket_id !== "string" || ticket_id.trim() === "") {
    return res.status(400).json({ error: "Missing ticket_id" });
  }

  // Load ticket from Firestore — recipient and all content from the trusted record
  let ticket;
  try {
    const snap = await getAdminDb().collection("tickets").doc(ticket_id).get();
    if (!snap.exists) return res.status(400).json({ error: "Ticket not found" });
    ticket = snap.data();
  } catch (e) {
    console.error("notify-agent Firestore read error:", e.message);
    return res.status(500).json({ error: "Failed to load ticket" });
  }

  const agentEmail = ticket.assignedTo?.email;
  if (!agentEmail || !agentEmail.includes("@")) {
    return res.status(200).json({ success: true, skipped: "No assigned agent email" });
  }

  // Resolve the assigner's display name from the agents directory
  let assignedByName = caller.email;
  try {
    const assignerSnap = await getAdminDb().collection("agents").doc(caller.email).get();
    if (assignerSnap.exists) assignedByName = assignerSnap.data().name || caller.email;
  } catch (_) { /* fall back to the caller's email */ }

  try {
    const result = await sendEmail({
      to:      agentEmail,
      subject: `[Harbix] Ticket assigned to you — ${ticket.location || "Unknown location"}`,
      html:    agentAssignedEmail({
        agentName:     ticket.assignedTo.name  || agentEmail,
        assignedBy:    assignedByName,
        submitterName: ticket.name             || "Unknown",
        location:      ticket.location         || "",
        issue:         ticket.issue            || "",
        priority:      ticket.priority         || "normal",
        dueDate:       ticket.dueDate          || "",
        ticketId:      ticket_id,
      }),
    });

    console.log("Assignment email sent:", result.id);
    return res.status(200).json({ success: true, emailId: result.id });

  } catch (err) {
    console.error("notify-agent error:", err.message);
    return res.status(500).json({ error: "Email send failed", detail: err.message });
  }
}
