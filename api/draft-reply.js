// api/draft-reply.js
// Vercel serverless function — AI-drafted submitter replies via the Anthropic API
// Called from TicketDetail's "Draft reply with AI" button. The agent edits the
// draft before sending, so the AI never communicates with anyone directly.
//
// Unlike /api/triage (which the public form calls), this endpoint verifies the
// caller's Firebase ID token — only signed-in @godchasers.church agents can use it.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth }                       from "firebase-admin/auth";

function getAdminApp() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
}

const SYSTEM_PROMPT = `You draft replies from the GodChasers Church help desk to people who submitted support tickets. The agent will review and edit your draft before sending — you are writing a draft, not sending anything.

Write a warm, plain-language reply that:
- Greets the submitter by first name
- Acknowledges their specific issue in everyday words (no technical jargon)
- Reflects the current state of the ticket: if it's being worked on, say so; if it's resolved, say what to expect; if it's still waiting, reassure them it's in the queue
- Never invents details, promises, timelines, or fixes that aren't supported by the ticket info and comments provided
- Is 2-5 sentences, friendly but not gushing
- Ends with just the agent's first name as a sign-off

Respond with ONLY the reply text. No subject line, no quotation marks, no preamble, no markdown.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── Verify the caller is a signed-in church agent ─────────────
  try {
    getAdminApp();
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Missing auth token" });
    const decoded = await getAuth().verifyIdToken(token);
    if (!decoded.email?.endsWith("@godchasers.church")) {
      return res.status(403).json({ error: "Not authorized" });
    }
  } catch (e) {
    console.error("Auth verification failed:", e.message);
    return res.status(401).json({ error: "Invalid auth token" });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY");
    return res.status(500).json({ error: "Not configured" });
  }

  const { ticket, comments, agentName } = req.body || {};
  if (!ticket?.issue) return res.status(400).json({ error: "Missing ticket" });

  const recent = (Array.isArray(comments) ? comments : [])
    .slice(-6)
    .map(c => `${(c.author||"Agent").slice(0,60)} (${c.type==="reply"?"reply to submitter":"internal note"}): ${(c.text||"").slice(0,500)}`)
    .join("\n");

  const userMessage =
    `Submitter first name: ${(ticket.name||"there").split(" ")[0].slice(0,40)}\n` +
    `Issue: ${(ticket.issue||"").slice(0,1500)}\n` +
    `Location: ${(ticket.location||"").slice(0,200)}\n` +
    `Ticket status: ${ticket.status||"waiting"}\n` +
    `Department: ${ticket.department||"unsorted"}\n` +
    `Priority: ${ticket.priority||"normal"}\n` +
    (recent ? `Recent comments on the ticket:\n${recent}\n` : "") +
    `Agent first name for the sign-off: ${(agentName||"The Help Desk").split(" ")[0].slice(0,40)}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: "user", content: userMessage }],
      }),
    });
    clearTimeout(timer);

    if (!response.ok) {
      const text = await response.text();
      console.error("Anthropic API error:", response.status, text);
      return res.status(502).json({ error: "Draft generation failed" });
    }

    const data  = await response.json();
    const draft = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim();

    if (!draft) return res.status(502).json({ error: "Empty draft" });

    return res.status(200).json({ draft });

  } catch (err) {
    console.error("draft-reply error:", err.message);
    return res.status(500).json({ error: "Draft generation failed" });
  }
}
