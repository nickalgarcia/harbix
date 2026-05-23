// api/submit-ticket.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, location, issue, contact, photoURL, firestoreId } = req.body;

  const PC_APP_ID   = process.env.PC_APP_ID;
  const PC_SECRET   = process.env.PC_SECRET;
  // Your Planning Center Person ID — visible at bottom right of api.planningcenteronline.com
  const PC_PERSON_ID = process.env.PC_PERSON_ID;

  if (!PC_APP_ID || !PC_SECRET || !PC_PERSON_ID) {
    console.error("Missing PC credentials");
    return res.status(500).json({ error: "Planning Center credentials not configured" });
  }

  const auth = "Basic " + Buffer.from(`${PC_APP_ID}:${PC_SECRET}`).toString("base64");

  const taskTitle = `[Harbix] ${name} — ${location}: ${issue.slice(0, 60)}${issue.length > 60 ? "…" : ""}`;

  const note = [
    `📍 Location: ${location}`,
    `👤 Submitted by: ${name}`,
    contact ? `📬 Contact: ${contact}` : null,
    ``,
    `📝 Issue: ${issue}`,
    photoURL ? `📷 Photo: ${photoURL}` : null,
    ``,
    `🔗 Harbix ID: ${firestoreId}`,
    `🌐 https://harbix.vercel.app`,
  ].filter(Boolean).join("\n");

  try {
    console.log("Creating PC task for person:", PC_PERSON_ID);

    const taskRes = await fetch(
      `https://api.planningcenteronline.com/people/v2/people/${PC_PERSON_ID}/tasks`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Authorization": auth },
        body: JSON.stringify({
          data: {
            type: "Task",
            attributes: {
              note:      taskTitle,
              completed: false,
            },
          },
        }),
      }
    );

    const taskJson = await taskRes.json();
    console.log("PC task response status:", taskRes.status);
    console.log("PC task response:", JSON.stringify(taskJson).slice(0, 300));

    if (!taskRes.ok) {
      console.error("PC task creation failed:", JSON.stringify(taskJson));
      return res.status(500).json({ error: "PC task creation failed", detail: taskJson });
    }

    return res.status(200).json({ success: true, pcTaskId: taskJson.data?.id });

  } catch (err) {
    console.error("Serverless function error:", err.message);
    return res.status(500).json({ error: "Internal server error", message: err.message });
  }
}