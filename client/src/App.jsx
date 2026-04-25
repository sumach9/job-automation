import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const API = "/api";

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
  { id:"logs",         icon:"≡",  label:"Logs"         },
  { id:"settings",     icon:"◎",  label:"Settings"     },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function scoreColor(s) {
  if (s >= 4.0) return "#22c55e";
  if (s >= 3.0) return "#84cc16";
  if (s >= 2.0) return "#f59e0b";
  if (s >= 1.0) return "#f97316";
  return "#ef4444";
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
  const bColor = job.score >= 4 ? "#22c55e" : job.score >= 3 ? "#84cc16" : "var(--border)";
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
  if (!job) return null;
  const c = companyColor(job.company);
  return (
    <div onClick={onClose} style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.75)", backdropFilter:"blur(4px)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background:"var(--surface)", borderRadius:20, width:"100%", maxWidth:720,
        maxHeight:"90vh", overflowY:"auto", border:"1px solid var(--border)",
        boxShadow:"0 32px 80px rgba(0,0,0,.7)",
      }}>
        {/* Header band */}
        <div style={{ background:`linear-gradient(135deg, ${c}20, transparent)`, padding:"28px 28px 20px", borderBottom:"1px solid var(--border)" }}>
          <div style={{ display:"flex", gap:16, alignItems:"flex-start" }}>
            <Avatar name={job.company} size={56}/>
            <div style={{ flex:1 }}>
              <h2 style={{ fontSize:20, fontWeight:800, color:"var(--text)", marginBottom:4 }}>{job.title}</h2>
              <div style={{ fontSize:14, color:"var(--text-muted)" }}>{job.company}
                {job.location && <> · <span style={{ color:"#f97316" }}>📍 {job.location}</span></>}
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <ScoreRing score={job.score} size={56}/>
              <button onClick={onClose} style={{
                background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text-dim)",
                borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:14, display:"flex",
                alignItems:"center", justifyContent:"center",
              }}>✕</button>
            </div>
          </div>

          {/* Tags row */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:14 }}>
            <PlatformTag platform={job.platform}/>
            {job.atsProvider && <Tag color="#a855f7">{job.atsProvider}</Tag>}
            {job.status && <StatusPill status={job.status}/>}
            {job.workMode && <Tag color="#8b5cf6">{job.workMode}</Tag>}
            {job.jobType && <Tag color="#06b6d4">{job.jobType}</Tag>}
            {job.salary && <Tag color="#22c55e">💰 {job.salary}</Tag>}
            {job.easyApply && <Tag color="#22c55e">⚡ Easy Apply</Tag>}
          </div>
        </div>

        <div style={{ padding:"20px 28px", display:"flex", flexDirection:"column", gap:18 }}>
          {/* Score breakdown */}
          {job.scoreBreakdown && (
            <div style={{ background:"var(--bg)", borderRadius:12, padding:"14px 16px", border:"1px solid var(--border)" }}>
              <div style={{ fontSize:11, color:"var(--text-dim)", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Match Breakdown</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                {[["Title Match",job.scoreBreakdown.title],["Skills",job.scoreBreakdown.skills?.toFixed(1)],["Location",job.scoreBreakdown.location]].map(([k,v]) => (
                  <div key={k} style={{ background:"var(--surface)", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                    <div style={{ fontSize:10, color:"var(--text-dim)", marginBottom:4 }}>{k}</div>
                    <div style={{ fontSize:22, fontWeight:800, color:scoreColor(job.score) }}>{v ?? "—"}</div>
                  </div>
                ))}
              </div>
              {job.scoreBreakdown.matchedSkills?.length > 0 && (
                <div style={{ marginTop:10, fontSize:12, color:"var(--text-dim)" }}>
                  Matched: <span style={{ color:"var(--text-muted)" }}>{job.scoreBreakdown.matchedSkills.join(", ")}</span>
                </div>
              )}
            </div>
          )}

          {/* Skills */}
          {job.skills?.length > 0 && (
            <div>
              <div style={{ fontSize:11, color:"var(--text-dim)", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Skills Required</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {job.skills.map((s,i) => (
                  <span key={i} style={{
                    background:"#6366f112", color:"#818cf8", border:"1px solid #6366f130",
                    borderRadius:6, padding:"3px 10px", fontSize:12,
                  }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {job.description && (
            <div>
              <div style={{ fontSize:11, color:"var(--text-dim)", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Description</div>
              <div style={{
                background:"var(--bg)", borderRadius:10, padding:"14px 16px", border:"1px solid var(--border)",
                fontSize:13, color:"var(--text-muted)", lineHeight:1.75, whiteSpace:"pre-wrap",
                maxHeight:220, overflowY:"auto",
              }}>{job.description}</div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", paddingTop:4 }}>
            <a href={job.url} target="_blank" rel="noreferrer" style={{
              flex:1, minWidth:130, textAlign:"center", padding:"11px 16px",
              background:c, color:"#fff", borderRadius:10, fontWeight:700, fontSize:13, textDecoration:"none",
            }}>Open Job ↗</a>
            <a href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent((job.company||"")+" recruiter talent acquisition")}`}
              target="_blank" rel="noreferrer" style={{
              flex:1, minWidth:130, textAlign:"center", padding:"11px 16px",
              background:"#0a66c220", color:"#0a66c2", borderRadius:10, fontWeight:700,
              fontSize:13, textDecoration:"none", border:"1px solid #0a66c240",
            }}>💼 Find Recruiter</a>
            {(job.status==="easy-apply-pending"||job.status==="apply-failed"||job.status==="queued-manual") && (
              <button onClick={() => onApply(job)} style={{
                flex:1, minWidth:130, padding:"11px 16px", background:"#22c55e20",
                color:"#22c55e", borderRadius:10, border:"1px solid #22c55e40",
                fontWeight:700, fontSize:13, cursor:"pointer",
              }}>⚡ Auto-Apply</button>
            )}
          </div>

          {job.autoApplyNote && (
            <div style={{ fontSize:12, color:"var(--text-dim)", background:"var(--bg)", borderRadius:8, padding:"10px 14px", border:"1px solid var(--border)" }}>
              Note: {job.autoApplyNote}
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

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
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
      const d = await fetch(`${API}/status`).then(r => r.json());
      setIsRunning(d.isRunning); setStats(d.stats); setSettings(d.settings);
      setSettingsForm(p => p ?? d.settings);
    } catch {}
  }, []);

  const fetchApplications = useCallback(async () => {
    try {
      const d = await fetch(`${API}/applications?limit=500`).then(r => r.json());
      setApplications(d.items || []);
    } catch {}
  }, []);

  const fetchLogs = useCallback(async () => {
    try { setLogs(await fetch(`${API}/logs?limit=200`).then(r => r.json())); } catch {}
  }, []);

  const fetchFoundJobs = useCallback(async (q="") => {
    try {
      const d = await fetch(`${API}/jobs?limit=500${q?`&q=${encodeURIComponent(q)}`:"" }`).then(r => r.json());
      setFoundJobs(d.items || []);
    } catch {}
  }, []);

  const fetchPipeline = useCallback(async () => {
    try {
      const d = await fetch(`${API}/pipeline`).then(r => r.json());
      setPipeline(d.stages || {});
    } catch {}
  }, []);

  useEffect(() => {
    fetch(`${API}/ats-companies`).then(r => r.json()).then(setAtsCompanies).catch(() => {});
  }, []);

  useEffect(() => {
    fetchStatus(); fetchApplications(); fetchLogs(); fetchFoundJobs(); fetchPipeline();
    const iv = setInterval(() => {
      fetchStatus(); fetchApplications(); fetchLogs(); fetchFoundJobs(jobSearch); fetchPipeline();
    }, 5000);
    return () => clearInterval(iv);
  }, [fetchStatus, fetchApplications, fetchLogs, fetchFoundJobs, fetchPipeline, jobSearch]);

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

  const hotJobs = useMemo(() => foundJobs.filter(j => j.score >= 4).slice(0, 6), [foundJobs]);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text).then(() => { setCopiedId(id); setTimeout(() => setCopiedId(null), 1500); });
  };

  const toggleAutomation = async () => {
    setLoading(true);
    try {
      const d = await fetch(`${API}/${isRunning?"stop":"start"}`, { method:"POST" }).then(r => r.json());
      if (d.ok) { setIsRunning(!isRunning); showToast(isRunning ? "Stopped" : "Scanner started!"); }
      else showToast(d.message||"Failed","error");
    } catch { showToast("Cannot reach server","error"); }
    setLoading(false);
  };

  const handleApplyNow = async (job) => {
    setSelectedJob(null);
    showToast(`Auto-applying to ${job.title}…`);
    try { await fetch(`${API}/apply/${job.id}`, { method:"POST" }); showToast("Auto-apply started!"); }
    catch { showToast("Failed","error"); }
  };

  const saveSettings = async () => {
    try {
      const d = await fetch(`${API}/settings`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(settingsForm),
      }).then(r => r.json());
      if (d.ok) { setSettings(d.settings); showToast("Settings saved"); }
    } catch { showToast("Failed","error"); }
  };

  const deleteApplication = async (id) => {
    await fetch(`${API}/applications/${id}`, { method:"DELETE" });
    setApplications(p => p.filter(a => a.id !== id));
  };

  const updateStage = async (id, stage) => {
    try {
      await fetch(`${API}/applications/${id}/stage`, {
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
      const d = await fetch(`${API}/generate-answers`, {
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
            {NAV.slice(2,4).map(item => (
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
              </button>
            ))}

            {!sidebarCollapsed && <div style={{ fontSize:10, color:"var(--text-dim)", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", padding:"10px 8px 4px" }}>System</div>}
            {NAV.slice(4).map(item => (
              <button key={item.id} className={`nav-btn${tab===item.id?" active":""}`} onClick={() => setTab(item.id)}
                title={sidebarCollapsed ? item.label : ""}>
                <span style={{ fontSize:16, flexShrink:0 }}>{item.icon}</span>
                {!sidebarCollapsed && <span>{item.label}</span>}
              </button>
            ))}
          </nav>

          {/* Bot status & profile */}
          <div style={{ borderTop:"1px solid var(--border)", padding: sidebarCollapsed ? "12px 0" : "14px 14px" }}>
            {!sidebarCollapsed && (
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <Avatar name={settings?.profile?.name || "Suma Chidara"} size={34}/>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:"var(--text)" }}>{settings?.profile?.name || "Suma Chidara"}</div>
                  <div style={{ fontSize:10, color:"var(--text-dim)" }}>Data Scientist</div>
                </div>
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

            <button onClick={toggleAutomation} disabled={loading} style={{
              padding:"8px 20px", borderRadius:8, border:"none", cursor: loading ? "not-allowed" : "pointer",
              fontWeight:700, fontSize:12, opacity: loading ? .6 : 1, letterSpacing:.3,
              background: isRunning ? "#ef444420" : "#22c55e20",
              color: isRunning ? "#ef4444" : "#22c55e",
              border: `1px solid ${isRunning ? "#ef444430" : "#22c55e30"}`,
              transition:"all .15s",
            }}>
              {loading ? "…" : isRunning ? "⏹ Stop Scanner" : "▶ Start Scanner"}
            </button>
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
                  <MetricCard label="Hot Matches"  value={hotJobs.length} color="#f59e0b" icon="★" sub="score ≥ 4.0"/>
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
                        ★ Hot Matches — Score 4.0+
                      </div>
                      <button onClick={() => setTab("jobs")} style={{
                        background:"none", border:"none", color:"var(--indigo)", fontSize:12, cursor:"pointer", fontWeight:600,
                      }}>View all {foundJobs.filter(j=>j.score>=4).length} →</button>
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

            {/* ── LOGS ──────────────────────────────────────────────────────── */}
            {tab==="logs" && (
              <div style={{
                background:"#050509", borderRadius:14, padding:"18px 22px",
                fontFamily:"'JetBrains Mono','Fira Code','Cascadia Code',monospace",
                fontSize:12, minHeight:400, border:"1px solid var(--border)",
              }}>
                {logs.length===0 && <span style={{ color:"var(--text-dim)" }}>No logs yet.</span>}
                {logs.map(l => (
                  <div key={l.id} style={{
                    display:"flex", gap:14, padding:"3px 0",
                    alignItems:"flex-start", borderBottom:"1px solid #ffffff04",
                  }}>
                    <span style={{ color:"#30304a", flexShrink:0, fontSize:11 }}>
                      {new Date(l.timestamp).toLocaleString()}
                    </span>
                    <span style={{ color:LEVEL_COLOR[l.level], width:60, flexShrink:0, fontWeight:700, fontSize:11 }}>
                      [{l.level.toUpperCase()}]
                    </span>
                    <span style={{ color:LEVEL_COLOR[l.level], lineHeight:1.6 }}>{l.message}</span>
                    {l.detail && <span style={{ color:"#30304a" }}>{l.detail}</span>}
                  </div>
                ))}
                <div ref={logsEndRef}/>
              </div>
            )}

            {/* ── SETTINGS ──────────────────────────────────────────────────── */}
            {tab==="settings" && settingsForm && (
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
                        const d = await fetch(`${API}/test-email`,{method:"POST"}).then(r=>r.json());
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
