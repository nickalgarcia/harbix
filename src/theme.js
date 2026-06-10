// src/theme.js
// Shared design system for Harbix — single source of truth for both
// the ticketing app (App.jsx) and inventory (HarbixInventory.jsx).
// If a color or component changes here, it changes everywhere.

// ── Brand palette ─────────────────────────────────────────────
export const B = {
  orange:      "#EF6423",
  orangeHov:   "#D4561E",
  orangeLight: "#FFF4EF",
  navy:        "#4E4D5F",
  navyDark:    "#3B3A4A",
  deep:        "#20101B",
  white:       "#FFFFFF",
  offWhite:    "#F8F7F5",
  cream:       "#F2F0EC",
  border:      "#E8E4DE",
  muted:       "#A09A94",
  text:        "#1C1B22",
  textSub:     "#6E6A72",
  green:       "#10B981",
  greenBg:     "#D1FAE5",
  greenText:   "#065F46",
  blue:        "#3B82F6",
  blueBg:      "#DBEAFE",
  blueText:    "#1E40AF",
  red:         "#EF4444",
  redBg:       "#FEE2E2",
  redText:     "#991B1B",
  amber:       "#F59E0B",
  amberBg:     "#FEF3C7",
  amberText:   "#92400E",
};

// ── Button tokens ─────────────────────────────────────────────
export const BTN = {
  orangeSolid: { background:B.orange, color:B.white, border:"none", borderRadius:10, padding:"10px 20px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',system-ui,sans-serif", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6 },
  ghost:       { background:B.white, color:B.textSub, border:`1.5px solid ${B.border}`, borderRadius:10, padding:"10px 20px", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',system-ui,sans-serif", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6 },
};

// ── Input style factory ───────────────────────────────────────
export const INP = (err) => ({
  width:"100%", padding:"12px 14px", borderRadius:10,
  border:`1.5px solid ${err?B.red:B.border}`,
  fontSize:14, color:B.text, outline:"none",
  boxSizing:"border-box", background:B.white,
  fontFamily:"'DM Sans',system-ui,sans-serif",
  WebkitAppearance:"none",
});

// ── Logo ──────────────────────────────────────────────────────
// Custom SVG chevron mark — consistent stroke weight at every size,
// replaces the italic-Georgia » character.
export function HarbixLogo({ dark=false, size="md", sub }) {
  const sz = { sm:15, md:18, lg:26 }[size];
  return (
    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
      <svg width={sz+5} height={sz+5} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink:0, display:"block" }}>
        <path d="M4.5 5.5 11 12l-6.5 6.5" stroke={B.orange} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 5.5 19.5 12 13 18.5" stroke={B.orange} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
      </svg>
      <span style={{ fontSize:sz, fontWeight:800, color:dark?B.white:B.text, letterSpacing:"-0.04em", fontFamily:"'DM Sans',system-ui,sans-serif", lineHeight:1 }}>
        Harbix
        {sub && <span style={{ fontWeight:500, fontSize:Math.max(11,sz-4), color:dark?"rgba(255,255,255,0.45)":B.muted, marginLeft:6, letterSpacing:"0" }}>{sub}</span>}
      </span>
    </div>
  );
}

// ── Shared UI atoms ───────────────────────────────────────────
export function Chip({ icon, children }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:11, color:B.textSub, background:B.cream, padding:"3px 9px", borderRadius:6, border:`1px solid ${B.border}`, whiteSpace:"nowrap" }}>
      {icon}<span>{children}</span>
    </span>
  );
}

export function Avatar({ initials, size=32, color=B.navy }) {
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:color, color:B.white, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.35, fontWeight:800, flexShrink:0, fontFamily:"'DM Sans',sans-serif" }}>
      {initials}
    </div>
  );
}

// ── Generic pill badge ────────────────────────────────────────
// Pass { label, bg, text, dot } — used for status, priority, department.
export function Pill({ label, bg, text, dot }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, letterSpacing:"0.03em", background:bg, color:text, whiteSpace:"nowrap" }}>
      {dot && <span style={{ width:6, height:6, borderRadius:"50%", background:dot, flexShrink:0 }} />}
      {label}
    </span>
  );
}
