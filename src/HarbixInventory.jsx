import { useState, useEffect } from "react";
import {
  collection, addDoc, getDocs, doc,
  updateDoc, query, orderBy, serverTimestamp, onSnapshot
} from "firebase/firestore";
import QRCode from "qrcode";
import { db } from "./firebase";

// ─── Constants ────────────────────────────────────────────────────────────────
const NOTIFY_EMAIL = "tech@godchasers.church";
const BASE_URL = typeof window !== "undefined" ? window.location.origin : "https://harbix.vercel.app";

const LOCATIONS = [
  "Green Room",
  "Next Wave 1",
  "Next Wave 2",
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

// ─── EmailJS notification (reuses existing setup) ────────────────────────────
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
  return QRCode.toDataURL(url, { width: 256, margin: 2, color: { dark: "#1a1a1a", light: "#ffffff" } });
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
    background: "#0f0f0f",
    color: "#e8e4de",
    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    padding: "0",
  },
  header: {
    background: "#161616",
    borderBottom: "1px solid #2a2a2a",
    padding: "0 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "56px",
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    textDecoration: "none",
  },
  logoMark: {
    width: "28px",
    height: "28px",
    background: "linear-gradient(135deg, #e8623a 0%, #c94d28 100%)",
    borderRadius: "7px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px",
    fontWeight: "700",
    color: "#fff",
    letterSpacing: "-0.5px",
  },
  logoText: {
    fontSize: "15px",
    fontWeight: "600",
    color: "#e8e4de",
    letterSpacing: "-0.3px",
  },
  logoSub: {
    fontSize: "12px",
    color: "#888",
    marginLeft: "6px",
    fontWeight: "400",
  },
  container: {
    maxWidth: "960px",
    margin: "0 auto",
    padding: "32px 24px",
  },
  card: {
    background: "#161616",
    border: "1px solid #2a2a2a",
    borderRadius: "12px",
    padding: "24px",
    marginBottom: "16px",
  },
  input: {
    width: "100%",
    background: "#1e1e1e",
    border: "1px solid #2a2a2a",
    borderRadius: "8px",
    color: "#e8e4de",
    padding: "10px 14px",
    fontSize: "16px",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  },
  select: {
    width: "100%",
    background: "#1e1e1e",
    border: "1px solid #2a2a2a",
    borderRadius: "8px",
    color: "#e8e4de",
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
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "6px",
    display: "block",
  },
  btn: {
    background: "#e8623a",
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
    background: "transparent",
    color: "#888",
    border: "1px solid #2a2a2a",
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
    border: "1px solid #3a2020",
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
  }),
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "12px",
  },
  assetCard: {
    background: "#161616",
    border: "1px solid #2a2a2a",
    borderRadius: "12px",
    padding: "18px 20px",
    cursor: "pointer",
    transition: "border-color 0.15s, transform 0.1s",
  },
  tab: (active) => ({
    padding: "8px 16px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "500",
    cursor: "pointer",
    background: active ? "#2a2a2a" : "transparent",
    color: active ? "#e8e4de" : "#666",
    border: "none",
    transition: "all 0.15s",
  }),
  divider: {
    borderTop: "1px solid #2a2a2a",
    margin: "16px 0",
  },
  checkoutHistory: {
    background: "#1a1a1a",
    borderRadius: "8px",
    padding: "12px 16px",
    marginBottom: "8px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
};

// ─── View router ─────────────────────────────────────────────────────────────
// Supports: "list" | "checkout" | "admin" | "add" | "asset_detail"
export default function HarbixInventory({ onBack }) {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  const assetIdFromPath = path.startsWith("/inventory/asset/")
    ? path.replace("/inventory/asset/", "")
    : null;

  const [view, setView] = useState(assetIdFromPath ? "checkout_public" : "admin");
  const [publicAssetId, setPublicAssetId] = useState(assetIdFromPath);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState(null);

  // Live sync from Firestore
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
      <Header
        view={view}
        onHome={() => navigate("admin")}
        onBack={onBack}
      />
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
  return (
    <div style={S.header}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {onBack && (
          <button onClick={onBack} style={{ ...S.btnGhost, padding: "5px 10px", fontSize: "13px", marginRight: "4px" }}>
            ← Tickets
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }} onClick={onHome}>
          <div style={S.logoMark}>H</div>
          <span style={S.logoText}>
            harbix <span style={S.logoSub}>inventory</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Loading ──────────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "#444" }}>
      Loading inventory…
    </div>
  );
}

// ─── Asset List (public) ──────────────────────────────────────────────────────
function AssetList({ assets, onCheckout, onAdmin }) {
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");

  const categories = ["All", ...Array.from(new Set(assets.map((a) => a.category)))];
  const statuses = ["All", "available", "checked_out", "needs_repair", "retired"];

  const filtered = assets.filter((a) => {
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.assetId?.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "All" || a.category === filterCat;
    const matchStatus = filterStatus === "All" || a.status === filterStatus;
    return matchSearch && matchCat && matchStatus;
  });

  const counts = {
    total: assets.length,
    available: assets.filter((a) => a.status === "available").length,
    checked_out: assets.filter((a) => a.status === "checked_out").length,
    needs_repair: assets.filter((a) => a.status === "needs_repair").length,
  };

  return (
    <div style={S.container}>
      {/* Summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" }}>
        {[
          { label: "Total Assets", value: counts.total, color: "#e8e4de" },
          { label: "Available", value: counts.available, color: "#639922" },
          { label: "Checked Out", value: counts.checked_out, color: "#ba7517" },
          { label: "Needs Repair", value: counts.needs_repair, color: "#e24b4a" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: "10px", padding: "14px 16px" }}>
            <div style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{s.label}</div>
            <div style={{ fontSize: "24px", fontWeight: "600", color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
        <input
          style={{ ...S.input, width: "200px", flex: "1 1 160px" }}
          placeholder="Search assets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select style={{ ...S.select, width: "140px" }} value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select style={{ ...S.select, width: "140px" }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          {statuses.map((s) => (
            <option key={s} value={s}>{s === "All" ? "All Statuses" : STATUS_COLORS[s]?.label}</option>
          ))}
        </select>
      </div>

      {/* Asset grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", color: "#444", padding: "60px 0" }}>
          {assets.length === 0 ? (
            <>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>📦</div>
              <div style={{ marginBottom: "8px" }}>No assets yet.</div>
              <button style={S.btn} onClick={onAdmin}>Add your first asset</button>
            </>
          ) : "No assets match your filters."}
        </div>
      ) : (
        <div style={S.grid}>
          {filtered.map((asset) => (
            <AssetCard key={asset.id} asset={asset} onCheckout={() => onCheckout(asset)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Asset Card ───────────────────────────────────────────────────────────────
function AssetCard({ asset, onCheckout }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ ...S.assetCard, borderColor: hovered ? "#3a3a3a" : "#2a2a2a", transform: hovered ? "translateY(-1px)" : "none" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <div>
          <div style={{ fontSize: "15px", fontWeight: "500", marginBottom: "2px" }}>{asset.name}</div>
          <div style={{ fontSize: "12px", color: "#555", fontFamily: "monospace" }}>{asset.assetId}</div>
        </div>
        <span style={S.badge(asset.status)}>{STATUS_COLORS[asset.status]?.label}</span>
      </div>
      <div style={{ fontSize: "12px", color: "#666", marginBottom: "14px" }}>
        {asset.category} · {asset.location}
        {asset.serialNumber && <span> · S/N: {asset.serialNumber}</span>}
      </div>
      {asset.status === "checked_out" && asset.checkedOutTo && (
        <div style={{ fontSize: "12px", color: "#ba7517", marginBottom: "10px", background: "#1e1800", borderRadius: "6px", padding: "6px 10px" }}>
          Out: {asset.checkedOutTo.name}
          {asset.checkedOutTo.date && ` · ${new Date(asset.checkedOutTo.date?.seconds ? asset.checkedOutTo.date.seconds * 1000 : asset.checkedOutTo.date).toLocaleDateString()}`}
        </div>
      )}
      {asset.status === "available" && (
        <button style={{ ...S.btn, width: "100%", padding: "8px" }} onClick={onCheckout}>
          Check out
        </button>
      )}
      {asset.status === "checked_out" && (
        <button style={{ ...S.btnGhost, width: "100%", padding: "8px", fontSize: "13px" }} onClick={onCheckout}>
          Return item
        </button>
      )}
    </div>
  );
}

// ─── Checkout Flow (from list) ────────────────────────────────────────────────
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
        // Log to checkout history sub-collection
        await addDoc(collection(db, "inventory", asset.id, "history"), {
          action: "returned",
          by: { name: name.trim(), email: email.trim() || null },
          notes: notes.trim() || null,
          timestamp: serverTimestamp(),
        });
      } else {
        const checkoutData = { name: name.trim(), email: email.trim() || null, date: serverTimestamp() };
        await updateDoc(assetRef, {
          status: "checked_out",
          checkedOutTo: checkoutData,
        });
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
          <div style={{ color: "#666", fontSize: "14px", marginBottom: "24px" }}>
            {isReturn
              ? `${asset.name} is back in inventory.`
              : `${asset.name} is checked out to ${name}.`}
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
          <div style={{ fontSize: "11px", color: "#555", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{isReturn ? "Return" : "Check out"}</div>
          <div style={{ fontSize: "20px", fontWeight: "500" }}>{asset.name}</div>
          <div style={{ fontSize: "12px", color: "#555", marginTop: "2px" }}>{asset.assetId} · {asset.location}</div>
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

// ─── Public Checkout (via QR scan) ───────────────────────────────────────────
function CheckoutPublic({ assetId, assets, loading }) {
  const asset = assets.find((a) => a.assetId === assetId);

  if (loading) return <div style={{ padding: "60px 24px", textAlign: "center", color: "#666" }}>Loading…</div>;
  if (!asset) return (
    <div style={{ padding: "60px 24px", textAlign: "center" }}>
      <div style={{ fontSize: "18px", marginBottom: "8px" }}>Asset not found</div>
      <div style={{ color: "#666", fontSize: "14px" }}>ID: {assetId}</div>
    </div>
  );

  return (
    <div style={{ padding: "24px", maxWidth: "440px", margin: "0 auto" }}>
      <div style={{ ...S.card, marginBottom: "0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: "500", marginBottom: "4px" }}>{asset.name}</div>
            <div style={{ fontSize: "12px", color: "#555", fontFamily: "monospace" }}>{asset.assetId}</div>
          </div>
          <span style={S.badge(asset.status)}>{STATUS_COLORS[asset.status]?.label}</span>
        </div>
        <div style={{ fontSize: "13px", color: "#666", marginBottom: "16px" }}>
          {asset.category} · {asset.location}
          {asset.condition && asset.condition !== "Good" && <span style={{ color: "#e24b4a" }}> · {asset.condition}</span>}
        </div>
        {asset.notes && (
          <div style={{ background: "#1e1e1e", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#888", marginBottom: "16px" }}>
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
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");

  const filtered = statusFilter === "All" ? assets : assets.filter((a) => a.status === statusFilter);

  const handleStatusChange = async (asset, newStatus) => {
    await updateDoc(doc(db, "inventory", asset.id), { status: newStatus });
  };

  const counts = {
    total: assets.length,
    available: assets.filter((a) => a.status === "available").length,
    checked_out: assets.filter((a) => a.status === "checked_out").length,
    needs_repair: assets.filter((a) => a.status === "needs_repair").length,
  };

  return (
    <div style={S.container}>
      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px", marginBottom: "24px" }}>
        {[
          { label: "Total Assets", value: counts.total, color: "#e8e4de" },
          { label: "Available", value: counts.available, color: "#639922" },
          { label: "Checked Out", value: counts.checked_out, color: "#ba7517" },
          { label: "Needs Repair", value: counts.needs_repair, color: "#e24b4a" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: "10px", padding: "14px 16px" }}>
            <div style={{ fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{s.label}</div>
            <div style={{ fontSize: "24px", fontWeight: "600", color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          {["assets", "checkouts"].map((t) => (
            <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
              {t === "assets" ? "All assets" : "Checkout log"}
            </button>
          ))}
        </div>
        <button style={S.btn} onClick={onAdd}>+ Add asset</button>
      </div>

      {tab === "assets" && (
        <>
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            {["All", "available", "checked_out", "needs_repair", "retired"].map((s) => (
              <button
                key={s}
                style={{ ...S.tab(statusFilter === s), fontSize: "12px", padding: "6px 12px" }}
                onClick={() => setStatusFilter(s)}
              >
                {s === "All" ? "All" : STATUS_COLORS[s]?.label}
              </button>
            ))}
          </div>
          <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: "12px", overflow: "hidden" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#444" }}>No assets found.</div>
            ) : (
              filtered.map((asset, i) => (
                <AdminAssetRow
                  key={asset.id}
                  asset={asset}
                  last={i === filtered.length - 1}
                  onStatusChange={handleStatusChange}
                  onSelect={() => setSelectedAsset(selectedAsset?.id === asset.id ? null : asset)}
                  expanded={selectedAsset?.id === asset.id}
                />
              ))
            )}
          </div>
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
    });
    setEditing(true);
  };

  const cancelEdit = (e) => {
    e?.stopPropagation();
    setEditing(false);
  };

  const saveEdit = async (e) => {
    e.stopPropagation();
    if (!editForm.name.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "inventory", asset.id), {
        ...editForm,
        name: editForm.name.trim(),
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
      if (!qrUrl) {
        const url = await generateQRDataURL(asset.assetId);
        setQrUrl(url);
      }
      setLoadingHistory(true);
      const snap = await getDocs(query(collection(db, "inventory", asset.id, "history"), orderBy("timestamp", "desc")));
      setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoadingHistory(false);
    }
    onSelect();
  };

  const printLabel = () => {
    const win = window.open("", "_blank");
    win.document.write(`
      <html><body style="text-align:center;font-family:sans-serif;padding:20px;">
        <img src="${qrUrl}" style="width:180px;height:180px;" /><br/>
        <strong style="font-size:16px;">${asset.name}</strong><br/>
        <span style="font-size:12px;color:#666;">${asset.assetId}</span>
      </body></html>
    `);
    win.print();
  };

  return (
    <div style={{ borderBottom: last ? "none" : "1px solid #222" }}>
      <div
        style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
        onClick={loadDetails}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <span style={S.badge(asset.status)}>{STATUS_COLORS[asset.status]?.label}</span>
          <div>
            <div style={{ fontSize: "14px", fontWeight: "500" }}>{asset.name}</div>
            <div style={{ fontSize: "12px", color: "#555" }}>{asset.assetId} · {asset.category} · {asset.location}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {expanded && !editing && (
            <button
              style={{ ...S.btnGhost, fontSize: "12px", padding: "4px 10px" }}
              onClick={startEdit}
            >
              ✏️ Edit
            </button>
          )}
          <span style={{ color: "#444", fontSize: "12px" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: "0 20px 20px", borderTop: "1px solid #1e1e1e" }}>

          {/* ── Edit form ── */}
          {editing ? (
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

          /* ── Read view ── */
          <div style={{
            display: "flex",
            flexDirection: window.innerWidth < 600 ? "column-reverse" : "row",
            gap: "20px",
            marginTop: "16px",
          }}>
            {/* Left: details + status control */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "12px", color: "#666", marginBottom: "12px", lineHeight: "1.8" }}>
                {asset.serialNumber && <div>Serial: <span style={{ color: "#aaa" }}>{asset.serialNumber}</span></div>}
                {asset.condition && <div>Condition: <span style={{ color: "#aaa" }}>{asset.condition}</span></div>}
                {asset.notes && <div>Notes: <span style={{ color: "#aaa" }}>{asset.notes}</span></div>}
                {asset.purchaseDate && <div>Purchased: <span style={{ color: "#aaa" }}>{asset.purchaseDate}</span></div>}
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={S.label}>Change status</label>
                <select
                  style={{ ...S.select, width: "180px" }}
                  value={asset.status}
                  onChange={(e) => onStatusChange(asset, e.target.value)}
                >
                  {Object.entries(STATUS_COLORS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              {/* Checkout history */}
              <div>
                <div style={{ fontSize: "11px", color: "#555", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Checkout history</div>
                {loadingHistory ? (
                  <div style={{ color: "#444", fontSize: "13px" }}>Loading…</div>
                ) : history.length === 0 ? (
                  <div style={{ color: "#444", fontSize: "13px" }}>No history yet.</div>
                ) : (
                  history.slice(0, 5).map((h) => (
                    <div key={h.id} style={S.checkoutHistory}>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: "500" }}>{h.by?.name}</div>
                        {h.by?.email && <div style={{ fontSize: "12px", color: "#666" }}>{h.by.email}</div>}
                        {h.notes && <div style={{ fontSize: "12px", color: "#888", fontStyle: "italic" }}>{h.notes}</div>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ ...S.badge(h.action === "returned" ? "available" : "checked_out"), fontSize: "10px" }}>
                          {h.action === "returned" ? "Returned" : "Checked out"}
                        </span>
                        {h.timestamp && (
                          <div style={{ fontSize: "11px", color: "#555", marginTop: "4px" }}>
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
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: window.innerWidth < 600 ? "center" : "flex-end",
            }}>
              {qrUrl ? (
                <>
                  <img src={qrUrl} alt="QR code" style={{
                    width: window.innerWidth < 600 ? "180px" : "120px",
                    height: window.innerWidth < 600 ? "180px" : "120px",
                    borderRadius: "8px",
                    marginBottom: "8px",
                  }} />
                  <div style={{ fontSize: "11px", color: "#555", textAlign: "center", marginBottom: "10px", fontFamily: "monospace", wordBreak: "break-all" }}>
                    {BASE_URL}/inventory/asset/{asset.assetId}
                  </div>
                  <button style={{ ...S.btnGhost, fontSize: "12px", padding: "6px 12px" }} onClick={printLabel}>
                    🖨 Print label
                  </button>
                </>
              ) : (
                <div style={{ width: "120px", height: "120px", background: "#1e1e1e", borderRadius: "8px" }} />
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
        snap.docs.forEach((d) => all.push({ ...d.data(), assetName: asset.name, assetId: asset.assetId }));
      }
      all.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setLog(all);
      setLoadingLog(false);
    };
    fetchAll();
  }, [assets]);

  if (loadingLog) return <div style={{ color: "#444", padding: "20px" }}>Loading log…</div>;
  if (log.length === 0) return <div style={{ color: "#444", padding: "20px" }}>No checkout history yet.</div>;

  return (
    <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: "12px", overflow: "hidden" }}>
      {log.map((entry, i) => (
        <div key={i} style={{ padding: "14px 20px", borderBottom: i === log.length - 1 ? "none" : "1px solid #1e1e1e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: "500" }}>{entry.assetName} <span style={{ color: "#555", fontFamily: "monospace", fontSize: "12px" }}>({entry.assetId})</span></div>
            <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>
              {entry.by?.name}{entry.by?.email && ` · ${entry.by.email}`}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ ...S.badge(entry.action === "returned" ? "available" : "checked_out"), fontSize: "10px" }}>
              {entry.action === "returned" ? "Returned" : "Checked out"}
            </span>
            {entry.timestamp && (
              <div style={{ fontSize: "11px", color: "#555", marginTop: "4px" }}>
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
        createdAt: serverTimestamp(),
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
              <input style={S.input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. iPad Pro 12.9" />
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
