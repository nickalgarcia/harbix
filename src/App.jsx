import { useState, useRef, useEffect } from "react";
import {
  signInWithPopup, signOut, onAuthStateChanged
} from "firebase/auth";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, getDocs
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  MapPin, Camera, MessageCircle, CalendarClock, Mail, Clock,
  User, Package, LayoutGrid, List, Inbox, Sparkles,
  ChevronLeft, Check, Eye, Trash2
} from "lucide-react";
import { auth, db, storage, googleProvider } from "./firebase";
import { B, BTN, INP, HarbixLogo, Chip, Avatar } from "./theme";
import HarbixInventory from "./HarbixInventory";

// ── Brand palette, buttons, inputs, logo, chips, avatars now live in src/theme.js ──

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


const PRIORITY = {
  normal:   { label:"Normal",   bg:"#F3F4F6", text:"#6B7280",   dot:"#9CA3AF" },
  high:     { label:"High",     bg:B.amberBg, text:B.amberText, dot:B.amber   },
  critical: { label:"Critical", bg:B.redBg,   text:B.redText,   dot:B.red     },
};

const DEPARTMENT = {
  tech:       { label:"Tech",       bg:"#CCFBF1", text:"#115E59", dot:"#14B8A6" },
  av:         { label:"AV",         bg:"#EDE9FE", text:"#5B21B6", dot:"#8B5CF6" },
  facilities: { label:"Facilities", bg:"#EFEBE4", text:"#5D4A37", dot:"#A18A6B" },
  unsorted:   { label:"Unsorted",   bg:"#F3F4F6", text:"#6B7280", dot:"#9CA3AF" },
};

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
function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.waiting;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, letterSpacing:"0.03em", background:s.bg, color:s.text, whiteSpace:"nowrap" }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:s.dot, flexShrink:0 }} />
      {s.label}
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
  const [tip, setTip]         = useState(null);
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
      const result = await onSubmit(updated, photoFile);
      setTip(result?.selfHelpTip || null);
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
      <div style={{ width:80, height:80, borderRadius:"50%", background:"rgba(16,185,129,0.15)", border:"2px solid rgba(16,185,129,0.35)", color:B.green, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:28 }}><Check size={38} strokeWidth={2.5} /></div>
      <h2 style={{ margin:"0 0 12px", fontSize:28, fontWeight:800, color:B.white, letterSpacing:"-0.04em" }}>
        Got it{answers.name?`, ${answers.name.split(" ")[0]}`:""}!
      </h2>
      <p style={{ color:"rgba(255,255,255,0.5)", fontSize:16, lineHeight:1.7, maxWidth:300, margin:"0 auto 36px" }}>
        Someone from our team will follow up with you{answers.contact?` at ${answers.contact}`:""} as soon as possible.
      </p>
      {tip && (
        <div style={{ background:"rgba(239,100,35,0.12)", border:"1.5px solid rgba(239,100,35,0.35)", borderRadius:14, padding:"14px 16px", margin:"0 auto 36px", maxWidth:320, textAlign:"left" }}>
          <div style={{ fontSize:11, fontWeight:700, color:B.orange, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:5 }}>
            <Sparkles size={12} style={{ verticalAlign:"-2px", marginRight:5 }} />While you wait
          </div>
          <div style={{ fontSize:14, color:"rgba(255,255,255,0.85)", lineHeight:1.5 }}>{tip}</div>
        </div>
      )}
      <button onClick={()=>{ setDone(false); setTip(null); setStep(0); setAnswers({}); setPhotoFile(null); setPhotoPreview(null); setCurrent(""); }}
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
            <button onClick={()=>go(-1)} style={{ width:34, height:34, background:"rgba(255,255,255,0.1)", border:"none", borderRadius:"50%", color:"rgba(255,255,255,0.7)", fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><ChevronLeft size={18} /></button>
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
function TicketCard({ ticket, agent, canAct=true, onClaim, onUnclaim, onClick }) {
  const isMine      = ticket.claimedBy?.id === agent?.id;
  const isUnclaimed = !ticket.claimedBy;
  return (
    <div className="hx-card" style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:16, overflow:"hidden" }}>
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
          {ticket.department && <DeptBadge department={ticket.department} />}
          <Chip icon={<MapPin size={12} strokeWidth={2.2} />}>{ticket.location}</Chip>
          {ticket.priority && ticket.priority !== "normal" && <PriorityBadge priority={ticket.priority} />}
          {ticket.assignedTo && <Chip icon={<User size={12} strokeWidth={2.2} />}>{ticket.assignedTo.name.split(" ")[0]}</Chip>}
          {ticket.photoURL && <Chip icon={<Camera size={12} strokeWidth={2.2} />}>Photo</Chip>}
          {ticket.comments?.length > 0 && <Chip icon={<MessageCircle size={12} strokeWidth={2.2} />}>{ticket.comments.length}</Chip>}
          {ticket.dueDate && <Chip icon={<CalendarClock size={12} strokeWidth={2.2} />}>{ticket.dueDate}</Chip>}
        </div>
        <p style={{ margin:0, fontSize:13, color:B.textSub, lineHeight:1.55, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{ticket.issue}</p>
        {ticket.ai?.firstStep && (
          <p style={{ margin:"10px 0 0", fontSize:11.5, color:B.orange, lineHeight:1.45, display:"flex", alignItems:"flex-start", gap:5 }}>
            <Sparkles size={13} style={{ flexShrink:0, marginTop:1 }} />
            <span style={{ display:"-webkit-box", WebkitLineClamp:1, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{ticket.ai.firstStep}</span>
          </p>
        )}
      </div>
      {ticket.status !== "closed" && (
        <div style={{ borderTop:`1px solid ${B.border}`, padding:"10px 14px", background:B.offWhite, display:"flex", gap:8 }}>
          {canAct && isUnclaimed && ticket.status==="waiting" && (
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

function TicketRow({ ticket, agent, canAct=true, onClaim, onUnclaim, onClick }) {
  const isMine      = ticket.claimedBy?.id === agent?.id;
  const isUnclaimed = !ticket.claimedBy;
  return (
    <div className="hx-row" style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, padding:"13px 16px", display:"flex", alignItems:"center", gap:12 }}>
      <Avatar initials={ticket.name.split(" ").map(w=>w[0]).join("").slice(0,2)} size={36} />
      <div style={{ flex:1, minWidth:0, cursor:"pointer" }} onClick={onClick}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap" }}>
          <span style={{ fontWeight:700, fontSize:14, color:B.text }}>{ticket.name}</span>
          {ticket.department && <DeptBadge department={ticket.department} />}
          <Chip icon={<MapPin size={12} strokeWidth={2.2} />}>{ticket.location}</Chip>
        </div>
        <p style={{ margin:0, fontSize:12, color:B.textSub, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{ticket.issue}</p>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
        <StatusBadge status={ticket.status} />
        {canAct && isUnclaimed && ticket.status==="waiting" && (
          <button onClick={e=>{e.stopPropagation();onClaim(ticket.id);}} style={{ ...BTN.orangeSolid, fontSize:12, padding:"6px 12px", borderRadius:8 }}>Claim</button>
        )}
        {isMine && (
          <button onClick={e=>{e.stopPropagation();onUnclaim(ticket.id);}} style={{ ...BTN.ghost, fontSize:12, padding:"6px 10px", borderRadius:8 }}>Release</button>
        )}
      </div>
    </div>
  );
}

// ── Priority Badge ────────────────────────────────────────────
function PriorityBadge({ priority }) {
  const p = PRIORITY[priority] || PRIORITY.normal;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:p.bg, color:p.text, whiteSpace:"nowrap" }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:p.dot, flexShrink:0 }} />
      {p.label}
    </span>
  );
}

// ── Department Badge ──────────────────────────────────────────
function DeptBadge({ department }) {
  const d = DEPARTMENT[department];
  if (!d) return null;
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:d.bg, color:d.text, whiteSpace:"nowrap" }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:d.dot, flexShrink:0 }} />
      {d.label}
    </span>
  );
}

// ── Ticket Detail ─────────────────────────────────────────────
function TicketDetail({ ticket, agent, team, onUpdate, readOnly=false, isAdmin=false, onDelete, onBack }) {
  const [comment, setComment]         = useState("");
  const [commentType, setCommentType] = useState("internal");
  const [drafting, setDrafting]       = useState(false);
  const [lightbox, setLightbox]       = useState(false);
  const [saving, setSaving]           = useState(false);

  const logActivity = (action) => ({
    id: "a"+Date.now(),
    action,
    agent: agent.name,
    ts: new Date().toISOString(),
  });

  const update = async (updates, activityMsg) => {
    setSaving(true);
    const activity = [...(ticket.activity||[])];
    if (activityMsg) activity.push(logActivity(activityMsg));
    await updateDoc(doc(db, "tickets", ticket.id), { ...updates, activity, updatedAt: serverTimestamp() });
    setSaving(false);
  };

  const handleStatusChange = async (newStatus) => {
    await update({ status: newStatus }, `Status changed to ${STATUS[newStatus]?.label}`);
    // Notify submitter if done or closed and they have an email
    if ((newStatus === "done" || newStatus === "closed") && ticket.contact?.includes("@")) {
      try {
        await fetch("/api/notify-submitter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "resolved",
            submitter_email: ticket.contact,
            location: ticket.location,
            issue: ticket.issue,
            status: STATUS[newStatus]?.label,
            ticket_id: ticket.id,
          }),
        });
      } catch(e) { console.error("Resolved notification failed:", e); }
    }
  };

  const handleAssign = async (teamMember) => {
    await update(
      { assignedTo: teamMember },
      teamMember ? `Assigned to ${teamMember.name}` : "Assignment removed"
    );
    if (teamMember) {
      try {
        await fetch("/api/notify-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_email:     teamMember.email,
            agent_name:      teamMember.name,
            assigned_by:     agent.name,
            submitter_name:  ticket.name,
            location:        ticket.location,
            issue:           ticket.issue,
            priority:        ticket.priority || "normal",
            due_date:        ticket.dueDate || "",
            ticket_id:       ticket.id,
          }),
        });
      } catch(e) { console.error("Assignment notification failed:", e); }
    }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    const c = { id:"c"+Date.now(), author:agent.name, avatar:agent.avatar, text:comment.trim(), type:commentType, ts:new Date().toISOString() };
    const activity = [...(ticket.activity||[]), logActivity(commentType==="reply"?"Replied to submitter":"Added internal note")];
    await updateDoc(doc(db, "tickets", ticket.id), {
      comments:[...(ticket.comments||[]), c],
      activity,
      updatedAt: serverTimestamp()
    });
    // Notify submitter on reply
    if (commentType==="reply" && ticket.contact?.includes("@")) {
      try {
        await fetch("/api/notify-submitter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "reply",
            submitter_email: ticket.contact,
            location: ticket.location,
            issue: ticket.issue,
            agent_name: agent.name,
            message: comment.trim(),
            ticket_id: ticket.id,
          }),
        });
      } catch(e) { console.error("Reply notification failed:", e); }
    }
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
        <button onClick={onBack} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.7)", fontSize:24, cursor:"pointer", padding:0, lineHeight:1, display:"flex", alignItems:"center" }}><ChevronLeft size={24} /></button>
        <span style={{ fontWeight:700, fontSize:15, color:B.white, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ticket.name}</span>
        <StatusBadge status={ticket.status} />
      </div>
      <div className="hx-fade" style={{ padding:"16px", maxWidth:720, margin:"0 auto" }}>
        <div style={{ background:B.white, borderRadius:16, padding:"20px", marginBottom:14, border:`1px solid ${B.border}` }}>
          <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
            {ticket.department && <DeptBadge department={ticket.department} />}
            <Chip icon={<MapPin size={12} strokeWidth={2.2} />}>{ticket.location}</Chip>
            {ticket.contact && <Chip icon={<Mail size={12} strokeWidth={2.2} />}>{ticket.contact}</Chip>}
            <Chip icon={<Clock size={12} strokeWidth={2.2} />}>{timeAgo(ticket.createdAt)}</Chip>
          </div>
          <p style={{ margin:0, fontSize:15, color:B.text, lineHeight:1.7 }}>{ticket.issue}</p>
          {ticket.photoURL && (
            <div style={{ marginTop:16 }}>
              <img src={ticket.photoURL} alt="attachment" style={{ width:140, height:96, objectFit:"cover", borderRadius:10, border:`1.5px solid ${B.border}`, cursor:"pointer" }} onClick={()=>setLightbox(true)} />
              <div style={{ fontSize:11, color:B.muted, marginTop:4 }}>Tap to enlarge</div>
            </div>
          )}
        </div>

        {readOnly && (
          <div style={{ display:"flex", alignItems:"center", gap:8, background:B.cream, border:`1px solid ${B.border}`, borderRadius:12, padding:"10px 14px", marginBottom:14, fontSize:12.5, color:B.textSub, fontWeight:600 }}>
            <Eye size={14} /> View-only — you can see this ticket, but editing it is reserved for that department's team.
          </div>
        )}

        {/* AI suggested first step */}
        {ticket.ai?.firstStep && (
          <div style={{ background:B.orangeLight, border:"1.5px solid #FDDECE", borderRadius:16, padding:"16px 20px", marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <div style={{ fontSize:11, fontWeight:700, color:B.orange, textTransform:"uppercase", letterSpacing:"0.08em" }}><Sparkles size={12} style={{ verticalAlign:"-2px", marginRight:5 }} />Suggested First Step</div>
              {typeof ticket.ai.confidence==="number" && ticket.ai.confidence>0 && (
                <span style={{ fontSize:11, color:B.muted, fontWeight:600 }}>{Math.round(ticket.ai.confidence*100)}% match</span>
              )}
            </div>
            <p style={{ margin:0, fontSize:14, color:B.text, lineHeight:1.6 }}>{ticket.ai.firstStep}</p>
          </div>
        )}

        {/* Department + Priority + Due Date */}
        {!readOnly && (
        <div style={{ background:B.white, borderRadius:16, padding:"20px", marginBottom:14, border:`1px solid ${B.border}` }}>
          <div style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:14 }}>Department</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:20 }}>
            {Object.entries(DEPARTMENT).map(([key,val])=>(
              <button key={key} onClick={()=>update({department:key},`Department set to ${val.label}`)} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 13px", borderRadius:8, border:`1.5px solid ${(ticket.department||"unsorted")===key?B.orange:B.border}`, background:(ticket.department||"unsorted")===key?B.orangeLight:B.white, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:(ticket.department||"unsorted")===key?700:400, color:(ticket.department||"unsorted")===key?B.orange:B.text }}>
                <span style={{ width:7, height:7, borderRadius:"50%", background:val.dot }} />{val.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:14 }}>Priority & Due Date</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
            {Object.entries(PRIORITY).map(([key,val])=>(
              <button key={key} onClick={()=>update({priority:key},`Priority set to ${val.label}`)} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 13px", borderRadius:8, border:`1.5px solid ${(ticket.priority||"normal")===key?B.orange:B.border}`, background:(ticket.priority||"normal")===key?B.orangeLight:B.white, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:(ticket.priority||"normal")===key?700:400, color:(ticket.priority||"normal")===key?B.orange:B.text }}>
                <span style={{ width:7, height:7, borderRadius:"50%", background:val.dot }} />{val.label}
              </button>
            ))}
          </div>
          <div>
            <label style={{ display:"block", fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>Due Date <span style={{ fontWeight:400, textTransform:"none", color:B.muted }}>Optional</span></label>
            <input type="date" value={ticket.dueDate||""} onChange={e=>update({dueDate:e.target.value},e.target.value?`Due date set to ${e.target.value}`:"Due date removed")}
              style={{ ...INP(false), fontSize:13 }} />
          </div>
        </div>
        )}

        {/* Status & Assignment */}
        {!readOnly && (
        <div style={{ background:B.white, borderRadius:16, padding:"20px", marginBottom:14, border:`1px solid ${B.border}` }}>
          <div style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:14 }}>Status</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:20 }}>
            {Object.entries(STATUS).map(([key,val])=>(
              <button key={key} onClick={()=>handleStatusChange(key)} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 13px", borderRadius:8, border:`1.5px solid ${ticket.status===key?B.orange:B.border}`, background:ticket.status===key?B.orangeLight:B.white, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:ticket.status===key?700:400, color:ticket.status===key?B.orange:B.text }}>
                <span style={{ width:7, height:7, borderRadius:"50%", background:val.dot }} />{val.label}
              </button>
            ))}
          </div>

          <div style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Assign To</div>
          <div style={{ position:"relative", marginBottom:14 }}>
            <select value={ticket.assignedTo?.id||""} onChange={e=>{
              const member = team.find(m=>m.id===e.target.value)||null;
              handleAssign(member);
            }} style={{ width:"100%", padding:"11px 40px 11px 14px", borderRadius:10, border:`1.5px solid ${ticket.assignedTo?B.orange:B.border}`, fontSize:14, color:ticket.assignedTo?B.orange:B.text, background:ticket.assignedTo?B.orangeLight:B.white, fontFamily:"inherit", cursor:"pointer", appearance:"auto" }}>
              <option value="">Unassigned — tap to assign</option>
              {team.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          {ticket.assignedTo && (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:B.orangeLight, borderRadius:10, padding:"10px 14px", marginBottom:14, border:`1px solid #FDDECE` }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <Avatar initials={ticket.assignedTo.avatar} size={28} color={B.orange} />
                <span style={{ fontSize:13, fontWeight:700, color:B.orange }}>{ticket.assignedTo.name}</span>
                <span style={{ fontSize:11, color:B.textSub }}>assigned</span>
              </div>
              <button onClick={()=>handleAssign(null)} style={{ background:"none", border:"none", fontSize:12, color:B.muted, cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}>Remove</button>
            </div>
          )}

          <div style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>Claim</div>
          {ticket.claimedBy ? (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:B.offWhite, borderRadius:10, padding:"10px 14px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <Avatar initials={ticket.claimedBy.avatar} size={28} color={B.navy} />
                <span style={{ fontSize:13, fontWeight:600, color:B.text }}>{ticket.claimedBy.name}</span>
                <span style={{ fontSize:11, color:B.muted }}>is on it</span>
              </div>
              {ticket.claimedBy.id===agent?.id && (
                <button onClick={()=>update({claimedBy:null,status:"waiting"},"Released ticket")} style={{ ...BTN.ghost, fontSize:12, padding:"5px 10px", borderRadius:7 }}>Release</button>
              )}
            </div>
          ) : (
            <button onClick={()=>update({claimedBy:agent,status:"on-it"},"Claimed ticket")} style={{ ...BTN.orangeSolid, width:"100%", padding:"12px 0", borderRadius:10, fontSize:14 }}>» Claim This Ticket</button>
          )}
        </div>
        )}

        {/* Activity Log */}
        {ticket.activity?.length > 0 && (
          <div style={{ background:B.white, borderRadius:16, padding:"20px", marginBottom:14, border:`1px solid ${B.border}` }}>
            <div style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:14 }}>Activity</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {[...(ticket.activity||[])].reverse().map(a=>(
                <div key={a.id} style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:B.orange, marginTop:5, flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <span style={{ fontSize:13, color:B.text }}>{a.action}</span>
                    <span style={{ fontSize:11, color:B.muted, marginLeft:6 }}>by {a.agent} · {timeAgo(a.ts)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
          {!readOnly && (
          <div style={{ borderTop:`1px solid ${B.border}`, paddingTop:16 }}>
            <div style={{ display:"flex", gap:6, marginBottom:10 }}>
              {[["internal","Internal note"],["reply","Reply to submitter"]].map(([t,label])=>(
                <button key={t} onClick={()=>setCommentType(t)} style={{ flex:1, padding:"7px 10px", borderRadius:8, border:`1.5px solid ${commentType===t?B.orange:B.border}`, background:commentType===t?B.orangeLight:B.white, color:commentType===t?B.orange:B.textSub, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>{label}</button>
              ))}
            </div>
            {commentType==="reply" && (
              <button
                disabled={drafting}
                onClick={async ()=>{
                  setDrafting(true);
                  try {
                    const token = await auth.currentUser.getIdToken();
                    const r = await fetch("/api/draft-reply", {
                      method:  "POST",
                      headers: { "Content-Type":"application/json", "Authorization":`Bearer ${token}` },
                      body: JSON.stringify({
                        ticket: {
                          name:       ticket.name,
                          issue:      ticket.issue,
                          location:   ticket.location,
                          status:     ticket.status,
                          department: ticket.department,
                          priority:   ticket.priority,
                        },
                        comments:  (ticket.comments||[]).slice(-6).map(c=>({ author:c.author, type:c.type, text:c.text })),
                        agentName: agent.name,
                      }),
                    });
                    const data = await r.json();
                    if (data.draft) setComment(data.draft);
                    else alert("Couldn't generate a draft right now — try again in a moment.");
                  } catch (e) {
                    console.error("Draft failed:", e);
                    alert("Couldn't generate a draft right now — try again in a moment.");
                  } finally {
                    setDrafting(false);
                  }
                }}
                style={{ ...BTN.ghost, width:"100%", marginBottom:8, padding:"9px 0", borderRadius:8, fontSize:12.5, color:B.orange, borderColor:"#FDDECE", background:B.orangeLight, display:"flex", alignItems:"center", justifyContent:"center", gap:6, opacity:drafting?0.6:1 }}>
                <Sparkles size={14} /> {drafting ? "Drafting…" : "Draft reply with AI"}
              </button>
            )}
            {commentType==="reply" && (
              <div style={{ fontSize:11, marginBottom:8, padding:"6px 10px", borderRadius:8, background: ticket.contact?.includes("@") ? B.greenBg : B.amberBg, color: ticket.contact?.includes("@") ? B.greenText : B.amberText, fontWeight:600 }}>
                {ticket.contact?.includes("@")
                  ? `Email will be sent to ${ticket.contact}`
                  : `No email on file — submitter provided "${ticket.contact||"nothing"}" as contact. Email will not be sent.`}
              </div>
            )}
            <textarea value={comment} onChange={e=>setComment(e.target.value)}
              placeholder={commentType==="reply"?"Write a reply — submitter will be notified…":"Add a note only your team can see…"}
              style={{ ...INP(false), resize:"none", minHeight:85, fontFamily:"inherit", marginBottom:10 }} rows={3} />
            <button style={{ ...BTN.orangeSolid, width:"100%", padding:"12px 0", borderRadius:10, fontSize:14 }} onClick={addComment} disabled={saving}>
              {saving?"Saving…":"Add Comment"}
            </button>
          </div>
          )}
        </div>

        {/* Admin-only: permanent delete for spam / test tickets */}
        {isAdmin && onDelete && (
          <button
            onClick={()=>{ if (window.confirm("Permanently delete this ticket? This cannot be undone.")) onDelete(ticket.id); }}
            style={{ ...BTN.ghost, width:"100%", marginTop:14, padding:"12px 0", borderRadius:10, color:B.red, borderColor:B.redBg, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            <Trash2 size={15} /> Delete Ticket
          </button>
        )}
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
function AgentDashboard({ agent, tickets, team, onUpdate, onAdd, onDelete, onLogout, onInventory, initialTicketId, onTicketLinkOpened }) {
  const isAdmin   = agent.role === "admin";
  const access    = agent.access || {};
  const myDepts   = Object.keys(access);                       // departments I can see
  const editDepts = myDepts.filter(d => access[d] === "edit"); // departments I can work
  const canEdit   = t => isAdmin || access[t?.department] === "edit";
  const canCreate = isAdmin || editDepts.length > 0;
  const roleLabel = isAdmin
    ? "Admin"
    : editDepts.length > 0
      ? editDepts.map(d=>DEPARTMENT[d]?.label||d).join(" + ") + " team"
      : "View only";

  const [tab, setTab]           = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [view, setView]         = useState("card");
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew]   = useState(false);
  const [search, setSearch]     = useState("");

  // ── Open a ticket deep-linked from an email notification (/ticket/{id})
  useEffect(() => {
    if (!initialTicketId || !tickets.length) return;
    if (tickets.some(t => t.id === initialTicketId)) {
      setSelected(initialTicketId);
      window.history.replaceState({}, "", "/"); // clean the URL so refresh returns to dashboard
      onTicketLinkOpened?.();
    }
  }, [initialTicketId, tickets]);

  const isOpen = t => t.status!=="done" && t.status!=="closed";

  const counts = {
    all:      tickets.filter(isOpen).length,
    waiting:  tickets.filter(t=>t.status==="waiting").length,
    mine:     tickets.filter(t=>isOpen(t)&&t.claimedBy?.id===agent.id).length,
    assigned: tickets.filter(t=>isOpen(t)&&t.assignedTo?.id===agent.id).length,
    critical: tickets.filter(t=>isOpen(t)&&t.priority==="critical").length,
    done:     tickets.filter(t=>t.status==="done"||t.status==="closed").length,
  };

  const deptCounts = {
    tech:       tickets.filter(t=>isOpen(t)&&t.department==="tech").length,
    av:         tickets.filter(t=>isOpen(t)&&t.department==="av").length,
    facilities: tickets.filter(t=>isOpen(t)&&t.department==="facilities").length,
    unsorted:   tickets.filter(t=>isOpen(t)&&t.department==="unsorted").length,
  };

  const filtered = tickets.filter(t => {
    const matchTab =
      tab==="all"      ? isOpen(t) :
      tab==="waiting"  ? t.status==="waiting" :
      tab==="mine"     ? isOpen(t)&&t.claimedBy?.id===agent.id :
      tab==="assigned" ? isOpen(t)&&t.assignedTo?.id===agent.id :
      tab==="critical" ? isOpen(t)&&t.priority==="critical" :
      tab==="done"     ? (t.status==="done"||t.status==="closed") : true;
    const matchDept = deptFilter==="all" ? true : t.department===deptFilter;
    const s = search.toLowerCase();
    return matchTab && matchDept && (!search || t.name.toLowerCase().includes(s) || t.issue.toLowerCase().includes(s) || t.location.toLowerCase().includes(s));
  });

  const claim   = id => { const t = tickets.find(x=>x.id===id); if (canEdit(t)) onUpdate(id,{claimedBy:agent,status:"on-it"}); };
  const unclaim = id => { const t = tickets.find(x=>x.id===id); if (canEdit(t)) onUpdate(id,{claimedBy:null,status:"waiting"}); };

  if (selected) {
    const live = tickets.find(t=>t.id===selected);
    if (!live) { setSelected(null); return null; }
    return <TicketDetail ticket={live} agent={agent} team={team} onUpdate={onUpdate} readOnly={!canEdit(live)} isAdmin={isAdmin}
      onDelete={async (id)=>{ await onDelete(id); setSelected(null); }} onBack={()=>setSelected(null)} />;
  }

  return (
    <div style={{ minHeight:"100vh", background:B.offWhite, fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      {showNew && <NewTicketModal agent={agent} onClose={()=>setShowNew(false)} onSubmit={onAdd} />}
      <div style={{ background:B.navy, padding:"0 16px", position:"sticky", top:0, zIndex:10 }}>
        <div className="hx-shell" style={{ height:54, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <HarbixLogo dark size="sm" />
          <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.05em", textTransform:"uppercase", padding:"3px 9px", borderRadius:20, background:"rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.65)", display:"inline-flex", alignItems:"center", gap:4, whiteSpace:"nowrap" }}>
            {!isAdmin && editDepts.length===0 && <Eye size={11} />}{roleLabel}
          </span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {canCreate && <button style={{ ...BTN.orangeSolid, fontSize:13, padding:"7px 14px", borderRadius:8 }} onClick={()=>setShowNew(true)}>+ New</button>}
          <button style={{ ...BTN.ghost, fontSize:13, padding:"7px 14px", borderRadius:8, background:"rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.7)", border:"1.5px solid rgba(255,255,255,0.15)" }} onClick={onInventory}><Package size={15} /> Inventory</button>
          <div style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer" }} onClick={onLogout}>
            {agent.photo
              ? <img src={agent.photo} alt="avatar" style={{ width:28, height:28, borderRadius:"50%", objectFit:"cover" }} />
              : <Avatar initials={agent.avatar} size={28} color={B.navyDark} />
            }
            <span style={{ fontSize:12, color:"rgba(255,255,255,0.55)", fontWeight:500 }}>Sign out</span>
          </div>
        </div>
        </div>
      </div>
      <div style={{ background:B.navy, padding:"0 16px 16px" }}>
        <div className="hx-shell" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
          {[["Open","all",counts.all,B.white],["Waiting","waiting",counts.waiting,B.amber],["Mine","mine",counts.mine,B.orange],["Done","done",counts.done,B.green]].map(([label,key,count,color])=>(
            <button key={label} onClick={()=>setTab(key)} style={{ background:tab===key?"rgba(255,255,255,0.14)":"rgba(255,255,255,0.07)", border:tab===key?"1.5px solid rgba(255,255,255,0.25)":"1.5px solid transparent", borderRadius:12, padding:"12px 10px", textAlign:"center", cursor:"pointer", fontFamily:"inherit" }}>
              <div style={{ fontSize:22, fontWeight:800, color, lineHeight:1, letterSpacing:"-0.03em" }}>{count}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginTop:3, fontWeight:600 }}>{label}</div>
            </button>
          ))}
        </div>
      </div>
      <div style={{ background:B.white, borderBottom:`1px solid ${B.border}`, padding:"0 16px" }}>
      <div className="hx-shell" style={{ display:"flex", overflowX:"auto" }}>
        {[["all","Open"],["waiting","Waiting"],["mine","My Queue"],["assigned","Assigned to Me"],["critical","Critical"],["done","Done"]]
          .filter(([key])=>!(!canCreate&&(key==="mine"||key==="assigned")))
          .map(([key,label])=>(
          <button key={key} onClick={()=>setTab(key)} style={{ background:"none", border:"none", borderBottom:`2.5px solid ${tab===key?B.orange:"transparent"}`, padding:"13px 14px", fontSize:13, fontWeight:tab===key?700:500, color:tab===key?B.orange:B.textSub, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
            {label} ({counts[key]||0})
          </button>
        ))}
      </div>
      </div>
      {!isAdmin && myDepts.length === 1 && (
        <div style={{ padding:"12px 16px 0" }}>
          <div className="hx-shell" style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:12, color:B.muted, fontWeight:600 }}>Your queue:</span>
            <DeptBadge department={myDepts[0]} />
            {access[myDepts[0]]==="view" && <span style={{ fontSize:11, color:B.muted }}>(view only)</span>}
          </div>
        </div>
      )}
      {(isAdmin || myDepts.length > 1) && (
      <div style={{ padding:"12px 16px 0" }}>
      <div className="hx-shell" style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        <button onClick={()=>setDeptFilter("all")} style={{ padding:"6px 13px", borderRadius:20, border:`1.5px solid ${deptFilter==="all"?B.navy:B.border}`, background:deptFilter==="all"?B.navy:B.white, color:deptFilter==="all"?B.white:B.textSub, fontSize:12, fontWeight:deptFilter==="all"?700:500, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
          All Depts
        </button>
        {Object.entries(DEPARTMENT).filter(([key])=>isAdmin||myDepts.includes(key)).map(([key,d])=>(
          <button key={key} onClick={()=>setDeptFilter(deptFilter===key?"all":key)} style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"6px 13px", borderRadius:20, border:`1.5px solid ${deptFilter===key?d.dot:B.border}`, background:deptFilter===key?d.bg:B.white, color:deptFilter===key?d.text:B.textSub, fontSize:12, fontWeight:deptFilter===key?700:500, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background:d.dot, flexShrink:0 }} />
            {d.label}{deptCounts[key]>0&&` (${deptCounts[key]})`}
            {!isAdmin&&access[key]==="view"&&<Eye size={11} style={{ opacity:0.6 }} />}
          </button>
        ))}
      </div>
      </div>
      )}
      <div style={{ padding:"12px 16px" }}>
      <div className="hx-shell" style={{ display:"flex", gap:8 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tickets…" style={{ flex:1, padding:"10px 14px", borderRadius:10, border:`1.5px solid ${B.border}`, fontSize:13, color:B.text, outline:"none", fontFamily:"inherit", background:B.white, WebkitAppearance:"none" }} />
        <div style={{ display:"flex", gap:4 }}>
          {[["card",<LayoutGrid size={16} />],["list",<List size={16} />]].map(([v,icon])=>(
            <button key={v} onClick={()=>setView(v)} style={{ width:38, height:38, borderRadius:8, border:`1.5px solid ${view===v?B.orange:B.border}`, background:view===v?B.orangeLight:B.white, color:view===v?B.orange:B.textSub, fontSize:15, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>{icon}</button>
          ))}
        </div>
      </div>
      </div>
      <div style={{ padding:"0 16px 40px" }}>
      <div className="hx-shell">
        {filtered.length===0 ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:B.muted }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:12 }}><Inbox size={36} strokeWidth={1.5} color={B.muted} /></div>
            <div style={{ fontSize:14, fontWeight:600 }}>No tickets here</div>
          </div>
        ) : view==="card" ? (
          <div className="hx-grid hx-fade">
            {filtered.map(t=><TicketCard key={t.id} ticket={t} agent={agent} canAct={canEdit(t)} onClaim={claim} onUnclaim={unclaim} onClick={()=>setSelected(t.id)} />)}
          </div>
        ) : (
          <div className="hx-fade" style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {filtered.map(t=><TicketRow key={t.id} ticket={t} agent={agent} canAct={canEdit(t)} onClaim={claim} onUnclaim={unclaim} onClick={()=>setSelected(t.id)} />)}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// ── Button tokens imported from src/theme.js ──────────────────

// ── Not-set-up screen — signed in but not in the agents directory ──
function NotSetUp({ agent, onLogout }) {
  return (
    <div style={{ minHeight:"100vh", background:B.offWhite, display:"flex", alignItems:"center", justifyContent:"center", padding:24, fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:20, padding:"36px 32px", maxWidth:400, textAlign:"center" }} className="hx-card">
        <div style={{ display:"flex", justifyContent:"center", marginBottom:18 }}><HarbixLogo size="md" /></div>
        <h2 style={{ margin:"0 0 10px", fontSize:19, fontWeight:800, color:B.text, letterSpacing:"-0.02em" }}>Almost there, {agent.name.split(" ")[0]}</h2>
        <p style={{ margin:"0 0 24px", fontSize:14, color:B.textSub, lineHeight:1.65 }}>
          Your Google account is verified, but it hasn't been added to the Harbix team directory yet. Ask an admin to add <strong style={{ color:B.text }}>{agent.email}</strong> and you'll be all set.
        </p>
        <button onClick={onLogout} style={{ ...BTN.ghost, width:"100%", padding:"12px 0", borderRadius:10 }}>Sign out</button>
      </div>
    </div>
  );
}

// ── Root App — real Firebase wired up ────────────────────────
// ── Email deep links: /ticket/{id} opens that ticket once the agent is logged in
const DEEP_LINK_TICKET_ID =
  typeof window !== "undefined" && window.location.pathname.startsWith("/ticket/")
    ? decodeURIComponent(window.location.pathname.slice("/ticket/".length).split("/")[0])
    : null;

export default function App() {
  const [user, setUser]       = useState(undefined); // undefined = loading
  const [agent, setAgent]     = useState(null);
  const [tickets, setTickets] = useState([]);
  const [team, setTeam]       = useState([]);
  const [pendingTicketId, setPendingTicketId] = useState(DEEP_LINK_TICKET_ID);
  const [page, setPage]       = useState(
    typeof window !== "undefined" && (["/agent","/login"].includes(window.location.pathname) || DEEP_LINK_TICKET_ID)
      ? "login" : "public"
  );

  // ── Auth listener — auto-redirect on refresh if already logged in
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && firebaseUser.email?.endsWith("@godchasers.church")) {
        // Permissions come from the agents directory (doc ID = email).
        // role: "admin" sees + does everything. Everyone else has an
        // `access` map of department -> "edit" | "view", e.g.
        // { av: "view", tech: "view", facilities: "edit" }.
        // No doc = "unlisted" → friendly not-set-up screen, and Firestore
        // rules block their reads anyway.
        let role = "unlisted", access = {};
        try {
          const snap = await getDoc(doc(db, "agents", firebaseUser.email));
          if (snap.exists()) {
            const d = snap.data();
            if (d.role === "admin") {
              role = "admin";
            } else {
              role = "member";
              if (d.access && typeof d.access === "object") {
                access = d.access;
              } else if (d.role === "viewer") {
                access = { av:"view", tech:"view", facilities:"view" }; // legacy shape
              } else if (d.department) {
                access = { [d.department]:"edit" }; // legacy shape
              }
            }
          }
        } catch (e) {
          console.error("Agent directory lookup failed:", e);
        }
        const a = {
          id:     firebaseUser.uid,
          name:   firebaseUser.displayName || firebaseUser.email,
          email:  firebaseUser.email,
          avatar: (firebaseUser.displayName || "??").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase(),
          photo:  firebaseUser.photoURL,
          role,
          access,
        };
        setAgent(a);
        setUser(firebaseUser);
        // Auto-redirect to agent dashboard when Firebase confirms login
        setPage("agent");
      } else {
        setAgent(null);
        setUser(null);
        setPage((["/agent","/login"].includes(window.location.pathname) || DEEP_LINK_TICKET_ID) ? "login" : "public");
      }
    });
    return unsub;
  }, []);

  // ── Firestore real-time listener (only when agent is logged in)
  // Admins stream every ticket; members stream ONLY the departments in
  // their access map (security rules aren't filters — the query itself
  // must match what the agent is allowed to read, or it errors out).
  useEffect(() => {
    if (!agent || agent.role === "unlisted") { setTickets([]); return; }
    let q;
    if (agent.role === "admin") {
      q = query(collection(db, "tickets"), orderBy("createdAt", "desc"));
    } else {
      const depts = Object.keys(agent.access || {});
      if (depts.length === 0) { setTickets([]); return; }
      // No orderBy here — avoids needing a composite index; sorted client-side
      q = query(collection(db, "tickets"), where("department", "in", depts));
    }
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map(d => ({ id:d.id, ...d.data() }));
      rows.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      setTickets(rows);
    }, (err) => console.error("Tickets listener error:", err));
    return unsub;
  }, [agent]);

  // ── Fetch agent directory from Firestore (not bundled in client JS)
  useEffect(() => {
    if (!agent || agent.role === "unlisted") { setTeam([]); return; }
    getDocs(collection(db, "agents")).then(snap => {
      setTeam(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [agent]);

  // ── Submit ticket (public form)
  const handleSubmit = async (answers, photoFile) => {
    const ticketId = "t_" + Date.now();
    let photoURL   = null;

    // Photo upload is non-blocking — ticket saves even if photo fails
    if (photoFile) {
      try {
        photoURL = await uploadPhoto(photoFile, ticketId);
      } catch (e) {
        console.warn("Photo upload failed — saving ticket without photo:", e);
      }
    }

    // AI triage — fails soft to unsorted/normal, never blocks submission
    let triage = { department:"unsorted", priority:"normal", firstStep:null, selfHelpTip:null, confidence:0 };
    try {
      const r = await fetch("/api/triage", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ issue: answers.issue, location: answers.location, name: answers.name }),
      });
      if (r.ok) triage = { ...triage, ...(await r.json()) };
    } catch (e) {
      console.warn("Triage unavailable — ticket saved as unsorted:", e);
    }

    const ticketData = {
      name:       answers.name     || "",
      contact:    answers.contact  || "",
      location:   answers.location || "",
      issue:      answers.issue    || "",
      photoURL,
      status:     "waiting",
      department: triage.department,
      priority:   triage.priority,
      ai: {
        firstStep:  triage.firstStep,
        confidence: triage.confidence,
      },
      claimedBy:  null,
      comments:   [],
      createdAt:  serverTimestamp(),
      updatedAt:  serverTimestamp(),
    };

    // Save to Firestore
    const docRef = await addDoc(collection(db, "tickets"), ticketData);

    // Send to Planning Center via serverless function
    try {
      await fetch("/api/submit-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ticketData, firestoreId: docRef.id, createdAt: new Date().toISOString() }),
      });
    } catch (e) {
      console.error("PC sync failed:", e);
      // Non-fatal — ticket is already in Firestore
    }

    // Return the tip so the form's confirmation screen can show it
    return { selfHelpTip: triage.selfHelpTip };
  };

  // ── Update ticket (agent actions)
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
      status:     status || "waiting",
      department: agent?.role === "admin"
        ? "unsorted"
        : (Object.keys(agent?.access||{}).find(d=>agent.access[d]==="edit") || "unsorted"),
      claimedBy:  claimedBy || null,
      comments:  [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, "tickets"), ticketData);
    // Notify the tech inbox — same as public form submissions (non-fatal if it fails)
    try {
      await fetch("/api/submit-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ticketData, firestoreId: docRef.id, createdAt: new Date().toISOString() }),
      });
    } catch (e) {
      console.error("Ticket notification failed:", e);
    }
  };

  // Auth listener owns setting `agent` (with role) — login just navigates
  const handleLogin  = () => setPage("agent");
  const handleLogout = async () => { await signOut(auth); setAgent(null); setPage("public"); };

  // Admin-only: permanently delete a ticket (spam/test cleanup)
  const handleDelete = async (id) => {
    await deleteDoc(doc(db, "tickets", id));
  };

  // ── QR scan intercept — render inventory checkout directly, no auth needed
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/inventory/asset/")) {
    return <HarbixInventory />;
  }

  // Loading state while Firebase checks auth
  if (user === undefined) return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(160deg,${B.deep} 0%,${B.navy} 100%)`, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ display:"flex", justifyContent:"center", marginBottom:12 }}><HarbixLogo dark size="lg" /></div>
        <div style={{ fontSize:14, color:"rgba(255,255,255,0.4)", fontFamily:"'DM Sans',sans-serif" }}>Loading…</div>
      </div>
    </div>
  );

  // If agent is logged in, show dashboard or inventory depending on page
  if (agent) {
    if (agent.role === "unlisted") return <NotSetUp agent={agent} onLogout={handleLogout} />;
    if (page === "inventory") return <HarbixInventory onBack={() => setPage("agent")} />;
    return (
      <AgentDashboard
        agent={agent}
        tickets={tickets}
        team={team}
        onUpdate={handleUpdate}
        onAdd={handleAdd}
        onDelete={handleDelete}
        onLogout={handleLogout}
        onInventory={() => setPage("inventory")}
        initialTicketId={pendingTicketId}
        onTicketLinkOpened={() => setPendingTicketId(null)}
      />
    );
  }

  return (
    <div style={{ fontFamily:"'DM Sans',system-ui,sans-serif" }}>
      {page === "public" && <PublicForm onSubmit={handleSubmit} />}
      {page === "login"  && <GoogleLogin onLogin={handleLogin} />}
    </div>
  );
}