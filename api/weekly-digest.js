// api/weekly-digest.js
// Vercel Cron Job — sends a weekly summary digest to tech@godchasers.church
// Schedule is set in vercel.json (recommended: Mondays at 8am CT = "0 14 * * 1")

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore }                  from "firebase-admin/firestore";

// ── Firebase Admin init (safe for multiple invocations) ───────────────────────
function getAdminDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function startOfWeek() {
  // Returns a Date for last Monday at 00:00:00 local (UTC for server)
  const now  = new Date();
  const day  = now.getUTCDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  const mon  = new Date(now);
  mon.setUTCDate(now.getUTCDate() - diff);
  mon.setUTCHours(0, 0, 0, 0);
  return mon;
}

function toTS(val) {
  // Normalize Firestore Timestamp, JS Date, or ISO string → Date
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  return new Date(val);
}

function daysSince(date) {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Allow manual trigger via GET (for testing) or the cron runner
  const isCron   = req.headers["x-vercel-cron"] === "1";
  const isManual = req.method === "GET" || req.method === "POST";
  if (!isCron && !isManual) return res.status(405).json({ error: "Method not allowed" });

  // Optional secret to protect manual triggers
  const secret = req.headers["x-digest-secret"] || req.query.secret;
  if (process.env.DIGEST_SECRET && secret !== process.env.DIGEST_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const db   = getAdminDb();
    const week = startOfWeek();

    // ── 1. Tickets ────────────────────────────────────────────────────────────
    const ticketSnap = await db.collection("tickets").get();
    const tickets    = ticketSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const openStatuses    = ["waiting", "claimed", "in_progress"];
    const resolvedStatuses = ["done", "closed"];

    const openTickets     = tickets.filter(t => openStatuses.includes(t.status));
    const resolvedThisWeek = tickets.filter(t => {
      if (!resolvedStatuses.includes(t.status)) return false;
      const updated = toTS(t.updatedAt);
      return updated && updated >= week;
    });
    const newThisWeek     = tickets.filter(t => {
      const created = toTS(t.createdAt);
      return created && created >= week;
    });

    // Waiting longest (top 3 open, sorted by createdAt asc)
    const waitingLongest = [...openTickets]
      .sort((a, b) => toTS(a.createdAt) - toTS(b.createdAt))
      .slice(0, 3)
      .map(t => {
        const age  = daysSince(toTS(t.createdAt));
        const who  = t.assignedTo?.name || t.claimedBy || "Unclaimed";
        return `• ${t.location} — "${t.issue?.slice(0, 60)}${t.issue?.length > 60 ? "…" : ""}" (${age}d old, ${who})`;
      });

    // Status breakdown of open tickets
    const byStatus = openStatuses.reduce((acc, s) => {
      acc[s] = openTickets.filter(t => t.status === s).length;
      return acc;
    }, {});

    // ── 2. Inventory ──────────────────────────────────────────────────────────
    const assetSnap = await db.collection("inventory").get();
    const assets    = assetSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const assetCounts = {
      total:        assets.length,
      available:    assets.filter(a => a.status === "available").length,
      checked_out:  assets.filter(a => a.status === "checked_out").length,
      needs_repair: assets.filter(a => a.status === "needs_repair").length,
    };

    // Overdue checkouts: checked out for 7+ days
    const overdueAssets = assets
      .filter(a => a.status === "checked_out")
      .map(a => {
        const history = a.checkoutHistory || [];
        const latest  = history[history.length - 1];
        const age     = latest?.checkedOutAt ? daysSince(toTS(latest.checkedOutAt)) : null;
        return { ...a, daysOut: age, checkedOutBy: latest?.name || "Unknown" };
      })
      .filter(a => a.daysOut !== null && a.daysOut >= 7)
      .sort((a, b) => b.daysOut - a.daysOut);

    const overdueLines = overdueAssets.length
      ? overdueAssets.map(a => `• ${a.name} (${a.assetId}) — checked out by ${a.checkedOutBy} for ${a.daysOut} days`).join("\n")
      : "None — all good! ✅";

    // ── 3. Send via EmailJS ───────────────────────────────────────────────────
    const dateLabel = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      timeZone: "America/Chicago",
    });
    const emailRes = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id:  process.env.EMAILJS_SERVICE_ID,
        template_id: process.env.EMAILJS_DIGEST_TEMPLATE_ID,
        user_id:     process.env.EMAILJS_PUBLIC_KEY,
        accessToken: process.env.EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email:            process.env.DIGEST_TO_EMAIL || "pd@godchasers.church",
          subject:             `Harbix Weekly Digest — ${dateLabel}`,
          week_of:             dateLabel,
          // Ticket stats
          new_tickets:         String(newThisWeek.length),
          open_tickets:        String(openTickets.length),
          resolved_tickets:    String(resolvedThisWeek.length),
          oldest_tickets:      waitingLongest.join("\n") || "No open tickets — clean slate! 🎉",
          // Inventory stats
          total_assets:        String(assetCounts.total),
          checked_out_assets:  String(assetCounts.checked_out),
          needs_repair_assets: String(assetCounts.needs_repair),
          overdue_list:        overdueLines,
        },
      }),
    });

    const emailText = await emailRes.text();
    if (!emailRes.ok) {
      console.error("EmailJS digest failed:", emailText);
      return res.status(500).json({ error: "EmailJS failed", detail: emailText });
    }

    console.log("Weekly digest sent successfully");
    return res.status(200).json({
      success: true,
      stats: {
        newTickets: newThisWeek.length,
        openTickets: openTickets.length,
        resolvedThisWeek: resolvedThisWeek.length,
        totalAssets: assetCounts.total,
        overdueCheckouts: overdueAssets.length,
      },
    });

  } catch (err) {
    console.error("weekly-digest error:", err);
    return res.status(500).json({ error: err.message });
  }
}
