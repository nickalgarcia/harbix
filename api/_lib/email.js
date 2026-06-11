// api/_lib/email.js
// Shared Resend send helper + all email templates for Harbix.
// The underscore prefix on _lib keeps Vercel from deploying this as an endpoint.
//
// Required env var:  RESEND_API_KEY
// Optional env vars: RESEND_FROM      (default: Harbix <notifications@godchasers.church>)
//                    RESEND_REPLY_TO  (default: tech@godchasers.church)

const FROM     = process.env.RESEND_FROM     || "Harbix <notifications@godchasers.church>";
const REPLY_TO = process.env.RESEND_REPLY_TO || "tech@godchasers.church";

// ── Brand palette (tweak to match Harbix exactly) ─────────────────────────────
const BRAND = {
  navy:    "#16243D",
  orange:  "#E8762D",
  text:    "#1F2937",
  textSub: "#6B7280",
  border:  "#E5E7EB",
  offWhite:"#F8F7F4",
  green:   "#15803D",
  red:     "#991B1B",
};

// ── Core send function ────────────────────────────────────────────────────────
export async function sendEmail({ to, subject, html, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from:     FROM,
      to:       Array.isArray(to) ? to : [to],
      subject,
      html,
      reply_to: replyTo || REPLY_TO,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Resend failed (${res.status}): ${text}`);
  }
  return JSON.parse(text); // { id: "..." }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Escape user-provided strings so ticket text can't inject HTML into emails
export function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Escape + preserve line breaks (for multi-line messages)
function escMultiline(str) {
  return esc(str).replace(/\n/g, "<br>");
}

// Shared outer layout — header bar, white card, footer
function layout(title, bodyHtml) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:${BRAND.offWhite};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.offWhite};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border};font-family:'Segoe UI',Arial,sans-serif;">
        <tr>
          <td style="background:${BRAND.navy};padding:18px 28px;">
            <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:0.5px;">Harbix</span>
            <span style="color:${BRAND.orange};font-size:13px;font-weight:600;padding-left:10px;">${esc(title)}</span>
          </td>
        </tr>
        <tr><td style="padding:26px 28px;color:${BRAND.text};font-size:14px;line-height:1.6;">
          ${bodyHtml}
        </td></tr>
        <tr>
          <td style="padding:14px 28px;border-top:1px solid ${BRAND.border};color:${BRAND.textSub};font-size:11.5px;">
            GodChasers Church &middot; Harbix Help Desk &middot; <a href="https://harbix.vercel.app" style="color:${BRAND.textSub};">harbix.vercel.app</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Label/value detail row
function row(label, valueHtml) {
  return `<tr>
    <td style="padding:6px 0;color:${BRAND.textSub};font-size:12.5px;width:120px;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;color:${BRAND.text};font-size:13.5px;">${valueHtml}</td>
  </tr>`;
}

// ── Templates ─────────────────────────────────────────────────────────────────

// 1. New ticket → tech inbox
export function newTicketEmail({ name, location, contact, issue, photoURL, ticketId }) {
  return layout("New Ticket", `
    <p style="margin:0 0 16px;font-size:15px;"><strong>A new ticket just came in.</strong></p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${row("From",     esc(name || "Unknown"))}
      ${row("Location", esc(location || "Unknown"))}
      ${row("Contact",  esc(contact || "Not provided"))}
      ${row("Issue",    escMultiline(issue || ""))}
      ${row("Photo",    photoURL ? `<a href="${esc(photoURL)}" style="color:${BRAND.orange};">View attached photo</a>` : "None")}
      ${row("Ticket ID", `<span style="font-family:monospace;font-size:12px;">${esc(ticketId || "")}</span>`)}
    </table>
    <p style="margin:20px 0 0;">
      <a href="https://harbix.vercel.app" style="background:${BRAND.orange};color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:13.5px;font-weight:600;display:inline-block;">Open Harbix</a>
    </p>
  `);
}

// 2. Ticket assigned → agent
export function agentAssignedEmail({ agentName, assignedBy, submitterName, location, issue, priority, dueDate, ticketId }) {
  const p = (priority || "normal").toLowerCase();
  const priorityLabels = { normal:"Normal", high:"High", critical:"Critical" };
  const priorityBg     = { normal:"#F3F4F6", high:"#FEF3C7", critical:"#FEE2E2" };
  const priorityColor  = { normal:"#6B7280", high:"#92400E", critical:"#991B1B" };

  return layout("Ticket Assigned", `
    <p style="margin:0 0 16px;font-size:15px;">Hi ${esc(agentName || "there")} — <strong>${esc(assignedBy || "An admin")}</strong> assigned you a ticket.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${row("Priority", `<span style="background:${priorityBg[p] || priorityBg.normal};color:${priorityColor[p] || priorityColor.normal};padding:3px 12px;border-radius:20px;font-size:11.5px;font-weight:700;">${priorityLabels[p] || "Normal"}</span>`)}
      ${row("Submitted by", esc(submitterName || "Unknown"))}
      ${row("Location",  esc(location || "Unknown"))}
      ${row("Issue",     escMultiline(issue || ""))}
      ${row("Due date",  esc(dueDate || "No due date set"))}
      ${row("Ticket ID", `<span style="font-family:monospace;font-size:12px;">${esc(ticketId || "")}</span>`)}
    </table>
    <p style="margin:20px 0 0;">
      <a href="https://harbix.vercel.app" style="background:${BRAND.orange};color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:13.5px;font-weight:600;display:inline-block;">View in Harbix</a>
    </p>
  `);
}

// 3. Agent replied → submitter
export function submitterReplyEmail({ location, issue, agentName, message, ticketId }) {
  return layout("Update on Your Request", `
    <p style="margin:0 0 16px;font-size:15px;"><strong>${esc(agentName || "Our team")}</strong> replied to your request:</p>
    <div style="background:${BRAND.offWhite};border-left:3px solid ${BRAND.orange};border-radius:0 8px 8px 0;padding:14px 16px;margin:0 0 18px;font-size:13.5px;">
      ${escMultiline(message || "")}
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${row("Your request", escMultiline(issue || ""))}
      ${row("Location",     esc(location || ""))}
      ${row("Reference",    `<span style="font-family:monospace;font-size:12px;">${esc(ticketId || "")}</span>`)}
    </table>
    <p style="margin:18px 0 0;color:${BRAND.textSub};font-size:12.5px;">Need to add more details? Just reply to this email and it'll reach the tech team.</p>
  `);
}

// 4. Ticket resolved → submitter
export function submitterResolvedEmail({ location, issue, status, ticketId }) {
  return layout("Request Resolved", `
    <p style="margin:0 0 16px;font-size:15px;">Good news — your request has been marked <strong style="color:${BRAND.green};">${esc(status || "Resolved")}</strong>. 🎉</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${row("Your request", escMultiline(issue || ""))}
      ${row("Location",     esc(location || ""))}
      ${row("Reference",    `<span style="font-family:monospace;font-size:12px;">${esc(ticketId || "")}</span>`)}
    </table>
    <p style="margin:18px 0 0;color:${BRAND.textSub};font-size:12.5px;">Still having trouble? Reply to this email or submit a new request at <a href="https://harbix.vercel.app" style="color:${BRAND.orange};">harbix.vercel.app</a>.</p>
  `);
}

// 5. Inventory checkout/check-in → tech inbox
export function inventoryCheckoutEmail({ action, assetName, assetId, personName, personEmail, notes }) {
  const isCheckin = action === "checkin";
  return layout(isCheckin ? "Asset Checked In" : "Asset Checked Out", `
    <p style="margin:0 0 16px;font-size:15px;"><strong>${esc(assetName || "An asset")}</strong> was ${isCheckin ? "checked in" : "checked out"}.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${row("Asset",    `${esc(assetName || "")} <span style="font-family:monospace;font-size:12px;color:${BRAND.textSub};">(${esc(assetId || "")})</span>`)}
      ${row(isCheckin ? "Returned by" : "Checked out by", esc(personName || "Unknown"))}
      ${personEmail ? row("Email", esc(personEmail)) : ""}
      ${notes ? row("Notes", escMultiline(notes)) : ""}
    </table>
  `);
}

// 6. Weekly digest → PD
export function weeklyDigestEmail({ weekOf, newTickets, openTickets, resolvedTickets, oldestTickets, totalAssets, checkedOutAssets, needsRepairAssets, overdueList }) {
  const stat = (label, value, color) => `
    <td align="center" style="padding:14px 6px;background:${BRAND.offWhite};border-radius:10px;">
      <div style="font-size:24px;font-weight:800;color:${color || BRAND.navy};">${esc(String(value))}</div>
      <div style="font-size:11px;color:${BRAND.textSub};text-transform:uppercase;letter-spacing:0.5px;padding-top:2px;">${label}</div>
    </td>`;

  const list = (items, emptyMsg) => items && items.length
    ? items.map(i => `<div style="padding:5px 0;font-size:13px;border-bottom:1px solid ${BRAND.border};">${esc(i)}</div>`).join("")
    : `<div style="padding:5px 0;font-size:13px;color:${BRAND.green};">${esc(emptyMsg)}</div>`;

  return layout("Weekly Digest", `
    <p style="margin:0 0 4px;font-size:15px;"><strong>Week of ${esc(weekOf)}</strong></p>
    <p style="margin:0 0 18px;color:${BRAND.textSub};font-size:12.5px;">Here's what happened across tickets and inventory this week.</p>

    <p style="margin:0 0 8px;font-weight:700;font-size:13px;color:${BRAND.navy};">TICKETS</p>
    <table role="presentation" cellpadding="0" cellspacing="6" width="100%"><tr>
      ${stat("New", newTickets)}
      ${stat("Open", openTickets, BRAND.orange)}
      ${stat("Resolved", resolvedTickets, BRAND.green)}
    </tr></table>

    <p style="margin:18px 0 6px;font-weight:700;font-size:13px;color:${BRAND.navy};">WAITING LONGEST</p>
    ${list(oldestTickets, "No open tickets — clean slate! 🎉")}

    <p style="margin:22px 0 8px;font-weight:700;font-size:13px;color:${BRAND.navy};">INVENTORY</p>
    <table role="presentation" cellpadding="0" cellspacing="6" width="100%"><tr>
      ${stat("Total Assets", totalAssets)}
      ${stat("Checked Out", checkedOutAssets, BRAND.orange)}
      ${stat("Needs Repair", needsRepairAssets, BRAND.red)}
    </tr></table>

    <p style="margin:18px 0 6px;font-weight:700;font-size:13px;color:${BRAND.navy};">CHECKED OUT 7+ DAYS</p>
    ${list(overdueList, "None — all good! ✅")}

    <p style="margin:22px 0 0;">
      <a href="https://harbix.vercel.app" style="background:${BRAND.orange};color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:13.5px;font-weight:600;display:inline-block;">Open Harbix</a>
    </p>
  `);
}
