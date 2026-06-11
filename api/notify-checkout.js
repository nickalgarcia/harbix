// api/notify-checkout.js
// NEW route — emails the tech inbox when an asset is checked out or checked in.
// Replaces the client-side EmailJS call in HarbixInventory.jsx (which exposed
// keys in the browser bundle). The browser now just POSTs the event here.

import { sendEmail, inventoryCheckoutEmail } from "./_lib/email.js";

const TICKETS_TO = process.env.TICKETS_TO_EMAIL || "tech@godchasers.church";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    action,        // "checkout" | "checkin" (defaults to checkout)
    asset_name, asset_id,
    person_name, person_email,
    notes,
  } = req.body;

  if (!asset_name && !asset_id) {
    return res.status(400).json({ error: "Missing asset info" });
  }

  const isCheckin = action === "checkin";

  try {
    const result = await sendEmail({
      to:      TICKETS_TO,
      subject: `[Harbix Inventory] ${asset_name || asset_id} ${isCheckin ? "checked in" : "checked out"}`,
      html:    inventoryCheckoutEmail({
        action,
        assetName:   asset_name,
        assetId:     asset_id,
        personName:  person_name,
        personEmail: person_email,
        notes,
      }),
    });

    console.log("Inventory email sent:", result.id);
    return res.status(200).json({ success: true, emailId: result.id });

  } catch (err) {
    console.error("notify-checkout error:", err.message);
    return res.status(500).json({ error: "Email send failed", detail: err.message });
  }
}
