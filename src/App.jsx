import { useState, useRef, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import {
  signInWithPopup, signOut, onAuthStateChanged
} from "firebase/auth";
import {
  collection, addDoc, updateDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage, googleProvider } from "./firebase";

// ── Brand ─────────────────────────────────────────────────────
const B = {
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

const STATUS = {
  waiting:   { label: "Waiting",  bg: B.amberBg,  text: B.amberText, dot: B.amber },
  "on-it":   { label: "On It",    bg: B.blueBg,   text: B.blueText,  dot: B.blue  },
  done:      { label: "Done",     bg: B.greenBg,  text: B.greenText, dot: B.green },
  closed:    { label: "Closed",   bg: B.cream,    text: B.muted,     dot: B.muted },
};

const STEPS = [
  { key:"name",     question:"Hey! What's your name?",               placeholder:"Type your name…",                         type:"text",     required:true  },
  { key:"location", question:"Where's the issue happening?",         placeholder:"Main Sanctuary, Youth Room, Lobby…",       type:"text",     required:true  },
  { key:"issue",    question:"Tell us what's going on.",             placeholder:"Describe what's happening — any detail helps…", type:"textarea", required:true  },
  { key:"contact",  question:"How can we reach you?",                placeholder:"Email or phone number",                    type:"text",     required:false },
  { key:"photo",    question:"Got a photo or screenshot?",           placeholder:"",                                         type:"photo",    required:false },
];

// ── Helpers ───────────────────────────────────────────────────
function timeAgo(val) {
  if (!val) return "";
  const ts = val?.toDate ? val.toDate() : new Date(val);
  const d  = Date.now() - ts.getTime();
  const m  = Math.floor(d / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

async function uploadPhoto(file, ticketId) {
  if (!file) return null;
  const storageRef = ref(storage, `tickets/${ticketId}/${Date.now()}`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

function dataURLtoBlob(dataURL) {
  const arr  = dataURL.split(",");
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n      = bstr.length;
  const u8   = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  return new Blob([u8], { type: mime });
}

// ── Shared UI ─────────────────────────────────────────────────
function HarbixLogo({ dark=false, size="md" }) {
  const sz = { sm:15, md:18, lg:26 }[size];
  return (
    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
      <span style={{ fontSize:sz+2, fontWeight:900, color:B.orange, fontFamily:"Georgia,serif", fontStyle:"italic", lineHeight:1 }}>»</span>
      <span style={{ fontSize:sz, fontWeight:800, color:dark?B.white:B.text, letterSpacing:"-0.04em", fontFamily:"'DM Sans',system-ui,sans-serif" }}>Harbix</span>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.waiting;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, letterSpacing:"0.03em", background:s.bg, color:s.text, whiteSpace:"nowrap" }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:s.dot, flexShrink:0 }} />
      {s.label}
    </span>
  );
}

function Avatar({ initials, size=32, color=B.navy }) {
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:color, color:B.white, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.35, fontWeight:800, flexShrink:0, fontFamily:"'DM Sans',sans-serif" }}>
      {initials}
    </div>
  );
}

function Chip({ icon, children }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:11, color:B.textSub, background:B.cream, padding:"3px 9px", borderRadius:6, border:`1px solid ${B.border}`, whiteSpace:"nowrap" }}>
      {icon}<span>{children}</span>
    </span>
  );
}

function Field({ label, error, optional, children }) {
  return (
    <div style={{ marginBottom:18 }}>
      <label style={{ display:"block", fontSize:11, fontWeight:700, color:B.textSub, marginBottom:6, letterSpacing:"0.05em", textTransform:"uppercase" }}>
        {label}{optional&&<span style={{ fontWeight:400, textTransform:"none", fontSize:11, color:B.muted, marginLeft:4 }}>Optional</span>}
      </label>
      {children}
      {error&&<span style={{ color:B.red, fontSize:11, marginTop:3, display:"block" }}>Required</span>}
    </div>
  );
}

const INP = (err) => ({
  width:"100%", padding:"12px 14px", borderRadius:10,
  border:`1.5px solid ${err?B.red:B.border}`,
  fontSize:14, color:B.text, outline:"none",
  boxSizing:"border-box", background:B.white,
  fontFamily:"'DM Sans',system-ui,sans-serif",
  WebkitAppearance:"none",
});

// ── Conversational Public Form ────────────────────────────────
function PublicForm({ onSubmit }) {
  const [step, setStep]       = useState(0);
  const [answers, setAnswers] = useState({});
  const [current, setCurrent] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [error, setError]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [anim, setAnim]       = useState(false);
  const [dir, setDir]         = useState("forward");
  const [done, setDone]       = useState(false);
  const [kbVisible, setKbVisible] = useState(false);
  const inputRef = useRef();
  const photoRef = useRef();
  const s = STEPS[step];

  useEffect(() => {
    const initial = window.visualViewport?.height || window.innerHeight;
    const handler = () => {
      const h = window.visualViewport?.height || window.innerHeight;
      setKbVisible(h < initial * 0.85);
    };
    const vp = window.visualViewport;
    if (vp) { vp.addEventListener("resize", handler); return () => vp.removeEventListener("resize", handler); }
  }, []);

  useEffect(() => {
    setCurrent(answers[s?.key] || "");
    setError(false);
    if (s?.type !== "photo") setTimeout(() => inputRef.current?.focus(), 300);
  }, [step]);

  const go = (delta) => {
    setDir(delta > 0 ? "forward" : "back");
    setAnim(true);
    setTimeout(() => { setStep(st => st + delta); setAnim(false); }, 200);
  };

  const advance = async () => {
    if (s.required && s.type !== "photo" && !current.trim()) { setError(true); return; }
    const updated = s.type !== "photo" ? { ...answers, [s.key]: current } : answers;
    setAnswers(updated);
    if (step < STEPS.length - 1) { go(1); return; }
    setLoading(true);
    try {
      await onSubmit(updated, photoFile);
    } finally {
      setLoading(false);
      setDone(true);
    }
  };

  const skip = () => {
    if (step < STEPS.length - 1) go(1); else advance();
  };

  const handleFile = f => {
    if (!f || !f.type.startsWith("image/")) return;
    setPhotoFile(f);
    const r = new FileReader();
    r.onload = e => setPhotoPreview(e.target.result);
    r.readAsDataURL(f);
  };

  if (done) return (
    <div style={{ height:"100dvh", background:`linear-gradient(160deg,${B.deep} 0%,${B.navy} 100%)`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 24px", textAlign:"center", fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      <div style={{ width:80, height:80, borderRadius:"50%", background:"rgba(16,185,129,0.15)", border:"2px solid rgba(16,185,129,0.35)", color:B.green, fontSize:36, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:28 }}>✓</div>
      <h2 style={{ margin:"0 0 12px", fontSize:28, fontWeight:800, color:B.white, letterSpacing:"-0.04em" }}>
        Got it{answers.name?`, ${answers.name.split(" ")[0]}`:""}!
      </h2>
      <p style={{ color:"rgba(255,255,255,0.5)", fontSize:16, lineHeight:1.7, maxWidth:300, margin:"0 auto 36px" }}>
        Someone from the AV team will follow up with you{answers.contact?` at ${answers.contact}`:""} as soon as possible.
      </p>
      <button onClick={()=>{ setDone(false); setStep(0); setAnswers({}); setPhotoFile(null); setPhotoPreview(null); setCurrent(""); }}
        style={{ background:"rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.7)", border:"1.5px solid rgba(255,255,255,0.15)", borderRadius:12, padding:"13px 28px", fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
        Submit another issue
      </button>
    </div>
  );

  const progress  = (step / STEPS.length) * 100;
  const slideStyle = { opacity:anim?0:1, transform:anim?`translateX(${dir==="forward"?"28px":"-28px"})`:"translateX(0)", transition:"opacity 0.2s ease,transform 0.2s ease" };

  return (
    <div style={{ height:"100dvh", background:`linear-gradient(160deg,${B.deep} 0%,${B.navy} 100%)`, display:"flex", flexDirection:"column", fontFamily:"'DM Sans',system-ui,sans-serif", overflow:"hidden" }}>
      <div style={{ padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <HarbixLogo dark />
        <span style={{ fontSize:11, color:"rgba(255,255,255,0.3)", fontWeight:600, letterSpacing:"0.06em", textTransform:"uppercase" }}>GodChasers Church</span>
      </div>
      <div style={{ height:3, background:"rgba(255,255,255,0.08)", flexShrink:0 }}>
        <div style={{ height:"100%", background:B.orange, width:`${progress}%`, transition:"width 0.4s ease", borderRadius:"0 2px 2px 0" }} />
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"28px 24px 16px", display:"flex", flexDirection:"column" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:36, flexShrink:0 }}>
          {step > 0 && (
            <button onClick={()=>go(-1)} style={{ width:34, height:34, background:"rgba(255,255,255,0.1)", border:"none", borderRadius:"50%", color:"rgba(255,255,255,0.7)", fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>‹</button>
          )}
          <span style={{ fontSize:12, color:"rgba(255,255,255,0.35)", fontWeight:600, letterSpacing:"0.06em" }}>{step+1} of {STEPS.length}</span>
        </div>
        <div style={slideStyle}>
          <h2 style={{ margin:"0 0 6px", fontSize:28, fontWeight:800, color:B.white, letterSpacing:"-0.04em", lineHeight:1.25 }}>{s.question}</h2>
          {!s.required && <p style={{ margin:"0 0 24px", fontSize:14, color:"rgba(255,255,255,0.38)" }}>Optional — tap Skip to continue</p>}
          {s.required  && <div style={{ marginBottom:24 }} />}

          {s.type==="text" && (
            <input ref={inputRef} value={current} onChange={e=>{setCurrent(e.target.value);setError(false);}}
              onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); advance(); } }}
              placeholder={s.placeholder} enterKeyHint={step===STEPS.length-1?"send":"next"}
              style={{ width:"100%", background:"rgba(255,255,255,0.09)", border:`1.5px solid ${error?"#FF6B6B":"rgba(255,255,255,0.18)"}`, borderRadius:14, padding:"16px 18px", fontSize:18, color:B.white, outline:"none", fontFamily:"inherit", WebkitAppearance:"none", caretColor:B.orange, boxSizing:"border-box" }} />
          )}
          {s.type==="textarea" && (
            <textarea ref={inputRef} value={current} onChange={e=>{setCurrent(e.target.value);setError(false);}}
              placeholder={s.placeholder} rows={4}
              style={{ width:"100%", background:"rgba(255,255,255,0.09)", border:`1.5px solid ${error?"#FF6B6B":"rgba(255,255,255,0.18)"}`, borderRadius:14, padding:"16px 18px", fontSize:16, color:B.white, outline:"none", fontFamily:"inherit", resize:"none", minHeight:120, caretColor:B.orange, boxSizing:"border-box" }} />
          )}
          {s.type==="photo" && (
            photoPreview ? (
              <div style={{ position:"relative" }}>
                <img src={photoPreview} alt="preview" style={{ width:"100%", maxHeight:200, objectFit:"cover", borderRadius:14, border:"1.5px solid rgba(255,255,255,0.15)", display:"block" }} />
                <button style={{ position:"absolute", top:10, right:10, background:"rgba(0,0,0,0.65)", color:"#fff", border:"none", borderRadius:6, padding:"4px 10px", fontSize:12, cursor:"pointer", fontWeight:700 }} onClick={()=>{ setPhotoFile(null); setPhotoPreview(null); }}>✕</button>
              </div>
            ) : (
              <div onClick={()=>photoRef.current.click()} style={{ border:"2px dashed rgba(255,255,255,0.18)", borderRadius:14, padding:"36px 20px", textAlign:"center", cursor:"pointer", background:"rgba(255,255,255,0.05)", display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:40 }}>📷</span>
                <span style={{ fontSize:15, color:"rgba(255,255,255,0.7)", fontWeight:600 }}>Tap to add a photo</span>
                <span style={{ fontSize:12, color:"rgba(255,255,255,0.35)" }}>PNG, JPG, WEBP</span>
                <input ref={photoRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])} />
              </div>
            )
          )}
          {error && <span style={{ color:"#FF8A80", fontSize:13, marginTop:8, display:"block" }}>This one's required — we need it to help you.</span>}
          {kbVisible && s.type==="text" && !error && (
            <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:14 }}>
              <span style={{ fontSize:12, color:"rgba(255,255,255,0.35)" }}>Press</span>
              <span style={{ fontSize:11, color:"rgba(255,255,255,0.55)", background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:5, padding:"2px 8px", fontWeight:600 }}>Return</span>
              <span style={{ fontSize:12, color:"rgba(255,255,255,0.35)" }}>to continue</span>
            </div>
          )}
        </div>
      </div>
      <div style={{ flexShrink:0, padding:"12px 24px 32px", transition:"opacity 0.2s ease", opacity:kbVisible&&s.type==="text"?0:1, pointerEvents:kbVisible&&s.type==="text"?"none":"auto" }}>
        <div style={{ display:"flex", gap:10 }}>
          {!s.required && (
            <button onClick={skip} style={{ padding:"15px 20px", background:"rgba(255,255,255,0.07)", color:"rgba(255,255,255,0.5)", border:"1.5px solid rgba(255,255,255,0.1)", borderRadius:14, fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>Skip</button>
          )}
          <button onClick={advance} disabled={loading} style={{ flex:1, background:B.orange, color:B.white, border:"none", borderRadius:14, padding:"16px 0", fontSize:17, fontWeight:800, cursor:loading?"default":"pointer", fontFamily:"inherit", opacity:loading?0.8:1 }}>
            {loading?"Sending…":step===STEPS.length-1?"Submit »":"Next »"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Google Login ──────────────────────────────────────────────
function GoogleLogin({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");

  const handleGoogleLogin = async () => {
    setLoading(true); setErr("");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email  = result.user.email;
      if (!email.endsWith("@godchasers.church")) {
        await signOut(auth);
        setErr("Access restricted to @godchasers.church accounts only.");
        setLoading(false);
        return;
      }
      const agent = {
        id:     result.user.uid,
        name:   result.user.displayName,
        email,
        avatar: result.user.displayName.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase(),
        photo:  result.user.photoURL,
      };
      onLogin(agent);
    } catch (e) {
      setErr("Sign-in failed. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(160deg,${B.deep} 0%,${B.navy} 100%)`, display:"flex", alignItems:"center", justifyContent:"center", padding:24, fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      <div style={{ background:B.white, borderRadius:24, padding:"40px 32px", width:"100%", maxWidth:380, textAlign:"center", boxShadow:"0 20px 60px rgba(0,0,0,0.35)" }}>
        <HarbixLogo size="lg" />
        <p style={{ color:B.textSub, fontSize:13, margin:"8px 0 28px", lineHeight:1.5 }}>Agent portal · GodChasers AV Team</p>
        <div style={{ background:B.offWhite, borderRadius:14, padding:"14px 16px", marginBottom:24, border:`1px solid ${B.border}` }}>
          <div style={{ fontSize:13, color:B.textSub, lineHeight:1.6 }}>
            Sign in with your <strong style={{ color:B.text }}>@godchasers.church</strong> Google account to access the agent portal.
          </div>
        </div>
        {err && (
          <div style={{ background:B.redBg, border:`1px solid ${B.red}`, borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:13, color:B.redText }}>{err}</div>
        )}
        <button onClick={handleGoogleLogin} disabled={loading} style={{ width:"100%", padding:"13px 20px", borderRadius:12, border:`1.5px solid ${B.border}`, background:B.white, cursor:loading?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, fontSize:14, fontWeight:700, color:B.text, fontFamily:"inherit", opacity:loading?0.7:1, boxShadow:"0 1px 4px rgba(0,0,0,0.08)" }}>
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2l6.8-6.8C35.8 2.3 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.2 17.7 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17z"/>
            <path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z"/>
            <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2 1.4-4.6 2.2-7.7 2.2-6.3 0-11.6-3.7-13.5-9.1l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/>
          </svg>
          {loading?"Signing in…":"Continue with Google"}
        </button>
        <p style={{ marginTop:18, fontSize:11, color:B.muted, lineHeight:1.5 }}>Only @godchasers.church accounts can access this portal.</p>
      </div>
    </div>
  );
}

// ── Ticket Card ───────────────────────────────────────────────
function TicketCard({ ticket, agent, onClaim, onUnclaim, onClick }) {
  const isMine      = ticket.claimedBy?.id === agent?.id;
  const isUnclaimed = !ticket.claimedBy;
  return (
    <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:16, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
      <div onClick={onClick} style={{ padding:"16px 16px 12px", cursor:"pointer" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <Avatar initials={ticket.name.split(" ").map(w=>w[0]).join("").slice(0,2)} size={34} />
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:B.text, lineHeight:1.2 }}>{ticket.name}</div>
              <div style={{ fontSize:11, color:B.muted, marginTop:2 }}>{timeAgo(ticket.createdAt)}</div>
            </div>
          </div>
          <StatusBadge status={ticket.status} />
        </div>
        <div style={{ display:"flex", gap:5, marginBottom:10, flexWrap:"wrap" }}>
          <Chip icon="📍">{ticket.location}</Chip>
          {ticket.photoURL && <Chip icon="📷">Photo</Chip>}
          {ticket.comments?.length > 0 && <Chip icon="💬">{ticket.comments.length}</Chip>}
          {ticket.claimedBy && <Chip icon="👤">{ticket.claimedBy.name.split(" ")[0]}</Chip>}
        </div>
        <p style={{ margin:0, fontSize:13, color:B.textSub, lineHeight:1.55, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{ticket.issue}</p>
      </div>
      {ticket.status !== "closed" && (
        <div style={{ borderTop:`1px solid ${B.border}`, padding:"10px 14px", background:B.offWhite, display:"flex", gap:8 }}>
          {isUnclaimed && ticket.status==="waiting" && (
            <button onClick={e=>{e.stopPropagation();onClaim(ticket.id);}} style={{ ...BTN.orangeSolid, flex:1, fontSize:13, padding:"9px 0", borderRadius:10 }}>» Claim Ticket</button>
          )}
          {isMine && ticket.status==="on-it" && (
            <>
              <button onClick={e=>{e.stopPropagation();onUnclaim(ticket.id);}} style={{ ...BTN.ghost, fontSize:12, padding:"8px 12px", borderRadius:10 }}>Release</button>
              <button onClick={onClick} style={{ ...BTN.orangeSolid, flex:1, fontSize:13, padding:"9px 0", borderRadius:10 }}>View & Update →</button>
            </>
          )}
          {!isMine && ticket.claimedBy && (
            <span style={{ fontSize:12, color:B.muted, padding:"8px 0" }}>Claimed by {ticket.claimedBy.name.split(" ")[0]}</span>
          )}
          {ticket.status==="done" && (
            <button onClick={onClick} style={{ ...BTN.ghost, flex:1, fontSize:13, padding:"9px 0", borderRadius:10 }}>View Details</button>
          )}
        </div>
      )}
    </div>
  );
}

function TicketRow({ ticket, agent, onClaim, onUnclaim, onClick }) {
  const isMine      = ticket.claimedBy?.id === agent?.id;
  const isUnclaimed = !ticket.claimedBy;
  return (
    <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, padding:"13px 16px", display:"flex", alignItems:"center", gap:12 }}>
      <Avatar initials={ticket.name.split(" ").map(w=>w[0]).join("").slice(0,2)} size={36} />
      <div style={{ flex:1, minWidth:0, cursor:"pointer" }} onClick={onClick}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap" }}>
          <span style={{ fontWeight:700, fontSize:14, color:B.text }}>{ticket.name}</span>
          <Chip icon="📍">{ticket.location}</Chip>
        </div>
        <p style={{ margin:0, fontSize:12, color:B.textSub, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{ticket.issue}</p>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
        <StatusBadge status={ticket.status} />
        {isUnclaimed && ticket.status==="waiting" && (
          <button onClick={e=>{e.stopPropagation();onClaim(ticket.id);}} style={{ ...BTN.orangeSolid, fontSize:12, padding:"6px 12px", borderRadius:8 }}>Claim</button>
        )}
        {isMine && (
          <button onClick={e=>{e.stopPropagation();onUnclaim(ticket.id);}} style={{ ...BTN.ghost, fontSize:12, padding:"6px 10px", borderRadius:8 }}>Release</button>
        )}
      </div>
    </div>
  );
}

// ── Ticket Detail ─────────────────────────────────────────────
function TicketDetail({ ticket, agent, onUpdate, onBack }) {
  const [comment, setComment]         = useState("");
  const [commentType, setCommentType] = useState("internal");
  const [lightbox, setLightbox]       = useState(false);
  const [saving, setSaving]           = useState(false);

  const update = async (updates) => {
    setSaving(true);
    await updateDoc(doc(db, "tickets", ticket.id), { ...updates, updatedAt: serverTimestamp() });
    setSaving(false);
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    const c = { id:"c"+Date.now(), author:agent.name, avatar:agent.avatar, text:comment.trim(), type:commentType, ts:new Date().toISOString() };
    await update({ comments:[...(ticket.comments||[]), c] });
    setComment("");
  };

  return (
    <div style={{ minHeight:"100vh", background:B.offWhite, fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      {lightbox && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={()=>setLightbox(false)}>
          <img src={ticket.photoURL} alt="attachment" style={{ maxWidth:"95vw", maxHeight:"90vh", borderRadius:12 }} />
        </div>
      )}
      <div style={{ background:B.navy, padding:"0 16px", height:54, display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:10 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.7)", fontSize:24, cursor:"pointer", padding:0, lineHeight:1 }}>‹</button>
        <span style={{ fontWeight:700, fontSize:15, color:B.white, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ticket.name}</span>
        <StatusBadge status={ticket.status} />
      </div>
      <div style={{ padding:"16px", maxWidth:640, margin:"0 auto" }}>
        <div style={{ background:B.white, borderRadius:16, padding:"20px", marginBottom:14, border:`1px solid ${B.border}` }}>
          <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
            <Chip icon="📍">{ticket.location}</Chip>
            {ticket.contact && <Chip icon="📬">{ticket.contact}</Chip>}
            <Chip icon="🕐">{timeAgo(ticket.createdAt)}</Chip>
          </div>
          <p style={{ margin:0, fontSize:15, color:B.text, lineHeight:1.7 }}>{ticket.issue}</p>
          {ticket.photoURL && (
            <div style={{ marginTop:16 }}>
              <img src={ticket.photoURL} alt="attachment" style={{ width:140, height:96, objectFit:"cover", borderRadius:10, border:`1.5px solid ${B.border}`, cursor:"pointer" }} onClick={()=>setLightbox(true)} />
              <div style={{ fontSize:11, color:B.muted, marginTop:4 }}>Tap to enlarge</div>
            </div>
          )}
        </div>

        <div style={{ background:B.white, borderRadius:16, padding:"20px", marginBottom:14, border:`1px solid ${B.border}` }}>
          <div style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:14 }}>Status & Assignment</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 }}>
            {Object.entries(STATUS).map(([key,val])=>(
              <button key={key} onClick={()=>update({status:key})} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 13px", borderRadius:8, border:`1.5px solid ${ticket.status===key?B.orange:B.border}`, background:ticket.status===key?B.orangeLight:B.white, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:ticket.status===key?700:400, color:ticket.status===key?B.orange:B.text }}>
                <span style={{ width:7, height:7, borderRadius:"50%", background:val.dot }} />{val.label}
              </button>
            ))}
          </div>
          {ticket.claimedBy ? (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:B.offWhite, borderRadius:10, padding:"10px 14px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <Avatar initials={ticket.claimedBy.avatar} size={28} color={B.orange} />
                <span style={{ fontSize:13, fontWeight:600, color:B.text }}>{ticket.claimedBy.name}</span>
                <span style={{ fontSize:11, color:B.muted }}>is on it</span>
              </div>
              {ticket.claimedBy.id===agent?.id && (
                <button onClick={()=>update({claimedBy:null,status:"waiting"})} style={{ ...BTN.ghost, fontSize:12, padding:"5px 10px", borderRadius:7 }}>Release</button>
              )}
            </div>
          ) : (
            <button onClick={()=>update({claimedBy:agent,status:"on-it"})} style={{ ...BTN.orangeSolid, width:"100%", padding:"12px 0", borderRadius:10, fontSize:14 }}>» Claim This Ticket</button>
          )}
        </div>

        <div style={{ background:B.white, borderRadius:16, padding:"20px", border:`1px solid ${B.border}` }}>
          <div style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:16 }}>
            Comments {ticket.comments?.length>0&&`(${ticket.comments.length})`}
          </div>
          {!ticket.comments?.length && <p style={{ color:B.muted, fontSize:13, margin:"0 0 20px" }}>No comments yet.</p>}
          <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:20 }}>
            {(ticket.comments||[]).map(c=>(
              <div key={c.id} style={{ display:"flex", gap:10 }}>
                <Avatar initials={c.avatar} size={30} color={c.type==="reply"?B.blue:B.navy} />
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5, flexWrap:"wrap" }}>
                    <span style={{ fontWeight:700, fontSize:13, color:B.text }}>{c.author}</span>
                    <span style={{ fontSize:10, padding:"2px 7px", borderRadius:8, background:c.type==="reply"?B.blueBg:B.cream, color:c.type==="reply"?B.blueText:B.muted, fontWeight:600 }}>
                      {c.type==="reply"?"Reply to submitter":"Internal note"}
                    </span>
                    <span style={{ fontSize:11, color:B.muted }}>{timeAgo(c.ts)}</span>
                  </div>
                  <div style={{ background:B.offWhite, borderRadius:"4px 12px 12px 12px", padding:"10px 13px", fontSize:13, color:B.text, lineHeight:1.6, border:`1px solid ${B.border}` }}>{c.text}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop:`1px solid ${B.border}`, paddingTop:16 }}>
            <div style={{ display:"flex", gap:6, marginBottom:10 }}>
              {[["internal","Internal note"],["reply","Reply to submitter"]].map(([t,label])=>(
                <button key={t} onClick={()=>setCommentType(t)} style={{ flex:1, padding:"7px 10px", borderRadius:8, border:`1.5px solid ${commentType===t?B.orange:B.border}`, background:commentType===t?B.orangeLight:B.white, color:commentType===t?B.orange:B.textSub, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>{label}</button>
              ))}
            </div>
            <textarea value={comment} onChange={e=>setComment(e.target.value)}
              placeholder={commentType==="reply"?"Write a reply — submitter will be notified…":"Add a note only your team can see…"}
              style={{ ...INP(false), resize:"none", minHeight:85, fontFamily:"inherit", marginBottom:10 }} rows={3} />
            <button style={{ ...BTN.orangeSolid, width:"100%", padding:"12px 0", borderRadius:10, fontSize:14 }} onClick={addComment} disabled={saving}>
              {saving?"Saving…":"Add Comment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── New Ticket Modal ──────────────────────────────────────────
function NewTicketModal({ agent, onClose, onSubmit }) {
  const [form, setForm]     = useState({ name:"", contact:"", location:"", issue:"" });
  const [photoFile, setPhotoFile]     = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [status, setStatus] = useState("waiting");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const photoRef = useRef();

  const set = (k,v) => { setForm(f=>({...f,[k]:v})); setErrors(e=>({...e,[k]:false})); };
  const handleFile = f => {
    if (!f||!f.type.startsWith("image/")) return;
    setPhotoFile(f);
    const r=new FileReader(); r.onload=e=>setPhotoPreview(e.target.result); r.readAsDataURL(f);
  };
  const validate = () => {
    const e={};
    if(!form.name)e.name=true;
    if(!form.location)e.location=true;
    if(!form.issue)e.issue=true;
    setErrors(e); return !Object.keys(e).length;
  };
  const submit = async () => {
    if(!validate()) return;
    setSaving(true);
    await onSubmit(form, photoFile, status, status==="on-it"?agent:null);
    setSaving(false);
    onClose();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:100, display:"flex", alignItems:"flex-end", justifyContent:"center", fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      <div style={{ background:B.white, borderRadius:"20px 20px 0 0", padding:"24px 20px 36px", width:"100%", maxWidth:580, maxHeight:"92vh", overflowY:"auto", boxShadow:"0 -8px 40px rgba(0,0,0,0.25)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
          <h2 style={{ margin:0, fontSize:20, fontWeight:800, color:B.text, letterSpacing:"-0.03em" }}>Create Ticket</h2>
          <button style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:B.muted }} onClick={onClose}>✕</button>
        </div>
        {[{k:"name",l:"Submitter Name",p:"Who is this for?",req:true},{k:"contact",l:"Contact Info",p:"Email or phone (optional)",req:false},{k:"location",l:"Location",p:"Where is the issue?",req:true}].map(({k,l,p,req})=>(
          <Field key={k} label={l} error={errors[k]} optional={!req}>
            <input style={INP(errors[k])} value={form[k]} placeholder={p} onChange={e=>set(k,e.target.value)} />
          </Field>
        ))}
        <Field label="Issue Description" error={errors.issue}>
          <textarea style={{ ...INP(errors.issue), resize:"none", fontFamily:"inherit", minHeight:90 }} value={form.issue} placeholder="Describe the issue" onChange={e=>set("issue",e.target.value)} rows={3} />
        </Field>
        <Field label="Initial Status" error={false}>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {Object.entries(STATUS).slice(0,3).map(([k,v])=>(
              <button key={k} onClick={()=>setStatus(k)} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 13px", borderRadius:8, border:`1.5px solid ${status===k?B.orange:B.border}`, background:status===k?B.orangeLight:B.white, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:status===k?700:400, color:status===k?B.orange:B.text }}>
                <span style={{ width:7, height:7, borderRadius:"50%", background:v.dot }} />{v.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Photo" optional>
          {photoPreview ? (
            <div style={{ position:"relative" }}>
              <img src={photoPreview} alt="preview" style={{ width:"100%", maxHeight:160, objectFit:"cover", borderRadius:10, border:`1.5px solid ${B.border}`, display:"block" }} />
              <button style={{ position:"absolute", top:8, right:8, background:"rgba(0,0,0,0.65)", color:"#fff", border:"none", borderRadius:6, padding:"4px 10px", fontSize:12, cursor:"pointer", fontWeight:700 }} onClick={()=>{ setPhotoFile(null); setPhotoPreview(null); }}>✕</button>
            </div>
          ) : (
            <div onClick={()=>photoRef.current.click()} style={{ border:`2px dashed ${B.border}`, borderRadius:10, padding:"16px", textAlign:"center", cursor:"pointer", background:B.offWhite }}>
              <span style={{ fontSize:13, color:B.textSub }}>📎 Tap to add a photo</span>
              <input ref={photoRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])} />
            </div>
          )}
        </Field>
        <div style={{ display:"flex", gap:10 }}>
          <button style={{ ...BTN.ghost, flex:1, padding:"12px 0", borderRadius:10, fontSize:14 }} onClick={onClose}>Cancel</button>
          <button style={{ ...BTN.orangeSolid, flex:2, padding:"12px 0", borderRadius:10, fontSize:14, opacity:saving?0.7:1 }} onClick={submit} disabled={saving}>
            {saving?"Creating…":"Create Ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Agent Dashboard ───────────────────────────────────────────
function AgentDashboard({ agent, tickets, onUpdate, onAdd, onLogout }) {
  const [tab, setTab]           = useState("all");
  const [view, setView]         = useState("card");
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew]   = useState(false);
  const [search, setSearch]     = useState("");

  const counts = {
    all:     tickets.length,
    waiting: tickets.filter(t=>t.status==="waiting").length,
    mine:    tickets.filter(t=>t.claimedBy?.id===agent.id).length,
    done:    tickets.filter(t=>t.status==="done"||t.status==="closed").length,
  };

  const filtered = tickets.filter(t => {
    const matchTab =
      tab==="all"     ? true :
      tab==="waiting" ? t.status==="waiting" :
      tab==="mine"    ? t.claimedBy?.id===agent.id :
      tab==="done"    ? (t.status==="done"||t.status==="closed") : true;
    const s = search.toLowerCase();
    return matchTab && (!search || t.name.toLowerCase().includes(s) || t.issue.toLowerCase().includes(s) || t.location.toLowerCase().includes(s));
  });

  const claim   = id => onUpdate(id,{claimedBy:agent,status:"on-it"});
  const unclaim = id => onUpdate(id,{claimedBy:null,status:"waiting"});

  if (selected) {
    const live = tickets.find(t=>t.id===selected);
    if (!live) { setSelected(null); return null; }
    return <TicketDetail ticket={live} agent={agent} onUpdate={onUpdate} onBack={()=>setSelected(null)} />;
  }

  return (
    <div style={{ minHeight:"100vh", background:B.offWhite, fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      {showNew && <NewTicketModal agent={agent} onClose={()=>setShowNew(false)} onSubmit={onAdd} />}
      <div style={{ background:B.navy, padding:"0 16px", height:54, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:10 }}>
        <HarbixLogo dark size="sm" />
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button style={{ ...BTN.orangeSolid, fontSize:13, padding:"7px 14px", borderRadius:8 }} onClick={()=>setShowNew(true)}>+ New</button>
          <div style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer" }} onClick={onLogout}>
            {agent.photo
              ? <img src={agent.photo} alt="avatar" style={{ width:28, height:28, borderRadius:"50%", objectFit:"cover" }} />
              : <Avatar initials={agent.avatar} size={28} color={B.navyDark} />
            }
            <span style={{ fontSize:12, color:"rgba(255,255,255,0.55)", fontWeight:500 }}>Sign out</span>
          </div>
        </div>
      </div>
      <div style={{ background:B.navy, padding:"0 16px 16px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
          {[["All",counts.all,B.white],["Waiting",counts.waiting,B.amber],["Mine",counts.mine,B.orange],["Done",counts.done,B.green]].map(([label,count,color])=>(
            <div key={label} style={{ background:"rgba(255,255,255,0.07)", borderRadius:12, padding:"12px 10px", textAlign:"center" }}>
              <div style={{ fontSize:22, fontWeight:800, color, lineHeight:1, letterSpacing:"-0.03em" }}>{count}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginTop:3, fontWeight:600 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background:B.white, borderBottom:`1px solid ${B.border}`, padding:"0 16px", display:"flex", overflowX:"auto" }}>
        {[["all","All"],["waiting","Waiting"],["mine","My Queue"],["done","Done"]].map(([key,label])=>(
          <button key={key} onClick={()=>setTab(key)} style={{ background:"none", border:"none", borderBottom:`2.5px solid ${tab===key?B.orange:"transparent"}`, padding:"13px 14px", fontSize:13, fontWeight:tab===key?700:500, color:tab===key?B.orange:B.textSub, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
            {label}{key!=="all"&&` (${counts[key]||0})`}
          </button>
        ))}
      </div>
      <div style={{ padding:"12px 16px", display:"flex", gap:8 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tickets…" style={{ flex:1, padding:"10px 14px", borderRadius:10, border:`1.5px solid ${B.border}`, fontSize:13, color:B.text, outline:"none", fontFamily:"inherit", background:B.white, WebkitAppearance:"none" }} />
        <div style={{ display:"flex", gap:4 }}>
          {[["card","▦"],["list","☰"]].map(([v,icon])=>(
            <button key={v} onClick={()=>setView(v)} style={{ width:38, height:38, borderRadius:8, border:`1.5px solid ${view===v?B.orange:B.border}`, background:view===v?B.orangeLight:B.white, color:view===v?B.orange:B.textSub, fontSize:15, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>{icon}</button>
          ))}
        </div>
      </div>
      <div style={{ padding:"0 16px 40px" }}>
        {filtered.length===0 ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:B.muted }}>
            <div style={{ fontSize:36, marginBottom:12 }}>📭</div>
            <div style={{ fontSize:14, fontWeight:600 }}>No tickets here</div>
          </div>
        ) : view==="card" ? (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {filtered.map(t=><TicketCard key={t.id} ticket={t} agent={agent} onClaim={claim} onUnclaim={unclaim} onClick={()=>setSelected(t.id)} />)}
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {filtered.map(t=><TicketRow key={t.id} ticket={t} agent={agent} onClaim={claim} onUnclaim={unclaim} onClick={()=>setSelected(t.id)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Button tokens ─────────────────────────────────────────────
const BTN = {
  orangeSolid: { background:B.orange, color:B.white, border:"none", borderRadius:10, padding:"10px 20px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',system-ui,sans-serif", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6 },
  ghost:       { background:B.white, color:B.textSub, border:`1.5px solid ${B.border}`, borderRadius:10, padding:"10px 20px", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',system-ui,sans-serif" },
};

// ── Root App — React Router with proper /agent route ─────────
function AppInner() {
  const [user, setUser]       = useState(undefined); // undefined = loading
  const [agent, setAgent]     = useState(null);
  const [tickets, setTickets] = useState([]);
  const navigate = useNavigate();

  // ── Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser && firebaseUser.email?.endsWith("@godchasers.church")) {
        const a = {
          id:     firebaseUser.uid,
          name:   firebaseUser.displayName || firebaseUser.email,
          email:  firebaseUser.email,
          avatar: (firebaseUser.displayName || "??").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase(),
          photo:  firebaseUser.photoURL,
        };
        setAgent(a);
        setUser(firebaseUser);
        navigate("/agent");
      } else {
        setAgent(null);
        setUser(null);
      }
    });
    return unsub;
  }, []);

  // ── Firestore real-time listener
  useEffect(() => {
    if (!agent) return;
    const q = query(collection(db, "tickets"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setTickets(snap.docs.map(d => ({ id:d.id, ...d.data() })));
    });
    return unsub;
  }, [agent]);

  // ── Submit ticket (public form)
  const handleSubmit = async (answers, photoFile) => {
    const ticketId = "t_" + Date.now();
    let photoURL   = null;
    if (photoFile) {
      try {
        console.log("Uploading photo, file type:", photoFile.type, "size:", photoFile.size);
        photoURL = await uploadPhoto(photoFile, ticketId);
        console.log("Photo uploaded successfully:", photoURL);
      } catch (e) {
        console.error("Photo upload failed:", e?.code, e?.message);
      }
    }
    const ticketData = {
      name:      answers.name     || "",
      contact:   answers.contact  || "",
      location:  answers.location || "",
      issue:     answers.issue    || "",
      photoURL,
      status:    "waiting",
      claimedBy: null,
      comments:  [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, "tickets"), ticketData);
    try {
      await fetch("/api/submit-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ticketData, firestoreId: docRef.id, createdAt: new Date().toISOString() }),
      });
    } catch (e) {
      console.error("Email notification failed:", e);
    }
  };

  // ── Update ticket
  const handleUpdate = async (id, updates) => {
    await updateDoc(doc(db, "tickets", id), { ...updates, updatedAt: serverTimestamp() });
  };

  // ── Add ticket (agent creates manually)
  const handleAdd = async (form, photoFile, status, claimedBy) => {
    let photoURL = null;
    if (photoFile) {
      const tempId = "t_" + Date.now();
      photoURL = await uploadPhoto(photoFile, tempId);
    }
    const ticketData = {
      name:      form.name     || "",
      contact:   form.contact  || "",
      location:  form.location || "",
      issue:     form.issue    || "",
      photoURL,
      status:    status || "waiting",
      claimedBy: claimedBy || null,
      comments:  [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await addDoc(collection(db, "tickets"), ticketData);
  };

  const handleLogin  = (a) => { setAgent(a); navigate("/agent"); };
  const handleLogout = async () => { await signOut(auth); setAgent(null); navigate("/"); };

  // Loading screen while Firebase checks auth
  if (user === undefined) return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(160deg,${B.deep} 0%,${B.navy} 100%)`, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:32, fontWeight:900, color:B.orange, fontFamily:"Georgia,serif", fontStyle:"italic", marginBottom:12 }}>»</div>
        <div style={{ fontSize:14, color:"rgba(255,255,255,0.4)", fontFamily:"'DM Sans',sans-serif" }}>Loading…</div>
      </div>
    </div>
  );

  return (
    <Routes>
      {/* Public form — anyone can access */}
      <Route path="/" element={<PublicForm onSubmit={handleSubmit} />} />

      {/* Agent login — redirects to /agent if already logged in */}
      <Route path="/agent/login" element={
        agent ? <Navigate to="/agent" replace /> : <GoogleLogin onLogin={handleLogin} />
      } />

      {/* Agent dashboard — redirects to login if not authenticated */}
      <Route path="/agent" element={
        agent
          ? <AgentDashboard agent={agent} tickets={tickets} onUpdate={handleUpdate} onAdd={handleAdd} onLogout={handleLogout} />
          : <Navigate to="/agent/login" replace />
      } />

      {/* Catch-all — redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}