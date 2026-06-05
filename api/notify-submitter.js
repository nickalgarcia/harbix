// api/notify-submitter.js
// Sends email to submitter on reply or ticket resolution

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    type, // "reply" | "resolved"
    submitter_email, location, issue,
    agent_name, message,  // reply only
    status,               // resolved only
    ticket_id,
  } = req.body;

  const EMAILJS_SERVICE_ID      = process.env.EMAILJS_SERVICE_ID;
  const EMAILJS_PUBLIC_KEY      = process.env.EMAILJS_PUBLIC_KEY;
  const EMAILJS_PRIVATE_KEY     = process.env.EMAILJS_PRIVATE_KEY;
  const EMAILJS_REPLY_TEMPLATE  = process.env.EMAILJS_REPLY_TEMPLATE_ID;
  const EMAILJS_RESOLVED_TEMPLATE = process.env.EMAILJS_RESOLVED_TEMPLATE_ID;

  // Only send if contact looks like an email
  if (!submitter_email || !submitter_email.includes("@")) {
    console.log("Contact is not an email — skipping submitter notification");
    return res.status(200).json({ success: true, skipped: true });
  }

  const templateId = type === "reply" ? EMAILJS_REPLY_TEMPLATE : EMAILJS_RESOLVED_TEMPLATE;

  if (!templateId) {
    return res.status(500).json({ error: `Missing template ID for type: ${type}` });
  }

  const templateParams = type === "reply"
    ? { submitter_email, location, issue, agent_name, message, ticket_id }
    : { submitter_email, location, issue, status, ticket_id };

  try {
    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id:   EMAILJS_SERVICE_ID,
        template_id:  templateId,
        user_id:      EMAILJS_PUBLIC_KEY,
        accessToken:  EMAILJS_PRIVATE_KEY,
        template_params: templateParams,
      }),
    });

    const text = await response.text();
    console.log("Submitter notify status:", response.status, text);

    if (!response.ok) {
      console.error("Submitter notify failed:", text);
      return res.status(500).json({ error: "EmailJS failed", detail: text });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("notify-submitter error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
