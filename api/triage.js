// api/triage.js
// Vercel serverless function — AI ticket triage via the Anthropic API
// Classifies a new ticket into a department, sets priority, and generates
// a suggested first step for the agent + an optional self-help tip for the submitter.
// Called by the public form BEFORE the ticket is written to Firestore.
// Fails soft: any error returns an "unsorted / normal" fallback so submission never breaks.

const FALLBACK = {
  department:  "unsorted",
  priority:    "normal",
  firstStep:   null,
  selfHelpTip: null,
  confidence:  0,
};

// ── Rate limiting (Upstash Redis REST) ────────────────────────────────────────
// 5 requests per IP per 60-second rolling window.
// Fails open with a logged warning if the Upstash env vars are absent —
// the function still works, rate limiting just won't be enforced until
// UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set in Vercel.
const RATE_LIMIT  = 5;  // max requests per window per IP
const RATE_WINDOW = 60; // window length in seconds

async function checkRateLimit(ip) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.warn("triage: rate limiting not configured (UPSTASH_REDIS_REST_URL/TOKEN missing) — skipping");
    return { limited: false };
  }

  let res;
  try {
    // Pipeline: INCR the counter, then (re)set its TTL
    res = await fetch(`${url}/pipeline`, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify([
        ["INCR",   `triage:${ip}`],
        ["EXPIRE", `triage:${ip}`, RATE_WINDOW],
      ]),
    });
  } catch (err) {
    console.warn("triage: Upstash request failed:", err.message, "— failing open");
    return { limited: false };
  }

  if (!res.ok) {
    console.warn(`triage: Upstash returned ${res.status} — failing open`);
    return { limited: false };
  }

  const data  = await res.json();
  const count = data?.[0]?.[1]; // pipeline response: [[error, result], ...]
  if (typeof count !== "number") {
    console.warn("triage: unexpected Upstash response — failing open");
    return { limited: false };
  }
  return { limited: count > RATE_LIMIT };
}

// ── AI prompt ────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You triage help desk tickets for GodChasers Church. Respond ONLY with a JSON object — no markdown, no backticks, no explanation.

Classify the ticket into exactly one department:
- "tech": computers, Wi-Fi/network, printers, software, email/accounts, check-in systems (KidCheck), TVs/streaming devices, security cameras, iPads, phones
- "av": soundboard, microphones, speakers, projectors, screens, livestream/broadcast, stage lighting, sanctuary audio/video
- "facilities": HVAC/heating/cooling, plumbing, doors/locks, building lights/electrical, furniture, cleaning, grounds, building damage
- "unsorted": only if it genuinely fits none of the above

Set priority:
- "critical": blocking a service or event happening now or within hours, a safety issue, or a church-wide outage
- "high": blocking someone's work or an upcoming service with no workaround
- "normal": everything else

Also provide:
- "firstStep": ONE practical sentence telling the technician the most likely diagnostic or fix to try first
- "selfHelpTip": ONE safe, simple thing the submitter could try themselves (power cycle, check a cable, check mute/volume, restart an app). Must require no tools, no ladders, and no opening equipment. If nothing safe and simple applies, use null.
- "confidence": a number 0 to 1 for how confident you are in the department classification

JSON shape:
{"department":"tech|av|facilities|unsorted","priority":"normal|high|critical","firstStep":"...","selfHelpTip":"..." or null,"confidence":0.0}`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const clientIP = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  let limited = false;
  try {
    ({ limited } = await checkRateLimit(clientIP));
  } catch (err) {
    console.warn("triage: rate-limit check threw:", err.message, "— failing open");
  }
  if (limited) {
    return res.status(429).json({ error: "Too many requests — try again shortly" });
  }

  // ── Key check (fail soft — never block a ticket) ──────────────────────────
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY");
    return res.status(200).json(FALLBACK);
  }

  const { issue, location, name } = req.body || {};
  if (!issue || typeof issue !== "string") {
    return res.status(200).json(FALLBACK);
  }

  // Cap input length — guards cost + abuse on a public endpoint
  const safeIssue    = issue.slice(0, 1500);
  const safeLocation = (location || "").slice(0, 200);
  const safeName     = (name || "").slice(0, 100);

  // Day/time context helps priority calls ("sound is down" hits different on Sunday 9am)
  const nowCT = new Date().toLocaleString("en-US", {
    weekday: "long", hour: "numeric", minute: "2-digit",
    timeZone: "America/Chicago",
  });

  const userMessage =
    `Current day/time (Central): ${nowCT}\n` +
    `Submitted by: ${safeName || "Unknown"}\n` +
    `Location: ${safeLocation || "Not given"}\n` +
    `Issue: ${safeIssue}`;

  try {
    // 8s timeout so the public form never hangs on a slow API call
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

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
        max_tokens: 300,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: "user", content: userMessage }],
      }),
    });
    clearTimeout(timer);

    if (!response.ok) {
      const text = await response.text();
      console.error("Anthropic API error:", response.status, text);
      return res.status(200).json(FALLBACK);
    }

    const data = await response.json();
    const raw  = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    const parsed = JSON.parse(raw);

    // Validate — never let a weird model response poison the ticket
    const departments = ["tech", "av", "facilities", "unsorted"];
    const priorities  = ["normal", "high", "critical"];

    const result = {
      department:  departments.includes(parsed.department) ? parsed.department : "unsorted",
      priority:    priorities.includes(parsed.priority)    ? parsed.priority   : "normal",
      firstStep:   typeof parsed.firstStep === "string"   ? parsed.firstStep.slice(0, 300)   : null,
      selfHelpTip: typeof parsed.selfHelpTip === "string" ? parsed.selfHelpTip.slice(0, 300) : null,
      confidence:  typeof parsed.confidence === "number"  ? Math.min(1, Math.max(0, parsed.confidence)) : 0,
    };

    // Low confidence → park it in unsorted so an admin routes it manually
    if (result.confidence < 0.5) result.department = "unsorted";

    console.log("Triage result:", JSON.stringify(result));
    return res.status(200).json(result);

  } catch (err) {
    console.error("triage error:", err.message);
    return res.status(200).json(FALLBACK);
  }
}
