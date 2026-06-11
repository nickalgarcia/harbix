// api/notify-agent.js
// Emails an agent when they're assigned a ticket.
// Migrated from EmailJS → Resend. Request body contract unchanged.

import { sendEmail, agentAssignedEmail } from "./_lib/email.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    agent_email, agent_name, assigned_by,
    submitter_name, location, issue,
    priority, due_date, ticket_id,
  } = req.body;

  if (!agent_email) {
    return res.status(200).json({ success: true, skipped: "No agent email" });
  }

  try {
    const result = await sendEmail({
      to:      agent_email,
      subject: `[Harbix] Ticket assigned to you — ${location || "Unknown location"}`,
      html:    agentAssignedEmail({
        agentName:     agent_name,
        assignedBy:    assigned_by,
        submitterName: submitter_name,
        location,
        issue,
        priority,
        dueDate:       due_date,
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
