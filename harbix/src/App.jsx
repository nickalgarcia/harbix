import { useState, useRef, useEffect } from "react";

// ── Brand tokens ──────────────────────────────────────────────
const B = {
  orange:     "#EF6423",
  orangeHov:  "#D4561E",
  navy:       "#4E4D5F",
  navyDark:   "#3B3A4A",
  deep:       "#20101B",
  white:      "#FFFFFF",
  offWhite:   "#F7F6F4",
  border:     "#E8E6E1",
  muted:      "#9B9691",
  text:       "#1C1B22",
  textSub:    "#6B6772",
  green:      "#10B981",
  greenBg:    "#D1FAE5",
  greenText:  "#065F46",
  yellow:     "#F59E0B",
  yellowBg:   "#FEF3C7",
  yellowText: "#92400E",
  blue:       "#3B82F6",
  blueBg:     "#DBEAFE",
  blueText:   "#1E40AF",
  red:        "#EF4444",
  redBg:      "#FEE2E2",
  redText:    "#991B1B",
};

const STATUS = {
  open:        { label: "Open",        bg: B.yellowBg,  text: B.yellowText, dot: B.yellow  },
  "in-progress":{ label: "In Progress", bg: B.blueBg,    text: B.blueText,  dot: B.blue    },
  resolved:    { label: "Resolved",    bg: B.greenBg,   text: B.greenText, dot: B.green   },
  closed:      { label: "Closed",      bg: "#F3F4F6",   text: "#6B7280",   dot: "#9CA3AF" },
};

const TEAM = ["Nick Garcia", "James Okafor", "Maria Santos", "Derek Hill"];

const MOCK_TICKETS = [
  { id:"t1", name:"Lisa Tran", contact:"lisa@gcc.org", location:"Main Sanctuary", issue:"Wireless mic pack #3 cuts out during worship set — happens every Sunday.", status:"open", assignee:"", photo:null, comments:[], createdAt: new Date(Date.now()-3600000*2).toISOString(), updatedAt: new Date(Date.now()-3600000*2).toISOString() },
  { id:"t2", name:"Marcus Webb", contact:"210-555-0122", location:"Youth Room", issue:"HDMI cable for the projector is missing. Can't connect laptop for Wednesday night.", status:"in-progress", assignee:"Nick Garcia", photo:null, comments:[{ id:"c1", author:"Nick Garcia", text:"Checked the storage closet — cable isn't there. Ordering a replacement today.", type:"internal", ts: new Date(Date.now()-3600000*20).toISOString() }], createdAt: new Date(Date.now()-3600000*26).toISOString(), updatedAt: new Date(Date.now()-3600000*20).toISOString() },
  { id:"t3", name:"Pastor Donte Banks", contact:"pd@godchasers.org", location:"Lobby", issue:"TV display near the entrance is frozen on a slide from two weeks ago.", status:"resolved", assignee:"James Okafor", photo:null, comments:[{ id:"c2", author:"James Okafor", text:"Fixed — TV was stuck in a loop. Rebooted the media player and pushed a fresh slide.", type:"reply", ts: new Date(Date.now()-3600000*45).toISOString() }], createdAt: new Date(Date.now()-3600000*50).toISOString(), updatedAt: new Date(Date.now()-3600000*45).toISOString() },
];

// ── Helpers ──────────────────────────────────────────────────
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}
function uid() { return "t" + Date.now() + Math.random().toString(36).slice(2,6); }

// ── Shared UI ────────────────────────────────────────────────
function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.open;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, letterSpacing:"0.03em", background:s.bg, color:s.text }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:s.dot, flexShrink:0 }} />
      {s.label}
    </span>
  );
}

function Avatar({ name, size=28 }) {
  const initials = name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  return (
    <span style={{ width:size, height:size, borderRadius:"50%", background:B.navy, color:B.white, display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:size*0.36, fontWeight:700, flexShrink:0, fontFamily:"'DM Sans', sans-serif" }}>
      {initials}
    </span>
  );
}

function PhotoUpload({ photo, onChange }) {
  const inputRef = useRef();
  const [drag, setDrag] = useState(false);
  const handleFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = e => onChange(e.target.result);
    r.readAsDataURL(file);
  };
  return (
    <div style={{ marginBottom:18 }}>
      <label style={S.label}>Photo or Screenshot <span style={{ fontWeight:400, color:B.muted, fontSize:11 }}>Optional</span></label>
      {photo ? (
        <div style={{ position:"relative" }}>
          <img src={photo} alt="preview" style={{ width:"100%", maxHeight:200, objectFit:"cover", borderRadius:10, border:`1.5px solid ${B.border}`, display:"block" }} />
          <button style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,0.6)", color:"#fff", border:"none", borderRadius:6, padding:"4px 10px", fontSize:12, cursor:"pointer", fontWeight:600 }} onClick={()=>onChange(null)}>✕ Remove</button>
        </div>
      ) : (
        <div
          style={{ border:`2px dashed ${drag?B.orange:B.border}`, borderRadius:10, padding:"22px 16px", textAlign:"center", cursor:"pointer", background:drag?"#FFF4EF":B.offWhite, display:"flex", flexDirection:"column", alignItems:"center", gap:5, transition:"all 0.15s" }}
          onDragOver={e=>{e.preventDefault();setDrag(true)}}
          onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0])}}
          onClick={()=>inputRef.current.click()}
        >
          <span style={{ fontSize:22 }}>📎</span>
          <span style={{ fontSize:13, color:B.textSub }}>Drag & drop or <span style={{ color:B.orange, fontWeight:600, textDecoration:"underline" }}>browse</span></span>
          <span style={{ fontSize:11, color:B.muted }}>PNG, JPG, GIF, WEBP</span>
          <input ref={inputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])} />
        </div>
      )}
    </div>
  );
}

// ── Public Form ──────────────────────────────────────────────
function PublicForm({ onSubmit }) {
  const [form, setForm] = useState({ name:"", contact:"", location:"", issue:"" });
  const [photo, setPhoto] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const validate = () => {
    const e = {};
    if (!form.name) e.name=true;
    if (!form.contact) e.contact=true;
    if (!form.location) e.location=true;
    if (!form.issue) e.issue=true;
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    await new Promise(r=>setTimeout(r,900));
    onSubmit({ id:uid(), ...form, photo, status:"open", assignee:"", comments:[], createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() });
    setLoading(false);
    setDone(true);
  };

  if (done) return (
    <div style={{ minHeight:"100vh", background:B.deep, display:"flex", alignItems:"center", justifyContent:"center", padding:24, fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ background:B.white, borderRadius:20, padding:"48px 40px", maxWidth:440, width:"100%", textAlign:"center", boxShadow:"0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ width:64, height:64, borderRadius:"50%", background:B.greenBg, color:B.green, fontSize:28, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px" }}>✓</div>
        <h2 style={{ margin:"0 0 8px", fontSize:22, fontWeight:700, color:B.text }}>Ticket Submitted</h2>
        <p style={{ color:B.textSub, fontSize:14, margin:"0 0 28px", lineHeight:1.6 }}>We've got it. Our AV team will look into it and follow up with you shortly.</p>
        <button style={S.btnOrange} onClick={()=>{setDone(false);setForm({name:"",contact:"",location:"",issue:""});setPhoto(null)}}>Submit Another</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:B.deep, display:"flex", flexDirection:"column", fontFamily:"'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ background:B.navy, padding:"0 24px", height:56, display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:`1px solid rgba(255,255,255,0.08)` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:20 }}>⚓</span>
          <span style={{ fontWeight:800, fontSize:17, color:B.white, letterSpacing:"-0.3px" }}>Harbix</span>
          <span style={{ fontSize:11, color:B.orange, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", marginLeft:4 }}>by GodChasers</span>
        </div>
      </div>
      {/* Form */}
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"40px 16px" }}>
        <div style={{ background:B.white, borderRadius:20, padding:"36px 32px", width:"100%", maxWidth:520, boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
          <div style={{ marginBottom:28 }}>
            <h1 style={{ margin:"0 0 6px", fontSize:24, fontWeight:800, color:B.text, letterSpacing:"-0.5px" }}>Submit a Support Request</h1>
            <p style={{ margin:0, fontSize:14, color:B.textSub, lineHeight:1.5 }}>Having an AV issue? Fill this out and our team will take care of it.</p>
          </div>
          <Field label="Your Name" error={errors.name}>
            <input style={S.input(errors.name)} name="name" value={form.name} placeholder="First and last name" onChange={e=>{ setForm({...form,name:e.target.value}); setErrors({...errors,name:false}); }} />
          </Field>
          <Field label="Contact Info" error={errors.contact}>
            <input style={S.input(errors.contact)} name="contact" value={form.contact} placeholder="Email or phone number" onChange={e=>{ setForm({...form,contact:e.target.value}); setErrors({...errors,contact:false}); }} />
          </Field>
          <Field label="Location" error={errors.location}>
            <input style={S.input(errors.location)} name="location" value={form.location} placeholder="e.g. Main Sanctuary, Youth Room, Lobby" onChange={e=>{ setForm({...form,location:e.target.value}); setErrors({...errors,location:false}); }} />
          </Field>
          <Field label="Describe the Issue" error={errors.issue}>
            <textarea style={{ ...S.input(errors.issue), resize:"vertical", fontFamily:"inherit", minHeight:100 }} value={form.issue} placeholder="What's happening? Be as specific as you can." onChange={e=>{ setForm({...form,issue:e.target.value}); setErrors({...errors,issue:false}); }} rows={4} />
          </Field>
          <PhotoUpload photo={photo} onChange={setPhoto} />
          <button style={{ ...S.btnOrange, width:"100%", opacity:loading?0.7:1, fontSize:15, padding:"13px 0" }} onClick={handleSubmit} disabled={loading}>
            {loading ? "Submitting…" : "Submit Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom:18 }}>
      <label style={S.label}>{label}</label>
      {children}
      {error && <span style={{ color:B.red, fontSize:11, marginTop:3, display:"block" }}>This field is required</span>}
    </div>
  );
}

// ── Agent Login ───────────────────────────────────────────────
function AgentLogin({ onLogin }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const attempt = () => {
    if (pw === "harbix2024") { onLogin(); }
    else { setErr(true); setTimeout(()=>setErr(false), 2000); }
  };
  return (
    <div style={{ minHeight:"100vh", background:B.deep, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ background:B.white, borderRadius:20, padding:"48px 40px", maxWidth:380, width:"100%", textAlign:"center", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ fontSize:36, marginBottom:16 }}>⚓</div>
        <h2 style={{ margin:"0 0 4px", fontSize:22, fontWeight:800, color:B.text }}>Harbix</h2>
        <p style={{ color:B.textSub, fontSize:13, margin:"0 0 28px" }}>Agent portal — GodChasers AV Team</p>
        <input
          type="password" value={pw} placeholder="Enter password"
          style={{ ...S.input(err), textAlign:"center", marginBottom:8 }}
          onChange={e=>setPw(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&attempt()}
        />
        {err && <p style={{ color:B.red, fontSize:12, margin:"0 0 12px" }}>Incorrect password</p>}
        <button style={{ ...S.btnOrange, width:"100%" }} onClick={attempt}>Sign In</button>
        <p style={{ marginTop:16, fontSize:12, color:B.muted }}>(Demo password: harbix2024)</p>
      </div>
    </div>
  );
}

// ── Ticket Card ───────────────────────────────────────────────
function TicketCard({ ticket, onClick }) {
  const hasPhoto = !!ticket.photo;
  return (
    <div onClick={onClick} style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:14, padding:20, cursor:"pointer", transition:"all 0.15s", boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}
      onMouseEnter={e=>{ e.currentTarget.style.borderColor=B.orange; e.currentTarget.style.boxShadow=`0 4px 16px rgba(239,100,35,0.12)`; }}
      onMouseLeave={e=>{ e.currentTarget.style.borderColor=B.border; e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,0.05)"; }}
    >
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <Avatar name={ticket.name} size={30} />
          <div>
            <div style={{ fontWeight:700, fontSize:14, color:B.text }}>{ticket.name}</div>
            <div style={{ fontSize:11, color:B.muted }}>{timeAgo(ticket.createdAt)}</div>
          </div>
        </div>
        <StatusBadge status={ticket.status} />
      </div>
      <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
        <Chip>📍 {ticket.location}</Chip>
        {ticket.assignee && <Chip>👤 {ticket.assignee.split(" ")[0]}</Chip>}
        {hasPhoto && <Chip>📷 Photo</Chip>}
        {ticket.comments.length > 0 && <Chip>💬 {ticket.comments.length}</Chip>}
      </div>
      <p style={{ margin:0, fontSize:13, color:B.textSub, lineHeight:1.5, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{ticket.issue}</p>
    </div>
  );
}

function TicketRow({ ticket, onClick }) {
  return (
    <div onClick={onClick} style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:10, padding:"14px 18px", cursor:"pointer", display:"flex", alignItems:"center", gap:14, transition:"all 0.15s" }}
      onMouseEnter={e=>{ e.currentTarget.style.borderColor=B.orange; }}
      onMouseLeave={e=>{ e.currentTarget.style.borderColor=B.border; }}
    >
      <Avatar name={ticket.name} size={32} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
          <span style={{ fontWeight:700, fontSize:14, color:B.text }}>{ticket.name}</span>
          <span style={{ fontSize:11, color:B.muted }}>·</span>
          <span style={{ fontSize:11, color:B.muted }}>📍 {ticket.location}</span>
        </div>
        <p style={{ margin:0, fontSize:12, color:B.textSub, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{ticket.issue}</p>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        {ticket.assignee && <span style={{ fontSize:11, color:B.textSub }}>{ticket.assignee.split(" ")[0]}</span>}
        <StatusBadge status={ticket.status} />
        <span style={{ fontSize:11, color:B.muted }}>{timeAgo(ticket.createdAt)}</span>
      </div>
    </div>
  );
}

function Chip({ children }) {
  return <span style={{ fontSize:11, color:B.textSub, background:B.offWhite, padding:"3px 9px", borderRadius:6, border:`1px solid ${B.border}` }}>{children}</span>;
}

// ── Ticket Detail ─────────────────────────────────────────────
function TicketDetail({ ticket, onUpdate, onBack }) {
  const [comment, setComment] = useState("");
  const [commentType, setCommentType] = useState("internal");
  const [lightbox, setLightbox] = useState(false);
  const [editStatus, setEditStatus] = useState(ticket.status);
  const [editAssignee, setEditAssignee] = useState(ticket.assignee);

  const addComment = () => {
    if (!comment.trim()) return;
    const c = { id:"c"+Date.now(), author:"Nick Garcia", text:comment.trim(), type:commentType, ts:new Date().toISOString() };
    onUpdate(ticket.id, { comments:[...ticket.comments, c], updatedAt:new Date().toISOString() });
    setComment("");
  };

  const updateStatus = (s) => { setEditStatus(s); onUpdate(ticket.id, { status:s, updatedAt:new Date().toISOString() }); };
  const updateAssignee = (a) => { setEditAssignee(a); onUpdate(ticket.id, { assignee:a, updatedAt:new Date().toISOString() }); };

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>
      {lightbox && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }} onClick={()=>setLightbox(false)}>
          <img src={ticket.photo} alt="attachment" style={{ maxWidth:"90vw", maxHeight:"88vh", borderRadius:12 }} onClick={e=>e.stopPropagation()} />
        </div>
      )}

      {/* Back */}
      <button style={{ background:"none", border:"none", color:B.orange, fontSize:13, fontWeight:600, cursor:"pointer", padding:"0 0 18px", display:"flex", alignItems:"center", gap:4, fontFamily:"inherit" }} onClick={onBack}>
        ← Back to tickets
      </button>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 280px", gap:24, alignItems:"start" }}>
        {/* Main */}
        <div>
          <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:16, padding:28, marginBottom:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <Avatar name={ticket.name} size={36} />
                <div>
                  <div style={{ fontWeight:700, fontSize:16, color:B.text }}>{ticket.name}</div>
                  <div style={{ fontSize:12, color:B.muted }}>{ticket.contact} · {timeAgo(ticket.createdAt)}</div>
                </div>
              </div>
              <StatusBadge status={editStatus} />
            </div>
            <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
              <Chip>📍 {ticket.location}</Chip>
              {ticket.photo && <Chip>📷 Photo attached</Chip>}
            </div>
            <p style={{ margin:0, fontSize:15, color:B.text, lineHeight:1.7 }}>{ticket.issue}</p>
            {ticket.photo && (
              <div style={{ marginTop:18 }}>
                <img src={ticket.photo} alt="attachment" style={{ width:160, height:110, objectFit:"cover", borderRadius:10, border:`1.5px solid ${B.border}`, cursor:"pointer" }} onClick={()=>setLightbox(true)} title="Click to enlarge" />
                <div style={{ fontSize:11, color:B.muted, marginTop:4 }}>Click to enlarge</div>
              </div>
            )}
          </div>

          {/* Comments */}
          <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:16, padding:28 }}>
            <h3 style={{ margin:"0 0 20px", fontSize:15, fontWeight:700, color:B.text }}>Comments {ticket.comments.length > 0 && <span style={{ color:B.muted, fontWeight:400 }}>({ticket.comments.length})</span>}</h3>

            {ticket.comments.length === 0 && (
              <p style={{ color:B.muted, fontSize:13, margin:"0 0 20px" }}>No comments yet.</p>
            )}

            <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:24 }}>
              {ticket.comments.map(c => (
                <div key={c.id} style={{ display:"flex", gap:10 }}>
                  <Avatar name={c.author} size={30} />
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                      <span style={{ fontWeight:700, fontSize:13, color:B.text }}>{c.author}</span>
                      <span style={{ fontSize:11, padding:"2px 8px", borderRadius:10, background:c.type==="reply"?B.blueBg:B.offWhite, color:c.type==="reply"?B.blueText:B.muted, fontWeight:600 }}>
                        {c.type==="reply" ? "Reply to submitter" : "Internal note"}
                      </span>
                      <span style={{ fontSize:11, color:B.muted }}>{timeAgo(c.ts)}</span>
                    </div>
                    <div style={{ background:B.offWhite, borderRadius:"4px 12px 12px 12px", padding:"10px 14px", fontSize:13, color:B.text, lineHeight:1.6, border:`1px solid ${B.border}` }}>{c.text}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Add comment */}
            <div style={{ borderTop:`1px solid ${B.border}`, paddingTop:20 }}>
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                {["internal","reply"].map(t => (
                  <button key={t} style={{ padding:"5px 14px", borderRadius:8, border:`1.5px solid ${commentType===t?B.orange:B.border}`, background:commentType===t?"#FFF4EF":B.white, color:commentType===t?B.orange:B.textSub, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }} onClick={()=>setCommentType(t)}>
                    {t==="internal" ? "Internal note" : "Reply to submitter"}
                  </button>
                ))}
              </div>
              <textarea
                value={comment} onChange={e=>setComment(e.target.value)}
                placeholder={commentType==="reply" ? "Write a reply — submitter will be notified by email…" : "Add an internal note — only agents can see this…"}
                style={{ ...S.input(false), resize:"vertical", fontFamily:"inherit", minHeight:80, marginBottom:10 }} rows={3}
              />
              <button style={{ ...S.btnOrange, fontSize:13 }} onClick={addComment}>Add Comment</button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {/* Status */}
          <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:14, padding:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:12 }}>Status</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {Object.entries(STATUS).map(([key,val]) => (
                <button key={key} onClick={()=>updateStatus(key)} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderRadius:8, border:`1.5px solid ${editStatus===key?B.orange:B.border}`, background:editStatus===key?"#FFF4EF":B.white, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:editStatus===key?700:400, color:editStatus===key?B.orange:B.text, transition:"all 0.12s" }}>
                  <span style={{ width:8, height:8, borderRadius:"50%", background:val.dot, flexShrink:0 }} />
                  {val.label}
                </button>
              ))}
            </div>
          </div>

          {/* Assignee */}
          <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:14, padding:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:12 }}>Assignee</div>
            <select value={editAssignee} onChange={e=>updateAssignee(e.target.value)} style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:`1.5px solid ${B.border}`, fontSize:13, color:B.text, background:B.white, fontFamily:"inherit", cursor:"pointer" }}>
              <option value="">Unassigned</option>
              {TEAM.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {editAssignee && (
              <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:12, padding:"8px 12px", background:B.offWhite, borderRadius:8 }}>
                <Avatar name={editAssignee} size={24} />
                <span style={{ fontSize:13, color:B.text, fontWeight:600 }}>{editAssignee}</span>
              </div>
            )}
          </div>

          {/* Meta */}
          <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:14, padding:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:12 }}>Details</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <MetaRow label="Submitted" value={timeAgo(ticket.createdAt)} />
              <MetaRow label="Last updated" value={timeAgo(ticket.updatedAt)} />
              <MetaRow label="Contact" value={ticket.contact} />
              <MetaRow label="Location" value={ticket.location} />
            </div>
          </div>

          {/* Close */}
          {editStatus !== "closed" && (
            <button onClick={()=>updateStatus("closed")} style={{ width:"100%", padding:"10px 0", borderRadius:10, border:`1.5px solid ${B.border}`, background:B.white, color:B.textSub, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
              Close Ticket
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize:11, color:B.muted, marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:13, color:B.text, fontWeight:500 }}>{value}</div>
    </div>
  );
}

// ── New Ticket Modal ──────────────────────────────────────────
function NewTicketModal({ onClose, onSubmit }) {
  const [form, setForm] = useState({ name:"", contact:"", location:"", issue:"" });
  const [photo, setPhoto] = useState(null);
  const [assignee, setAssignee] = useState("");
  const [status, setStatus] = useState("open");
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.name) e.name=true;
    if (!form.location) e.location=true;
    if (!form.issue) e.issue=true;
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onSubmit({ id:uid(), ...form, photo, status, assignee, comments:[], createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() });
    onClose();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16, fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ background:B.white, borderRadius:20, padding:32, width:"100%", maxWidth:560, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 80px rgba(0,0,0,0.3)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
          <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:B.text }}>Create Ticket</h2>
          <button style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:B.muted }} onClick={onClose}>✕</button>
        </div>
        <Field label="Submitter Name" error={errors.name}>
          <input style={S.input(errors.name)} value={form.name} placeholder="Who is reporting this?" onChange={e=>{ setForm({...form,name:e.target.value}); setErrors({...errors,name:false}); }} />
        </Field>
        <Field label="Contact Info" error={false}>
          <input style={S.input(false)} value={form.contact} placeholder="Email or phone (optional)" onChange={e=>setForm({...form,contact:e.target.value})} />
        </Field>
        <Field label="Location" error={errors.location}>
          <input style={S.input(errors.location)} value={form.location} placeholder="Where is the issue?" onChange={e=>{ setForm({...form,location:e.target.value}); setErrors({...errors,location:false}); }} />
        </Field>
        <Field label="Issue Description" error={errors.issue}>
          <textarea style={{ ...S.input(errors.issue), resize:"vertical", fontFamily:"inherit", minHeight:90 }} value={form.issue} placeholder="Describe the issue" onChange={e=>{ setForm({...form,issue:e.target.value}); setErrors({...errors,issue:false}); }} rows={3} />
        </Field>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:18 }}>
          <div>
            <label style={S.label}>Status</label>
            <select value={status} onChange={e=>setStatus(e.target.value)} style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1.5px solid ${B.border}`, fontSize:13, fontFamily:"inherit", background:B.white, color:B.text }}>
              {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Assign To</label>
            <select value={assignee} onChange={e=>setAssignee(e.target.value)} style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1.5px solid ${B.border}`, fontSize:13, fontFamily:"inherit", background:B.white, color:B.text }}>
              <option value="">Unassigned</option>
              {TEAM.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <PhotoUpload photo={photo} onChange={setPhoto} />
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button style={{ ...S.btnGhost }} onClick={onClose}>Cancel</button>
          <button style={{ ...S.btnOrange }} onClick={handleSubmit}>Create Ticket</button>
        </div>
      </div>
    </div>
  );
}

// ── Agent Dashboard ───────────────────────────────────────────
function AgentDashboard({ tickets, onTicketUpdate, onNewTicket, onLogout }) {
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("card");
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");

  const counts = {
    all: tickets.length,
    open: tickets.filter(t=>t.status==="open").length,
    "in-progress": tickets.filter(t=>t.status==="in-progress").length,
    resolved: tickets.filter(t=>t.status==="resolved").length,
    closed: tickets.filter(t=>t.status==="closed").length,
  };

  const filtered = tickets.filter(t => {
    const matchFilter = filter === "all" || t.status === filter;
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.issue.toLowerCase().includes(search.toLowerCase()) || t.location.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const handleUpdate = (id, updates) => {
    onTicketUpdate(id, updates);
    if (selected?.id === id) setSelected(prev=>({...prev,...updates}));
  };

  if (selected) return (
    <div style={{ minHeight:"100vh", background:B.offWhite, fontFamily:"'DM Sans', sans-serif" }}>
      <AgentNav onLogout={onLogout} onNew={()=>setShowNew(true)} />
      <div style={{ maxWidth:1000, margin:"0 auto", padding:"32px 24px" }}>
        <TicketDetail ticket={tickets.find(t=>t.id===selected.id)||selected} onUpdate={handleUpdate} onBack={()=>setSelected(null)} />
      </div>
      {showNew && <NewTicketModal onClose={()=>setShowNew(false)} onSubmit={t=>{onNewTicket(t);setShowNew(false);}} />}
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:B.offWhite, fontFamily:"'DM Sans', sans-serif" }}>
      <AgentNav onLogout={onLogout} onNew={()=>setShowNew(true)} />
      {showNew && <NewTicketModal onClose={()=>setShowNew(false)} onSubmit={t=>{onNewTicket(t);setShowNew(false);}} />}

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"32px 24px" }}>
        {/* Stats row */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:28 }}>
          {[["Open",counts.open,B.yellow],["In Progress",counts["in-progress"],B.blue],["Resolved",counts.resolved,B.green],["Closed",counts.closed,B.muted]].map(([label,count,color])=>(
            <div key={label} style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:14, padding:"18px 20px" }}>
              <div style={{ fontSize:28, fontWeight:800, color, lineHeight:1 }}>{count}</div>
              <div style={{ fontSize:12, color:B.muted, marginTop:4, fontWeight:600 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, flexWrap:"wrap" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tickets…" style={{ ...S.input(false), maxWidth:260, margin:0 }} />
          <div style={{ display:"flex", gap:4, flex:1, flexWrap:"wrap" }}>
            {Object.entries({all:"All",open:"Open","in-progress":"In Progress",resolved:"Resolved",closed:"Closed"}).map(([k,v])=>(
              <button key={k} onClick={()=>setFilter(k)} style={{ padding:"6px 14px", borderRadius:8, border:`1.5px solid ${filter===k?B.orange:B.border}`, background:filter===k?"#FFF4EF":B.white, color:filter===k?B.orange:B.textSub, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
                {v} {k==="all"?`(${counts.all})`:`(${counts[k]||0})`}
              </button>
            ))}
          </div>
          <div style={{ display:"flex", gap:4 }}>
            {[["card","▦"],["list","☰"]].map(([v,icon])=>(
              <button key={v} onClick={()=>setView(v)} style={{ width:34, height:34, borderRadius:8, border:`1.5px solid ${view===v?B.orange:B.border}`, background:view===v?"#FFF4EF":B.white, color:view===v?B.orange:B.textSub, fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>{icon}</button>
            ))}
          </div>
        </div>

        {/* Ticket grid/list */}
        {filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:B.muted, fontSize:14 }}>No tickets found.</div>
        ) : view === "card" ? (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:14 }}>
            {filtered.map(t=><TicketCard key={t.id} ticket={t} onClick={()=>setSelected(t)} />)}
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {filtered.map(t=><TicketRow key={t.id} ticket={t} onClick={()=>setSelected(t)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentNav({ onLogout, onNew }) {
  return (
    <div style={{ background:B.navy, height:56, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 24px", borderBottom:`1px solid rgba(255,255,255,0.08)`, position:"sticky", top:0, zIndex:50 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:20 }}>⚓</span>
        <span style={{ fontWeight:800, fontSize:17, color:B.white, letterSpacing:"-0.3px" }}>Harbix</span>
        <span style={{ fontSize:11, color:B.orange, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", marginLeft:4 }}>Agent</span>
      </div>
      <div style={{ display:"flex", gap:10 }}>
        <button style={{ ...S.btnOrange, fontSize:13, padding:"7px 16px" }} onClick={onNew}>+ New Ticket</button>
        <button style={{ ...S.btnGhost, fontSize:13, padding:"7px 16px" }} onClick={onLogout}>Sign out</button>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────
const S = {
  label: { display:"block", fontSize:12, fontWeight:700, color:B.textSub, marginBottom:5, letterSpacing:"0.02em" },
  input: (err) => ({ width:"100%", padding:"10px 14px", borderRadius:8, border:`1.5px solid ${err?B.red:B.border}`, fontSize:13, color:B.text, outline:"none", boxSizing:"border-box", background:B.white, fontFamily:"'DM Sans', sans-serif" }),
  btnOrange: { background:B.orange, color:B.white, border:"none", borderRadius:8, padding:"9px 20px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans', sans-serif", letterSpacing:"0.01em" },
  btnGhost: { background:B.white, color:B.textSub, border:`1.5px solid ${B.border}`, borderRadius:8, padding:"9px 20px", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans', sans-serif" },
};

// ── Root App ──────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("public"); // public | login | agent
  const [tickets, setTickets] = useState(MOCK_TICKETS);
  const [authed, setAuthed] = useState(false);

  const updateTicket = (id, updates) => setTickets(prev=>prev.map(t=>t.id===id?{...t,...updates}:t));
  const addTicket = (t) => setTickets(prev=>[t,...prev]);

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>
      {/* Page switcher for demo */}
      <div style={{ position:"fixed", bottom:16, right:16, zIndex:200, display:"flex", gap:8 }}>
        <button style={{ ...S.btnGhost, fontSize:11, padding:"5px 12px", boxShadow:"0 2px 8px rgba(0,0,0,0.12)" }} onClick={()=>setPage("public")}>👤 User form</button>
        <button style={{ ...S.btnOrange, fontSize:11, padding:"5px 12px", boxShadow:"0 2px 8px rgba(0,0,0,0.15)" }} onClick={()=>{ if(authed){setPage("agent")}else{setPage("login")} }}>🔒 Agent</button>
      </div>

      {page === "public" && <PublicForm onSubmit={t=>{addTicket(t);}} />}
      {page === "login" && <AgentLogin onLogin={()=>{ setAuthed(true); setPage("agent"); }} />}
      {page === "agent" && authed && <AgentDashboard tickets={tickets} onTicketUpdate={updateTicket} onNewTicket={addTicket} onLogout={()=>{ setAuthed(false); setPage("public"); }} />}
    </div>
  );
}