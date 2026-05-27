// api/notify-agent.js
// Sends email to an agent when they are assigned a ticket

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    agent_email, agent_name, assigned_by,
    submitter_name, location, issue,
    priority, due_date, ticket_id,
  } = req.body;

  const EMAILJS_SERVICE_ID    = process.env.EMAILJS_SERVICE_ID;
  const EMAILJS_PUBLIC_KEY    = process.env.EMAILJS_PUBLIC_KEY;
  const EMAILJS_PRIVATE_KEY   = process.env.EMAILJS_PRIVATE_KEY;
  const EMAILJS_ASSIGN_TEMPLATE = process.env.EMAILJS_ASSIGN_TEMPLATE_ID;

  if (!agent_email) {
    return res.status(200).json({ success: true, skipped: "No agent email" });
  }

  const priorityLabels = { normal:"Normal", high:"High", critical:"Critical" };
  const priorityBg     = { normal:"#F3F4F6", high:"#FEF3C7", critical:"#FEE2E2" };
  const priorityColor  = { normal:"#6B7280", high:"#92400E", critical:"#991B1B" };

  try {
    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id:   EMAILJS_SERVICE_ID,
        template_id:  EMAILJS_ASSIGN_TEMPLATE,
        user_id:      EMAILJS_PUBLIC_KEY,
        accessToken:  EMAILJS_PRIVATE_KEY,
        template_params: {
          agent_email,
          agent_name,
          assigned_by,
          submitter_name,
          location,
          issue,
          priority:      priorityLabels[priority] || "Normal",
          priority_bg:   priorityBg[priority]     || "#F3F4F6",
          priority_color:priorityColor[priority]  || "#6B7280",
          due_date:      due_date || "No due date set",
          ticket_id,
        },
      }),
    });

    const text = await response.text();
    console.log("Agent notify status:", response.status, text);

    if (!response.ok) {
      console.error("Agent notify failed:", text);
      return res.status(500).json({ error: "EmailJS failed", detail: text });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("notify-agent error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
