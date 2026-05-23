// api/submit-ticket.js
// Vercel serverless function — runs on the server, PC credentials never exposed to browser

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, location, issue, contact, photoURL, firestoreId } = req.body;

  const PC_APP_ID = process.env.PC_APP_ID;
  const PC_SECRET = process.env.PC_SECRET;

  if (!PC_APP_ID || !PC_SECRET) {
    return res.status(500).json({ error: "Planning Center credentials not configured" });
  }

  // Build the task note with all ticket details
  const noteLines = [
    `📍 Location: ${location}`,
    `👤 Submitted by: ${name}`,
    contact ? `📬 Contact: ${contact}` : null,
    ``,
    `📝 Issue:`,
    issue,
    ``,
    photoURL ? `📷 Photo: ${photoURL}` : null,
    ``,
    `🔗 Harbix ID: ${firestoreId}`,
    `🌐 View in Harbix: https://harbix.vercel.app`,
  ].filter(Boolean).join("\n");

  try {
    // First — get your own Person ID from Planning Center
    const meResponse = await fetch("https://api.planningcenteronline.com/people/v2/me", {
      headers: {
        "Authorization": "Basic " + Buffer.from(`${PC_APP_ID}:${PC_SECRET}`).toString("base64"),
      },
    });
    const meData = await meResponse.json();
    const personId = meData.data?.id;

    if (!personId) {
      console.error("Could not fetch PC person ID:", JSON.stringify(meData));
      return res.status(500).json({ error: "Could not resolve Planning Center person ID" });
    }

    // Create a task assigned to that person
    const response = await fetch(`https://api.planningcenteronline.com/people/v2/people/${personId}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic " + Buffer.from(`${PC_APP_ID}:${PC_SECRET}`).toString("base64"),
      },
      body: JSON.stringify({
        data: {
          type: "Task",
          attributes: {
            note:      `[Harbix] ${name} — ${location}: ${issue.slice(0, 80)}${issue.length > 80 ? "…" : ""}`,
            completed: false,
          },
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("PC API error:", err);
      return res.status(500).json({ error: "Planning Center API error", detail: err });
    }

    const data = await response.json();
    return res.status(200).json({ success: true, pcTaskId: data.data?.id });

  } catch (err) {
    console.error("Serverless function error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}