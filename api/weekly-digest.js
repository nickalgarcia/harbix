// api/weekly-digest.js
// Vercel Cron Job — sends a weekly summary digest (default: pd@godchasers.church)
// Schedule is set in vercel.json (Mondays at 8am CT = "0 14 * * 1")
// Migrated from EmailJS → Resend. Data logic unchanged; only the send section is new.

import { getAdminDb }                   from "./_lib/admin.js";
import { sendEmail, weeklyDigestEmail }  from "./_lib/email.js";

// ── Helpers ───────────────────────────────────────────────────────────────────
function startOfWeek() {
  const now  = new Date();
  const day  = now.getUTCDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  const mon  = new Date(now);
  mon.setUTCDate(now.getUTCDate() - diff);
  mon.setUTCHours(0, 0, 0, 0);
  return mon;
}

function toTS(val) {
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
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // CRON_SECRET is required — fail closed if not set.
  // Vercel automatically attaches "Authorization: Bearer <CRON_SECRET>" to
  // cron invocations. For manual triggers, include the same header.
  // Note: the old x-vercel-cron header is NOT used as an auth signal because
  // any HTTP client can set it.
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("weekly-digest: CRON_SECRET env var not set — locked down until it is");
    return res.status(503).json({ error: "Not configured" });
  }
  const authHeader = req.headers.authorization || "";
  const provided   = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const db   = getAdminDb();
    const week = startOfWeek();

    // ── 1. Tickets ────────────────────────────────────────────────────────────
    const ticketSnap = await db.collection("tickets").get();
    const tickets    = ticketSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const openStatuses     = ["waiting", "claimed", "in_progress"];
    const resolvedStatuses = ["done", "closed"];

    const openTickets      = tickets.filter(t => openStatuses.includes(t.status));
    const resolvedThisWeek = tickets.filter(t => {
      if (!resolvedStatuses.includes(t.status)) return false;
      const updated = toTS(t.updatedAt);
      return updated && updated >= week;
    });
    const newThisWeek      = tickets.filter(t => {
      const created = toTS(t.createdAt);
      return created && created >= week;
    });

    // Waiting longest (top 3 open, sorted by createdAt asc)
    const waitingLongest = [...openTickets]
      .sort((a, b) => toTS(a.createdAt) - toTS(b.createdAt))
      .slice(0, 3)
      .map(t => {
        const age = daysSince(toTS(t.createdAt));
        const who = t.assignedTo?.name || t.claimedBy || "Unclaimed";
        return `${t.location} — "${t.issue?.slice(0, 60)}${t.issue?.length > 60 ? "…" : ""}" (${age}d old, ${who})`;
      });

    // ── 2. Inventory ──────────────────────────────────────────────────────────
    const assetSnap = await db.collection("inventory").get();
    const assets    = assetSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const assetCounts = {
      total:        assets.length,
      available:    assets.filter(a => a.status === "available").length,
      checked_out:  assets.filter(a => a.status === "checked_out").length,
      needs_repair: assets.filter(a => a.status === "needs_repair" || a.condition === "Needs Repair").length,
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

    const overdueList = overdueAssets.map(
      a => `${a.name} (${a.assetId}) — checked out by ${a.checkedOutBy} for ${a.daysOut} days`
    );

    // ── 3. Send via Resend ────────────────────────────────────────────────────
    const dateLabel = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      timeZone: "America/Chicago",
    });

    const result = await sendEmail({
      to:      process.env.DIGEST_TO_EMAIL || "pd@godchasers.church",
      subject: `Harbix Weekly Digest — ${dateLabel}`,
      html:    weeklyDigestEmail({
        weekOf:            dateLabel,
        newTickets:        newThisWeek.length,
        openTickets:       openTickets.length,
        resolvedTickets:   resolvedThisWeek.length,
        oldestTickets:     waitingLongest,
        totalAssets:       assetCounts.total,
        checkedOutAssets:  assetCounts.checked_out,
        needsRepairAssets: assetCounts.needs_repair,
        overdueList,
      }),
    });

    console.log("Weekly digest sent:", result.id);
    return res.status(200).json({
      success: true,
      emailId: result.id,
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
