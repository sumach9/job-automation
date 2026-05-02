import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const API = "/api";

// ─── Authenticated fetch — injects JWT from localStorage ─────────────────────
function apiFetch(url, opts = {}) {
  const token = localStorage.getItem("applyai_token");
  return fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

// ─── Constants ───────────────────────────────────────────────────────────────
const LEVEL_COLOR = { info:"#6366f1", success:"#22c55e", warning:"#f59e0b", error:"#ef4444" };

const PLATFORM_META = {
  linkedin:     { label:"LinkedIn",     color:"#0a66c2", bg:"#0a66c215" },
  indeed:       { label:"Indeed",       color:"#2557a7", bg:"#2557a715" },
  glassdoor:    { label:"Glassdoor",    color:"#0caa41", bg:"#0caa4115" },
  ziprecruiter: { label:"ZipRecruiter", color:"#4a90e2", bg:"#4a90e215" },
  googlejobs:   { label:"Google Jobs",  color:"#ea4335", bg:"#ea433515" },
  atsDirect:    { label:"ATS Direct",   color:"#a855f7", bg:"#a855f715" },
};

const STATUS_META = {
  "auto-applied":       { color:"#22c55e", label:"Auto Applied",  dot:"#22c55e" },
  "easy-apply-pending": { color:"#60a5fa", label:"Easy Apply",    dot:"#3b82f6" },
  "simplify-opened":    { color:"#c084fc", label:"Simplify",      dot:"#a855f7" },
  "onetouch-filled":    { color:"#818cf8", label:"OneTouch",      dot:"#6366f1" },
  "browser-opened":     { color:"#fb923c", label:"Opened",        dot:"#f97316" },
  "queued-manual":      { color:"#94a3b8", label:"Queued",        dot:"#64748b" },
  "apply-failed":       { color:"#f87171", label:"Failed",        dot:"#ef4444" },
  "interviewing":       { color:"#38bdf8", label:"Interviewing",  dot:"#0ea5e9" },
  "offered":            { color:"#fbbf24", label:"Offered",       dot:"#f59e0b" },
  "rejected":           { color:"#f87171", label:"Rejected",      dot:"#ef4444" },
};

const PIPELINE_STAGES = [
  { key:"queued-manual",   label:"Queued",       color:"#94a3b8", icon:"◷" },
  { key:"onetouch-filled", label:"OneTouch",     color:"#818cf8", icon:"⚡" },
  { key:"applied",         label:"Applied",      color:"#22c55e", icon:"✓" },
  { key:"interviewing",    label:"Interviewing", color:"#38bdf8", icon:"💬" },
  { key:"offered",         label:"Offered",      color:"#f59e0b", icon:"★" },
  { key:"rejected",        label:"Rejected",     color:"#ef4444", icon:"✕" },
];

const NAV = [
  { id:"dashboard",    icon:"▦",  label:"Dashboard"    },
  { id:"pipeline",     icon:"⇒",  label:"Pipeline"     },
  { id:"jobs",         icon:"◈",  label:"Jobs"         },
  { id:"applications", icon:"☰",  label:"Applications" },
  { id:"agents",       icon:"🤖", label:"Agents"       },
  { id:"architecture", icon:"⬡",  label:"Architecture" },
  { id:"billing",      icon:"💳", label:"Billing"      },
  { id:"settings",     icon:"◎",  label:"Settings"     },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function scoreColor(s) {
  if (s >= 3.5) return "#22c55e";
  if (s >= 2.5) return "#84cc16";
  if (s >= 1.5) return "#f59e0b";
  if (s >= 1.0) return "#f97316";
  return "#ef4444";
}

function profileCompleteness(profile) {
  if (!profile) return 0;
  const fields = ["name","email","phone","location","skills","yearsExperience","summary","targetRoles","school"];
  const filled = fields.filter(f => {
    const v = profile[f];
    return Array.isArray(v) ? v.length > 0 : !!v;
  });
  return Math.round((filled.length / fields.length) * 100);
}

function companyColor(name = "") {
  const palette = ["#6366f1","#8b5cf6","#ec4899","#ef4444","#f97316","#eab308","#22c55e","#14b8a6","#3b82f6","#06b6d4","#a855f7","#10b981"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

function initials(name = "") {
  return name.trim().split(/\s+/).slice(0,2).map(w => w[0] || "").join("").toUpperCase() || "?";
}

function fmt(n) { return (n || 0).toLocaleString(); }

function relTime(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

// ─── Small Components ─────────────────────────────────────────────────────────
function Avatar({ name, size = 36 }) {
  const c = companyColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28, flexShrink: 0,
      background: c + "20", border: `1.5px solid ${c}45`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.33, fontWeight: 800, color: c, letterSpacing: -0.5,
    }}>
      {initials(name)}
    </div>
  );
}

function ScoreRing({ score, size = 48 }) {
  if (score == null) return null;
  const c = scoreColor(score);
  const r = (size - 7) / 2;
  const circ = 2 * Math.PI * r;
  const pct  = Math.min(score / 5, 1);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#ffffff08" strokeWidth={5}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth={5}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle"
        fill={c} fontSize={size * 0.28} fontWeight="800" fontFamily="system-ui">
        {score}
      </text>
    </svg>
  );
}

function StatusPill({ status }) {
  const s = STATUS_META[status] || { color:"#64748b", label: status || "Unknown", dot:"#64748b" };
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:5,
      background: s.color + "15", color: s.color,
      border: `1px solid ${s.color}30`,
      borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600, whiteSpace:"nowrap",
    }}>
      <span style={{ width:6, height:6, borderRadius:"50%", background:s.dot, flexShrink:0 }}/>
      {s.label}
    </span>
  );
}

function PlatformTag({ platform }) {
  const p = Object.values(PLATFORM_META).find(m => m.label === platform)
         || { label: platform || "Other", color:"#6366f1", bg:"#6366f115" };
  return (
    <span style={{
      background: p.bg || p.color+"15", color: p.color,
      border: `1px solid ${p.color}30`,
      borderRadius: 6, padding:"2px 8px", fontSize:11, fontWeight:600,
    }}>
      {p.label}
    </span>
  );
}

function Tag({ children, color="#6366f1" }) {
  return (
    <span style={{
      background: color+"15", color, border:`1px solid ${color}30`,
      borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:500,
    }}>
      {children}
    </span>
  );
}

// ─── Metric Card ──────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, color="#6366f1", icon, bar, barMax }) {
  const barPct = barMax ? Math.min((value / barMax) * 100, 100) : 0;
  return (
    <div style={{
      background:"var(--surface)", borderRadius:16, padding:"22px 24px",
      border:"1px solid var(--border)", flex:"1 1 160px", minWidth:140,
      display:"flex", flexDirection:"column", gap:8, position:"relative", overflow:"hidden",
    }}>
      {/* Glow */}
      <div style={{
        position:"absolute", top:0, left:0, right:0, height:2,
        background:`linear-gradient(90deg, transparent, ${color}60, transparent)`,
      }}/>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontSize:11, fontWeight:700, color:"var(--text-dim)", textTransform:"uppercase", letterSpacing:"0.08em" }}>
          {label}
        </span>
        <span style={{
          fontSize:16, width:30, height:30, borderRadius:8,
          background:color+"15", display:"flex", alignItems:"center", justifyContent:"center",
        }}>{icon}</span>
      </div>
      <div style={{ fontSize:36, fontWeight:800, color, letterSpacing:-2, lineHeight:1 }}>
        {fmt(value)}
      </div>
      {sub && <div style={{ fontSize:12, color:"var(--text-dim)" }}>{sub}</div>}
      {bar && barMax > 0 && (
        <div style={{ height:3, background:"var(--surface3)", borderRadius:2, marginTop:4 }}>
          <div style={{ height:"100%", width:`${barPct}%`, background:color, borderRadius:2, transition:"width .6s ease" }}/>
        </div>
      )}
    </div>
  );
}

// ─── Application Funnel ───────────────────────────────────────────────────────
function AppFunnel({ stages }) {
  const rows = [
    { label:"Jobs Found",    value: stages.found   || 0, color:"#6366f1" },
    { label:"Queued",        value: stages.queued   || 0, color:"#94a3b8" },
    { label:"Applied",       value: stages.applied  || 0, color:"#22c55e" },
    { label:"Interviewing",  value: stages.inter    || 0, color:"#38bdf8" },
    { label:"Offered",       value: stages.offered  || 0, color:"#f59e0b" },
  ];
  const max = Math.max(...rows.map(r => r.value), 1);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      {rows.map(r => (
        <div key={r.label} style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ fontSize:12, color:"var(--text-dim)", width:100, flexShrink:0 }}>{r.label}</div>
          <div style={{ flex:1, height:8, background:"var(--surface3)", borderRadius:4 }}>
            <div style={{
              height:"100%", width:`${(r.value/max)*100}%`,
              background:r.color, borderRadius:4, minWidth: r.value > 0 ? 8 : 0,
              transition:"width .8s cubic-bezier(.4,0,.2,1)",
            }}/>
          </div>
          <div style={{ fontSize:13, fontWeight:700, color:r.color, width:50, textAlign:"right" }}>
            {fmt(r.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Hot Job Card (Dashboard) ─────────────────────────────────────────────────
function HotJobCard({ job, onClick }) {
  const c = companyColor(job.company);
  return (
    <div onClick={onClick} style={{
      background:"var(--surface)", border:"1px solid var(--border)",
      borderRadius:14, padding:"16px 18px", cursor:"pointer",
      transition:"all .15s", display:"flex", flexDirection:"column", gap:10,
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = c+"60"; e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow=`0 8px 24px ${c}18`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor="var(--border)"; e.currentTarget.style.transform="none"; e.currentTarget.style.boxShadow="none"; }}
    >
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <Avatar name={job.company} size={38}/>
        <ScoreRing score={job.score} size={42}/>
      </div>
      <div>
        <div style={{ fontSize:13, fontWeight:700, color:"var(--text)", lineHeight:1.35, marginBottom:4 }}>
          {job.title}
        </div>
        <div style={{ fontSize:12, color:"var(--text-dim)" }}>{job.company}</div>
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        {job.location && <Tag color="#f97316">📍 {job.location.split(",")[0]}</Tag>}
        {job.workMode && <Tag color="#8b5cf6">{job.workMode}</Tag>}
        {job.salary && <Tag color="#22c55e">💰 {job.salary}</Tag>}
      </div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <PlatformTag platform={job.platform}/>
        <span style={{ fontSize:10, color:"var(--text-dim)" }}>{relTime(job.savedAt)}</span>
      </div>
    </div>
  );
}

// ─── Full Job Card (Jobs tab) ─────────────────────────────────────────────────
function JobCard({ job, onDetails, onCopy, copiedId }) {
  const c = companyColor(job.company);
  const bColor = job.score >= 3.5 ? "#22c55e" : job.score >= 2.5 ? "#84cc16" : "var(--border)";
  return (
    <div style={{
      background:"var(--surface)", border:"1px solid var(--border)",
      borderLeft:`3px solid ${bColor}`, borderRadius:12,
      padding:"16px 20px", transition:"all .15s",
    }}
      onMouseEnter={e => e.currentTarget.style.background="var(--surface2)"}
      onMouseLeave={e => e.currentTarget.style.background="var(--surface)"}
    >
      <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
        <Avatar name={job.company} size={44}/>

        <div style={{ flex:1, minWidth:0 }}>
          {/* Title row */}
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:5 }}>
            <span style={{ fontSize:15, fontWeight:700, color:"var(--text)" }}>{job.title}</span>
            {job.easyApply && (
              <span style={{ background:"#22c55e15", color:"#22c55e", border:"1px solid #22c55e30",
                borderRadius:20, padding:"1px 8px", fontSize:11, fontWeight:700 }}>
                ⚡ Easy Apply
              </span>
            )}
            {job.atsProvider && <Tag color="#a855f7">{job.atsProvider}</Tag>}
          </div>

          {/* Company / location */}
          <div style={{ fontSize:13, color:"var(--text-muted)", marginBottom:8 }}>
            <span style={{ fontWeight:600, color: c }}>{job.company}</span>
            {job.location && <><span style={{ color:"var(--text-dim)" }}> · </span><span>📍 {job.location}</span></>}
            {job.salary && <><span style={{ color:"var(--text-dim)" }}> · </span><span style={{ color:"#22c55e" }}>💰 {job.salary}</span></>}
          </div>

          {/* Skills */}
          {job.skills?.length > 0 && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:8 }}>
              {job.skills.slice(0,6).map((s,i) => (
                <span key={i} style={{
                  background:"#6366f112", color:"#818cf8", border:"1px solid #6366f125",
                  borderRadius:5, padding:"2px 8px", fontSize:11,
                }}>{s}</span>
              ))}
              {job.skills.length > 6 && <span style={{ color:"var(--text-dim)", fontSize:11, padding:"2px 4px" }}>+{job.skills.length-6}</span>}
            </div>
          )}

          {/* Description */}
          {job.description && (
            <div style={{
              fontSize:12, color:"var(--text-dim)", lineHeight:1.6, marginBottom:10,
              display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden",
            }}>
              {job.description}
            </div>
          )}

          {/* Actions */}
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
            <PlatformTag platform={job.platform}/>
            <span style={{ color:"var(--text-dim)", fontSize:11 }}>{relTime(job.savedAt)}</span>
            <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
              <a href={job.url} target="_blank" rel="noreferrer" style={{
                padding:"5px 14px", background:c, color:"#fff", borderRadius:7,
                fontSize:11, fontWeight:700, textDecoration:"none",
              }}>Open ↗</a>
              <button onClick={() => onCopy(job.url, `u${job.id}`)} style={{
                padding:"5px 12px", background:"transparent",
                border:"1px solid var(--border)", color: copiedId===`u${job.id}` ? "#22c55e" : "var(--text-dim)",
                borderRadius:7, fontSize:11, cursor:"pointer",
              }}>{copiedId===`u${job.id}` ? "✓" : "Copy"}</button>
              <button onClick={() => onDetails(job)} style={{
                padding:"5px 14px", background:"var(--surface3)", border:"1px solid var(--border)",
                color:"var(--text-muted)", borderRadius:7, fontSize:11, cursor:"pointer", fontWeight:600,
              }}>Details</button>
            </div>
          </div>
        </div>

        {/* Score ring */}
        <ScoreRing score={job.score} size={52}/>
      </div>
    </div>
  );
}

// ─── Job Detail Modal ─────────────────────────────────────────────────────────
function JobModal({ job, onClose, onApply }) {
  const [skillGap, setSkillGap]       = useState(null);
  const [resume, setResume]           = useState(null);
  const [loadingGap, setLoadingGap]   = useState(false);
  const [loadingResume, setLoadingResume] = useState(false);
  const [activeTab, setActiveTab]     = useState("overview"); // overview | gap | resume

  useEffect(() => {
    if (!job) return;
    setSkillGap(null); setResume(null); setActiveTab("overview");
  }, [job]);

  if (!job) return null;
  const c = companyColor(job.company);

  async function loadSkillGap() {
    setLoadingGap(true); setActiveTab("gap");
    try {
      const d = await apiFetch(`${API}/skill-gap`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ job }),
      }).then(r => r.json());
      setSkillGap(d);
    } catch {}
    setLoadingGap(false);
  }

  async function loadResume() {
    setLoadingResume(true); setActiveTab("resume");
    try {
      const d = await apiFetch(`${API}/generate-resume`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ job }),
      }).then(r => r.json());
      setResume(d);
    } catch {}
    setLoadingResume(false);
  }

  const modalTabs = [
    { id:"overview", label:"Overview" },
    { id:"gap",      label:"Skill Gap" },
    { id:"resume",   label:"Resume Draft" },
  ];

  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.75)", backdropFilter:"blur(4px)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background:"var(--surface)", borderRadius:20, width:"100%", maxWidth:760,
        maxHeight:"92vh", overflowY:"auto", border:"1px solid var(--border)",
        boxShadow:"0 32px 80px rgba(0,0,0,.7)",
      }}>
        {/* Header band */}
        <div style={{ background:`linear-gradient(135deg, ${c}20, transparent)`, padding:"24px 28px 18px", borderBottom:"1px solid var(--border)" }}>
          <div style={{ display:"flex", gap:16, alignItems:"flex-start" }}>
            <Avatar name={job.company} size={54}/>
            <div style={{ flex:1, minWidth:0 }}>
              <h2 style={{ fontSize:19, fontWeight:800, color:"var(--text)", marginBottom:4, lineHeight:1.3 }}>{job.title}</h2>
              <div style={{ fontSize:13, color:"var(--text-muted)" }}>{job.company}
                {job.location && <> · <span style={{ color:"#f97316" }}>📍 {job.location}</span></>}
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <ScoreRing score={job.score} size={52}/>
              <button onClick={onClose} style={{
                background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text-dim)",
                borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:14,
              }}>✕</button>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:12 }}>
            <PlatformTag platform={job.platform}/>
            {job.atsProvider && <Tag color="#a855f7">{job.atsProvider}</Tag>}
            {job.status && <StatusPill status={job.status}/>}
            {job.salary && <Tag color="#22c55e">💰 {job.salary}</Tag>}
            {job.easyApply && <Tag color="#22c55e">⚡ Easy Apply</Tag>}
          </div>
        </div>

        {/* Action bar */}
        <div style={{ display:"flex", gap:8, padding:"12px 28px", borderBottom:"1px solid var(--border)", background:"var(--surface2)", flexWrap:"wrap" }}>
          <a href={job.url} target="_blank" rel="noreferrer" style={{
            padding:"8px 16px", background:c, color:"#fff", borderRadius:8,
            fontWeight:700, fontSize:12, textDecoration:"none",
          }}>Open Job ↗</a>
          <a href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent((job.company||"")+" recruiter talent acquisition")}`}
            target="_blank" rel="noreferrer" style={{
            padding:"8px 16px", background:"#0a66c220", color:"#0a66c2", borderRadius:8,
            fontWeight:700, fontSize:12, textDecoration:"none", border:"1px solid #0a66c240",
          }}>💼 Find Recruiter</a>
          <button onClick={loadSkillGap} style={{
            padding:"8px 16px", background:"#f59e0b20", color:"#f59e0b", border:"1px solid #f59e0b40",
            borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer",
          }}>🎯 Skill Gap</button>
          <button onClick={loadResume} style={{
            padding:"8px 16px", background:"#22c55e20", color:"#22c55e", border:"1px solid #22c55e40",
            borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer",
          }}>📄 Generate Resume</button>
          {(job.status==="easy-apply-pending"||job.status==="apply-failed"||job.status==="queued-manual") && (
            <button onClick={() => onApply(job)} style={{
              padding:"8px 16px", background:"#6366f1", color:"#fff", border:"none",
              borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer",
            }}>⚡ Auto-Apply</button>
          )}
        </div>

        {/* Inner tabs */}
        <div style={{ display:"flex", gap:0, borderBottom:"1px solid var(--border)" }}>
          {modalTabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding:"10px 20px", background:"none", border:"none", borderBottom: activeTab===t.id ? "2px solid #6366f1" : "2px solid transparent",
              color: activeTab===t.id ? "#818cf8" : "var(--text-dim)", fontWeight:activeTab===t.id?700:400,
              fontSize:12, cursor:"pointer",
            }}>{t.label}</button>
          ))}
        </div>

        <div style={{ padding:"20px 28px", display:"flex", flexDirection:"column", gap:18 }}>

          {/* OVERVIEW TAB */}
          {activeTab === "overview" && <>
            {job.scoreBreakdown && (
              <div style={{ background:"var(--bg)", borderRadius:12, padding:"14px 16px", border:"1px solid var(--border)" }}>
                <div style={{ fontSize:11, color:"var(--text-dim)", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Fit Breakdown</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                  {[
                    ["Title",    job.scoreBreakdown.title, "/2"],
                    ["Skills",   job.scoreBreakdown.skills?.toFixed(1), "/2"],
                    ["Location", job.scoreBreakdown.location, "/1"],
                    ["Exp",      job.scoreBreakdown.experienceBonus?.toFixed(1), "+"],
                  ].map(([k,v,max]) => (
                    <div key={k} style={{ background:"var(--surface)", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                      <div style={{ fontSize:10, color:"var(--text-dim)", marginBottom:4 }}>{k}</div>
                      <div style={{ fontSize:20, fontWeight:800, color:scoreColor(job.score) }}>{v ?? "—"}</div>
                      <div style={{ fontSize:10, color:"var(--text-dim)" }}>{max}</div>
                    </div>
                  ))}
                </div>
                {job.scoreBreakdown.matchedSkills?.length > 0 && (
                  <div style={{ marginTop:10, fontSize:12, color:"var(--text-dim)" }}>
                    ✅ You have: <span style={{ color:"#22c55e" }}>{job.scoreBreakdown.matchedSkills.join(", ")}</span>
                  </div>
                )}
              </div>
            )}
            {job.skills?.length > 0 && (
              <div>
                <div style={{ fontSize:11, color:"var(--text-dim)", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Required Skills</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {job.skills.map((s,i) => (
                    <span key={i} style={{ background:"#6366f112", color:"#818cf8", border:"1px solid #6366f130", borderRadius:6, padding:"3px 10px", fontSize:12 }}>{s}</span>
                  ))}
                </div>
              </div>
            )}
            {job.description && (
              <div>
                <div style={{ fontSize:11, color:"var(--text-dim)", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Description</div>
                <div style={{ background:"var(--bg)", borderRadius:10, padding:"14px 16px", border:"1px solid var(--border)", fontSize:13, color:"var(--text-muted)", lineHeight:1.75, whiteSpace:"pre-wrap", maxHeight:220, overflowY:"auto" }}>
                  {job.description}
                </div>
              </div>
            )}
            {job.autoApplyNote && (
              <div style={{ fontSize:12, color:"var(--text-dim)", background:"var(--bg)", borderRadius:8, padding:"10px 14px", border:"1px solid var(--border)" }}>
                Note: {job.autoApplyNote}
              </div>
            )}
          </>}

          {/* SKILL GAP TAB */}
          {activeTab === "gap" && (
            <div>
              {loadingGap && <div style={{ textAlign:"center", color:"var(--text-dim)", padding:40 }}>Analysing skill gap…</div>}
              {!loadingGap && !skillGap && (
                <div style={{ textAlign:"center", padding:40 }}>
                  <button onClick={loadSkillGap} style={{ padding:"12px 28px", background:"#f59e0b", color:"#000", border:"none", borderRadius:10, fontWeight:700, fontSize:14, cursor:"pointer" }}>
                    🎯 Run Skill Gap Analysis
                  </button>
                  <p style={{ color:"var(--text-dim)", fontSize:13, marginTop:12 }}>Compares your profile skills against this job's requirements</p>
                </div>
              )}
              {skillGap && (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  {/* Match meter */}
                  <div style={{ background:"var(--bg)", borderRadius:12, padding:"16px 20px", border:"1px solid var(--border)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>Skill Match</span>
                      <span style={{ fontSize:22, fontWeight:800, color: skillGap.matchPct >= 70 ? "#22c55e" : skillGap.matchPct >= 40 ? "#f59e0b" : "#ef4444" }}>{skillGap.matchPct}%</span>
                    </div>
                    <div style={{ height:8, background:"var(--border)", borderRadius:8, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${skillGap.matchPct}%`, background: skillGap.matchPct >= 70 ? "#22c55e" : skillGap.matchPct >= 40 ? "#f59e0b" : "#ef4444", borderRadius:8, transition:"width .6s" }}/>
                    </div>
                    <div style={{ fontSize:11, color:"var(--text-dim)", marginTop:6 }}>
                      {skillGap.matched?.length || 0} of {skillGap.total} your skills match this job
                    </div>
                  </div>
                  {/* Experience check */}
                  {skillGap.expGap && (
                    <div style={{ background: skillGap.expGap.ok ? "#22c55e10" : "#ef444410", borderRadius:10, padding:"12px 16px", border:`1px solid ${skillGap.expGap.ok ? "#22c55e30" : "#ef444430"}` }}>
                      <span style={{ fontSize:13, fontWeight:700, color: skillGap.expGap.ok ? "#22c55e" : "#ef4444" }}>
                        {skillGap.expGap.ok ? "✅" : "⚠"} Experience: {skillGap.expGap.you} yrs you · {skillGap.expGap.required}+ yrs required
                      </span>
                    </div>
                  )}
                  {/* You have */}
                  {skillGap.matched?.length > 0 && (
                    <div>
                      <div style={{ fontSize:11, color:"#22c55e", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>✅ You Have ({skillGap.matched.length})</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                        {skillGap.matched.map((s,i) => <span key={i} style={{ background:"#22c55e15", color:"#22c55e", border:"1px solid #22c55e30", borderRadius:6, padding:"3px 10px", fontSize:12 }}>{s}</span>)}
                      </div>
                    </div>
                  )}
                  {/* Missing */}
                  {skillGap.missing?.length > 0 && (
                    <div>
                      <div style={{ fontSize:11, color:"#ef4444", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>🎯 Gap — Learn These ({skillGap.missing.length})</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                        {skillGap.missing.map((s,i) => <span key={i} style={{ background:"#ef444415", color:"#f87171", border:"1px solid #ef444430", borderRadius:6, padding:"3px 10px", fontSize:12 }}>{s}</span>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* RESUME DRAFT TAB */}
          {activeTab === "resume" && (
            <div>
              {loadingResume && <div style={{ textAlign:"center", color:"var(--text-dim)", padding:40 }}>Generating tailored resume…</div>}
              {!loadingResume && !resume && (
                <div style={{ textAlign:"center", padding:40 }}>
                  <button onClick={loadResume} style={{ padding:"12px 28px", background:"#22c55e", color:"#000", border:"none", borderRadius:10, fontWeight:700, fontSize:14, cursor:"pointer" }}>
                    📄 Generate Tailored Resume
                  </button>
                  <p style={{ color:"var(--text-dim)", fontSize:13, marginTop:12 }}>Creates resume sections prioritising skills this job needs based on your profile</p>
                </div>
              )}
              {resume && (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  {/* Header preview */}
                  <div style={{ background:"var(--bg)", borderRadius:12, padding:"16px 20px", border:"1px solid var(--border)" }}>
                    <div style={{ fontSize:18, fontWeight:800, color:"var(--text)" }}>{resume.name || "Your Name"}</div>
                    <div style={{ fontSize:12, color:"var(--text-dim)", marginTop:4 }}>
                      {[resume.email, resume.phone, resume.location, resume.linkedinUrl].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {/* Summary */}
                  {resume.tailoredSummary && (
                    <div style={{ background:"var(--bg)", borderRadius:12, padding:"14px 16px", border:"1px solid var(--border)" }}>
                      <div style={{ fontSize:11, color:"#6366f1", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Summary — Tailored to {resume.targetTitle}</div>
                      <div style={{ fontSize:13, color:"var(--text-muted)", lineHeight:1.7 }}>{resume.tailoredSummary}</div>
                    </div>
                  )}
                  {/* Skills — matched first */}
                  {resume.orderedSkills?.length > 0 && (
                    <div style={{ background:"var(--bg)", borderRadius:12, padding:"14px 16px", border:"1px solid var(--border)" }}>
                      <div style={{ fontSize:11, color:"#6366f1", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>Skills (job matches first)</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                        {resume.matchedSkills?.map((s,i) => <span key={i} style={{ background:"#22c55e15", color:"#22c55e", border:"1px solid #22c55e30", borderRadius:6, padding:"3px 10px", fontSize:12, fontWeight:600 }}>{s}</span>)}
                        {resume.otherSkills?.map((s,i) => <span key={i} style={{ background:"#6366f112", color:"#818cf8", border:"1px solid #6366f130", borderRadius:6, padding:"3px 10px", fontSize:12 }}>{s}</span>)}
                      </div>
                    </div>
                  )}
                  {/* Experience bullets */}
                  {resume.experienceBullets?.length > 0 && (
                    <div style={{ background:"var(--bg)", borderRadius:12, padding:"14px 16px", border:"1px solid var(--border)" }}>
                      <div style={{ fontSize:11, color:"#6366f1", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>Experience Bullet Points (tailored)</div>
                      {resume.experienceBullets.map((b,i) => (
                        <div key={i} style={{ display:"flex", gap:10, marginBottom:8, fontSize:13, color:"var(--text-muted)", lineHeight:1.6 }}>
                          <span style={{ color:"#6366f1", flexShrink:0 }}>•</span><span>{b}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Skills gap reminder */}
                  {resume.missingSkills?.length > 0 && (
                    <div style={{ background:"#f59e0b10", borderRadius:10, padding:"12px 16px", border:"1px solid #f59e0b30" }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#f59e0b", marginBottom:6 }}>⚡ Boost your match — add these to your profile:</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                        {resume.missingSkills.map((s,i) => <span key={i} style={{ background:"#f59e0b15", color:"#fbbf24", border:"1px solid #f59e0b30", borderRadius:6, padding:"3px 10px", fontSize:12 }}>{s}</span>)}
                      </div>
                    </div>
                  )}
                  {/* Education */}
                  {resume.education?.school && (
                    <div style={{ background:"var(--bg)", borderRadius:12, padding:"14px 16px", border:"1px solid var(--border)", fontSize:13, color:"var(--text-muted)" }}>
                      <div style={{ fontSize:11, color:"#6366f1", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Education</div>
                      <strong style={{ color:"var(--text)" }}>{resume.education.school}</strong> · {resume.education.degree}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Settings: Platform Pill ──────────────────────────────────────────────────
function PlatformPill({ id, active, onChange }) {
  const m = PLATFORM_META[id];
  if (!m) return null;
  return (
    <label style={{
      display:"flex", alignItems:"center", gap:8, cursor:"pointer", userSelect:"none",
      background: active ? m.color+"15" : "var(--surface2)",
      border:`1px solid ${active ? m.color+"50" : "var(--border)"}`,
      borderRadius:8, padding:"7px 12px", transition:"all .15s",
    }}>
      <input type="checkbox" checked={active} onChange={e => onChange(id, e.target.checked)} style={{ accentColor:m.color }}/>
      <span style={{ fontSize:13, color: active ? m.color : "var(--text-dim)", fontWeight:500 }}>{m.label}</span>
    </label>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:"block", fontSize:11, color:"var(--text-dim)", marginBottom:5, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em" }}>
        {label}
      </label>
      <div className="fc">{children}</div>
    </div>
  );
}

// ─── Agents Tab ───────────────────────────────────────────────────────────────
function AgentsTab({ showToast }) {
  const [agents, setAgents]     = useState([]);
  const [running, setRunning]   = useState({});
  const [expanded, setExpanded] = useState({});
  const [configs, setConfigs]   = useState({});
  const [results, setResults]   = useState({});

  const load = useCallback(async () => {
    try {
      const d = await apiFetch(`${API}/agents`).then(r => r.json());
      setAgents(d.agents || []);
      (d.agents || []).forEach(a => { if (a.result) setResults(p => ({ ...p, [a.id]: a.result })); });
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const runAgent = async (id) => {
    setRunning(r => ({ ...r, [id]: true }));
    try {
      const d = await apiFetch(`${API}/agents/${id}/run`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ config: configs[id] || {} }),
      }).then(r => r.json());
      if (d.ok) { setResults(r => ({ ...r, [id]: d.result })); setExpanded(e => ({ ...e, [id]: true })); showToast("Agent completed ✓"); }
      else showToast(d.message || "Agent failed", "error");
    } catch { showToast("Cannot reach server", "error"); }
    setRunning(r => ({ ...r, [id]: false }));
  };

  const updCfg = (aid, key, val) => setConfigs(c => ({ ...c, [aid]: { ...(c[aid]||{}), [key]: val } }));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ background:"linear-gradient(135deg,#1e1b4b,#312e81)", borderRadius:16, padding:"20px 24px", border:"1px solid #6366f130", display:"flex", alignItems:"center", gap:16 }}>
        <div style={{ fontSize:36 }}>🤖</div>
        <div>
          <div style={{ fontSize:18, fontWeight:800, color:"#fff" }}>AI Agent Suite</div>
          <div style={{ fontSize:12, color:"#a5b4fc", marginTop:3 }}>5 autonomous agents — no LLM API key required.</div>
        </div>
      </div>
      {agents.map(agent => {
        const res = results[agent.id]; const isOpen = expanded[agent.id]; const cfg = configs[agent.id] || {}; const isRun = running[agent.id];
        return (
          <div key={agent.id} style={{ background:"var(--surface)", borderRadius:16, border:`1px solid ${agent.color}25`, overflow:"hidden" }}>
            <div style={{ padding:"18px 22px", display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ width:48, height:48, borderRadius:12, flexShrink:0, background:`${agent.color}18`, border:`1px solid ${agent.color}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>{agent.icon}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:800, color:"var(--text)", marginBottom:2 }}>{agent.name}</div>
                <div style={{ fontSize:12, color:"var(--text-dim)", lineHeight:1.5 }}>{agent.description}</div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                {res && <span style={{ fontSize:10, color:agent.color, background:agent.color+"15", border:`1px solid ${agent.color}30`, borderRadius:20, padding:"3px 10px", fontWeight:700 }}>Done ✓</span>}
                <button onClick={() => runAgent(agent.id)} disabled={isRun} style={{ padding:"9px 20px", borderRadius:10, border:"none", background:isRun?"var(--surface2)":`linear-gradient(135deg,${agent.color},${agent.color}cc)`, color:isRun?"var(--text-dim)":"#fff", fontWeight:700, fontSize:12, cursor:isRun?"not-allowed":"pointer" }}>
                  {isRun ? "⏳ Running…" : "▶ Run"}
                </button>
                {res && <button onClick={() => setExpanded(e => ({ ...e, [agent.id]: !isOpen }))} style={{ background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text-dim)", borderRadius:8, cursor:"pointer", width:32, height:32, fontSize:14 }}>{isOpen?"▲":"▼"}</button>}
              </div>
            </div>
            {agent.configFields?.length > 0 && (
              <div style={{ borderTop:"1px solid var(--border)", padding:"10px 22px", background:"var(--bg)", display:"flex", gap:16, alignItems:"center", flexWrap:"wrap" }}>
                <span style={{ fontSize:10, color:"var(--text-dim)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em" }}>Config</span>
                {agent.configFields.map(f => (
                  <label key={f.key} style={{ display:"flex", alignItems:"center", gap:7, fontSize:12, color:"var(--text-muted)" }}>
                    {f.label}:
                    {f.type === "select"
                      ? <select value={cfg[f.key]??f.default} onChange={e=>updCfg(agent.id,f.key,e.target.value)} style={{ background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:6, padding:"3px 8px", fontSize:12 }}>{(f.options||[]).map(o=><option key={o}>{o}</option>)}</select>
                      : <input type="number" value={cfg[f.key]??f.default} onChange={e=>updCfg(agent.id,f.key,e.target.value)} style={{ width:60, background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text)", borderRadius:6, padding:"3px 8px", fontSize:12 }}/>}
                  </label>
                ))}
              </div>
            )}
            {isOpen && res && (
              <div style={{ borderTop:`2px solid ${agent.color}30`, padding:"18px 22px" }}>
                <div style={{ background:agent.color+"12", borderRadius:10, padding:"10px 14px", marginBottom:14, border:`1px solid ${agent.color}25`, fontSize:12, color:agent.color, fontWeight:600 }}>📊 {res.summary}</div>
                {(agent.id==="outreach-writer") && res.items?.map((item,i) => (
                  <div key={i} style={{ marginBottom:10, background:"var(--bg)", borderRadius:10, border:"1px solid var(--border)", overflow:"hidden" }}>
                    <div style={{ padding:"9px 14px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10 }}>
                      <Avatar name={item.job.company} size={24}/><span style={{ fontSize:12, fontWeight:700, color:"var(--text)" }}>{item.job.title} @ {item.job.company}</span>
                      <ScoreRing score={item.job.score} size={30}/>
                      <a href={item.recruiterSearchUrl} target="_blank" rel="noreferrer" style={{ marginLeft:"auto", fontSize:10, color:"#6366f1", border:"1px solid #6366f130", borderRadius:6, padding:"4px 10px", textDecoration:"none", fontWeight:700 }}>Find Recruiter →</a>
                    </div>
                    <pre style={{ margin:0, padding:"12px 14px", fontSize:11, color:"var(--text-muted)", whiteSpace:"pre-wrap", lineHeight:1.7, fontFamily:"system-ui" }}>{item.message}</pre>
                    <div style={{ padding:"8px 14px", borderTop:"1px solid var(--border)" }}>
                      <button onClick={()=>navigator.clipboard.writeText(item.message).then(()=>showToast("Copied!"))} style={{ background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text-dim)", borderRadius:6, padding:"4px 12px", fontSize:11, cursor:"pointer" }}>📋 Copy</button>
                    </div>
                  </div>
                ))}
                {(agent.id==="followup-drafter") && res.items?.map((item,i) => (
                  <div key={i} style={{ marginBottom:10, background:"var(--bg)", borderRadius:10, border:"1px solid var(--border)", overflow:"hidden" }}>
                    <div style={{ padding:"9px 14px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10 }}>
                      <Avatar name={item.app.company} size={24}/><span style={{ fontSize:12, fontWeight:700, color:"var(--text)" }}>{item.app.title} @ {item.app.company}</span>
                      <span style={{ marginLeft:"auto", fontSize:10, background:"#f59e0b15", color:"#f59e0b", border:"1px solid #f59e0b30", borderRadius:20, padding:"2px 10px", fontWeight:700 }}>{item.app.daysSince}d ago</span>
                    </div>
                    <pre style={{ margin:0, padding:"12px 14px", fontSize:11, color:"var(--text-muted)", whiteSpace:"pre-wrap", lineHeight:1.7, fontFamily:"system-ui" }}>{item.followUp}</pre>
                    <div style={{ padding:"8px 14px", borderTop:"1px solid var(--border)" }}>
                      <button onClick={()=>navigator.clipboard.writeText(item.followUp).then(()=>showToast("Copied!"))} style={{ background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text-dim)", borderRadius:6, padding:"4px 12px", fontSize:11, cursor:"pointer" }}>📋 Copy</button>
                    </div>
                  </div>
                ))}
                {(agent.id==="profile-optimizer") && (
                  <div>
                    {res.alreadyHave?.length>0 && <div style={{ marginBottom:12 }}>
                      <div style={{ fontSize:9, color:"#22c55e", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:7 }}>✅ Skills you already have (in demand)</div>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>{res.alreadyHave.map(s=><span key={s.skill} style={{ background:"#22c55e12", color:"#22c55e", border:"1px solid #22c55e25", borderRadius:20, padding:"3px 12px", fontSize:11, fontWeight:600 }}>✓ {s.skill} ×{s.frequency}</span>)}</div>
                    </div>}
                    {res.recommendations?.length>0 && <div>
                      <div style={{ fontSize:9, color:"#f59e0b", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:7 }}>🎯 Recommended skills to add</div>
                      {res.recommendations.map(r=>(
                        <div key={r.skill} style={{ display:"flex", alignItems:"center", gap:12, background:"var(--bg)", borderRadius:8, padding:"7px 12px", border:"1px solid var(--border)", marginBottom:5 }}>
                          <div style={{ flex:1, fontSize:12, fontWeight:700, color:"var(--text)" }}>{r.skill}</div>
                          <div style={{ width:80, height:5, background:"var(--border)", borderRadius:3 }}><div style={{ height:"100%", width:`${r.pctOfJobs}%`, background:"#f59e0b", borderRadius:3 }}/></div>
                          <div style={{ fontSize:11, color:"#f59e0b", fontWeight:700, minWidth:50, textAlign:"right" }}>{r.pctOfJobs}% of jobs</div>
                        </div>
                      ))}
                    </div>}
                  </div>
                )}
                {(agent.id==="salary-analyst") && res.breakdown?.length>0 && res.breakdown.map(r=>(
                  <div key={r.role} style={{ background:"var(--bg)", borderRadius:10, padding:"11px 14px", border:"1px solid var(--border)", display:"flex", alignItems:"center", gap:14, marginBottom:6 }}>
                    <div style={{ flex:1, minWidth:0 }}><div style={{ fontSize:12, fontWeight:700, color:"var(--text)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.role}</div><div style={{ fontSize:10, color:"var(--text-dim)" }}>{r.count} mention{r.count!==1?"s":""}</div></div>
                    {[["Min",r.minFmt,"#94a3b8"],["Avg",r.avgFmt,"#f59e0b"],["Max",r.maxFmt,"#22c55e"]].map(([lbl,val,c])=>(
                      <div key={lbl} style={{ textAlign:"center" }}><div style={{ fontSize:14, fontWeight:800, color:c }}>{val}</div><div style={{ fontSize:9, color:"var(--text-dim)", textTransform:"uppercase" }}>{lbl}</div></div>
                    ))}
                  </div>
                ))}
                {(agent.id==="cold-scout") && res.grouped?.map(group=>(
                  <div key={group.provider} style={{ marginBottom:12 }}>
                    <div style={{ fontSize:10, color:"#22c55e", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:7 }}>{group.provider} · {group.count} job{group.count!==1?"s":""}</div>
                    {group.jobs.map(j=>(
                      <div key={j.id} style={{ background:"var(--bg)", borderRadius:8, padding:"8px 12px", border:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10, marginBottom:5 }}>
                        <Avatar name={j.company} size={24}/><div style={{ flex:1, minWidth:0 }}><div style={{ fontSize:12, fontWeight:700, color:"var(--text)" }}>{j.title}</div><div style={{ fontSize:10, color:"var(--text-dim)" }}>{j.company}</div></div>
                        <ScoreRing score={j.score} size={28}/>
                        <a href={j.url} target="_blank" rel="noreferrer" style={{ fontSize:10, color:"#22c55e", border:"1px solid #22c55e30", borderRadius:6, padding:"4px 10px", textDecoration:"none", fontWeight:700 }}>Apply →</a>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Architecture Diagram ─────────────────────────────────────────────────────
function ArchDiagram() {
  const nodes = [
    { id:"jb",   x:300, y:20,  w:300, h:65,  color:"#3b82f6", icon:"🌐", label:"Job Boards", sub:"LinkedIn · Indeed · Glassdoor · ZipRecruiter · ATS Direct" },
    { id:"srv",  x:295, y:200, w:310, h:85,  color:"#6366f1", icon:"⚙️", label:"server.js — Node.js / Express", sub:"REST API · Apify · SerpAPI · port 3004" },
    { id:"ext",  x:20,  y:200, w:180, h:85,  color:"#a855f7", icon:"🧩", label:"Chrome Extension", sub:"content.js · popup · background.js" },
    { id:"dash", x:700, y:200, w:180, h:85,  color:"#14b8a6", icon:"📊", label:"React Dashboard", sub:"Vite SPA · 8 tabs" },
    { id:"scr",  x:160, y:375, w:180, h:70,  color:"#f59e0b", icon:"🎯", label:"scorer.js", sub:"0–5 profile-aware scoring" },
    { id:"db",   x:530, y:375, w:180, h:70,  color:"#22c55e", icon:"🗄️", label:"data.json", sub:"apps · jobs · profile" },
  ];
  const cx = n => n.x + n.w/2; const cy = n => n.y + n.h/2; const get = id => nodes.find(n=>n.id===id);
  const Arrow = ({ from, to, label, color="#6366f150", bend=0 }) => {
    const f=get(from),t=get(to); if(!f||!t) return null;
    const x1=cx(f),y1=cy(f),x2=cx(t),y2=cy(t),mx=(x1+x2)/2+bend,my=(y1+y2)/2;
    return (<g><defs><marker id={`arr-${from}-${to}`} markerWidth={8} markerHeight={8} refX={7} refY={3} orient="auto"><path d="M0,0 L0,6 L8,3 z" fill={color} opacity={0.85}/></marker></defs>
      <path d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`} fill="none" stroke={color} strokeWidth={1.8} strokeDasharray="5 3" markerEnd={`url(#arr-${from}-${to})`} opacity={0.75}/>
      {label && <text x={mx} y={my-7} textAnchor="middle" fill={color} fontSize={9} fontWeight={700} opacity={0.9}>{label}</text>}
    </g>);
  };
  return (
    <div style={{ background:"var(--surface)", borderRadius:16, border:"1px solid var(--border)", overflow:"hidden" }}>
      <div style={{ background:"linear-gradient(135deg,#1e1b4b,#312e81)", padding:"20px 28px", borderBottom:"1px solid #6366f130" }}>
        <div style={{ fontSize:9, color:"#a5b4fc", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.15em", marginBottom:4 }}>SYSTEM ARCHITECTURE</div>
        <div style={{ fontSize:18, fontWeight:800, color:"#fff" }}>ApplyAI — How It Works</div>
        <div style={{ fontSize:12, color:"#a5b4fc", marginTop:4 }}>Chrome Extension + Node.js API + React Dashboard + AI Scorer</div>
      </div>
      <div style={{ padding:"24px", overflowX:"auto" }}>
        <svg viewBox="0 0 900 480" width="100%" style={{ maxWidth:900, display:"block", margin:"0 auto" }}>
          <Arrow from="jb" to="srv" label="Apify/SerpAPI" color="#3b82f6"/>
          <Arrow from="ext" to="srv" label="profile sync" color="#a855f7" bend={-30}/>
          <Arrow from="srv" to="dash" label="REST API" color="#14b8a6"/>
          <Arrow from="ext" to="jb" label="auto-fill" color="#a855f750" bend={60}/>
          <Arrow from="srv" to="scr" label="scoreJob()" color="#f59e0b"/>
          <Arrow from="srv" to="db" label="saveData()" color="#22c55e"/>
          <Arrow from="dash" to="srv" label="fetch/POST" color="#14b8a650" bend={30}/>
          {nodes.map(n => (
            <g key={n.id}>
              <rect x={n.x+3} y={n.y+3} width={n.w} height={n.h} rx={12} fill={n.color} opacity={0.1}/>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={12} fill="#1e1b4b" stroke={n.color} strokeWidth={1.5} opacity={0.95}/>
              <rect x={n.x} y={n.y} width={n.w} height={3} rx={12} fill={n.color} opacity={0.9}/>
              <text x={n.x+14} y={n.y+26} fontSize={17}>{n.icon}</text>
              <text x={n.x+40} y={n.y+24} fill="#fff" fontSize={11} fontWeight={700} fontFamily="system-ui">{n.label}</text>
              <text x={n.x+14} y={n.y+42} fill={n.color} fontSize={9} opacity={0.8} fontFamily="system-ui">{n.sub}</text>
            </g>
          ))}
          <g transform="translate(20,460)">
            {[["#a855f7","Extension"],["#6366f1","Server"],["#14b8a6","Dashboard"],["#3b82f6","Job Boards"],["#f59e0b","Scorer"],["#22c55e","Storage"]].map(([c,l],i)=>(
              <g key={l} transform={`translate(${i*140},0)`}><rect x={0} y={-8} width={10} height={10} rx={2} fill={c} opacity={0.85}/><text x={14} y={0} fill="#94a3b8" fontSize={10} fontFamily="system-ui">{l}</text></g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}

// ─── Billing Tab ──────────────────────────────────────────────────────────────
function BillingTab({ showToast }) {
  const [plans, setPlans]   = useState([]);
  const [sub, setSub]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);

  useEffect(() => {
    apiFetch(`${API}/billing/plans`).then(r=>r.json()).then(d => { setPlans(d.plans||[]); setStripeReady(d.stripeConfigured); });
    apiFetch(`${API}/billing/subscription`).then(r=>r.json()).then(d => setSub(d));
  }, []);

  const checkout = async (planId) => {
    if (!stripeReady) { showToast("Add STRIPE_SECRET_KEY to .env to enable payments","error"); return; }
    setLoading(true);
    try {
      const d = await apiFetch(`${API}/billing/checkout`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ planId }) }).then(r=>r.json());
      if (d.ok && d.url) window.location.href = d.url;
      else showToast(d.message||"Checkout failed","error");
    } catch { showToast("Cannot reach server","error"); }
    setLoading(false);
  };

  const openPortal = async () => {
    const d = await apiFetch(`${API}/billing/portal`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}).then(r=>r.json());
    if (d.ok && d.url) window.open(d.url,"_blank");
    else showToast(d.message||"Portal unavailable","error");
  };

  const currentPlan = sub?.plan || "free";

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
      {/* Hero */}
      <div style={{ background:"linear-gradient(135deg,#1e1b4b 0%,#312e81 50%,#1e3a5f 100%)", borderRadius:20, padding:"32px 36px", textAlign:"center" }}>
        <div style={{ fontSize:11, color:"#a5b4fc", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.15em", marginBottom:10 }}>PRICING</div>
        <div style={{ fontSize:28, fontWeight:900, color:"#fff", marginBottom:10 }}>Apply smarter. Land faster.</div>
        <div style={{ fontSize:14, color:"#a5b4fc", maxWidth:480, margin:"0 auto" }}>
          ApplyAI automates your entire job search — from discovery to offer. Choose a plan that fits your ambition.
        </div>
        {!stripeReady && (
          <div style={{ marginTop:16, background:"#f59e0b15", border:"1px solid #f59e0b40", borderRadius:10, padding:"10px 18px", display:"inline-block" }}>
            <span style={{ fontSize:11, color:"#f59e0b", fontWeight:600 }}>⚠ Add <code style={{ background:"#f59e0b20", padding:"1px 6px", borderRadius:4 }}>STRIPE_SECRET_KEY</code> to .env to enable payments</span>
          </div>
        )}
      </div>

      {/* Pricing cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
        {plans.map(plan => {
          const active = currentPlan === plan.id;
          return (
            <div key={plan.id} style={{
              background: plan.popular ? "linear-gradient(180deg,#312e81,#1e1b4b)" : "var(--surface)",
              borderRadius:18, padding:"28px 24px",
              border: active ? "2px solid #6366f1" : plan.popular ? "1px solid #6366f150" : "1px solid var(--border)",
              position:"relative", display:"flex", flexDirection:"column",
            }}>
              {plan.popular && <div style={{ position:"absolute", top:-12, left:"50%", transform:"translateX(-50%)", background:"linear-gradient(135deg,#6366f1,#a855f7)", color:"#fff", borderRadius:20, padding:"4px 16px", fontSize:10, fontWeight:800, whiteSpace:"nowrap" }}>MOST POPULAR</div>}
              {active && <div style={{ position:"absolute", top:-12, right:20, background:"#22c55e", color:"#fff", borderRadius:20, padding:"4px 12px", fontSize:10, fontWeight:800 }}>CURRENT</div>}
              <div style={{ fontSize:12, fontWeight:700, color: plan.popular?"#a5b4fc":"var(--text-dim)", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>{plan.name}</div>
              <div style={{ display:"flex", alignItems:"baseline", gap:4, marginBottom:6 }}>
                <span style={{ fontSize:36, fontWeight:900, color: plan.popular?"#fff":"var(--text)" }}>{plan.price === 0 ? "Free" : `$${plan.price}`}</span>
                {plan.price > 0 && <span style={{ fontSize:13, color: plan.popular?"#a5b4fc":"var(--text-dim)" }}>/month</span>}
              </div>
              <div style={{ flex:1, marginBottom:20 }}>
                {plan.features.map((f,i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", fontSize:12, color: plan.popular?"#c7d2fe":"var(--text-muted)" }}>
                    <span style={{ color: plan.popular?"#818cf8":"#6366f1", flexShrink:0 }}>✓</span>{f}
                  </div>
                ))}
              </div>
              {active ? (
                <button onClick={openPortal} style={{ padding:"11px 20px", borderRadius:10, border:"1px solid #6366f150", background:"transparent", color:"#6366f1", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                  Manage Subscription
                </button>
              ) : plan.price === 0 ? (
                <button disabled style={{ padding:"11px 20px", borderRadius:10, border:"1px solid var(--border)", background:"transparent", color:"var(--text-dim)", fontWeight:700, fontSize:13 }}>Current Plan</button>
              ) : (
                <button onClick={() => checkout(plan.id)} disabled={loading || !stripeReady} style={{
                  padding:"11px 20px", borderRadius:10, border:"none",
                  background: stripeReady ? "linear-gradient(135deg,#6366f1,#a855f7)" : "var(--surface2)",
                  color: stripeReady ? "#fff" : "var(--text-dim)", fontWeight:700, fontSize:13, cursor: stripeReady?"pointer":"not-allowed",
                }}>
                  {loading ? "…" : `Upgrade to ${plan.name} →`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Current subscription status */}
      {sub?.subscription && (
        <div style={{ background:"var(--surface)", borderRadius:14, padding:"18px 22px", border:"1px solid #22c55e30", display:"flex", alignItems:"center", gap:16 }}>
          <span style={{ fontSize:24 }}>✅</span>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>Active Subscription — {(sub.subscription.planId||"pro").charAt(0).toUpperCase()+(sub.subscription.planId||"pro").slice(1)} Plan</div>
            <div style={{ fontSize:11, color:"var(--text-dim)" }}>Started {sub.subscription.startedAt ? new Date(sub.subscription.startedAt).toLocaleDateString() : "—"} · Status: {sub.subscription.status}</div>
          </div>
          <button onClick={openPortal} style={{ marginLeft:"auto", padding:"8px 18px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", color:"var(--text-muted)", fontSize:12, fontWeight:600, cursor:"pointer" }}>
            Manage →
          </button>
        </div>
      )}

      {/* Setup guide */}
      <div style={{ background:"var(--surface)", borderRadius:14, padding:"20px 24px", border:"1px solid var(--border)" }}>
        <div style={{ fontSize:12, fontWeight:700, color:"var(--text)", marginBottom:14 }}>🔧 Payment Setup — 3 steps</div>
        {[
          { n:1, title:"Create a Stripe account", desc:"Sign up at stripe.com → create a product with two prices (Pro $29/mo, Enterprise $99/mo)" },
          { n:2, title:"Add keys to .env", desc:"STRIPE_SECRET_KEY=sk_live_... · STRIPE_PRICE_PRO=price_... · STRIPE_PRICE_ENTERPRISE=price_... · STRIPE_WEBHOOK_SECRET=whsec_..." },
          { n:3, title:"Add webhook endpoint", desc:"In Stripe dashboard → Webhooks → add https://yourdomain.com/api/billing/webhook → events: checkout.session.completed, customer.subscription.deleted" },
        ].map(s => (
          <div key={s.n} style={{ display:"flex", gap:14, marginBottom:14, alignItems:"flex-start" }}>
            <div style={{ width:26, height:26, borderRadius:"50%", background:"linear-gradient(135deg,#6366f1,#a855f7)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:"#fff", flexShrink:0 }}>{s.n}</div>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:"var(--text)", marginBottom:2 }}>{s.title}</div>
              <div style={{ fontSize:11, color:"var(--text-dim)", lineHeight:1.55 }}>{s.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const d = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      }).then(r => r.json());
      if (d.ok && d.token) {
        localStorage.setItem("applyai_token", d.token);
        onLogin(d.token);
      } else {
        setError(d.message || "Invalid credentials");
      }
    } catch {
      setError("Cannot reach server — make sure it is running");
    }
    setLoading(false);
  };

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        html, body, #root { height:100%; }
        body { background:#08080f; color:#f0f0ff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:none; } }
        @keyframes orb1 { 0%,100% { transform:translate(0,0) scale(1); } 50% { transform:translate(40px,-30px) scale(1.1); } }
        @keyframes orb2 { 0%,100% { transform:translate(0,0) scale(1); } 50% { transform:translate(-30px,40px) scale(1.08); } }
        @keyframes spin  { to { transform:rotate(360deg); } }
        .login-input {
          width:100%; background:#0f0f1c; border:1px solid #2a2a42;
          border-radius:10px; padding:13px 14px; color:#f0f0ff; font-size:14px;
          outline:none; transition:border-color .2s, box-shadow .2s;
        }
        .login-input:focus { border-color:#6366f1; box-shadow:0 0 0 3px #6366f120; }
        .login-btn {
          width:100%; padding:14px; border-radius:10px; border:none;
          background:linear-gradient(135deg,#6366f1,#a855f7);
          color:#fff; font-size:14px; font-weight:700; cursor:pointer;
          transition:opacity .15s, transform .1s;
          letter-spacing:.3px;
        }
        .login-btn:hover:not(:disabled) { opacity:.92; transform:translateY(-1px); }
        .login-btn:active { transform:translateY(0); }
        .login-btn:disabled { opacity:.5; cursor:not-allowed; }
      `}</style>

      {/* Full-page bg */}
      <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", position:"relative", overflow:"hidden", background:"#08080f" }}>

        {/* Ambient orbs */}
        <div style={{ position:"absolute", width:600, height:600, borderRadius:"50%", background:"radial-gradient(circle,#6366f115 0%,transparent 70%)", top:"-20%", left:"-10%", animation:"orb1 12s ease-in-out infinite", pointerEvents:"none" }}/>
        <div style={{ position:"absolute", width:500, height:500, borderRadius:"50%", background:"radial-gradient(circle,#a855f712 0%,transparent 70%)", bottom:"-15%", right:"-8%", animation:"orb2 15s ease-in-out infinite", pointerEvents:"none" }}/>

        {/* Grid overlay */}
        <div style={{ position:"absolute", inset:0, backgroundImage:"linear-gradient(#6366f108 1px,transparent 1px),linear-gradient(90deg,#6366f108 1px,transparent 1px)", backgroundSize:"48px 48px", pointerEvents:"none" }}/>

        {/* Card */}
        <div style={{ width:420, animation:"fadeUp .35s ease", position:"relative", zIndex:1 }}>
          <div style={{ background:"rgba(15,15,28,0.95)", border:"1px solid #2a2a42", borderRadius:22, padding:"40px 36px", backdropFilter:"blur(20px)", boxShadow:"0 32px 80px rgba(0,0,0,.6)" }}>

            {/* Logo */}
            <div style={{ textAlign:"center", marginBottom:32 }}>
              <div style={{
                width:60, height:60, borderRadius:18, margin:"0 auto 14px",
                background:"linear-gradient(135deg,#6366f1,#a855f7)",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:28, boxShadow:"0 8px 24px #6366f140",
              }}>⚡</div>
              <div style={{ fontSize:24, fontWeight:900, letterSpacing:-.5, color:"#f0f0ff" }}>ApplyAI</div>
              <div style={{ fontSize:13, color:"#50506a", marginTop:5 }}>Your automated job search command center</div>
            </div>

            {/* Feature chips */}
            <div style={{ display:"flex", gap:8, justifyContent:"center", marginBottom:28, flexWrap:"wrap" }}>
              {["🔍 AI Scoring","🤖 Auto Apply","📊 Pipeline","💳 Billing"].map(f => (
                <span key={f} style={{ fontSize:11, fontWeight:600, color:"#818cf8", background:"#6366f112", border:"1px solid #6366f125", borderRadius:20, padding:"4px 10px" }}>{f}</span>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div>
                <label style={{ display:"block", fontSize:11, color:"#50506a", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em", marginBottom:6 }}>Username</label>
                <input
                  className="login-input"
                  type="text"
                  placeholder="admin"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoFocus
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <label style={{ display:"block", fontSize:11, color:"#50506a", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em", marginBottom:6 }}>Password</label>
                <div style={{ position:"relative" }}>
                  <input
                    className="login-input"
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    style={{ paddingRight:44 }}
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)} style={{
                    position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                    background:"none", border:"none", color:"#50506a", cursor:"pointer", fontSize:16, lineHeight:1,
                  }}>{showPass ? "🙈" : "👁"}</button>
                </div>
              </div>

              {error && (
                <div style={{ background:"#ef444412", border:"1px solid #ef444430", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#f87171", display:"flex", alignItems:"center", gap:8 }}>
                  <span>⚠</span>{error}
                </div>
              )}

              <button className="login-btn" type="submit" disabled={loading} style={{ marginTop:4 }}>
                {loading
                  ? <span style={{ display:"inline-flex", alignItems:"center", gap:8 }}>
                      <span style={{ width:14, height:14, border:"2px solid #ffffff40", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .7s linear infinite", display:"inline-block" }}/>
                      Signing in…
                    </span>
                  : "Sign in →"
                }
              </button>
            </form>

            {/* Footer */}
            <div style={{ marginTop:24, textAlign:"center", fontSize:11, color:"#383852", display:"flex", alignItems:"center", justifyContent:"center", gap:12 }}>
              <span>🔒 Secured</span>
              <span style={{ color:"#2a2a42" }}>·</span>
              <span>🏠 Data stays local</span>
              <span style={{ color:"#2a2a42" }}>·</span>
              <span>⚡ ApplyAI</span>
            </div>
          </div>

          {/* Version hint */}
          <div style={{ textAlign:"center", marginTop:14, fontSize:11, color:"#2a2a42" }}>
            Default: <code style={{ color:"#383852" }}>admin</code> / <code style={{ color:"#383852" }}>applyai2024</code> — change in <code style={{ color:"#383852" }}>.env</code>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const [authed, setAuthed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("applyai_token");
    if (!token) { setAuthChecked(true); return; }
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.ok) setAuthed(true); else localStorage.removeItem("applyai_token"); })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  const handleLogin  = (token) => { setAuthed(true); };
  const handleLogout = () => { localStorage.removeItem("applyai_token"); setAuthed(false); };

  // ── App state ───────────────────────────────────────────────────────────────
  const [tab, setTab]                       = useState("dashboard");
  const [foundJobs, setFoundJobs]           = useState([]);
  const [jobSearch, setJobSearch]           = useState("");
  const [sortBy, setSortBy]                 = useState("score");
  const [minScore, setMinScore]             = useState(0);
  const [filterPlatform, setFilterPlatform] = useState("All");
  const [filterLocation, setFilterLocation] = useState("All");
  const [filterEasyApply, setFilterEasyApply] = useState(false);
  const [copiedId, setCopiedId]             = useState(null);
  const [isRunning, setIsRunning]           = useState(false);
  const [stats, setStats]                   = useState({ applied:0, found:0, skipped:0, errors:0 });
  const [applications, setApplications]     = useState([]);
  const [logs, setLogs]                     = useState([]);
  const [settings, setSettings]             = useState(null);
  const [settingsForm, setSettingsForm]     = useState(null);
  const [loading, setLoading]               = useState(false);
  const [toast, setToast]                   = useState(null);
  const [selectedJob, setSelectedJob]       = useState(null);
  const [atsCompanies, setAtsCompanies]     = useState(null);
  const [pipeline, setPipeline]             = useState({});
  const [talkingPoints, setTalkingPoints]   = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const logsEndRef = useRef(null);

  const showToast = (msg, type="success") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const d = await apiFetch(`${API}/status`).then(r => r.json());
      setIsRunning(d.isRunning); setStats(d.stats); setSettings(d.settings);
      setSettingsForm(p => p ?? d.settings);
    } catch {}
  }, []);

  const fetchApplications = useCallback(async () => {
    try {
      const d = await apiFetch(`${API}/applications?limit=500`).then(r => r.json());
      setApplications(d.items || []);
    } catch {}
  }, []);

  const fetchLogs = useCallback(async () => {
    try { setLogs(await apiFetch(`${API}/logs?limit=200`).then(r => r.json())); } catch {}
  }, []);

  const fetchFoundJobs = useCallback(async (q="") => {
    try {
      const d = await apiFetch(`${API}/jobs?limit=500${q?`&q=${encodeURIComponent(q)}`:"" }`).then(r => r.json());
      setFoundJobs(d.items || []);
    } catch {}
  }, []);

  const fetchPipeline = useCallback(async () => {
    try {
      const d = await apiFetch(`${API}/pipeline`).then(r => r.json());
      setPipeline(d.stages || {});
    } catch {}
  }, []);

  useEffect(() => {
    if (!authed) return;
    apiFetch(`${API}/ats-companies`).then(r => r.json()).then(setAtsCompanies).catch(() => {});
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    fetchStatus(); fetchApplications(); fetchLogs(); fetchFoundJobs(); fetchPipeline();
    const iv = setInterval(() => {
      fetchStatus(); fetchApplications(); fetchLogs(); fetchFoundJobs(jobSearch); fetchPipeline();
    }, 5000);
    return () => clearInterval(iv);
  }, [authed, fetchStatus, fetchApplications, fetchLogs, fetchFoundJobs, fetchPipeline, jobSearch]);

  useEffect(() => {
    if (tab === "logs") logsEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [logs, tab]);

  const uniqueLocations = useMemo(() => {
    const locs = [...new Set(foundJobs.map(j => j.location).filter(Boolean))].sort();
    return ["All", ...locs];
  }, [foundJobs]);

  const uniquePlatforms = useMemo(() => {
    const plats = [...new Set(foundJobs.map(j => j.platform).filter(Boolean))].sort();
    return ["All", ...plats];
  }, [foundJobs]);

  const displayedJobs = useMemo(() => {
    let jobs = [...foundJobs];
    if (jobSearch) {
      const q = jobSearch.toLowerCase();
      jobs = jobs.filter(j => `${j.title} ${j.company} ${j.location} ${j.platform}`.toLowerCase().includes(q));
    }
    if (minScore > 0) jobs = jobs.filter(j => (j.score||0) >= minScore);
    if (filterPlatform !== "All") jobs = jobs.filter(j => j.platform === filterPlatform);
    if (filterLocation !== "All") jobs = jobs.filter(j => j.location === filterLocation);
    if (filterEasyApply) jobs = jobs.filter(j => j.easyApply);
    jobs.sort((a,b) => {
      if (sortBy==="score")    return (b.score||0)-(a.score||0);
      if (sortBy==="date")     return new Date(b.savedAt)-new Date(a.savedAt);
      if (sortBy==="company")  return (a.company||"").localeCompare(b.company||"");
      if (sortBy==="platform") return (a.platform||"").localeCompare(b.platform||"");
      return 0;
    });
    return jobs;
  }, [foundJobs, jobSearch, minScore, filterPlatform, filterLocation, filterEasyApply, sortBy]);

  const hotJobs = useMemo(() => foundJobs.filter(j => j.score >= 3.5).slice(0, 6), [foundJobs]);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text).then(() => { setCopiedId(id); setTimeout(() => setCopiedId(null), 1500); });
  };

  const toggleAutomation = async () => {
    setLoading(true);
    try {
      const d = await apiFetch(`${API}/${isRunning?"stop":"start"}`, { method:"POST" }).then(r => r.json());
      if (d.ok) { setIsRunning(!isRunning); showToast(isRunning ? "Stopped" : "Scanner started!"); }
      else showToast(d.message||"Failed","error");
    } catch { showToast("Cannot reach server","error"); }
    setLoading(false);
  };

  const handleApplyNow = async (job) => {
    setSelectedJob(null);
    showToast(`Auto-applying to ${job.title}…`);
    try { await apiFetch(`${API}/apply/${job.id}`, { method:"POST" }); showToast("Auto-apply started!"); }
    catch { showToast("Failed","error"); }
  };

  const saveSettings = async () => {
    try {
      const d = await apiFetch(`${API}/settings`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(settingsForm),
      }).then(r => r.json());
      if (d.ok) { setSettings(d.settings); showToast("Settings saved"); }
    } catch { showToast("Failed","error"); }
  };

  const deleteApplication = async (id) => {
    await apiFetch(`${API}/applications/${id}`, { method:"DELETE" });
    setApplications(p => p.filter(a => a.id !== id));
  };

  const updateStage = async (id, stage) => {
    try {
      await apiFetch(`${API}/applications/${id}/stage`, {
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ stage }),
      });
      setApplications(prev => prev.map(a => a.id===id ? {...a, status:stage} : a));
      fetchPipeline();
      showToast(`→ ${stage}`);
    } catch { showToast("Failed","error"); }
  };

  const fetchTalkingPoints = async (job) => {
    try {
      const d = await apiFetch(`${API}/generate-answers`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ job }),
      }).then(r => r.json());
      setTalkingPoints({ ...d, jobTitle:job.title, company:job.company });
    } catch { showToast("Could not generate report","error"); }
  };

  const platformCounts = applications.reduce((acc,a) => { acc[a.platform]=(acc[a.platform]||0)+1; return acc; }, {});
  const statusCounts   = applications.reduce((acc,a) => { acc[a.status]  =(acc[a.status]  ||0)+1; return acc; }, {});

  const funnelData = {
    found:   stats.found,
    queued:  statusCounts["queued-manual"] || 0,
    applied: applications.length,
    inter:   statusCounts["interviewing"]  || 0,
    offered: statusCounts["offered"]       || 0,
  };

  // ── Auth gate ───────────────────────────────────────────────────────────────
  if (!authChecked) return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#08080f", gap:16 }}>
      <div style={{ width:44, height:44, border:"3px solid #2a2a42", borderTopColor:"#6366f1", borderRadius:"50%", animation:"spin .7s linear infinite" }}/>
      <span style={{ color:"#50506a", fontSize:13, fontFamily:"system-ui" }}>Loading ApplyAI…</span>
      <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        body { background:#08080f; }
      `}</style>
    </div>
  );
  if (!authed) return <LoginPage onLogin={handleLogin}/>;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        :root {
          --bg:       #08080f;
          --surface:  #0f0f1c;
          --surface2: #161626;
          --surface3: #1e1e32;
          --border:   #2a2a42;
          --text:     #f0f0ff;
          --text-muted: #8888aa;
          --text-dim:   #50506a;
          --indigo:   #6366f1;
          --green:    #22c55e;
          --amber:    #f59e0b;
          --red:      #ef4444;
        }
        html, body, #root { height:100%; }
        body { background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:var(--border); border-radius:4px; }
        .fc input,.fc textarea,.fc select {
          width:100%; background:var(--bg); border:1px solid var(--border);
          border-radius:8px; padding:9px 12px; color:var(--text); font-size:13px;
          outline:none; resize:vertical; transition:border-color .15s;
        }
        .fc input:focus,.fc textarea:focus,.fc select:focus { border-color:var(--indigo); }
        .nav-btn {
          display:flex; align-items:center; gap:10px; padding:9px 12px;
          border-radius:9px; border:none; background:transparent; color:var(--text-dim);
          font-size:13px; font-weight:500; cursor:pointer; width:100%; text-align:left;
          transition:all .12s; position:relative; white-space:nowrap;
        }
        .nav-btn:hover { background:var(--surface2); color:var(--text-muted); }
        .nav-btn.active { background:#6366f118; color:var(--text); }
        .nav-btn.active::after {
          content:''; position:absolute; left:0; top:6px; bottom:6px;
          width:3px; background:var(--indigo); border-radius:0 3px 3px 0;
        }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
        @keyframes pulse  { 0%,100% { opacity:1; } 50% { opacity:.3; } }
        @keyframes spin   { to { transform:rotate(360deg); } }
        .card-anim { animation:fadeUp .2s ease; }
      `}</style>

      <div style={{ display:"flex", height:"100vh", overflow:"hidden" }}>

        {/* ══ SIDEBAR ═══════════════════════════════════════════════════════════ */}
        <aside style={{
          width: sidebarCollapsed ? 60 : 228, flexShrink:0,
          background:"var(--bg)", borderRight:"1px solid var(--border)",
          display:"flex", flexDirection:"column", height:"100vh",
          transition:"width .2s cubic-bezier(.4,0,.2,1)", overflow:"hidden",
        }}>
          {/* Brand */}
          <div style={{
            padding: sidebarCollapsed ? "18px 0" : "20px 16px 16px",
            borderBottom:"1px solid var(--border)",
            display:"flex", alignItems:"center",
            justifyContent: sidebarCollapsed ? "center" : "space-between",
          }}>
            {!sidebarCollapsed && (
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{
                  width:34, height:34, borderRadius:10, flexShrink:0,
                  background:"linear-gradient(135deg,#6366f1,#a855f7)",
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:18,
                }}>⚡</div>
                <div>
                  <div style={{ fontWeight:800, fontSize:15, letterSpacing:-.3 }}>OneTouch</div>
                  <div style={{ fontSize:10, color:"var(--text-dim)", marginTop:1 }}>Apply in one click</div>
                </div>
              </div>
            )}
            {sidebarCollapsed && (
              <div style={{ width:32, height:32, borderRadius:9, background:"linear-gradient(135deg,#6366f1,#a855f7)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>⚡</div>
            )}
            <button onClick={() => setSidebarCollapsed(v => !v)} style={{
              background:"none", border:"none", color:"var(--text-dim)", cursor:"pointer",
              fontSize:16, padding:4, borderRadius:6, lineHeight:1,
            }}>{sidebarCollapsed ? "›" : "‹"}</button>
          </div>

          {/* Nav */}
          <nav style={{ flex:1, padding:"12px 8px", display:"flex", flexDirection:"column", gap:2, overflowY:"auto" }}>
            {!sidebarCollapsed && <div style={{ fontSize:10, color:"var(--text-dim)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", padding:"6px 8px 4px" }}>Overview</div>}
            {NAV.slice(0,2).map(item => (
              <button key={item.id} className={`nav-btn${tab===item.id?" active":""}`} onClick={() => setTab(item.id)}
                title={sidebarCollapsed ? item.label : ""}>
                <span style={{ fontSize:16, flexShrink:0 }}>{item.icon}</span>
                {!sidebarCollapsed && <span>{item.label}</span>}
                {!sidebarCollapsed && item.id==="pipeline" && (
                  <span style={{ marginLeft:"auto", background:"#6366f120", color:"var(--indigo)", borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:700 }}>
                    {applications.length}
                  </span>
                )}
              </button>
            ))}

            {!sidebarCollapsed && <div style={{ fontSize:10, color:"var(--text-dim)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", padding:"10px 8px 4px" }}>Jobs</div>}
            {NAV.slice(2,5).map(item => (
              <button key={item.id} className={`nav-btn${tab===item.id?" active":""}`} onClick={() => setTab(item.id)}
                title={sidebarCollapsed ? item.label : ""}>
                <span style={{ fontSize:16, flexShrink:0 }}>{item.icon}</span>
                {!sidebarCollapsed && <span>{item.label}</span>}
                {!sidebarCollapsed && item.id==="jobs" && foundJobs.length > 0 && (
                  <span style={{ marginLeft:"auto", background:"#22c55e15", color:"#22c55e", borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:700 }}>
                    {foundJobs.length}
                  </span>
                )}
                {!sidebarCollapsed && item.id==="applications" && applications.length > 0 && (
                  <span style={{ marginLeft:"auto", background:"#6366f115", color:"var(--indigo)", borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:700 }}>
                    {applications.length}
                  </span>
                )}
                {!sidebarCollapsed && item.id==="agents" && (
                  <span style={{ marginLeft:"auto", background:"#6366f115", color:"var(--indigo)", borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:700 }}>
                    5
                  </span>
                )}
              </button>
            ))}

            {!sidebarCollapsed && <div style={{ fontSize:10, color:"var(--text-dim)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", padding:"10px 8px 4px" }}>System</div>}
            {NAV.slice(5).map(item => (
              <button key={item.id} className={`nav-btn${tab===item.id?" active":""}`} onClick={() => setTab(item.id)}
                title={sidebarCollapsed ? item.label : ""}>
                <span style={{ fontSize:16, flexShrink:0 }}>{item.icon}</span>
                {!sidebarCollapsed && <span>{item.label}</span>}
                {!sidebarCollapsed && item.id==="billing" && (
                  <span style={{ marginLeft:"auto", background:"#6366f115", color:"var(--indigo)", borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:700 }}>
                    PRO
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Bot status & profile */}
          <div style={{ borderTop:"1px solid var(--border)", padding: sidebarCollapsed ? "12px 0" : "14px 14px" }}>
            {!sidebarCollapsed && (() => {
              const prof = settings?.profile || {};
              const displayName = prof.name || "Your Name";
              const displayRole = (prof.targetRoles || "").split(",")[0].trim() || "Job Seeker";
              const completeness = profileCompleteness(prof);
              return (
                <div style={{ marginBottom:10 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                    <Avatar name={displayName} size={34}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"var(--text)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{displayName}</div>
                      <div style={{ fontSize:10, color:"var(--text-dim)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{displayRole}</div>
                    </div>
                  </div>
                  {/* Profile completeness bar */}
                  <div style={{ marginBottom:2, display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:9, color:"var(--text-dim)", textTransform:"uppercase", letterSpacing:"0.06em" }}>Profile</span>
                    <span style={{ fontSize:9, color: completeness === 100 ? "#22c55e" : "#f59e0b", fontWeight:700 }}>{completeness}%</span>
                  </div>
                  <div style={{ height:3, background:"var(--border)", borderRadius:4, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${completeness}%`, background: completeness === 100 ? "#22c55e" : "#6366f1", borderRadius:4, transition:"width 0.4s" }}/>
                  </div>
                  {completeness < 100 && <div onClick={() => setTab("settings")} style={{ fontSize:9, color:"#6366f1", cursor:"pointer", marginTop:3 }}>Complete profile →</div>}
                </div>
              );
            })()}
            {sidebarCollapsed && settings?.profile?.name && (
              <div style={{ display:"flex", justifyContent:"center" }}>
                <Avatar name={settings.profile.name} size={32}/>
              </div>
            )}
            <div style={{
              display:"flex", alignItems:"center", justifyContent: sidebarCollapsed ? "center" : "flex-start", gap:8,
              padding: sidebarCollapsed ? 0 : "8px 10px",
              background: isRunning ? "#22c55e10" : "transparent",
              borderRadius:8, border: isRunning ? "1px solid #22c55e20" : "none",
            }}>
              <span style={{
                width:8, height:8, borderRadius:"50%", flexShrink:0,
                background: isRunning ? "#22c55e" : "#50506a",
                animation: isRunning ? "pulse 2s ease infinite" : "none",
                boxShadow: isRunning ? "0 0 8px #22c55e" : "none",
              }}/>
              {!sidebarCollapsed && <span style={{ fontSize:11, color: isRunning ? "#22c55e" : "var(--text-dim)", fontWeight:600 }}>
                {isRunning ? "Scanner running" : "Stopped"}
              </span>}
            </div>
          </div>
        </aside>

        {/* ══ MAIN ══════════════════════════════════════════════════════════════ */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>

          {/* Header */}
          <header style={{
            height:58, flexShrink:0, background:"var(--bg)", borderBottom:"1px solid var(--border)",
            display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 24px", gap:16,
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <h1 style={{ fontSize:15, fontWeight:700, color:"var(--text)" }}>
                {NAV.find(n => n.id===tab)?.label || "Dashboard"}
              </h1>
              <span style={{ color:"var(--border)", fontSize:14 }}>·</span>
              <span style={{ fontSize:12, color:"var(--text-dim)" }}>
                <span style={{ color:"#6366f1", fontWeight:700 }}>{fmt(stats.found)}</span> found
                <span style={{ color:"var(--border)", margin:"0 6px" }}>|</span>
                <span style={{ color:"#22c55e", fontWeight:700 }}>{fmt(applications.length)}</span> tracked
              </span>
            </div>

            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <button onClick={toggleAutomation} disabled={loading} style={{
                padding:"8px 20px", borderRadius:8, border:"none", cursor: loading ? "not-allowed" : "pointer",
                fontWeight:700, fontSize:12, opacity: loading ? .6 : 1, letterSpacing:.3,
                background: isRunning ? "#ef444420" : "#22c55e20",
                color: isRunning ? "#ef4444" : "#22c55e",
                borderColor: isRunning ? "#ef444430" : "#22c55e30",
                borderStyle:"solid", borderWidth:1,
                transition:"all .15s",
              }}>
                {loading ? "…" : isRunning ? "⏹ Stop Scanner" : "▶ Start Scanner"}
              </button>
              <button onClick={handleLogout} title="Sign out" style={{
                padding:"8px 12px", borderRadius:8, border:"1px solid #2a2a42",
                background:"transparent", color:"#50506a", cursor:"pointer",
                fontSize:15, lineHeight:1, transition:"all .15s",
              }}
                onMouseEnter={e => { e.currentTarget.style.color="#ef4444"; e.currentTarget.style.borderColor="#ef444430"; }}
                onMouseLeave={e => { e.currentTarget.style.color="#50506a"; e.currentTarget.style.borderColor="#2a2a42"; }}
              >⏻</button>
            </div>
          </header>

          {/* Content */}
          <main style={{ flex:1, overflowY:"auto", padding:"24px" }}>

            {/* ── DASHBOARD ─────────────────────────────────────────────────── */}
            {tab==="dashboard" && (
              <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
                {/* Metric cards */}
                <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                  <MetricCard label="Jobs Found"   value={stats.found}   color="#6366f1" icon="🔍" sub={`${stats.skipped} filtered out`} bar barMax={stats.found+stats.skipped}/>
                  <MetricCard label="Applications" value={applications.length} color="#22c55e" icon="✓" sub="tracked in dashboard"/>
                  <MetricCard label="Simplify"     value={statusCounts["simplify-opened"]||0} color="#a855f7" icon="✨" sub="form pre-filled"/>
                  <MetricCard label="Hot Matches"  value={stats?.hotMatches ?? hotJobs.length} color="#f59e0b" icon="★" sub="score ≥ 3.5"/>
                  <MetricCard label="Errors"       value={stats.errors}  color="#ef4444" icon="⚠" sub="this session"/>
                </div>

                {/* Funnel + Platform */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:16 }}>
                  {/* Application funnel */}
                  <div style={{ background:"var(--surface)", borderRadius:16, padding:"22px 24px", border:"1px solid var(--border)" }}>
                    <div style={{ fontSize:11, color:"var(--text-dim)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:18 }}>
                      Application Funnel
                    </div>
                    <AppFunnel stages={funnelData}/>
                  </div>

                  {/* Platform breakdown */}
                  <div style={{ background:"var(--surface)", borderRadius:16, padding:"22px 24px", border:"1px solid var(--border)" }}>
                    <div style={{ fontSize:11, color:"var(--text-dim)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:18 }}>
                      By Platform
                    </div>
                    {Object.entries(platformCounts).length === 0 && (
                      <div style={{ color:"var(--text-dim)", fontSize:13 }}>No data yet</div>
                    )}
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      {Object.entries(platformCounts).slice(0,6).map(([platform, count]) => {
                        const m = Object.values(PLATFORM_META).find(p => p.label===platform) || { color:"#6366f1" };
                        return (
                          <div key={platform} style={{ display:"flex", alignItems:"center", gap:10 }}>
                            <div style={{ width:8, height:8, borderRadius:"50%", background:m.color, flexShrink:0 }}/>
                            <div style={{ flex:1, fontSize:12, color:"var(--text-muted)" }}>{platform}</div>
                            <div style={{ fontSize:13, fontWeight:700, color:m.color }}>{count}</div>
                          </div>
                        );
                      })}
                    </div>
                    {atsCompanies && (
                      <div style={{ marginTop:16, paddingTop:14, borderTop:"1px solid var(--border)", fontSize:11, color:"var(--text-dim)" }}>
                        🏢 ATS Direct · <span style={{ color:"#a855f7" }}>{atsCompanies.total} companies</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Hot matches */}
                {hotJobs.length > 0 && (
                  <div>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                      <div style={{ fontSize:11, color:"var(--text-dim)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em" }}>
                        ★ Hot Matches — Score 3.5+
                      </div>
                      <button onClick={() => setTab("jobs")} style={{
                        background:"none", border:"none", color:"var(--indigo)", fontSize:12, cursor:"pointer", fontWeight:600,
                      }}>View all {foundJobs.filter(j=>j.score>=3.5).length} →</button>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:14 }}>
                      {hotJobs.map(job => <HotJobCard key={job.id} job={job} onClick={() => setSelectedJob(job)}/>)}
                    </div>
                  </div>
                )}

                {/* Recent activity */}
                <div style={{ background:"var(--surface)", borderRadius:16, border:"1px solid var(--border)", overflow:"hidden" }}>
                  <div style={{ padding:"14px 22px", borderBottom:"1px solid var(--border)" }}>
                    <div style={{ fontSize:11, color:"var(--text-dim)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em" }}>
                      Recent Activity
                    </div>
                  </div>
                  <div style={{ padding:"8px 0" }}>
                    {logs.length===0 && <div style={{ padding:"20px 22px", color:"var(--text-dim)", fontSize:13 }}>No activity yet. Click ▶ Start Scanner.</div>}
                    {logs.slice(0,20).map(l => (
                      <div key={l.id} style={{
                        display:"flex", gap:12, padding:"8px 22px",
                        borderBottom:"1px solid var(--border)", alignItems:"center",
                      }}>
                        <div style={{
                          width:6, height:6, borderRadius:"50%", flexShrink:0,
                          background: LEVEL_COLOR[l.level] || "#6366f1",
                        }}/>
                        <span style={{ fontSize:11, color:"var(--text-dim)", whiteSpace:"nowrap", flexShrink:0, minWidth:60 }}>
                          {new Date(l.timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                        </span>
                        <span style={{ fontSize:12, color:"var(--text-muted)", flex:1 }}>{l.message}</span>
                        {l.detail && <span style={{ fontSize:11, color:"var(--text-dim)" }}>{l.detail}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── PIPELINE ──────────────────────────────────────────────────── */}
            {tab==="pipeline" && (
              <div>
                {talkingPoints && (
                  <div style={{
                    background:"var(--surface)", borderRadius:14, padding:20,
                    border:"1px solid #6366f130", marginBottom:20, position:"relative",
                    animation:"fadeUp .2s ease",
                  }}>
                    <button onClick={() => setTalkingPoints(null)} style={{
                      position:"absolute", top:14, right:14, background:"var(--surface2)",
                      border:"1px solid var(--border)", color:"var(--text-dim)",
                      borderRadius:6, cursor:"pointer", width:26, height:26, fontSize:12,
                    }}>✕</button>
                    <div style={{ fontSize:11, color:"var(--indigo)", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>
                      ⚡ Prep — {talkingPoints.jobTitle} @ {talkingPoints.company}
                    </div>
                    {talkingPoints.matchedSkills?.length > 0 && (
                      <div style={{ marginBottom:12 }}>
                        <div style={{ fontSize:10, color:"var(--text-dim)", marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>Matched Skills</div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          {talkingPoints.matchedSkills.map(s => (
                            <span key={s} style={{ background:"#22c55e15", color:"#22c55e", border:"1px solid #22c55e30", borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:600 }}>✓ {s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {talkingPoints.talkingPoints?.map((tp,i) => (
                      <div key={i} style={{ fontSize:12, color:"var(--text-muted)", padding:"5px 0", borderBottom:"1px solid var(--border)" }}>{tp}</div>
                    ))}
                    {talkingPoints.coverLetter && (
                      <details style={{ marginTop:10 }}>
                        <summary style={{ fontSize:12, color:"var(--indigo)", cursor:"pointer", fontWeight:600 }}>Generated cover letter ▾</summary>
                        <pre style={{
                          marginTop:10, background:"var(--bg)", borderRadius:8, padding:"12px 16px",
                          fontSize:12, color:"var(--text-muted)", whiteSpace:"pre-wrap",
                          lineHeight:1.7, border:"1px solid var(--border)",
                        }}>{talkingPoints.coverLetter}</pre>
                      </details>
                    )}
                  </div>
                )}

                <div style={{ display:"flex", gap:12, overflowX:"auto", paddingBottom:8, alignItems:"flex-start" }}>
                  {PIPELINE_STAGES.map(({ key, label, color, icon }) => {
                    const cards = pipeline[key] || [];
                    return (
                      <div key={key} style={{
                        minWidth:210, width:210, flexShrink:0,
                        background:"var(--surface)", borderRadius:14,
                        border:"1px solid var(--border)", display:"flex", flexDirection:"column",
                        maxHeight:"calc(100vh - 200px)",
                      }}>
                        <div style={{
                          padding:"12px 14px", borderBottom:`2px solid ${color}30`,
                          display:"flex", alignItems:"center", justifyContent:"space-between",
                        }}>
                          <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                            <span style={{ fontSize:13, color }}>{icon}</span>
                            <span style={{ fontSize:12, fontWeight:700, color }}>{label}</span>
                          </div>
                          <span style={{ background:color+"20", color, borderRadius:10, padding:"1px 8px", fontSize:11, fontWeight:700 }}>
                            {cards.length}
                          </span>
                        </div>
                        <div style={{ flex:1, overflowY:"auto", padding:"8px 8px", display:"flex", flexDirection:"column", gap:7 }}>
                          {cards.length===0 && (
                            <div style={{ color:"var(--text-dim)", fontSize:11, textAlign:"center", padding:"16px 0" }}>Empty</div>
                          )}
                          {cards.map(a => (
                            <div key={a.id} style={{
                              background:"var(--bg)", borderRadius:10, padding:"11px 12px",
                              border:"1px solid var(--border)", cursor:"pointer", animation:"fadeUp .15s ease",
                            }}
                              onClick={() => { setSelectedJob(a); fetchTalkingPoints(a); }}
                            >
                              <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:6 }}>
                                <Avatar name={a.company} size={26}/>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontSize:11, fontWeight:700, color:"var(--text)", lineHeight:1.35, marginBottom:1 }}>
                                    {a.title}
                                  </div>
                                  <div style={{ fontSize:10, color:"var(--text-dim)" }}>{a.company}</div>
                                </div>
                              </div>
                              {a.score != null && (
                                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                                  <div style={{ flex:1, height:3, background:"var(--border)", borderRadius:2 }}>
                                    <div style={{ height:"100%", width:`${(a.score/5)*100}%`, background:scoreColor(a.score), borderRadius:2 }}/>
                                  </div>
                                  <span style={{ fontSize:10, fontWeight:700, color:scoreColor(a.score) }}>★{a.score}</span>
                                </div>
                              )}
                              <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                                {PIPELINE_STAGES.filter(s=>s.key!==key).slice(0,2).map(s => (
                                  <button key={s.key} onClick={e => { e.stopPropagation(); updateStage(a.id, s.key); }}
                                    style={{
                                      background:s.color+"15", color:s.color, border:`1px solid ${s.color}30`,
                                      borderRadius:5, padding:"2px 7px", fontSize:10, fontWeight:600, cursor:"pointer",
                                    }}>
                                    → {s.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── JOBS ──────────────────────────────────────────────────────── */}
            {tab==="jobs" && (
              <div>
                {/* Search */}
                <div style={{
                  background:"var(--surface)", borderRadius:12, padding:"12px 16px",
                  border:"1px solid var(--border)", marginBottom:16,
                  display:"flex", alignItems:"center", gap:12,
                }}>
                  <span style={{ fontSize:16, color:"var(--text-dim)" }}>🔍</span>
                  <input
                    placeholder="Search jobs, companies, skills, locations…"
                    value={jobSearch}
                    onChange={e => { setJobSearch(e.target.value); fetchFoundJobs(e.target.value); }}
                    style={{
                      flex:1, background:"transparent", border:"none", color:"var(--text)",
                      fontSize:14, outline:"none",
                    }}
                  />
                  <span style={{ fontSize:12, color:"var(--text-dim)", whiteSpace:"nowrap" }}>
                    {displayedJobs.length} / {foundJobs.length}
                  </span>
                </div>

                {/* Controls row */}
                <div style={{ display:"flex", gap:8, marginBottom:12, alignItems:"center", flexWrap:"wrap" }}>
                  {/* Sort */}
                  <div style={{ display:"flex", gap:4, background:"var(--surface)", borderRadius:8, padding:3, border:"1px solid var(--border)" }}>
                    {[{k:"score",l:"★ Score"},{k:"date",l:"Newest"},{k:"company",l:"A–Z"},{k:"platform",l:"Platform"}].map(o => (
                      <button key={o.k} onClick={() => setSortBy(o.k)} style={{
                        padding:"5px 12px", borderRadius:6, border:"none", fontSize:11, fontWeight:600, cursor:"pointer",
                        background: sortBy===o.k ? "var(--indigo)" : "transparent",
                        color: sortBy===o.k ? "#fff" : "var(--text-dim)",
                        transition:"all .12s",
                      }}>{o.l}</button>
                    ))}
                  </div>

                  {/* Min score */}
                  <div style={{
                    display:"flex", alignItems:"center", gap:8, background:"var(--surface)",
                    borderRadius:8, padding:"5px 12px", border:"1px solid var(--border)",
                  }}>
                    <span style={{ fontSize:11, color:"var(--text-dim)" }}>Min ★</span>
                    <input type="range" min={0} max={5} step={0.5} value={minScore}
                      onChange={e => setMinScore(parseFloat(e.target.value))}
                      style={{ width:70, accentColor:"var(--indigo)" }}/>
                    <span style={{ fontSize:12, fontWeight:700, color:scoreColor(minScore), minWidth:18 }}>{minScore}</span>
                  </div>

                  <button onClick={() => setFilterEasyApply(v => !v)} style={{
                    padding:"6px 13px", borderRadius:8, border:`1px solid ${filterEasyApply?"#22c55e40":"var(--border)"}`,
                    background: filterEasyApply ? "#22c55e15" : "var(--surface)",
                    color: filterEasyApply ? "#22c55e" : "var(--text-dim)",
                    fontSize:11, fontWeight:600, cursor:"pointer",
                  }}>⚡ Easy Apply only</button>
                </div>

                {/* Platform chips */}
                <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
                  {["All", ...uniquePlatforms.filter(p => p!=="All")].map(p => {
                    const m = Object.values(PLATFORM_META).find(pm => pm.label===p);
                    const active = filterPlatform===p;
                    return (
                      <button key={p} onClick={() => setFilterPlatform(p)} style={{
                        padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:600, cursor:"pointer",
                        border:`1px solid ${active ? (m?.color||"var(--indigo)")+"60" : "var(--border)"}`,
                        background: active ? (m?.color||"var(--indigo)")+"15" : "transparent",
                        color: active ? (m?.color||"var(--indigo)") : "var(--text-dim)",
                      }}>{p}</button>
                    );
                  })}
                </div>

                {/* ATS bar */}
                {atsCompanies && (
                  <div style={{
                    background:"#a855f710", border:"1px solid #a855f725", borderRadius:9,
                    padding:"9px 16px", marginBottom:14, fontSize:12,
                    display:"flex", gap:16, alignItems:"center", flexWrap:"wrap",
                  }}>
                    <span style={{ color:"#a855f7", fontWeight:700 }}>🏢 ATS Direct · {atsCompanies.total} companies</span>
                    <span style={{ color:"var(--text-dim)" }}>Greenhouse ({atsCompanies.greenhouse?.length})</span>
                    <span style={{ color:"var(--text-dim)" }}>Lever ({atsCompanies.lever?.length})</span>
                    <span style={{ color:"var(--text-dim)" }}>Ashby ({atsCompanies.ashby?.length})</span>
                  </div>
                )}

                {displayedJobs.length===0 && (
                  <div style={{
                    background:"var(--surface)", borderRadius:14, padding:48,
                    textAlign:"center", color:"var(--text-dim)", border:"1px solid var(--border)",
                  }}>
                    {foundJobs.length===0 ? "No jobs yet — click ▶ Start Scanner" : "No matches — adjust filters"}
                  </div>
                )}

                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {displayedJobs.map(job => (
                    <JobCard key={job.id} job={job} onDetails={setSelectedJob}
                      onCopy={copyToClipboard} copiedId={copiedId}/>
                  ))}
                </div>
              </div>
            )}

            {/* ── APPLICATIONS ──────────────────────────────────────────────── */}
            {tab==="applications" && (
              <div>
                {/* Summary pills */}
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
                  {Object.entries(statusCounts).map(([s, c]) => {
                    const m = STATUS_META[s];
                    return m ? (
                      <div key={s} style={{
                        display:"flex", alignItems:"center", gap:6,
                        background:m.color+"10", border:`1px solid ${m.color}25`,
                        borderRadius:8, padding:"6px 14px",
                      }}>
                        <span style={{ width:7, height:7, borderRadius:"50%", background:m.color }}/>
                        <span style={{ fontSize:13, fontWeight:700, color:m.color }}>{c}</span>
                        <span style={{ fontSize:11, color:m.color, opacity:.8 }}>{m.label}</span>
                      </div>
                    ) : null;
                  })}
                </div>

                <div style={{ background:"var(--surface)", borderRadius:16, border:"1px solid var(--border)", overflow:"hidden" }}>
                  <div style={{
                    padding:"12px 20px", borderBottom:"1px solid var(--border)",
                    display:"flex", justifyContent:"space-between", alignItems:"center",
                    background:"var(--surface)", position:"sticky", top:0, zIndex:10,
                  }}>
                    <span style={{ fontSize:13, fontWeight:700, color:"var(--text-muted)" }}>
                      {applications.length} Application{applications.length!==1?"s":""}
                    </span>
                  </div>

                  {applications.length===0 && <p style={{ color:"var(--text-dim)", fontSize:13, padding:"28px 20px" }}>No applications yet.</p>}

                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"var(--bg)" }}>
                          {["","Title","Company","Platform","Score","Status","Applied",""].map((h,i) => (
                            <th key={i} style={{
                              padding:"10px 14px", textAlign:"left", fontSize:10,
                              color:"var(--text-dim)", fontWeight:700, textTransform:"uppercase",
                              letterSpacing:0.8, borderBottom:"1px solid var(--border)", whiteSpace:"nowrap",
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {applications.map(a => (
                          <tr key={a.id} style={{ borderBottom:"1px solid var(--border)", transition:"background .1s" }}
                            onMouseEnter={e => e.currentTarget.style.background="var(--surface2)"}
                            onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                            <td style={{ padding:"10px 14px" }}><Avatar name={a.company} size={30}/></td>
                            <td style={{ padding:"10px 14px" }}>
                              <button onClick={() => setSelectedJob(a)} style={{
                                background:"none", border:"none", color:"var(--text)", fontWeight:600,
                                cursor:"pointer", fontSize:13, textAlign:"left", padding:0,
                              }}
                                onMouseEnter={e => e.currentTarget.style.color="var(--indigo)"}
                                onMouseLeave={e => e.currentTarget.style.color="var(--text)"}
                              >{a.title}</button>
                            </td>
                            <td style={{ padding:"10px 14px", fontSize:13, color:"var(--text-muted)" }}>{a.company}</td>
                            <td style={{ padding:"10px 14px" }}><PlatformTag platform={a.platform}/></td>
                            <td style={{ padding:"10px 14px" }}>
                              {a.score != null && (
                                <span style={{ fontSize:12, fontWeight:700, color:scoreColor(a.score) }}>★ {a.score}</span>
                              )}
                            </td>
                            <td style={{ padding:"10px 14px" }}><StatusPill status={a.status}/></td>
                            <td style={{ padding:"10px 14px", fontSize:11, color:"var(--text-dim)", whiteSpace:"nowrap" }}>
                              {a.postedAt ? new Date(a.postedAt).toLocaleDateString() : "—"}
                            </td>
                            <td style={{ padding:"10px 14px" }}>
                              <button onClick={() => deleteApplication(a.id)} style={{
                                background:"none", border:"none", color:"var(--text-dim)",
                                cursor:"pointer", fontSize:14, borderRadius:4, padding:"3px 6px",
                              }}
                                onMouseEnter={e => e.currentTarget.style.color="#ef4444"}
                                onMouseLeave={e => e.currentTarget.style.color="var(--text-dim)"}
                              >✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── AGENTS ────────────────────────────────────────────────────── */}
            {tab==="agents" && <AgentsTab showToast={showToast}/>}

            {/* ── ARCHITECTURE ──────────────────────────────────────────────── */}
            {tab==="architecture" && <ArchDiagram/>}

            {/* ── BILLING ───────────────────────────────────────────────────── */}
            {tab==="billing" && <BillingTab showToast={showToast}/>}

            {/* ── SETTINGS ──────────────────────────────────────────────────── */}
            {tab==="settings" && settingsForm && (
              <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                {/* User Profile */}
                <div style={{ background:"var(--surface)", borderRadius:14, padding:22, border:"1px solid #6366f130" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
                    <Avatar name={settingsForm.profile?.name || "?"} size={44}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:15, fontWeight:800, color:"var(--text)" }}>{settingsForm.profile?.name || "Your Name"}</div>
                      <div style={{ fontSize:11, color:"var(--text-dim)" }}>{(settingsForm.profile?.targetRoles||"").split(",")[0]?.trim() || "Job Seeker"}</div>
                    </div>
                    {(() => {
                      const pct = profileCompleteness(settingsForm.profile||{});
                      return <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:11, color:pct===100?"#22c55e":"#f59e0b", fontWeight:700 }}>{pct}% complete</span>
                        <div style={{ width:70, height:5, background:"var(--border)", borderRadius:3, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${pct}%`, background:pct===100?"#22c55e":"#6366f1", borderRadius:3 }}/>
                        </div>
                      </div>;
                    })()}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:12 }}>
                    <Field label="Full Name">
                      <input value={settingsForm.profile?.name||""} placeholder="Jane Smith"
                        onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,name:e.target.value}}))}/>
                    </Field>
                    <Field label="Email">
                      <input type="email" value={settingsForm.profile?.email||""} placeholder="jane@email.com"
                        onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,email:e.target.value}}))}/>
                    </Field>
                    <Field label="Phone">
                      <input value={settingsForm.profile?.phone||""} placeholder="+1 555 000 0000"
                        onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,phone:e.target.value}}))}/>
                    </Field>
                    <Field label="Location">
                      <input value={settingsForm.profile?.location||""} placeholder="San Francisco, CA"
                        onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,location:e.target.value}}))}/>
                    </Field>
                    <Field label="Years Experience">
                      <input type="number" min={0} max={40} value={settingsForm.profile?.yearsExperience||""}
                        onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,yearsExperience:e.target.value}}))}/>
                    </Field>
                    <Field label="School">
                      <input value={settingsForm.profile?.school||""} placeholder="MIT, Stanford…"
                        onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,school:e.target.value}}))}/>
                    </Field>
                  </div>
                  <Field label="Target Roles (comma-separated)">
                    <input value={settingsForm.profile?.targetRoles||""} placeholder="Data Scientist, ML Engineer"
                      onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,targetRoles:e.target.value}}))}/>
                  </Field>
                  <Field label="Skills (comma-separated — powers AI scorer)">
                    <textarea rows={3}
                      value={Array.isArray(settingsForm.profile?.skills)?settingsForm.profile.skills.join(", "):(settingsForm.profile?.skills||"")}
                      placeholder="Python, SQL, PyTorch, AWS, LLM…"
                      onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,skills:e.target.value}}))}
                      onBlur={e=>setSettingsForm(f=>({...f,profile:{...f.profile,skills:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)}}))}/>
                  </Field>
                  <Field label="Professional Summary">
                    <textarea rows={3} value={settingsForm.profile?.summary||""} placeholder="Results-driven engineer with 5+ years…"
                      onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,summary:e.target.value}}))}/>
                  </Field>

                  {/* ── EDUCATION ─────────────────────────────────────────── */}
                  <div style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                      <label style={{ fontSize:11, color:"var(--text-dim)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em" }}>🎓 Education</label>
                      <button onClick={() => setSettingsForm(f => {
                        const edu = [...(f.profile?.education || []), { school:"", degree:"", major:"", startYear:"", endYear:"", gpa:"", current:false }];
                        return {...f, profile:{...f.profile, education: edu}};
                      })} style={{ fontSize:11, fontWeight:700, color:"var(--indigo)", background:"#6366f112", border:"1px solid #6366f130", borderRadius:6, padding:"4px 10px", cursor:"pointer" }}>+ Add</button>
                    </div>
                    {(settingsForm.profile?.education||[]).map((edu, i) => (
                      <div key={i} style={{ background:"var(--bg)", borderRadius:10, padding:14, border:"1px solid var(--border)", marginBottom:10, position:"relative" }}>
                        <button onClick={() => setSettingsForm(f => {
                          const arr = [...(f.profile?.education||[])]; arr.splice(i,1);
                          return {...f, profile:{...f.profile, education:arr}};
                        })} style={{ position:"absolute", top:10, right:10, background:"none", border:"none", color:"#50506a", cursor:"pointer", fontSize:14, lineHeight:1 }}
                          onMouseEnter={e=>e.currentTarget.style.color="#ef4444"}
                          onMouseLeave={e=>e.currentTarget.style.color="#50506a"}>✕</button>
                        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:10, marginBottom:8 }}>
                          <div className="fc"><label style={{fontSize:10,color:"var(--text-dim)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:4}}>School</label>
                            <input value={edu.school||""} placeholder="MIT, Stanford…" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.education||[])];a[i]={...a[i],school:e.target.value};return{...f,profile:{...f.profile,education:a}};})}/>
                          </div>
                          <div className="fc"><label style={{fontSize:10,color:"var(--text-dim)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:4}}>Start Year</label>
                            <input value={edu.startYear||""} placeholder="2018" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.education||[])];a[i]={...a[i],startYear:e.target.value};return{...f,profile:{...f.profile,education:a}};})}/>
                          </div>
                          <div className="fc"><label style={{fontSize:10,color:"var(--text-dim)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:4}}>End Year</label>
                            <input value={edu.endYear||""} placeholder="2022 or Present" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.education||[])];a[i]={...a[i],endYear:e.target.value};return{...f,profile:{...f.profile,education:a}};})}/>
                          </div>
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                          <div className="fc"><label style={{fontSize:10,color:"var(--text-dim)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:4}}>Degree</label>
                            <input value={edu.degree||""} placeholder="B.S., M.S., Ph.D." onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.education||[])];a[i]={...a[i],degree:e.target.value};return{...f,profile:{...f.profile,education:a}};})}/>
                          </div>
                          <div className="fc"><label style={{fontSize:10,color:"var(--text-dim)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:4}}>Major / Field</label>
                            <input value={edu.major||""} placeholder="Computer Science" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.education||[])];a[i]={...a[i],major:e.target.value};return{...f,profile:{...f.profile,education:a}};})}/>
                          </div>
                          <div className="fc"><label style={{fontSize:10,color:"var(--text-dim)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:4}}>GPA (optional)</label>
                            <input value={edu.gpa||""} placeholder="3.9 / 4.0" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.education||[])];a[i]={...a[i],gpa:e.target.value};return{...f,profile:{...f.profile,education:a}};})}/>
                          </div>
                        </div>
                      </div>
                    ))}
                    {!(settingsForm.profile?.education||[]).length && (
                      <div style={{ fontSize:12, color:"var(--text-dim)", padding:"10px 14px", background:"var(--bg)", borderRadius:8, border:"1px dashed var(--border)", textAlign:"center" }}>No education added — click + Add</div>
                    )}
                  </div>

                  {/* ── EXPERIENCE ────────────────────────────────────────── */}
                  <div style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                      <label style={{ fontSize:11, color:"var(--text-dim)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em" }}>💼 Work Experience</label>
                      <button onClick={() => setSettingsForm(f => {
                        const exp = [...(f.profile?.experiences || []), { company:"", title:"", startDate:"", endDate:"", current:false, description:"" }];
                        return {...f, profile:{...f.profile, experiences: exp}};
                      })} style={{ fontSize:11, fontWeight:700, color:"var(--indigo)", background:"#6366f112", border:"1px solid #6366f130", borderRadius:6, padding:"4px 10px", cursor:"pointer" }}>+ Add</button>
                    </div>
                    {(settingsForm.profile?.experiences||[]).map((exp, i) => (
                      <div key={i} style={{ background:"var(--bg)", borderRadius:10, padding:14, border:"1px solid var(--border)", marginBottom:10, position:"relative" }}>
                        <button onClick={() => setSettingsForm(f => {
                          const arr = [...(f.profile?.experiences||[])]; arr.splice(i,1);
                          return {...f, profile:{...f.profile, experiences:arr}};
                        })} style={{ position:"absolute", top:10, right:10, background:"none", border:"none", color:"#50506a", cursor:"pointer", fontSize:14, lineHeight:1 }}
                          onMouseEnter={e=>e.currentTarget.style.color="#ef4444"}
                          onMouseLeave={e=>e.currentTarget.style.color="#50506a"}>✕</button>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:8 }}>
                          <div className="fc"><label style={{fontSize:10,color:"var(--text-dim)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:4}}>Company</label>
                            <input value={exp.company||""} placeholder="Amazon, Google…" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.experiences||[])];a[i]={...a[i],company:e.target.value};return{...f,profile:{...f.profile,experiences:a}};})}/>
                          </div>
                          <div className="fc"><label style={{fontSize:10,color:"var(--text-dim)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:4}}>Job Title</label>
                            <input value={exp.title||""} placeholder="Data Scientist" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.experiences||[])];a[i]={...a[i],title:e.target.value};return{...f,profile:{...f.profile,experiences:a}};})}/>
                          </div>
                          <div className="fc"><label style={{fontSize:10,color:"var(--text-dim)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:4}}>Start Date</label>
                            <input value={exp.startDate||""} placeholder="Jan 2021" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.experiences||[])];a[i]={...a[i],startDate:e.target.value};return{...f,profile:{...f.profile,experiences:a}};})}/>
                          </div>
                          <div className="fc"><label style={{fontSize:10,color:"var(--text-dim)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:4}}>End Date</label>
                            <input value={exp.endDate||""} placeholder="Dec 2023 or Present" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.experiences||[])];a[i]={...a[i],endDate:e.target.value};return{...f,profile:{...f.profile,experiences:a}};})}/>
                          </div>
                        </div>
                        <div className="fc"><label style={{fontSize:10,color:"var(--text-dim)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:4}}>Responsibilities & Achievements</label>
                          <textarea rows={3} value={exp.description||""} placeholder="• Built ML pipeline processing 10M events/day&#10;• Reduced model latency by 40% with quantization&#10;• Led team of 3 engineers…"
                            onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.experiences||[])];a[i]={...a[i],description:e.target.value};return{...f,profile:{...f.profile,experiences:a}};})}/>
                        </div>
                      </div>
                    ))}
                    {!(settingsForm.profile?.experiences||[]).length && (
                      <div style={{ fontSize:12, color:"var(--text-dim)", padding:"10px 14px", background:"var(--bg)", borderRadius:8, border:"1px dashed var(--border)", textAlign:"center" }}>No experience added — click + Add</div>
                    )}
                  </div>

                  <button onClick={saveSettings} style={{ padding:"10px 24px", borderRadius:8, border:"none", background:"var(--indigo)", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>💾 Save Profile & Settings</button>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, alignItems:"start" }}>
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  {/* Search settings */}
                  <div style={{ background:"var(--surface)", borderRadius:14, padding:22, border:"1px solid var(--border)" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"var(--text)", marginBottom:18 }}>Search Settings</div>
                    <Field label="Job Titles (comma-separated)">
                      <textarea rows={3}
                        value={Array.isArray(settingsForm.jobTitles) ? settingsForm.jobTitles.join(", ") : settingsForm.jobTitles}
                        onChange={e => setSettingsForm(f => ({...f, jobTitles: e.target.value.split(",").map(s=>s.trim()).filter(Boolean)}))}/>
                    </Field>
                    <Field label="Locations (comma-separated)">
                      <textarea rows={2}
                        value={Array.isArray(settingsForm.locations) ? settingsForm.locations.join(", ") : settingsForm.locations}
                        onChange={e => setSettingsForm(f => ({...f, locations: e.target.value.split(",").map(s=>s.trim()).filter(Boolean)}))}/>
                    </Field>
                    <div style={{ marginBottom:16 }}>
                      <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em" }}>Platforms</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                        {Object.keys(PLATFORM_META).map(id => (
                          <PlatformPill key={id} id={id}
                            active={settingsForm.platforms?.[id] !== false}
                            onChange={(pid, val) => setSettingsForm(f => ({...f, platforms:{...f.platforms,[pid]:val}}))}/>
                        ))}
                      </div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
                      <Field label="Interval (min)">
                        <input type="number" min={1} max={60} value={settingsForm.intervalMinutes}
                          onChange={e => setSettingsForm(f => ({...f, intervalMinutes:parseInt(e.target.value)}))}/>
                      </Field>
                      <Field label="Max jobs / run">
                        <input type="number" min={1} max={50} value={settingsForm.maxApplicationsPerRun}
                          onChange={e => setSettingsForm(f => ({...f, maxApplicationsPerRun:parseInt(e.target.value)}))}/>
                      </Field>
                      <Field label="Max browser / cycle">
                        <input type="number" min={1} max={20} value={settingsForm.maxBrowserOpensPerCycle ?? 5}
                          onChange={e => setSettingsForm(f => ({...f, maxBrowserOpensPerCycle:parseInt(e.target.value)}))}/>
                      </Field>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
                      {[["autoApplyEnabled","Enable LinkedIn / Indeed auto-apply"],["emailNotifications","Email notifications"]].map(([k,lbl]) => (
                        <label key={k} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
                          <input type="checkbox" checked={!!settingsForm[k]}
                            onChange={e => setSettingsForm(f => ({...f,[k]:e.target.checked}))}
                            style={{ accentColor:"var(--indigo)", width:15, height:15 }}/>
                          <span style={{ fontSize:13, color:"var(--text-muted)" }}>{lbl}</span>
                        </label>
                      ))}
                    </div>
                    {settingsForm.emailNotifications && (
                      <Field label="Notification email">
                        <input type="email" value={settingsForm.notifyEmail || ""}
                          onChange={e => setSettingsForm(f => ({...f, notifyEmail:e.target.value}))}/>
                      </Field>
                    )}
                    <div style={{ display:"flex", gap:10 }}>
                      <button onClick={saveSettings} style={{
                        padding:"9px 20px", borderRadius:8, border:"none", background:"var(--indigo)",
                        color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer",
                      }}>Save Settings</button>
                      <button onClick={async () => {
                        const d = await apiFetch(`${API}/test-email`,{method:"POST"}).then(r=>r.json());
                        showToast(d.ok?"Test email sent!":d.message, d.ok?"success":"error");
                      }} style={{
                        padding:"9px 18px", borderRadius:8, border:"1px solid var(--border)",
                        background:"transparent", color:"var(--text-muted)", fontSize:13, cursor:"pointer",
                      }}>Test Email</button>
                    </div>
                  </div>
                </div>

                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  {/* Simplify */}
                  <div style={{ background:"var(--surface)", borderRadius:14, padding:22, border:"1px solid #a855f730" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>✨ Simplify Auto-Fill</div>
                      <a href="https://simplify.jobs" target="_blank" rel="noreferrer" style={{
                        padding:"5px 14px", background:"var(--indigo)", color:"#fff",
                        borderRadius:7, fontSize:11, fontWeight:700, textDecoration:"none",
                      }}>Install Free ↗</a>
                    </div>
                    <p style={{ fontSize:12, color:"var(--text-dim)", lineHeight:1.7, marginBottom:14 }}>
                      Works on Greenhouse · Lever · Ashby · any site
                    </p>
                    <div style={{ display:"flex", flexDirection:"column", gap:6, fontSize:12, color:"var(--text-muted)" }}>
                      {["Install Simplify from Chrome Web Store","Log in → fill your profile","Set opens each job → Simplify fills every field instantly","Just click Submit"].map((s,i) => (
                        <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                          <span style={{ color:"var(--indigo)", fontWeight:700, flexShrink:0 }}>{i+1}.</span>
                          <span>{s}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop:14, fontSize:11, color:"var(--text-dim)", background:"var(--bg)", borderRadius:8, padding:"10px 14px", border:"1px solid var(--border)" }}>
                      Mode: <span style={{ color:"#a855f7" }}>{settingsForm.simplifyMode || "shell"}</span>
                      &nbsp;·&nbsp; Auto-submit: <span style={{ color:"#a855f7" }}>{String(!!settingsForm.simplifyAutoSubmit)}</span>
                    </div>
                  </div>

                  {/* Credentials */}
                  <div style={{ background:"var(--surface)", borderRadius:14, padding:22, border:"1px solid var(--border)" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"var(--text)", marginBottom:16 }}>Credentials (.env)</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {[
                        ["APIFY_TOKEN",         settings?.apifyConfigured,   "Scraping"],
                        ["SERPAPI_KEY",          settings?.serpApiConfigured,  "Google Jobs"],
                        ["LINKEDIN_EMAIL/PASS",  settings?.linkedinConfigured, "Auto-apply"],
                        ["EMAIL_USER/PASS",       settings?.emailConfigured,    "Notifications"],
                        ["RESUME_PATH",           !!settings?.profile?.resumePath, "configured"],
                      ].map(([key, ok, desc]) => (
                        <div key={key} style={{
                          display:"flex", alignItems:"center", justifyContent:"space-between",
                          padding:"9px 14px", background:"var(--bg)", borderRadius:8, border:"1px solid var(--border)",
                        }}>
                          <span style={{ fontSize:12, fontWeight:600, color:"var(--text-muted)", fontFamily:"monospace" }}>{key}</span>
                          <span style={{ fontSize:11, fontWeight:600, color: ok ? "#22c55e" : "var(--text-dim)" }}>
                            {ok ? `✓ ${desc}` : "not set"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                </div>
              </div>
            )}

          </main>
        </div>
      </div>

      {/* ── JOB MODAL ──────────────────────────────────────────────────────────── */}
      {selectedJob && <JobModal job={selectedJob} onClose={() => setSelectedJob(null)} onApply={handleApplyNow}/>}

      {/* ── TOAST ──────────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position:"fixed", bottom:24, right:24, zIndex:9999,
          background:"var(--surface)", border:`1px solid ${toast.type==="error" ? "#ef444440" : "#22c55e40"}`,
          color: toast.type==="error" ? "#ef4444" : "#22c55e",
          borderRadius:12, padding:"12px 20px", fontSize:13, fontWeight:600,
          boxShadow:"0 8px 32px rgba(0,0,0,.5)", animation:"fadeUp .2s ease",
          display:"flex", alignItems:"center", gap:10, maxWidth:320,
        }}>
          <span>{toast.type==="error" ? "⚠" : "✓"}</span>
          {toast.msg}
        </div>
      )}
    </>
  );
}
