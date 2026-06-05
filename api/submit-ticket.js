// api/submit-ticket.js
// Vercel serverless function — sends email notification via EmailJS on ticket submission

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, location, issue, contact, photoURL, firestoreId } = req.body;

  const EMAILJS_SERVICE_ID   = process.env.EMAILJS_SERVICE_ID;
  const EMAILJS_TEMPLATE_ID  = process.env.EMAILJS_TEMPLATE_ID;
  const EMAILJS_PUBLIC_KEY   = process.env.EMAILJS_PUBLIC_KEY;
  const EMAILJS_PRIVATE_KEY  = process.env.EMAILJS_PRIVATE_KEY;

  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY || !EMAILJS_PRIVATE_KEY) {
    console.error("Missing EmailJS credentials");
    return res.status(500).json({ error: "EmailJS credentials not configured" });
  }

  try {
    console.log("Sending EmailJS notification for ticket:", firestoreId);

    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id:   EMAILJS_SERVICE_ID,
        template_id:  EMAILJS_TEMPLATE_ID,
        user_id:      EMAILJS_PUBLIC_KEY,
        accessToken:  EMAILJS_PRIVATE_KEY,
        template_params: {
          name:       name       || "Unknown",
          location:   location   || "Unknown",
          contact:    contact    || "Not provided",
          issue:      issue      || "",
          photo_note: photoURL   ? `Photo attached: ${photoURL}` : "No photo attached",
          ticket_id:  firestoreId || "",
        },
      }),
    });

    const text = await response.text();
    console.log("EmailJS response status:", response.status);
    console.log("EmailJS response:", text);

    if (!response.ok) {
      console.error("EmailJS failed:", text);
      return res.status(500).json({ error: "EmailJS failed", detail: text });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Serverless function error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}