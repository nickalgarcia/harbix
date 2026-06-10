import { useState, useEffect } from "react";
import {
  collection, addDoc, getDocs, doc,
  updateDoc, query, orderBy, serverTimestamp, onSnapshot
} from "firebase/firestore";
import QRCode from "qrcode";
import { db } from "./firebase";
import { B, HarbixLogo } from "./theme";

// ─── Constants ────────────────────────────────────────────────────────────────
const NOTIFY_EMAIL = "tech@godchasers.church";
const BASE_URL = typeof window !== "undefined" ? window.location.origin : "https://harbix.vercel.app";

const LOCATIONS = [
  "AV Room",
  "Copy Room",
  "Green Room",
  "gKids - General",
  "gKids - gFour5",
  "gKids - gKids Jr.",
  "gKids - gSeen",
  "gKids - gTots",
  "gTeens - Next Wave 1",
  "gTeens - Next Wave 2",
  "Parent Care Room",
  "Staff Lounge",
  "The Main Hall",
  "The Nexus",
  "Worship Center (Sanctuary)",
  "Storage",
  "Other",
];

const CATEGORIES = [
  "iPad",
  "Laptop",
  "Camera",
  "Microphone",
  "Audio Gear",
  "Video Gear",
  "Cable / Adapter",
  "TV / Display",
  "Printer",
  "Other",
];

const CONDITIONS = ["Good", "Fair", "Needs Repair", "Retired"];

const STATUS_COLORS = {
  available: { bg: "#eaf3de", text: "#3b6d11", label: "Available" },
  checked_out: { bg: "#faeeda", text: "#854f0b", label: "Checked Out" },
  needs_repair: { bg: "#fcebeb", text: "#a32d2d", label: "Needs Repair" },
  retired: { bg: "#f1efe8", text: "#5f5e5a", label: "Retired" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCurrency(val) {
  const n = parseFloat(val);
  if (!val || isNaN(n)) return null;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function exportCSV(assets) {
  const headers = ["Asset ID", "Name", "Category", "Location", "Status", "Condition", "Serial Number", "Purchase Date", "Purchase Value", "Notes"];
  const rows = assets.map((a) => [
    a.assetId,
    a.name,
    a.category,
    a.location,
    STATUS_COLORS[a.status]?.label || a.status,
    a.condition,
    a.serialNumber || "",
    a.purchaseDate || "",
    a.purchaseValue ? `$${parseFloat(a.purchaseValue).toFixed(2)}` : "",
    (a.notes || "").replace(/,/g, ";"),
  ]);
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `GodChasers-Inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportInsuranceReport(assets) {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const totalValue = assets.reduce((sum, a) => sum + (parseFloat(a.purchaseValue) || 0), 0);
  const activeAssets = assets.filter((a) => a.status !== "retired");

  const byLocation = activeAssets.reduce((acc, a) => {
    const loc = a.location || "Unknown";
    if (!acc[loc]) acc[loc] = [];
    acc[loc].push(a);
    return acc;
  }, {});

  const rows = Object.entries(byLocation).sort(([a], [b]) => a.localeCompare(b)).map(([loc, items]) => {
    const locValue = items.reduce((s, a) => s + (parseFloat(a.purchaseValue) || 0), 0);
    const itemRows = items.map((a) => `
      <tr>
        <td>${a.assetId}</td>
        <td>${a.name}</td>
        <td>${a.category}</td>
        <td>${a.condition || "—"}</td>
        <td>${a.serialNumber || "—"}</td>
        <td>${a.purchaseDate || "—"}</td>
        <td>${a.purchaseValue ? `$${parseFloat(a.purchaseValue).toLocaleString()}` : "—"}</td>
      </tr>`).join("");
    return `
      <tr style="background:#f5f5f5;">
        <td colspan="6" style="font-weight:600;padding:10px 8px;">${loc}</td>
        <td style="font-weight:600;padding:10px 8px;">${locValue ? `$${locValue.toLocaleString()}` : "—"}</td>
      </tr>
      ${itemRows}`;
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>GodChasers Church — Inventory Report</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; padding: 40px; max-width: 1000px; margin: 0 auto; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .meta { color: #666; font-size: 13px; margin-bottom: 32px; }
    .summary { display: flex; gap: 24px; margin-bottom: 32px; flex-wrap: wrap; }
    .stat { background: #f5f5f5; border-radius: 8px; padding: 14px 20px; min-width: 140px; }
    .stat-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-value { font-size: 24px; font-weight: 700; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #111; color: #fff; padding: 10px 8px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: 8px; border-bottom: 1px solid #eee; vertical-align: top; }
    .footer { margin-top: 40px; font-size: 11px; color: #aaa; border-top: 1px solid #eee; padding-top: 16px; }
  </style>
</head>
<body>
  <h1>GodChasers Church — Equipment Inventory</h1>
  <div class="meta">Generated ${date} · For insurance and asset management purposes</div>
  <div class="summary">
    <div class="stat"><div class="stat-label">Total Active Assets</div><div class="stat-value">${activeAssets.length}</div></div>
    <div class="stat"><div class="stat-label">Total Declared Value</div><div class="stat-value" style="color:#1a6b2a;">${totalValue ? `$${totalValue.toLocaleString()}` : "Not recorded"}</div></div>
    <div class="stat"><div class="stat-label">Locations</div><div class="stat-value">${Object.keys(byLocation).length}</div></div>
    <div class="stat"><div class="stat-label">Needs Repair</div><div class="stat-value" style="color:#a32d2d;">${assets.filter(a => a.status === "needs_repair" || a.condition === "Needs Repair").length}</div></div>
  </div>
  <table>
    <thead><tr><th>Asset ID</th><th>Name</th><th>Category</th><th>Condition</th><th>Serial #</th><th>Purchase Date</th><th>Value</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">GodChasers Church · Harbix Inventory System · harbix.vercel.app</div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  // Trigger print after load
  if (win) win.onload = () => { win.print(); };
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ─── EmailJS notification ─────────────────────────────────────────────────────
async function sendCheckoutEmail(asset, checkoutData) {
  try {
    const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
    const templateId = import.meta.env.VITE_EMAILJS_INVENTORY_TEMPLATE_ID || import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
    const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
    if (!serviceId || !templateId || !publicKey) return;
    await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: {
          to_email: NOTIFY_EMAIL,
          subject: `[Harbix Inventory] ${asset.name} checked out`,
          message: `Asset: ${asset.name} (${asset.assetId})\nChecked out by: ${checkoutData.name}${checkoutData.email ? ` <${checkoutData.email}>` : ""}\nLocation: ${asset.location}\nTime: ${new Date().toLocaleString()}`,
        },
      }),
    });
  } catch (e) {
    console.log("Email notification skipped:", e.message);
  }
}

// ─── QR Generator ────────────────────────────────────────────────────────────
async function generateQRDataURL(assetId) {
  const url = `${BASE_URL}/inventory/asset/${assetId}`;
  return QRCode.toDataURL(url, { width: 256, margin: 2, color: { dark: "#F2F0EC", light: "#ffffff" } });
}

// ─── Generate asset ID ────────────────────────────────────────────────────────
function generateAssetId(category, existingIds) {
  const prefix = category.replace(/[^a-zA-Z]/g, "").substring(0, 3).toUpperCase();
  let num = 1;
  while (existingIds.includes(`GC-${prefix}-${String(num).padStart(3, "0")}`)) num++;
  return `GC-${prefix}-${String(num).padStart(3, "0")}`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const S = {
  page: {
    minHeight: "100vh",
    background: "#F8F7F5",
    color: "#1C1B22",
    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    padding: "0",
  },
  header: {
    background: "#4E4D5F",
    padding: "0 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "54px",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  container: {
    maxWidth: "1100px",
    margin: "0 auto",
    padding: "32px 24px",
  },
  card: {
    background: "#FFFFFF",
    border: "1px solid #E8E4DE",
    borderRadius: "12px",
    padding: "24px",
    marginBottom: "16px",
  },
  input: {
    width: "100%",
    background: "#FFFFFF",
    border: "1px solid #E8E4DE",
    borderRadius: "8px",
    color: "#1C1B22",
    padding: "10px 14px",
    fontSize: "16px",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  },
  select: {
    width: "100%",
    background: "#FFFFFF",
    border: "1px solid #E8E4DE",
    borderRadius: "8px",
    color: "#1C1B22",
    padding: "10px 14px",
    fontSize: "16px",
    outline: "none",
    boxSizing: "border-box",
    appearance: "none",
    cursor: "pointer",
  },
  label: {
    fontSize: "12px",
    fontWeight: "500",
    color: "#6E6A72",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "6px",
    display: "block",
  },
  btn: {
    background: "#EF6423",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  btnGhost: {
    background: "#FFFFFF",
    color: "#6E6A72",
    border: "1px solid #E8E4DE",
    borderRadius: "8px",
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  btnDanger: {
    background: "transparent",
    color: "#e24b4a",
    border: "1px solid #F7C1C1",
    borderRadius: "8px",
    padding: "8px 16px",
    fontSize: "13px",
    cursor: "pointer",
  },
  badge: (status) => ({
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: "500",
    background: STATUS_COLORS[status]?.bg || "#f1efe8",
    color: STATUS_COLORS[status]?.text || "#5f5e5a",
    letterSpacing: "0.02em",
    whiteSpace: "nowrap",
  }),
  tab: (active) => ({
    padding: "8px 16px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: active ? "700" : "500",
    cursor: "pointer",
    background: active ? "#FFF4EF" : "transparent",
    color: active ? "#EF6423" : "#8A8590",
    border: active ? "1.5px solid #FDDECE" : "1.5px solid transparent",
    transition: "all 0.15s",
  }),
  divider: {
    borderTop: "1px solid #E8E4DE",
    margin: "16px 0",
  },
  checkoutHistory: {
    background: "#F2F0EC",
    borderRadius: "8px",
    padding: "12px 16px",
    marginBottom: "8px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
};

// ─── View router ──────────────────────────────────────────────────────────────
export default function HarbixInventory({ onBack }) {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const assetIdFromPath = path.startsWith("/inventory/asset/")
    ? path.replace("/inventory/asset/", "")
    : null;

  const [view, setView] = useState(assetIdFromPath ? "checkout_public" : "admin");
  const [publicAssetId] = useState(assetIdFromPath);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "inventory"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setAssets(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const navigate = (v, asset = null) => {
    setView(v);
    if (asset) setSelectedAsset(asset);
  };

  return (
    <div style={S.page}>
      <Header view={view} onHome={() => navigate("admin")} onBack={onBack} />
      {loading && view !== "checkout_public" ? (
        <LoadingScreen />
      ) : view === "admin" ? (
        <AdminDashboard assets={assets} onAdd={() => navigate("add")} onBack={onBack} onCheckout={(a) => navigate("checkout", a)} />
      ) : view === "checkout" ? (
        <CheckoutFlow asset={selectedAsset} onBack={() => navigate("admin")} onDone={() => navigate("admin")} />
      ) : view === "checkout_public" ? (
        <CheckoutPublic assetId={publicAssetId} assets={assets} loading={loading} />
      ) : view === "add" ? (
        <AddAsset assets={assets} onBack={() => navigate("admin")} onSaved={() => navigate("admin")} />
      ) : null}
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────
function Header({ view, onHome, onBack }) {
  const handleBackToTickets = onBack || (() => { window.location.href = "/agent"; });
  return (
    <div style={S.header}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {view !== "checkout_public" && (
          <button onClick={handleBackToTickets} style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", border: "1.5px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "6px 12px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
            ← Tickets
          </button>
        )}
        <div style={{ cursor: "pointer" }} onClick={onHome}>
          <HarbixLogo dark size="sm" sub="Inventory" />
        </div>
      </div>
    </div>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "#A09A94" }}>
      Loading inventory…
    </div>
  );
}

// ─── Public Checkout (via QR scan) ───────────────────────────────────────────
function CheckoutPublic({ assetId, assets, loading }) {
  const asset = assets.find((a) => a.assetId === assetId);
  if (loading) return <div style={{ padding: "60px 24px", textAlign: "center", color: "#8A8590" }}>Loading…</div>;
  if (!asset) return (
    <div style={{ padding: "60px 24px", textAlign: "center" }}>
      <div style={{ fontSize: "18px", marginBottom: "8px" }}>Asset not found</div>
      <div style={{ color: "#8A8590", fontSize: "14px" }}>ID: {assetId}</div>
    </div>
  );
  return (
    <div style={{ padding: "24px", maxWidth: "440px", margin: "0 auto" }}>
      <div style={{ ...S.card, marginBottom: "0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: "500", marginBottom: "4px" }}>{asset.name}</div>
            <div style={{ fontSize: "12px", color: "#6E6A72", fontFamily: "monospace" }}>{asset.assetId}</div>
          </div>
          <span style={S.badge(asset.status)}>{STATUS_COLORS[asset.status]?.label}</span>
        </div>
        <div style={{ fontSize: "13px", color: "#8A8590", marginBottom: "16px" }}>
          {asset.category} · {asset.location}
          {asset.condition && asset.condition !== "Good" && <span style={{ color: "#e24b4a" }}> · {asset.condition}</span>}
        </div>
        {asset.notes && (
          <div style={{ background: "#F2F0EC", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#6E6A72", marginBottom: "16px" }}>
            {asset.notes}
          </div>
        )}
      </div>
      <CheckoutFlow asset={asset} onBack={() => window.location.href = "/"} onDone={() => window.location.href = "/"} />
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminDashboard({ assets, onAdd, onBack, onCheckout }) {
  const [tab, setTab] = useState("assets");
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState({});

  const setStatusFilterSafe = (val) => { setStatusFilter(val); setExpandedIds(new Set()); setCollapsedCategories({}); };
  const setSearchSafe = (val) => { setSearch(val); setExpandedIds(new Set()); setCollapsedCategories({}); };

  const toggleAsset = (id) => setExpandedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const handleStatusChange = async (asset, newStatus) => {
    await updateDoc(doc(db, "inventory", asset.id), { status: newStatus });
  };

  // Some assets are flagged via the "Condition" field (e.g. set to "Needs Repair")
  // without their operational status being updated to match — treat either as a match
  // so the "Needs Repair" filter and counts reflect what staff actually marked.
  const matchesStatus = (asset, status) =>
    status === "needs_repair"
      ? asset.status === "needs_repair" || asset.condition === "Needs Repair"
      : asset.status === status;

  const totalValue = assets
    .filter((a) => a.status !== "retired")
    .reduce((sum, a) => sum + (parseFloat(a.purchaseValue) || 0), 0);

  const counts = {
    total: assets.length,
    available: assets.filter((a) => a.status === "available").length,
    checked_out: assets.filter((a) => a.status === "checked_out").length,
    needs_repair: assets.filter((a) => matchesStatus(a, "needs_repair")).length,
  };

  const filtered = assets.filter((a) => {
    const matchStatus = statusFilter === "All" || matchesStatus(a, statusFilter);
    const q = search.toLowerCase();
    const matchSearch = !q || a.name?.toLowerCase().includes(q) || a.assetId?.toLowerCase().includes(q) || a.location?.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const grouped = filtered.reduce((acc, asset) => {
    const cat = asset.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(asset);
    return acc;
  }, {});
  const categories = Object.keys(grouped).sort();

  const toggleCategory = (cat) => setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));

  return (
    <div style={S.container}>
      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px", marginBottom: "24px" }}>
        {[
          { label: "Total Assets", value: counts.total, color: "#1C1B22" },
          { label: "Available", value: counts.available, color: "#639922" },
          { label: "Checked Out", value: counts.checked_out, color: "#ba7517" },
          { label: "Needs Repair", value: counts.needs_repair, color: "#e24b4a" },
          { label: "Declared Value", value: totalValue ? `$${totalValue.toLocaleString()}` : "—", color: "#3B82F6", small: true },
        ].map((s) => (
          <div key={s.label} style={{ background: "#FFFFFF", border: "1px solid #E8E4DE", borderRadius: "10px", padding: "14px 16px" }}>
            <div style={{ fontSize: "11px", color: "#8A8590", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{s.label}</div>
            <div style={{ fontSize: s.small ? "18px" : "24px", fontWeight: "600", color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs + actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          {["assets", "checkouts"].map((t) => (
            <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
              {t === "assets" ? "All assets" : "Checkout log"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={{ ...S.btnGhost, fontSize: "13px", padding: "8px 14px" }} onClick={() => exportCSV(assets)} title="Download CSV for spreadsheet use">
            ↓ CSV
          </button>
          <button style={{ ...S.btnGhost, fontSize: "13px", padding: "8px 14px" }} onClick={() => exportInsuranceReport(assets)} title="Print insurance report grouped by location">
            🖨 Report
          </button>
          <button style={S.btn} onClick={onAdd}>+ Add asset</button>
        </div>
      </div>

      {tab === "assets" && (
        <>
          <div style={{ marginBottom: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <input
              style={{ ...S.input, fontSize: "14px" }}
              placeholder="Search by name, ID, or location…"
              value={search}
              onChange={(e) => setSearchSafe(e.target.value)}
            />
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {["All", "available", "checked_out", "needs_repair", "retired"].map((s) => (
                <button
                  key={s}
                  style={{ ...S.tab(statusFilter === s), fontSize: "12px", padding: "6px 12px" }}
                  onClick={() => setStatusFilterSafe(s)}
                >
                  {s === "All" ? `All (${assets.length})` : `${STATUS_COLORS[s]?.label} (${assets.filter(a => matchesStatus(a, s)).length})`}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#A09A94", background: "#FFFFFF", border: "1px solid #E8E4DE", borderRadius: "12px" }}>
              {search ? `No assets matching "${search}"` : "No assets found."}
            </div>
          ) : (
            categories.map((cat) => {
              const catAssets = grouped[cat];
              const isCollapsed = collapsedCategories[cat];
              return (
                <div key={cat} style={{ marginBottom: "12px" }}>
                  <div
                    onClick={() => toggleCategory(cat)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "#F2F0EC", border: "1px solid #E8E4DE", borderRadius: isCollapsed ? "10px" : "10px 10px 0 0", cursor: "pointer", userSelect: "none" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "13px", fontWeight: "600", color: "#1C1B22" }}>{cat}</span>
                      <span style={{ fontSize: "11px", color: "#6E6A72", background: "#F2F0EC", padding: "2px 8px", borderRadius: "10px" }}>{catAssets.length}</span>
                    </div>
                    <span style={{ color: "#A09A94", fontSize: "11px" }}>{isCollapsed ? "▼" : "▲"}</span>
                  </div>
                  {!isCollapsed && (
                    <div style={{ background: "#FFFFFF", border: "1px solid #E8E4DE", borderTop: "none", borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
                      {catAssets.map((asset, i) => (
                        <AdminAssetRow
                          key={asset.id}
                          asset={asset}
                          last={i === catAssets.length - 1}
                          onStatusChange={handleStatusChange}
                          onSelect={() => toggleAsset(asset.id)}
                          expanded={expandedIds.has(asset.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </>
      )}

      {tab === "checkouts" && <CheckoutLog assets={assets} />}
    </div>
  );
}

// ─── Admin Asset Row ──────────────────────────────────────────────────────────
function AdminAssetRow({ asset, last, onStatusChange, onSelect, expanded }) {
  const [qrUrl, setQrUrl] = useState(null);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const startEdit = (e) => {
    e.stopPropagation();
    setEditForm({
      name: asset.name || "",
      category: asset.category || "iPad",
      location: asset.location || "The Nexus",
      condition: asset.condition || "Good",
      serialNumber: asset.serialNumber || "",
      notes: asset.notes || "",
      purchaseDate: asset.purchaseDate || "",
      purchaseValue: asset.purchaseValue || "",
    });
    setEditing(true);
  };

  const cancelEdit = (e) => { e?.stopPropagation(); setEditing(false); };

  const saveEdit = async (e) => {
    e.stopPropagation();
    if (!editForm.name.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "inventory", asset.id), {
        ...editForm,
        name: editForm.name.trim(),
        purchaseValue: editForm.purchaseValue ? parseFloat(editForm.purchaseValue) : null,
        updatedAt: serverTimestamp(),
      });
      setEditing(false);
    } catch (err) {
      console.error("Failed to update asset:", err);
    }
    setSaving(false);
  };

  const setF = (k, v) => setEditForm((f) => ({ ...f, [k]: v }));

  const loadDetails = async () => {
    if (!expanded) {
      try {
        if (!qrUrl) {
          const url = await generateQRDataURL(asset.assetId);
          setQrUrl(url);
        }
        setLoadingHistory(true);
        const snap = await getDocs(query(collection(db, "inventory", asset.id, "history"), orderBy("timestamp", "desc")));
        setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Failed to load asset details:", err);
      } finally {
        setLoadingHistory(false);
      }
    }
    onSelect();
  };

  const printLabel = () => {
    const win = window.open("", "_blank");
    win.document.write(`
      <html><body style="text-align:center;font-family:sans-serif;padding:20px;">
        <img src="${qrUrl}" style="width:180px;height:180px;" /><br/>
        <strong style="font-size:16px;">${asset.name}</strong><br/>
        <span style="font-size:12px;color:#8A8590;">${asset.assetId} · ${asset.location}</span>
      </body></html>
    `);
    win.print();
  };

  const isMobile = window.innerWidth < 600;

  return (
    <div style={{ borderBottom: last ? "none" : "1px solid #222" }}>
      {/* Collapsed row */}
      <div
        className="hx-row"
        style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
        onClick={loadDetails}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1, minWidth: 0 }}>
          <span style={S.badge(asset.status)}>{STATUS_COLORS[asset.status]?.label}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "14px", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {asset.name}
              {/* Show checked-out name inline */}
              {asset.status === "checked_out" && asset.checkedOutTo?.name && (
                <span style={{ fontSize: "12px", color: "#ba7517", fontWeight: "400", marginLeft: "8px" }}>
                  → {asset.checkedOutTo.name}
                </span>
              )}
            </div>
            <div style={{ fontSize: "12px", color: "#6E6A72" }}>{asset.assetId} · {asset.location}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          {expanded && !editing && (
            <button style={{ ...S.btnGhost, fontSize: "12px", padding: "4px 10px" }} onClick={startEdit}>
              ✏️ Edit
            </button>
          )}
          <span style={{ color: "#A09A94", fontSize: "12px" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: "0 20px 20px", borderTop: "1px solid #FFFFFF" }}>
          {editing ? (
            // ── Edit form ──
            <div style={{ marginTop: "16px" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Asset name *">
                    <input style={S.input} value={editForm.name} onChange={(e) => setF("name", e.target.value)} />
                  </Field>
                </div>
                <Field label="Category">
                  <select style={S.select} value={editForm.category} onChange={(e) => setF("category", e.target.value)}>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Location">
                  <select style={S.select} value={editForm.location} onChange={(e) => setF("location", e.target.value)}>
                    {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Condition">
                  <select style={S.select} value={editForm.condition} onChange={(e) => setF("condition", e.target.value)}>
                    {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Serial number">
                  <input style={S.input} value={editForm.serialNumber} onChange={(e) => setF("serialNumber", e.target.value)} placeholder="Optional" />
                </Field>
                <Field label="Purchase date">
                  <input style={S.input} type="date" value={editForm.purchaseDate} onChange={(e) => setF("purchaseDate", e.target.value)} />
                </Field>
                <Field label="Purchase value ($)">
                  <input style={S.input} type="number" min="0" step="1" value={editForm.purchaseValue} onChange={(e) => setF("purchaseValue", e.target.value)} placeholder="e.g. 329" />
                </Field>
                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Notes">
                    <textarea style={{ ...S.input, height: "72px", resize: "vertical" }} value={editForm.notes} onChange={(e) => setF("notes", e.target.value)} placeholder="Anything the team should know" />
                  </Field>
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button style={S.btnGhost} onClick={cancelEdit}>Cancel</button>
                <button style={{ ...S.btn, opacity: saving ? 0.6 : 1 }} onClick={saveEdit} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          ) : (
            // ── Read view ──
            <div style={{ display: "flex", flexDirection: isMobile ? "column-reverse" : "row", gap: "20px", marginTop: "16px" }}>
              {/* Left: details + status + history */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "12px", color: "#8A8590", marginBottom: "12px", lineHeight: "1.8" }}>
                  {asset.serialNumber && <div>Serial: <span style={{ color: "#6E6A72" }}>{asset.serialNumber}</span></div>}
                  {asset.condition && <div>Condition: <span style={{ color: "#6E6A72" }}>{asset.condition}</span></div>}
                  {asset.purchaseDate && <div>Purchased: <span style={{ color: "#6E6A72" }}>{asset.purchaseDate}</span></div>}
                  {asset.purchaseValue && <div>Value: <span style={{ color: "#3B82F6", fontWeight: "500" }}>{formatCurrency(asset.purchaseValue)}</span></div>}
                  {asset.checkedOutTo?.name && (
                    <div>Checked out to: <span style={{ color: "#ba7517" }}>{asset.checkedOutTo.name}{asset.checkedOutTo.email ? ` · ${asset.checkedOutTo.email}` : ""}</span></div>
                  )}
                  {asset.notes && <div style={{ marginTop: "4px" }}>Notes: <span style={{ color: "#6E6A72" }}>{asset.notes}</span></div>}
                </div>
                <div style={{ marginBottom: "12px" }}>
                  <label style={S.label}>Change status</label>
                  <select style={{ ...S.select, width: "180px" }} value={asset.status} onChange={(e) => onStatusChange(asset, e.target.value)}>
                    {Object.entries(STATUS_COLORS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                {/* Checkout history */}
                <div>
                  <div style={{ fontSize: "11px", color: "#6E6A72", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Checkout history</div>
                  {loadingHistory ? (
                    <div style={{ color: "#A09A94", fontSize: "13px" }}>Loading…</div>
                  ) : history.length === 0 ? (
                    <div style={{ color: "#A09A94", fontSize: "13px" }}>No history yet.</div>
                  ) : (
                    history.slice(0, 5).map((h) => (
                      <div key={h.id} style={S.checkoutHistory}>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: "500" }}>{h.by?.name}</div>
                          {h.by?.email && <div style={{ fontSize: "12px", color: "#8A8590" }}>{h.by.email}</div>}
                          {h.notes && <div style={{ fontSize: "12px", color: "#6E6A72", fontStyle: "italic" }}>{h.notes}</div>}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ ...S.badge(h.action === "returned" ? "available" : "checked_out"), fontSize: "10px" }}>
                            {h.action === "returned" ? "Returned" : "Checked out"}
                          </span>
                          {h.timestamp && (
                            <div style={{ fontSize: "11px", color: "#6E6A72", marginTop: "4px" }}>
                              {new Date(h.timestamp.seconds * 1000).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              {/* Right: QR code */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: isMobile ? "center" : "flex-end" }}>
                {qrUrl ? (
                  <>
                    <img src={qrUrl} alt="QR code" style={{ width: isMobile ? "180px" : "120px", height: isMobile ? "180px" : "120px", borderRadius: "8px", marginBottom: "8px" }} />
                    <div style={{ fontSize: "11px", color: "#6E6A72", textAlign: "center", marginBottom: "10px", fontFamily: "monospace", wordBreak: "break-all" }}>
                      {BASE_URL}/inventory/asset/{asset.assetId}
                    </div>
                    <button style={{ ...S.btnGhost, fontSize: "12px", padding: "6px 12px" }} onClick={printLabel}>
                      🖨 Print label
                    </button>
                  </>
                ) : (
                  <div style={{ width: "120px", height: "120px", background: "#F2F0EC", borderRadius: "8px" }} />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Checkout Log ─────────────────────────────────────────────────────────────
function CheckoutLog({ assets }) {
  const [log, setLog] = useState([]);
  const [loadingLog, setLoadingLog] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      const all = [];
      for (const asset of assets) {
        const snap = await getDocs(query(collection(db, "inventory", asset.id, "history"), orderBy("timestamp", "desc")));
        snap.docs.forEach((d) => all.push({ ...d.data(), assetName: asset.name, assetId: asset.assetId, location: asset.location }));
      }
      all.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setLog(all);
      setLoadingLog(false);
    };
    fetchAll();
  }, [assets]);

  if (loadingLog) return <div style={{ color: "#A09A94", padding: "20px" }}>Loading log…</div>;
  if (log.length === 0) return <div style={{ color: "#A09A94", padding: "20px" }}>No checkout history yet.</div>;

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #E8E4DE", borderRadius: "12px", overflow: "hidden" }}>
      {log.map((entry, i) => (
        <div key={i} style={{ padding: "14px 20px", borderBottom: i === log.length - 1 ? "none" : "1px solid #FFFFFF", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: "500" }}>{entry.assetName} <span style={{ color: "#6E6A72", fontFamily: "monospace", fontSize: "12px" }}>({entry.assetId})</span></div>
            <div style={{ fontSize: "12px", color: "#8A8590", marginTop: "2px" }}>
              {entry.by?.name}{entry.by?.email && ` · ${entry.by.email}`}
            </div>
            {entry.location && <div style={{ fontSize: "11px", color: "#A09A94", marginTop: "2px" }}>{entry.location}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ ...S.badge(entry.action === "returned" ? "available" : "checked_out"), fontSize: "10px" }}>
              {entry.action === "returned" ? "Returned" : "Checked out"}
            </span>
            {entry.timestamp && (
              <div style={{ fontSize: "11px", color: "#6E6A72", marginTop: "4px" }}>
                {new Date(entry.timestamp.seconds * 1000).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  );
}

// ─── Checkout Flow ────────────────────────────────────────────────────────────
function CheckoutFlow({ asset, onBack, onDone }) {
  const isReturn = asset?.status === "checked_out";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  if (!asset) return null;

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Name is required."); return; }
    setSubmitting(true);
    setError("");
    try {
      const assetRef = doc(db, "inventory", asset.id);
      if (isReturn) {
        await updateDoc(assetRef, {
          status: "available",
          checkedOutTo: null,
          lastReturnedAt: serverTimestamp(),
          lastReturnedBy: { name: name.trim(), email: email.trim() || null },
        });
        await addDoc(collection(db, "inventory", asset.id, "history"), {
          action: "returned",
          by: { name: name.trim(), email: email.trim() || null },
          notes: notes.trim() || null,
          timestamp: serverTimestamp(),
        });
      } else {
        const checkoutData = { name: name.trim(), email: email.trim() || null, date: serverTimestamp() };
        await updateDoc(assetRef, { status: "checked_out", checkedOutTo: checkoutData });
        await addDoc(collection(db, "inventory", asset.id, "history"), {
          action: "checked_out",
          by: checkoutData,
          notes: notes.trim() || null,
          timestamp: serverTimestamp(),
        });
        await sendCheckoutEmail(asset, { name: name.trim(), email: email.trim() });
      }
      setDone(true);
    } catch (e) {
      setError("Something went wrong. Please try again.");
      console.error(e);
    }
    setSubmitting(false);
  };

  if (done) {
    return (
      <div style={{ ...S.container, maxWidth: "480px" }}>
        <div style={{ ...S.card, textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>{isReturn ? "✅" : "📦"}</div>
          <div style={{ fontSize: "18px", fontWeight: "500", marginBottom: "8px" }}>
            {isReturn ? "Returned!" : "Checked out!"}
          </div>
          <div style={{ color: "#8A8590", fontSize: "14px", marginBottom: "24px" }}>
            {isReturn ? `${asset.name} is back in inventory.` : `${asset.name} is checked out to ${name}.`}
          </div>
          <button style={S.btn} onClick={onDone}>Back to inventory</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...S.container, maxWidth: "480px" }}>
      <button style={{ ...S.btnGhost, marginBottom: "20px", padding: "6px 14px", fontSize: "13px" }} onClick={onBack}>
        ← Back
      </button>
      <div style={S.card}>
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "11px", color: "#6E6A72", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{isReturn ? "Return" : "Check out"}</div>
          <div style={{ fontSize: "20px", fontWeight: "500" }}>{asset.name}</div>
          <div style={{ fontSize: "12px", color: "#6E6A72", marginTop: "2px" }}>{asset.assetId} · {asset.location}</div>
        </div>
        <div style={S.divider} />
        <div style={{ marginBottom: "16px" }}>
          <label style={S.label}>Your name *</label>
          <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" />
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={S.label}>Email (optional)</label>
          <input style={S.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div style={{ marginBottom: "20px" }}>
          <label style={S.label}>Notes (optional)</label>
          <textarea style={{ ...S.input, height: "72px", resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={isReturn ? "Any issues to report?" : "What will you use this for?"} />
        </div>
        {error && <div style={{ color: "#e24b4a", fontSize: "13px", marginBottom: "12px" }}>{error}</div>}
        <button style={{ ...S.btn, width: "100%", opacity: submitting ? 0.6 : 1 }} onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Saving…" : isReturn ? "Confirm return" : "Confirm checkout"}
        </button>
      </div>
    </div>
  );
}

// ─── Add Asset ────────────────────────────────────────────────────────────────
function AddAsset({ assets, onBack, onSaved }) {
  const [form, setForm] = useState({
    name: "",
    category: "iPad",
    location: "The Nexus",
    condition: "Good",
    serialNumber: "",
    notes: "",
    purchaseDate: "",
    purchaseValue: "",
    status: "available",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Asset name is required."); return; }
    setSaving(true);
    setError("");
    try {
      const existingIds = assets.map((a) => a.assetId);
      const assetId = generateAssetId(form.category, existingIds);
      await addDoc(collection(db, "inventory"), {
        ...form,
        name: form.name.trim(),
        assetId,
        purchaseValue: form.purchaseValue ? parseFloat(form.purchaseValue) : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onSaved();
    } catch (e) {
      setError("Failed to save. Please try again.");
      console.error(e);
    }
    setSaving(false);
  };

  return (
    <div style={{ ...S.container, maxWidth: "560px" }}>
      <button style={{ ...S.btnGhost, marginBottom: "20px", padding: "6px 14px", fontSize: "13px" }} onClick={onBack}>
        ← Back
      </button>
      <div style={S.card}>
        <div style={{ fontSize: "16px", fontWeight: "500", marginBottom: "20px" }}>Add new asset</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Asset name *">
              <input style={S.input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. iPad 9th Gen" />
            </Field>
          </div>
          <Field label="Category">
            <select style={S.select} value={form.category} onChange={(e) => set("category", e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Location">
            <select style={S.select} value={form.location} onChange={(e) => set("location", e.target.value)}>
              {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </Field>
          <Field label="Condition">
            <select style={S.select} value={form.condition} onChange={(e) => set("condition", e.target.value)}>
              {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Initial status">
            <select style={S.select} value={form.status} onChange={(e) => set("status", e.target.value)}>
              {Object.entries(STATUS_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Serial number">
            <input style={S.input} value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Purchase date">
            <input style={S.input} type="date" value={form.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} />
          </Field>
          <Field label="Purchase value ($)">
            <input style={S.input} type="number" min="0" step="1" value={form.purchaseValue} onChange={(e) => set("purchaseValue", e.target.value)} placeholder="e.g. 329" />
          </Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Notes">
              <textarea style={{ ...S.input, height: "72px", resize: "vertical" }} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything the team should know about this item" />
            </Field>
          </div>
        </div>
        {error && <div style={{ color: "#e24b4a", fontSize: "13px", marginBottom: "12px" }}>{error}</div>}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button style={S.btnGhost} onClick={onBack}>Cancel</button>
          <button style={{ ...S.btn, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save asset"}
          </button>
        </div>
      </div>
    </div>
  );
}
