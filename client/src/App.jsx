import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const API = "/api";

function apiFetch(url, opts = {}) {
  const token = localStorage.getItem("jobpilot_token");
  return fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PLATFORM_META = {
  linkedin:     { label:"LinkedIn",     color:"#0a66c2" },
  indeed:       { label:"Indeed",       color:"#2557a7" },
  glassdoor:    { label:"Glassdoor",    color:"#0caa41" },
  ziprecruiter: { label:"ZipRecruiter", color:"#4a90e2" },
  googlejobs:   { label:"Google Jobs",  color:"#ea4335" },
  atsDirect:    { label:"ATS Direct",   color:"#7c3aed" },
};

const STATUS_META = {
  "auto-applied":       { color:"#16a34a", label:"Auto Applied" },
  "easy-apply-pending": { color:"#2563eb", label:"Easy Apply" },
  "simplify-opened":    { color:"#7c3aed", label:"Simplify" },
  "onetouch-filled":    { color:"#2563eb", label:"JobPilot" },
  "browser-opened":     { color:"#d97706", label:"Opened" },
  "queued-manual":      { color:"#78716c", label:"Queued" },
  "apply-failed":       { color:"#dc2626", label:"Failed" },
  "interviewing":       { color:"#0891b2", label:"Interviewing" },
  "offered":            { color:"#d97706", label:"Offered" },
  "rejected":           { color:"#dc2626", label:"Rejected" },
};

const PIPELINE_STAGES = [
  { key:"queued-manual",   label:"Queued",       color:"#78716c" },
  { key:"onetouch-filled", label:"Applied",      color:"#2563eb" },
  { key:"applied",         label:"Confirmed",    color:"#16a34a" },
  { key:"interviewing",    label:"Interviewing", color:"#0891b2" },
  { key:"offered",         label:"Offered",      color:"#d97706" },
  { key:"rejected",        label:"Rejected",     color:"#dc2626" },
];

const NAV = [
  { id:"dashboard",    label:"Overview",      icon:"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { id:"jobs",         label:"Jobs",          icon:"M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  { id:"pipeline",     label:"Pipeline",      icon:"M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" },
  { id:"applications", label:"Applications",  icon:"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { id:"outreach",     label:"Outreach",      icon:"M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
  { id:"settings",     label:"Settings",      icon:"M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function scoreColor(s) {
  if (s >= 3.5) return "#16a34a";
  if (s >= 2.5) return "#d97706";
  if (s >= 1.5) return "#ea580c";
  return "#dc2626";
}

function profileCompleteness(profile) {
  if (!profile) return 0;
  const fields = ["name","email","phone","location","skills","yearsExperience","summary","targetRoles","school"];
  const filled = fields.filter(f => { const v = profile[f]; return Array.isArray(v) ? v.length > 0 : !!v; });
  return Math.round((filled.length / fields.length) * 100);
}

function companyColor(name = "") {
  const palette = ["#2563eb","#7c3aed","#db2777","#dc2626","#ea580c","#ca8a04","#16a34a","#0d9488","#0284c7","#0891b2"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

function initials(name = "") {
  return name.trim().split(/\s+/).slice(0,2).map(w => w[0]||"").join("").toUpperCase() || "?";
}

function fmt(n) { return (n||0).toLocaleString(); }

function relTime(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

// ─── SVG Icon helper ──────────────────────────────────────────────────────────
function Icon({ d, size=16, color="currentColor", style={} }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24"
      stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {d.split(" M").map((segment, i) => (
        <path key={i} d={i === 0 ? segment : "M" + segment}/>
      ))}
    </svg>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, size=36 }) {
  const c = companyColor(name);
  return (
    <div style={{
      width:size, height:size, borderRadius:size*0.25, flexShrink:0,
      background:c+"18", border:`1.5px solid ${c}30`,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:size*0.33, fontWeight:700, color:c, letterSpacing:-0.5,
    }}>
      {initials(name)}
    </div>
  );
}

// ─── Status Pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const s = STATUS_META[status] || { color:"#78716c", label: status || "Unknown" };
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:5,
      background:s.color+"12", color:s.color,
      border:`1px solid ${s.color}25`,
      borderRadius:20, padding:"3px 9px", fontSize:11, fontWeight:600, whiteSpace:"nowrap",
    }}>
      <span style={{ width:5, height:5, borderRadius:"50%", background:s.color, flexShrink:0 }}/>
      {s.label}
    </span>
  );
}

// ─── Score Badge ──────────────────────────────────────────────────────────────
function ScoreBadge({ score, size="md" }) {
  if (score == null) return null;
  const c = scoreColor(score);
  const pad = size === "sm" ? "2px 7px" : "4px 10px";
  const fs = size === "sm" ? 11 : 13;
  return (
    <span style={{
      background:c+"12", color:c, border:`1px solid ${c}25`,
      borderRadius:6, padding:pad, fontSize:fs, fontWeight:700,
    }}>
      {score}
    </span>
  );
}

// ─── Platform Tag ─────────────────────────────────────────────────────────────
function PlatformTag({ platform }) {
  const p = Object.values(PLATFORM_META).find(m => m.label===platform)
         || { label:platform||"Other", color:"#2563eb" };
  return (
    <span style={{
      background:p.color+"10", color:p.color, border:`1px solid ${p.color}20`,
      borderRadius:5, padding:"2px 8px", fontSize:11, fontWeight:500,
    }}>
      {p.label}
    </span>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent="#2563eb" }) {
  return (
    <div style={{
      background:"#fff", borderRadius:12, padding:"18px 20px",
      border:"1px solid #e5e3e0", flex:"1 1 150px", minWidth:130,
    }}>
      <div style={{ fontSize:11, color:"#a8a29e", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10 }}>
        {label}
      </div>
      <div style={{ fontSize:28, fontWeight:700, color:"#1c1917", letterSpacing:-1, lineHeight:1 }}>
        {fmt(value)}
      </div>
      {sub && <div style={{ fontSize:12, color:"#a8a29e", marginTop:6 }}>{sub}</div>}
    </div>
  );
}

// ─── Job Detail Panel (right-pane) ────────────────────────────────────────────
function JobDetailPanel({ job, onApply, onClose }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [skillGap, setSkillGap]   = useState(null);
  const [resume, setResume]       = useState(null);
  const [loadingGap, setLoadingGap] = useState(false);
  const [loadingResume, setLoadingResume] = useState(false);

  useEffect(() => { setSkillGap(null); setResume(null); setActiveTab("overview"); }, [job]);
  if (!job) return (
    <div style={{
      flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      gap:12, color:"#a8a29e", background:"#fafaf9",
    }}>
      <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="#d6d3d1" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
      </svg>
      <span style={{ fontSize:14 }}>Select a job to view details</span>
    </div>
  );

  const c = companyColor(job.company);

  async function loadSkillGap() {
    setLoadingGap(true); setActiveTab("gap");
    try {
      const d = await apiFetch(`${API}/skill-gap`, {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({job}),
      }).then(r=>r.json());
      setSkillGap(d);
    } catch {}
    setLoadingGap(false);
  }

  async function loadResume() {
    setLoadingResume(true); setActiveTab("resume");
    try {
      const d = await apiFetch(`${API}/generate-resume`, {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({job}),
      }).then(r=>r.json());
      setResume(d);
    } catch {}
    setLoadingResume(false);
  }

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", background:"#fff", borderLeft:"1px solid #e5e3e0" }}>
      {/* Header */}
      <div style={{ padding:"20px 24px 16px", borderBottom:"1px solid #f0eeec" }}>
        <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
          <Avatar name={job.company} size={44}/>
          <div style={{ flex:1, minWidth:0 }}>
            <h2 style={{ fontSize:16, fontWeight:700, color:"#1c1917", marginBottom:3, lineHeight:1.3 }}>{job.title}</h2>
            <div style={{ fontSize:13, color:"#78716c" }}>
              {job.company}{job.location && ` · ${job.location}`}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <ScoreBadge score={job.score}/>
            {onClose && (
              <button onClick={onClose} style={{ background:"none", border:"1px solid #e5e3e0", color:"#a8a29e", borderRadius:7, width:30, height:30, cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
            )}
          </div>
        </div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:12 }}>
          <PlatformTag platform={job.platform}/>
          {job.easyApply && <span style={{ background:"#dcfce7", color:"#16a34a", border:"1px solid #bbf7d0", borderRadius:5, padding:"2px 8px", fontSize:11, fontWeight:600 }}>Easy Apply</span>}
          {job.salary && <span style={{ background:"#f0fdf4", color:"#16a34a", border:"1px solid #bbf7d0", borderRadius:5, padding:"2px 8px", fontSize:11, fontWeight:600 }}>{job.salary}</span>}
          {job.status && <StatusPill status={job.status}/>}
        </div>
      </div>

      {/* Action bar */}
      <div style={{ display:"flex", gap:8, padding:"12px 24px", borderBottom:"1px solid #f0eeec", flexWrap:"wrap", background:"#fafaf9" }}>
        <a href={job.url} target="_blank" rel="noreferrer" style={{
          padding:"7px 16px", background:"#2563eb", color:"#fff", borderRadius:8,
          fontWeight:600, fontSize:12, textDecoration:"none",
        }}>Open Job ↗</a>
        <button onClick={loadSkillGap} style={{
          padding:"7px 14px", background:"#fff", color:"#57534e", border:"1px solid #e5e3e0",
          borderRadius:8, fontWeight:600, fontSize:12, cursor:"pointer",
        }}>Skill Gap</button>
        <button onClick={loadResume} style={{
          padding:"7px 14px", background:"#fff", color:"#57534e", border:"1px solid #e5e3e0",
          borderRadius:8, fontWeight:600, fontSize:12, cursor:"pointer",
        }}>Resume Draft</button>
        {(job.status==="easy-apply-pending"||job.status==="apply-failed"||job.status==="queued-manual") && (
          <button onClick={() => onApply(job)} style={{
            padding:"7px 16px", background:"#2563eb", color:"#fff", border:"none",
            borderRadius:8, fontWeight:600, fontSize:12, cursor:"pointer",
          }}>Auto-Apply</button>
        )}
        <a href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent((job.company||"")+" recruiter")}`}
          target="_blank" rel="noreferrer" style={{
          padding:"7px 14px", background:"#fff", color:"#0a66c2", border:"1px solid #0a66c230",
          borderRadius:8, fontWeight:600, fontSize:12, textDecoration:"none",
        }}>Find Recruiter</a>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:"1px solid #f0eeec", padding:"0 24px" }}>
        {[["overview","Overview"],["gap","Skill Gap"],["resume","Resume"]].map(([id,lbl]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            padding:"10px 0", marginRight:20, background:"none", border:"none",
            borderBottom: activeTab===id ? "2px solid #2563eb" : "2px solid transparent",
            color: activeTab===id ? "#2563eb" : "#a8a29e",
            fontWeight: activeTab===id ? 600 : 400, fontSize:13, cursor:"pointer",
          }}>{lbl}</button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>
        {activeTab==="overview" && <>
          {job.scoreBreakdown && (
            <div style={{ background:"#fafaf9", borderRadius:10, padding:"14px 16px", border:"1px solid #e5e3e0", marginBottom:16 }}>
              <div style={{ fontSize:11, color:"#a8a29e", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>Fit Breakdown</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                {[["Title",job.scoreBreakdown.title,"/2"],["Skills",job.scoreBreakdown.skills?.toFixed(1),"/2"],["Location",job.scoreBreakdown.location,"/1"],["Exp",job.scoreBreakdown.experienceBonus?.toFixed(1),"+"]].map(([k,v,max]) => (
                  <div key={k} style={{ background:"#fff", borderRadius:8, padding:"10px 12px", textAlign:"center", border:"1px solid #f0eeec" }}>
                    <div style={{ fontSize:10, color:"#a8a29e", marginBottom:4 }}>{k}</div>
                    <div style={{ fontSize:18, fontWeight:700, color:scoreColor(job.score) }}>{v??"-"}</div>
                    <div style={{ fontSize:10, color:"#d6d3d1" }}>{max}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {job.skills?.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:"#a8a29e", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Required Skills</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {job.skills.map((s,i) => (
                  <span key={i} style={{ background:"#eff6ff", color:"#2563eb", border:"1px solid #bfdbfe", borderRadius:5, padding:"3px 9px", fontSize:12 }}>{s}</span>
                ))}
              </div>
            </div>
          )}
          {job.description && (
            <div>
              <div style={{ fontSize:11, color:"#a8a29e", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Description</div>
              <div style={{ background:"#fafaf9", borderRadius:10, padding:"14px 16px", border:"1px solid #f0eeec", fontSize:13, color:"#57534e", lineHeight:1.75, whiteSpace:"pre-wrap", maxHeight:240, overflowY:"auto" }}>
                {job.description}
              </div>
            </div>
          )}
        </>}

        {activeTab==="gap" && (
          <div>
            {loadingGap && <div style={{ textAlign:"center", color:"#a8a29e", padding:40 }}>Analysing skill gap…</div>}
            {!loadingGap && !skillGap && (
              <div style={{ textAlign:"center", padding:40 }}>
                <button onClick={loadSkillGap} style={{ padding:"9px 20px", background:"#2563eb", color:"#fff", border:"none", borderRadius:8, fontWeight:600, cursor:"pointer" }}>
                  Analyse Skill Gap
                </button>
              </div>
            )}
            {skillGap && (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {skillGap.matched?.length > 0 && (
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:"#16a34a", marginBottom:8 }}>You have ({skillGap.matched.length})</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {skillGap.matched.map((s,i) => <span key={i} style={{ background:"#dcfce7", color:"#16a34a", border:"1px solid #bbf7d0", borderRadius:5, padding:"3px 9px", fontSize:12 }}>{s}</span>)}
                    </div>
                  </div>
                )}
                {skillGap.missing?.length > 0 && (
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:"#dc2626", marginBottom:8 }}>Missing ({skillGap.missing.length})</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {skillGap.missing.map((s,i) => <span key={i} style={{ background:"#fef2f2", color:"#dc2626", border:"1px solid #fecaca", borderRadius:5, padding:"3px 9px", fontSize:12 }}>{s}</span>)}
                    </div>
                  </div>
                )}
                {skillGap.advice && <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:10, padding:"12px 14px", fontSize:13, color:"#1d4ed8", lineHeight:1.65 }}>{skillGap.advice}</div>}
              </div>
            )}
          </div>
        )}

        {activeTab==="resume" && (
          <div>
            {loadingResume && <div style={{ textAlign:"center", color:"#a8a29e", padding:40 }}>Generating resume draft…</div>}
            {!loadingResume && !resume && (
              <div style={{ textAlign:"center", padding:40 }}>
                <button onClick={loadResume} style={{ padding:"9px 20px", background:"#2563eb", color:"#fff", border:"none", borderRadius:8, fontWeight:600, cursor:"pointer" }}>
                  Generate Resume Draft
                </button>
              </div>
            )}
            {resume && (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {resume.summary && (
                  <div>
                    <div style={{ fontSize:11, color:"#a8a29e", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Summary</div>
                    <div style={{ background:"#fafaf9", border:"1px solid #e5e3e0", borderRadius:10, padding:"12px 14px", fontSize:13, color:"#57534e", lineHeight:1.7 }}>{resume.summary}</div>
                  </div>
                )}
                {resume.bullets?.length > 0 && (
                  <div>
                    <div style={{ fontSize:11, color:"#a8a29e", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Key Points</div>
                    <ul style={{ paddingLeft:18, display:"flex", flexDirection:"column", gap:6 }}>
                      {resume.bullets.map((b,i) => <li key={i} style={{ fontSize:13, color:"#57534e", lineHeight:1.6 }}>{b}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Job Row (left pane) ──────────────────────────────────────────────────────
function JobRow({ job, selected, onClick }) {
  const c = companyColor(job.company);
  return (
    <div onClick={() => onClick(job)} style={{
      padding:"14px 16px", borderBottom:"1px solid #f5f4f2", cursor:"pointer",
      background: selected ? "#eff6ff" : "#fff",
      borderLeft: selected ? "3px solid #2563eb" : "3px solid transparent",
      transition:"background .1s",
    }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background="#fafaf9"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background="#fff"; }}
    >
      <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
        <Avatar name={job.company} size={36}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, color:"#1c1917", lineHeight:1.3, marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {job.title}
          </div>
          <div style={{ fontSize:12, color:"#78716c", marginBottom:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {job.company}{job.location ? ` · ${job.location}` : ""}
          </div>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            <PlatformTag platform={job.platform}/>
            {job.easyApply && <span style={{ background:"#dcfce7", color:"#16a34a", border:"1px solid #bbf7d0", borderRadius:5, padding:"1px 6px", fontSize:10, fontWeight:600 }}>Easy Apply</span>}
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6, flexShrink:0 }}>
          <ScoreBadge score={job.score} size="sm"/>
          <span style={{ fontSize:11, color:"#a8a29e" }}>{relTime(job.savedAt)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline Card ────────────────────────────────────────────────────────────
function PipelineCard({ app, stageKey, onMove, onSelect }) {
  return (
    <div onClick={() => onSelect(app)} style={{
      background:"#fff", borderRadius:9, padding:"12px 13px",
      border:"1px solid #e5e3e0", cursor:"pointer", marginBottom:8,
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.08)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow="none"}
    >
      <div style={{ display:"flex", gap:9, alignItems:"flex-start", marginBottom:8 }}>
        <Avatar name={app.company} size={28}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:600, color:"#1c1917", lineHeight:1.3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{app.title}</div>
          <div style={{ fontSize:11, color:"#a8a29e" }}>{app.company}</div>
        </div>
        {app.score != null && <ScoreBadge score={app.score} size="sm"/>}
      </div>
      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
        {PIPELINE_STAGES.filter(s => s.key !== stageKey).slice(0,3).map(s => (
          <button key={s.key} onClick={e => { e.stopPropagation(); onMove(app.id, s.key); }} style={{
            background:`${s.color}10`, color:s.color, border:`1px solid ${s.color}25`,
            borderRadius:4, padding:"2px 7px", fontSize:10, fontWeight:600, cursor:"pointer",
          }}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Resume Upload Card ───────────────────────────────────────────────────────
function ResumeUploadCard({ onParsed, showToast, currentResumePath }) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  const upload = async (file) => {
    if (!file) return;
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "text/plain"];
    if (!allowed.includes(file.type) && !/\.(pdf|docx?|txt)$/i.test(file.name)) {
      showToast("Only PDF, DOCX, or TXT files", "error"); return;
    }
    setUploading(true); setResult(null);
    const form = new FormData();
    form.append("resume", file);
    try {
      const d = await apiFetch(`${API}/upload-resume`, { method:"POST", body:form }).then(r=>r.json());
      if (d.ok) { setResult(d.parsed); onParsed(d.profile); }
      else showToast(d.message || "Parse failed", "error");
    } catch { showToast("Upload failed","error"); }
    setUploading(false);
  };

  const onDrop = (e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files[0]); };

  return (
    <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e5e3e0", overflow:"hidden" }}>
      <div style={{ padding:"18px 24px", borderBottom:"1px solid #f0eeec", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:"#1c1917" }}>Resume</div>
          <div style={{ fontSize:12, color:"#a8a29e", marginTop:2 }}>Upload your PDF or DOCX — we'll auto-fill your profile</div>
        </div>
        {currentResumePath && <span style={{ fontSize:11, color:"#16a34a", background:"#dcfce7", border:"1px solid #bbf7d0", borderRadius:20, padding:"3px 10px", fontWeight:600 }}>✓ Resume on file</span>}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e=>{e.preventDefault();setDragging(true);}}
        onDragLeave={()=>setDragging(false)}
        onDrop={onDrop}
        onClick={()=>inputRef.current?.click()}
        style={{
          margin:16, borderRadius:10, border:`2px dashed ${dragging?"#2563eb":"#e5e3e0"}`,
          background:dragging?"#eff6ff":"#fafaf9", padding:"28px 20px",
          textAlign:"center", cursor:"pointer", transition:"all .15s",
        }}
      >
        <input ref={inputRef} type="file" accept=".pdf,.docx,.doc,.txt" style={{display:"none"}}
          onChange={e => upload(e.target.files[0])}/>
        {uploading ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
            <div style={{ width:28, height:28, border:"3px solid #e5e3e0", borderTopColor:"#2563eb", borderRadius:"50%", animation:"spin .7s linear infinite" }}/>
            <span style={{ fontSize:13, color:"#2563eb", fontWeight:600 }}>Parsing resume…</span>
          </div>
        ) : (
          <>
            <div style={{ fontSize:28, marginBottom:8 }}>📄</div>
            <div style={{ fontSize:13, fontWeight:600, color:"#1c1917", marginBottom:4 }}>Drop your resume here or click to browse</div>
            <div style={{ fontSize:12, color:"#a8a29e" }}>PDF, DOCX, or TXT · Max 10 MB</div>
          </>
        )}
      </div>

      {/* Parse result preview */}
      {result && (
        <div style={{ margin:"0 16px 16px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"14px 16px" }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#16a34a", marginBottom:10 }}>✓ Profile auto-filled from resume</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {[
              result.name       && ["Name",       result.name],
              result.email      && ["Email",      result.email],
              result.phone      && ["Phone",      result.phone],
              result.location   && ["Location",   result.location],
              result.skills?.length && ["Skills", `${result.skills.length} detected`],
              result.experiences?.length && ["Experience", `${result.experiences.length} jobs`],
              result.education?.length && ["Education", `${result.education.length} entries`],
              result.yearsExperience && ["Years Exp", result.yearsExperience + " yrs"],
            ].filter(Boolean).map(([k,v]) => (
              <div key={k} style={{ background:"#fff", border:"1px solid #bbf7d0", borderRadius:7, padding:"5px 10px", fontSize:12 }}>
                <span style={{ color:"#a8a29e" }}>{k}: </span>
                <span style={{ fontWeight:600, color:"#1c1917" }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize:11, color:"#16a34a", marginTop:10 }}>Scroll down to review and edit the auto-filled fields, then click Save Profile.</div>
        </div>
      )}
    </div>
  );
}

// ─── Settings Field ───────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:"block", fontSize:12, color:"#78716c", marginBottom:5, fontWeight:500 }}>{label}</label>
      {children}
    </div>
  );
}

// ─── Agents Tab ───────────────────────────────────────────────────────────────
function AgentsTab({ showToast }) {
  const [agents, setAgents] = useState([]);
  const [running, setRunning] = useState({});
  const [expanded, setExpanded] = useState({});
  const [configs, setConfigs] = useState({});
  const [results, setResults] = useState({});

  const load = useCallback(async () => {
    try {
      const d = await apiFetch(`${API}/agents`).then(r=>r.json());
      setAgents(d.agents||[]);
      (d.agents||[]).forEach(a => { if (a.result) setResults(p => ({...p,[a.id]:a.result})); });
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const runAgent = async (id) => {
    setRunning(r => ({...r,[id]:true}));
    try {
      const d = await apiFetch(`${API}/agents/${id}/run`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ config: configs[id]||{} }),
      }).then(r=>r.json());
      if (d.ok) { setResults(r => ({...r,[id]:d.result})); setExpanded(e => ({...e,[id]:true})); showToast("Agent completed"); }
      else showToast(d.message||"Agent failed","error");
    } catch { showToast("Cannot reach server","error"); }
    setRunning(r => ({...r,[id]:false}));
  };

  const updCfg = (aid, key, val) => setConfigs(c => ({...c,[aid]:{...(c[aid]||{}),[key]:val}}));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ background:"#eff6ff", borderRadius:10, padding:"14px 18px", border:"1px solid #bfdbfe" }}>
        <div style={{ fontSize:14, fontWeight:700, color:"#1d4ed8" }}>AI Agent Suite</div>
        <div style={{ fontSize:12, color:"#3b82f6", marginTop:3 }}>5 autonomous agents — no LLM API key required.</div>
      </div>
      {agents.map(agent => {
        const res = results[agent.id]; const isOpen = expanded[agent.id]; const cfg = configs[agent.id]||{}; const isRun = running[agent.id];
        return (
          <div key={agent.id} style={{ background:"#fff", borderRadius:12, border:"1px solid #e5e3e0", overflow:"hidden" }}>
            <div style={{ padding:"16px 20px", display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:agent.color+"15", border:`1px solid ${agent.color}25`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>{agent.icon}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:600, color:"#1c1917", marginBottom:2 }}>{agent.name}</div>
                <div style={{ fontSize:12, color:"#a8a29e", lineHeight:1.5 }}>{agent.description}</div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                {res && <span style={{ fontSize:10, color:"#16a34a", background:"#dcfce7", border:"1px solid #bbf7d0", borderRadius:20, padding:"3px 9px", fontWeight:600 }}>Done</span>}
                <button onClick={() => runAgent(agent.id)} disabled={isRun} style={{
                  padding:"8px 18px", borderRadius:8, border:"none",
                  background:isRun?"#f5f4f2":`${agent.color}`,
                  color:isRun?"#a8a29e":"#fff", fontWeight:600, fontSize:12, cursor:isRun?"not-allowed":"pointer",
                }}>{isRun?"Running…":"Run"}</button>
                {res && <button onClick={() => setExpanded(e => ({...e,[agent.id]:!isOpen}))} style={{ background:"#f5f4f2", border:"1px solid #e5e3e0", color:"#78716c", borderRadius:7, cursor:"pointer", width:30, height:30, fontSize:12 }}>{isOpen?"▲":"▼"}</button>}
              </div>
            </div>
            {agent.configFields?.length > 0 && (
              <div style={{ borderTop:"1px solid #f0eeec", padding:"10px 20px", background:"#fafaf9", display:"flex", gap:14, alignItems:"center", flexWrap:"wrap" }}>
                {agent.configFields.map(f => (
                  <label key={f.key} style={{ display:"flex", alignItems:"center", gap:7, fontSize:12, color:"#78716c" }}>
                    {f.label}:
                    {f.type==="select"
                      ? <select value={cfg[f.key]??f.default} onChange={e=>updCfg(agent.id,f.key,e.target.value)} style={{ background:"#fff", border:"1px solid #e5e3e0", color:"#1c1917", borderRadius:6, padding:"3px 8px", fontSize:12 }}>{(f.options||[]).map(o=><option key={o}>{o}</option>)}</select>
                      : <input type="number" value={cfg[f.key]??f.default} onChange={e=>updCfg(agent.id,f.key,e.target.value)} style={{ width:60, background:"#fff", border:"1px solid #e5e3e0", color:"#1c1917", borderRadius:6, padding:"3px 8px", fontSize:12 }}/>}
                  </label>
                ))}
              </div>
            )}
            {isOpen && res && (
              <div style={{ borderTop:"1px solid #f0eeec", padding:"16px 20px" }}>
                <div style={{ background:"#fafaf9", borderRadius:8, padding:"10px 14px", marginBottom:12, border:"1px solid #e5e3e0", fontSize:12, color:"#57534e" }}>{res.summary}</div>
                {(agent.id==="outreach-writer") && res.items?.map((item,i) => (
                  <div key={i} style={{ marginBottom:10, background:"#fafaf9", borderRadius:8, border:"1px solid #e5e3e0", overflow:"hidden" }}>
                    <div style={{ padding:"8px 14px", borderBottom:"1px solid #f0eeec", display:"flex", alignItems:"center", gap:8 }}>
                      <Avatar name={item.job.company} size={22}/>
                      <span style={{ fontSize:12, fontWeight:600, color:"#1c1917" }}>{item.job.title} @ {item.job.company}</span>
                      <a href={item.recruiterSearchUrl} target="_blank" rel="noreferrer" style={{ marginLeft:"auto", fontSize:10, color:"#2563eb", border:"1px solid #bfdbfe", borderRadius:5, padding:"3px 9px", textDecoration:"none", fontWeight:600 }}>Find Recruiter →</a>
                    </div>
                    <pre style={{ margin:0, padding:"12px 14px", fontSize:11, color:"#57534e", whiteSpace:"pre-wrap", lineHeight:1.7, fontFamily:"inherit" }}>{item.message}</pre>
                    <div style={{ padding:"8px 14px", borderTop:"1px solid #f0eeec" }}>
                      <button onClick={()=>navigator.clipboard.writeText(item.message).then(()=>showToast("Copied!"))} style={{ background:"#fff", border:"1px solid #e5e3e0", color:"#78716c", borderRadius:6, padding:"4px 12px", fontSize:11, cursor:"pointer" }}>Copy</button>
                    </div>
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

// ─── Billing Tab ──────────────────────────────────────────────────────────────
function BillingTab({ showToast }) {
  const [plans, setPlans] = useState([]);
  const [sub, setSub] = useState(null);
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
      const d = await apiFetch(`${API}/billing/checkout`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({planId}) }).then(r=>r.json());
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
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div style={{ fontSize:15, fontWeight:700, color:"#1c1917" }}>Billing & Plans</div>
      {!stripeReady && (
        <div style={{ background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#92400e" }}>
          Add <code style={{ background:"#fef3c7", padding:"1px 5px", borderRadius:4 }}>STRIPE_SECRET_KEY</code> to .env to enable payments
        </div>
      )}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
        {plans.map(plan => {
          const active = currentPlan === plan.id;
          return (
            <div key={plan.id} style={{
              background:"#fff", borderRadius:14, padding:"24px 20px",
              border: active ? "2px solid #2563eb" : "1px solid #e5e3e0",
              display:"flex", flexDirection:"column", position:"relative",
            }}>
              {active && <div style={{ position:"absolute", top:-10, right:16, background:"#2563eb", color:"#fff", borderRadius:20, padding:"3px 12px", fontSize:10, fontWeight:700 }}>CURRENT</div>}
              {plan.popular && !active && <div style={{ position:"absolute", top:-10, left:"50%", transform:"translateX(-50%)", background:"#1c1917", color:"#fff", borderRadius:20, padding:"3px 12px", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>MOST POPULAR</div>}
              <div style={{ fontSize:13, fontWeight:600, color:"#57534e", marginBottom:8 }}>{plan.name}</div>
              <div style={{ fontSize:32, fontWeight:700, color:"#1c1917", marginBottom:4 }}>{plan.price===0?"Free":`$${plan.price}`}{plan.price>0&&<span style={{ fontSize:14, fontWeight:400, color:"#a8a29e" }}>/mo</span>}</div>
              <div style={{ flex:1, margin:"16px 0" }}>
                {plan.features.map((f,i) => (
                  <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"4px 0", fontSize:13, color:"#57534e" }}>
                    <span style={{ color:"#16a34a", flexShrink:0, marginTop:1 }}>✓</span>{f}
                  </div>
                ))}
              </div>
              {active ? (
                <button onClick={openPortal} style={{ padding:"10px", borderRadius:8, border:"1px solid #bfdbfe", background:"transparent", color:"#2563eb", fontWeight:600, fontSize:13, cursor:"pointer" }}>Manage</button>
              ) : plan.price===0 ? (
                <button disabled style={{ padding:"10px", borderRadius:8, border:"1px solid #e5e3e0", background:"transparent", color:"#a8a29e", fontWeight:600, fontSize:13 }}>Free Plan</button>
              ) : (
                <button onClick={() => checkout(plan.id)} disabled={loading||!stripeReady} style={{
                  padding:"10px", borderRadius:8, border:"none", background:stripeReady?"#1c1917":"#f5f4f2",
                  color:stripeReady?"#fff":"#a8a29e", fontWeight:600, fontSize:13, cursor:stripeReady?"pointer":"not-allowed",
                }}>{loading?"…":`Upgrade to ${plan.name}`}</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const d = await fetch(`${API}/auth/login`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ username, password }),
      }).then(r=>r.json());
      if (d.ok && d.token) { localStorage.setItem("jobpilot_token", d.token); onLogin(d.token); }
      else setError(d.message||"Invalid credentials");
    } catch { setError("Cannot reach server — make sure it is running"); }
    setLoading(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        html, body, #root { height:100%; }
        body { background:#fafaf9; color:#1c1917; font-family:'DM Sans',sans-serif; }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
      `}</style>
      <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#fafaf9" }}>
        <div style={{ width:"100%", maxWidth:400, animation:"fadeUp .25s ease" }}>
          {/* Logo */}
          <div style={{ textAlign:"center", marginBottom:32 }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:10, marginBottom:8 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:"#1c1917", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              </div>
              <span style={{ fontSize:20, fontWeight:700, color:"#1c1917", letterSpacing:-0.5 }}>JobPilot</span>
            </div>
            <div style={{ fontSize:14, color:"#78716c" }}>Your automated job search co-pilot</div>
          </div>

          {/* Card */}
          <div style={{ background:"#fff", borderRadius:16, border:"1px solid #e5e3e0", padding:"28px 28px 24px", boxShadow:"0 1px 3px rgba(0,0,0,.05)" }}>
            <div style={{ fontSize:16, fontWeight:700, color:"#1c1917", marginBottom:20 }}>Sign in</div>
            <form onSubmit={handleLogin} style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div>
                <label style={{ display:"block", fontSize:13, fontWeight:500, color:"#57534e", marginBottom:6 }}>Username</label>
                <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="admin" autoComplete="username" required
                  style={{ width:"100%", background:"#fff", border:"1.5px solid #e5e3e0", borderRadius:9, padding:"10px 12px", fontSize:14, color:"#1c1917", outline:"none", transition:"border-color .15s" }}
                  onFocus={e=>e.target.style.borderColor="#2563eb"}
                  onBlur={e=>e.target.style.borderColor="#e5e3e0"}/>
              </div>
              <div>
                <label style={{ display:"block", fontSize:13, fontWeight:500, color:"#57534e", marginBottom:6 }}>Password</label>
                <div style={{ position:"relative" }}>
                  <input type={showPass?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)}
                    placeholder="••••••••" autoComplete="current-password" required
                    style={{ width:"100%", background:"#fff", border:"1.5px solid #e5e3e0", borderRadius:9, padding:"10px 40px 10px 12px", fontSize:14, color:"#1c1917", outline:"none", transition:"border-color .15s" }}
                    onFocus={e=>e.target.style.borderColor="#2563eb"}
                    onBlur={e=>e.target.style.borderColor="#e5e3e0"}/>
                  <button type="button" onClick={()=>setShowPass(v=>!v)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#a8a29e", cursor:"pointer", fontSize:14, lineHeight:1 }}>
                    {showPass?"🙈":"👁"}
                  </button>
                </div>
              </div>
              {error && (
                <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"9px 12px", fontSize:13, color:"#dc2626" }}>
                  {error}
                </div>
              )}
              <button type="submit" disabled={loading} style={{
                padding:"11px", borderRadius:9, border:"none", background:"#1c1917",
                color:"#fff", fontSize:14, fontWeight:600, cursor:loading?"not-allowed":"pointer", opacity:loading?.7:1, marginTop:4,
              }}>
                {loading ? (
                  <span style={{ display:"inline-flex", alignItems:"center", gap:8 }}>
                    <span style={{ width:14, height:14, border:"2px solid #ffffff40", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .7s linear infinite", display:"inline-block" }}/>
                    Signing in…
                  </span>
                ) : "Sign in →"}
              </button>
            </form>
          </div>
          <div style={{ textAlign:"center", marginTop:16, fontSize:12, color:"#d6d3d1" }}>
            Default: admin / jobpilot2024 — change in .env
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Outreach Page ────────────────────────────────────────────────────────────
function OutreachPage({ showToast, profile }) {
  const [stats, setStats]         = useState({ today:0, total:0, connected:0, running:false });
  const [log, setLog]             = useState([]);
  const [companies, setCompanies] = useState("Amazon, Microsoft, Google, Meta, Expedia, Salesforce, Databricks, Snowflake, Adobe, Nvidia");
  const [loading, setLoading]     = useState(false);

  const fetchOutreach = async () => {
    try {
      const d = await apiFetch(`${API}/outreach`).then(r=>r.json());
      if (d.ok) { setStats(d.stats); setLog(d.log||[]); }
    } catch {}
  };

  useEffect(() => { fetchOutreach(); }, []);

  const startOutreach = async () => {
    setLoading(true);
    try {
      const companyList = companies.split(",").map(c=>c.trim()).filter(Boolean);
      const d = await apiFetch(`${API}/outreach/run`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ companies: companyList }),
      }).then(r=>r.json());
      showToast(d.message, d.ok ? "success" : "error");
      if (d.ok) setTimeout(fetchOutreach, 5000);
    } catch(e) { showToast("Outreach failed: "+e.message,"error"); }
    finally { setLoading(false); }
  };

  const statBox = (label, val, color="#1c1917") => (
    <div style={{ background:"#fff", border:"1px solid #e5e3e0", borderRadius:10, padding:"16px 22px", minWidth:110, textAlign:"center" }}>
      <div style={{ fontSize:26, fontWeight:700, color }}>{val}</div>
      <div style={{ fontSize:12, color:"#78716c", marginTop:2 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ maxWidth:900 }}>
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:22, fontWeight:700, color:"#1c1917", margin:0 }}>Recruiter Outreach</h2>
        <p style={{ color:"#78716c", marginTop:4, fontSize:14 }}>
          Automatically find recruiters at target companies and send personalized LinkedIn connection requests (max 10/day to keep your account safe).
        </p>
      </div>

      {/* Stats */}
      <div style={{ display:"flex", gap:12, marginBottom:28, flexWrap:"wrap" }}>
        {statBox("Sent Today",   stats.today,     "#2563eb")}
        {statBox("Total Sent",   stats.total,     "#1c1917")}
        {statBox("Connected",    stats.connected, "#16a34a")}
        {statBox("Daily Limit",  10,              "#78716c")}
      </div>

      {/* How it works */}
      <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:10, padding:"14px 18px", marginBottom:24, fontSize:13, color:"#0369a1" }}>
        <strong>How it works:</strong> JobPilot searches LinkedIn for Technical Recruiters and Talent Acquisition staff at your target companies, then sends them a personalized connection request using your profile. Responses and connections are tracked below.
      </div>

      {/* Target companies */}
      <div style={{ background:"#fff", border:"1px solid #e5e3e0", borderRadius:10, padding:20, marginBottom:20 }}>
        <label style={{ display:"block", fontWeight:600, fontSize:13, marginBottom:8, color:"#1c1917" }}>
          Target Companies (comma-separated)
        </label>
        <textarea
          value={companies}
          onChange={e=>setCompanies(e.target.value)}
          rows={3}
          style={{ width:"100%", border:"1px solid #d6d3d1", borderRadius:8, padding:"10px 12px", fontSize:13, fontFamily:"inherit", resize:"vertical", boxSizing:"border-box" }}
          placeholder="Amazon, Microsoft, Google, Meta..."
        />
        <div style={{ marginTop:12, display:"flex", gap:10, alignItems:"center" }}>
          <button
            onClick={startOutreach}
            disabled={loading || stats.running || stats.today>=10}
            style={{ background: loading||stats.running||stats.today>=10 ? "#d1d5db" : "#1c1917", color:"#fff", border:"none", borderRadius:8, padding:"10px 22px", fontWeight:600, cursor: loading||stats.running||stats.today>=10 ? "not-allowed":"pointer", fontSize:14 }}
          >
            {loading || stats.running ? "Running..." : stats.today>=10 ? "Daily limit reached" : "Start Outreach"}
          </button>
          <button onClick={fetchOutreach} style={{ background:"none", border:"1px solid #e5e3e0", borderRadius:8, padding:"9px 16px", fontSize:13, cursor:"pointer", color:"#78716c" }}>
            Refresh
          </button>
          <span style={{ fontSize:12, color:"#78716c" }}>{10 - stats.today} slots remaining today</span>
        </div>
      </div>

      {/* Outreach log */}
      <div style={{ background:"#fff", border:"1px solid #e5e3e0", borderRadius:10, overflow:"hidden" }}>
        <div style={{ padding:"14px 20px", borderBottom:"1px solid #e5e3e0", fontWeight:600, fontSize:13, color:"#1c1917" }}>
          Outreach Log ({log.length})
        </div>
        {log.length === 0 ? (
          <div style={{ padding:40, textAlign:"center", color:"#a8a29e", fontSize:14 }}>
            No outreach sent yet. Click "Start Outreach" to begin.
          </div>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#fafaf9", borderBottom:"1px solid #e5e3e0" }}>
                  {["Recruiter","Company","Title","Status","Note","Sent At"].map(h=>(
                    <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontWeight:600, color:"#78716c", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.map((r,i)=>(
                  <tr key={i} style={{ borderBottom:"1px solid #f0efed" }}>
                    <td style={{ padding:"10px 14px", fontWeight:500, color:"#1c1917" }}>
                      {r.profileUrl ? <a href={r.profileUrl} target="_blank" rel="noreferrer" style={{ color:"#2563eb", textDecoration:"none" }}>{r.recruiter||"—"}</a> : (r.recruiter||"—")}
                    </td>
                    <td style={{ padding:"10px 14px", color:"#44403c" }}>{r.company||"—"}</td>
                    <td style={{ padding:"10px 14px", color:"#78716c", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.title||"—"}</td>
                    <td style={{ padding:"10px 14px" }}>
                      {r.connected
                        ? <span style={{ background:"#dcfce7", color:"#16a34a", borderRadius:6, padding:"2px 8px", fontWeight:600, fontSize:11 }}>Connected</span>
                        : r.sent
                          ? <span style={{ background:"#dbeafe", color:"#2563eb", borderRadius:6, padding:"2px 8px", fontWeight:600, fontSize:11 }}>Sent</span>
                          : <span style={{ background:"#fee2e2", color:"#dc2626", borderRadius:6, padding:"2px 8px", fontWeight:600, fontSize:11 }}>Failed</span>
                      }
                    </td>
                    <td style={{ padding:"10px 14px", color:"#78716c", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={r.note}>{r.note||"—"}</td>
                    <td style={{ padding:"10px 14px", color:"#a8a29e", whiteSpace:"nowrap", fontSize:11 }}>{r.sentAt ? new Date(r.sentAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Platform suggestions */}
      <div style={{ marginTop:24, padding:"16px 20px", background:"#fff", border:"1px solid #e5e3e0", borderRadius:10 }}>
        <div style={{ fontWeight:600, fontSize:13, color:"#1c1917", marginBottom:10 }}>Also: Create a Profile on These Platforms (Recruiters Search Here)</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
          {[
            { name:"Hired.com", url:"https://hired.com", desc:"Companies bid on you — best for $100k+ roles" },
            { name:"Wellfound", url:"https://wellfound.com", desc:"Startup jobs — YC-backed companies" },
            { name:"Dice", url:"https://dice.com", desc:"Tech-specific — recruiters search daily" },
            { name:"Indeed Resume", url:"https://indeed.com/create-resume", desc:"Make yourself searchable on Indeed" },
            { name:"Otta", url:"https://otta.com", desc:"Curated tech roles — no noise" },
          ].map(p=>(
            <a key={p.name} href={p.url} target="_blank" rel="noreferrer" style={{ display:"flex", flexDirection:"column", padding:"12px 16px", border:"1px solid #e5e3e0", borderRadius:8, textDecoration:"none", minWidth:160, background:"#fafaf9" }}>
              <span style={{ fontWeight:600, color:"#1c1917", fontSize:13 }}>{p.name}</span>
              <span style={{ color:"#78716c", fontSize:11, marginTop:3 }}>{p.desc}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("jobpilot_token");
    if (!token) { setAuthChecked(true); return; }
    fetch(`${API}/auth/me`, { headers:{ Authorization:`Bearer ${token}` } })
      .then(r=>r.json())
      .then(d => { if (d.ok) setAuthed(true); else localStorage.removeItem("jobpilot_token"); })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  const handleLogin  = () => setAuthed(true);
  const handleLogout = () => { localStorage.removeItem("jobpilot_token"); setAuthed(false); };

  const [tab, setTab]                         = useState("dashboard");
  const [settingsTab, setSettingsTab]         = useState("profile");
  const [foundJobs, setFoundJobs]             = useState([]);
  const [jobSearch, setJobSearch]             = useState("");
  const [sortBy, setSortBy]                   = useState("score");
  const [minScore, setMinScore]               = useState(0);
  const [filterPlatform, setFilterPlatform]   = useState("All");
  const [filterEasyApply, setFilterEasyApply] = useState(false);
  const [isRunning, setIsRunning]             = useState(false);
  const [stats, setStats]                     = useState({ applied:0, found:0, skipped:0, errors:0 });
  const [applications, setApplications]       = useState([]);
  const [logs, setLogs]                       = useState([]);
  const [settings, setSettings]               = useState(null);
  const [settingsForm, setSettingsForm]       = useState(null);
  const [loading, setLoading]                 = useState(false);
  const [toast, setToast]                     = useState(null);
  const [selectedJob, setSelectedJob]         = useState(null);
  const [atsCompanies, setAtsCompanies]       = useState(null);
  const [pipeline, setPipeline]               = useState({});
  const [talkingPoints, setTalkingPoints]     = useState(null);

  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  const fetchStatus = useCallback(async () => {
    try {
      const d = await apiFetch(`${API}/status`).then(r=>r.json());
      setIsRunning(d.isRunning); setStats(d.stats); setSettings(d.settings);
      setSettingsForm(p => p ?? d.settings);
    } catch {}
  }, []);

  const fetchApplications = useCallback(async () => {
    try { const d = await apiFetch(`${API}/applications?limit=500`).then(r=>r.json()); setApplications(d.items||[]); } catch {}
  }, []);

  const fetchLogs = useCallback(async () => {
    try { setLogs(await apiFetch(`${API}/logs?limit=200`).then(r=>r.json())); } catch {}
  }, []);

  const fetchFoundJobs = useCallback(async (q="") => {
    try {
      const d = await apiFetch(`${API}/jobs?limit=500${q?`&q=${encodeURIComponent(q)}`:"" }`).then(r=>r.json());
      setFoundJobs(d.items||[]);
    } catch {}
  }, []);

  const fetchPipeline = useCallback(async () => {
    try { const d = await apiFetch(`${API}/pipeline`).then(r=>r.json()); setPipeline(d.stages||{}); } catch {}
  }, []);

  useEffect(() => {
    if (!authed) return;
    apiFetch(`${API}/ats-companies`).then(r=>r.json()).then(setAtsCompanies).catch(()=>{});
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    fetchStatus(); fetchApplications(); fetchLogs(); fetchFoundJobs(); fetchPipeline();
    const iv = setInterval(() => {
      fetchStatus(); fetchApplications(); fetchLogs(); fetchFoundJobs(jobSearch); fetchPipeline();
    }, 5000);
    return () => clearInterval(iv);
  }, [authed, fetchStatus, fetchApplications, fetchLogs, fetchFoundJobs, fetchPipeline, jobSearch]);

  const uniquePlatforms = useMemo(() => {
    const plats = [...new Set(foundJobs.map(j=>j.platform).filter(Boolean))].sort();
    return ["All", ...plats];
  }, [foundJobs]);

  const displayedJobs = useMemo(() => {
    let jobs = [...foundJobs];
    if (jobSearch) { const q = jobSearch.toLowerCase(); jobs = jobs.filter(j=>`${j.title} ${j.company} ${j.location} ${j.platform}`.toLowerCase().includes(q)); }
    if (minScore > 0) jobs = jobs.filter(j=>(j.score||0)>=minScore);
    if (filterPlatform !== "All") jobs = jobs.filter(j=>j.platform===filterPlatform);
    if (filterEasyApply) jobs = jobs.filter(j=>j.easyApply);
    jobs.sort((a,b) => {
      if (sortBy==="score")   return (b.score||0)-(a.score||0);
      if (sortBy==="date")    return new Date(b.savedAt)-new Date(a.savedAt);
      if (sortBy==="company") return (a.company||"").localeCompare(b.company||"");
      return 0;
    });
    return jobs;
  }, [foundJobs, jobSearch, minScore, filterPlatform, filterEasyApply, sortBy]);

  const hotJobs = useMemo(() => foundJobs.filter(j=>j.score>=3.5).slice(0,5), [foundJobs]);
  const statusCounts   = applications.reduce((acc,a) => { acc[a.status]=(acc[a.status]||0)+1; return acc; }, {});
  const platformCounts = applications.reduce((acc,a) => { acc[a.platform]=(acc[a.platform]||0)+1; return acc; }, {});

  const toggleAutomation = async () => {
    setLoading(true);
    try {
      const d = await apiFetch(`${API}/${isRunning?"stop":"start"}`, { method:"POST" }).then(r=>r.json());
      if (d.ok) { setIsRunning(!isRunning); showToast(isRunning?"Stopped":"Scanner started"); }
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
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(settingsForm),
      }).then(r=>r.json());
      if (d.ok) { setSettings(d.settings); showToast("Settings saved"); }
    } catch { showToast("Failed","error"); }
  };

  const deleteApplication = async (id) => {
    await apiFetch(`${API}/applications/${id}`, { method:"DELETE" });
    setApplications(p=>p.filter(a=>a.id!==id));
  };

  const updateStage = async (id, stage) => {
    try {
      await apiFetch(`${API}/applications/${id}/stage`, {
        method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({stage}),
      });
      setApplications(prev=>prev.map(a=>a.id===id?{...a,status:stage}:a));
      fetchPipeline(); showToast(`Moved to ${stage}`);
    } catch { showToast("Failed","error"); }
  };

  const fetchTalkingPoints = async (job) => {
    try {
      const d = await apiFetch(`${API}/generate-answers`, {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({job}),
      }).then(r=>r.json());
      setTalkingPoints({...d, jobTitle:job.title, company:job.company});
    } catch { showToast("Could not generate prep","error"); }
  };

  // ── Auth gate ────────────────────────────────────────────────────────────────
  if (!authChecked) return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        html, body, #root { height:100%; }
        body { background:#fafaf9; font-family:'DM Sans',sans-serif; }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>
      <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#fafaf9" }}>
        <div style={{ width:28, height:28, border:"2.5px solid #e5e3e0", borderTopColor:"#1c1917", borderRadius:"50%", animation:"spin .7s linear infinite" }}/>
      </div>
    </>
  );
  if (!authed) return <LoginPage onLogin={handleLogin}/>;

  // ── Input style helper ────────────────────────────────────────────────────────
  const inp = { width:"100%", background:"#fff", border:"1.5px solid #e5e3e0", borderRadius:8, padding:"9px 11px", fontSize:13, color:"#1c1917", outline:"none" };
  const ta  = { ...inp, resize:"vertical" };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        html, body, #root { height:100%; }
        body { background:#fafaf9; color:#1c1917; font-family:'DM Sans',sans-serif; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#e5e3e0; border-radius:4px; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
        @keyframes pulse  { 0%,100% { opacity:1; } 50% { opacity:.3; } }
        @keyframes spin   { to { transform:rotate(360deg); } }
        input:focus, textarea:focus, select:focus { border-color:#2563eb !important; outline:none; }
      `}</style>

      <div style={{ display:"flex", height:"100vh", overflow:"hidden" }}>

        {/* ── SIDEBAR ─────────────────────────────────────────────────────────── */}
        <aside style={{
          width:220, flexShrink:0, background:"#fff", borderRight:"1px solid #f0eeec",
          display:"flex", flexDirection:"column", height:"100vh",
        }}>
          {/* Brand */}
          <div style={{ padding:"20px 20px 16px", borderBottom:"1px solid #f0eeec" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:"#1c1917", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:14, color:"#1c1917", letterSpacing:-0.3 }}>JobPilot</div>
                <div style={{ fontSize:10, color:"#a8a29e", marginTop:1 }}>Automated job search</div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ flex:1, padding:"12px 10px", display:"flex", flexDirection:"column", gap:2, overflowY:"auto" }}>
            {NAV.map(item => (
              <button key={item.id} onClick={() => setTab(item.id)} style={{
                display:"flex", alignItems:"center", gap:10, padding:"9px 10px",
                borderRadius:8, border:"none", cursor:"pointer", width:"100%", textAlign:"left",
                background: tab===item.id ? "#f0f0f0" : "transparent",
                color: tab===item.id ? "#1c1917" : "#78716c",
                fontWeight: tab===item.id ? 600 : 400,
                fontSize:13, transition:"all .1s",
              }}
                onMouseEnter={e => { if (tab!==item.id) e.currentTarget.style.background="#fafaf9"; }}
                onMouseLeave={e => { if (tab!==item.id) e.currentTarget.style.background="transparent"; }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
                  {item.icon.split(" M").map((seg,i) => <path key={i} d={i===0?seg:"M"+seg}/>)}
                </svg>
                <span>{item.label}</span>
                {item.id==="jobs" && foundJobs.length>0 && (
                  <span style={{ marginLeft:"auto", background:tab==="jobs"?"#1c1917":"#f0f0f0", color:tab==="jobs"?"#fff":"#78716c", borderRadius:10, padding:"1px 7px", fontSize:11, fontWeight:600 }}>
                    {foundJobs.length}
                  </span>
                )}
                {item.id==="applications" && applications.length>0 && (
                  <span style={{ marginLeft:"auto", background:tab==="applications"?"#1c1917":"#f0f0f0", color:tab==="applications"?"#fff":"#78716c", borderRadius:10, padding:"1px 7px", fontSize:11, fontWeight:600 }}>
                    {applications.length}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Status & profile */}
          <div style={{ borderTop:"1px solid #f0eeec", padding:"14px 16px" }}>
            {settings?.profile?.name && (
              <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:12 }}>
                <Avatar name={settings.profile.name} size={30}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:"#1c1917", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{settings.profile.name}</div>
                  <div style={{ fontSize:10, color:"#a8a29e" }}>{(settings.profile.targetRoles||"").split(",")[0]?.trim()||"Job Seeker"}</div>
                </div>
              </div>
            )}
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{
                width:7, height:7, borderRadius:"50%", flexShrink:0,
                background: isRunning ? "#16a34a" : "#d6d3d1",
                animation: isRunning ? "pulse 2s ease infinite" : "none",
              }}/>
              <span style={{ fontSize:12, color: isRunning?"#16a34a":"#a8a29e" }}>
                {isRunning ? "Scanner running" : "Stopped"}
              </span>
            </div>
          </div>
        </aside>

        {/* ── MAIN ────────────────────────────────────────────────────────────── */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>

          {/* Topbar */}
          <header style={{
            height:56, flexShrink:0, background:"#fff", borderBottom:"1px solid #f0eeec",
            display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 28px",
          }}>
            <div style={{ fontSize:15, fontWeight:700, color:"#1c1917" }}>
              {NAV.find(n=>n.id===tab)?.label}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#a8a29e" }}>
                <span style={{ color:"#1c1917", fontWeight:600 }}>{fmt(stats.found)}</span> found
                <span style={{ color:"#e5e3e0" }}>|</span>
                <span style={{ color:"#1c1917", fontWeight:600 }}>{fmt(applications.length)}</span> tracked
              </div>
              <button onClick={toggleAutomation} disabled={loading} style={{
                padding:"7px 18px", borderRadius:8, border:`1px solid ${isRunning?"#fecaca":"#bbf7d0"}`,
                background: isRunning ? "#fef2f2" : "#f0fdf4",
                color: isRunning ? "#dc2626" : "#16a34a",
                fontWeight:600, fontSize:12, cursor:loading?"not-allowed":"pointer",
              }}>
                {loading ? "…" : isRunning ? "Stop" : "Start Scanner"}
              </button>
              <button onClick={handleLogout} title="Sign out" style={{
                padding:"7px 12px", borderRadius:8, border:"1px solid #e5e3e0",
                background:"transparent", color:"#a8a29e", cursor:"pointer", fontSize:13, fontWeight:500,
              }}
                onMouseEnter={e=>{ e.currentTarget.style.color="#dc2626"; e.currentTarget.style.borderColor="#fecaca"; }}
                onMouseLeave={e=>{ e.currentTarget.style.color="#a8a29e"; e.currentTarget.style.borderColor="#e5e3e0"; }}
              >Sign out</button>
            </div>
          </header>

          {/* Content area */}
          <main style={{ flex:1, overflowY: tab==="jobs"||tab==="pipeline" ? "hidden" : "auto", padding: tab==="jobs"||tab==="pipeline" ? 0 : "28px 32px", background:"#fafaf9" }}>

            {/* ── OVERVIEW ──────────────────────────────────────────────────── */}
            {tab==="dashboard" && (
              <div style={{ display:"flex", flexDirection:"column", gap:24 }}>

                {/* Stat cards */}
                <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                  <StatCard label="Jobs Found"   value={stats.found}            sub={`${stats.skipped||0} filtered out`}/>
                  <StatCard label="Applications" value={applications.length}    sub="total tracked"/>
                  <StatCard label="Interviews"   value={statusCounts["interviewing"]||0} sub="in progress"/>
                  <StatCard label="Hot Matches"  value={hotJobs.length}          sub="score ≥ 3.5"/>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:20 }}>
                  {/* Top matches */}
                  <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e5e3e0", overflow:"hidden" }}>
                    <div style={{ padding:"16px 20px", borderBottom:"1px solid #f0eeec", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontSize:13, fontWeight:600, color:"#1c1917" }}>Top Matches</span>
                      <button onClick={() => setTab("jobs")} style={{ background:"none", border:"none", color:"#2563eb", fontSize:12, cursor:"pointer", fontWeight:500 }}>View all →</button>
                    </div>
                    {hotJobs.length===0 && (
                      <div style={{ padding:"28px 20px", color:"#a8a29e", fontSize:13 }}>No hot matches yet. Start the scanner.</div>
                    )}
                    {hotJobs.map(job => (
                      <div key={job.id} onClick={() => { setSelectedJob(job); setTab("jobs"); }} style={{
                        padding:"13px 20px", borderBottom:"1px solid #f5f4f2", cursor:"pointer",
                        display:"flex", gap:12, alignItems:"center",
                      }}
                        onMouseEnter={e=>e.currentTarget.style.background="#fafaf9"}
                        onMouseLeave={e=>e.currentTarget.style.background="#fff"}
                      >
                        <Avatar name={job.company} size={34}/>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:"#1c1917", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job.title}</div>
                          <div style={{ fontSize:12, color:"#a8a29e" }}>{job.company}</div>
                        </div>
                        <ScoreBadge score={job.score} size="sm"/>
                      </div>
                    ))}
                  </div>

                  {/* Pipeline summary + activity */}
                  <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                    <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e5e3e0", padding:"16px 18px" }}>
                      <div style={{ fontSize:13, fontWeight:600, color:"#1c1917", marginBottom:14 }}>Pipeline</div>
                      {PIPELINE_STAGES.slice(0,5).map(s => {
                        const count = (pipeline[s.key]||[]).length;
                        return (
                          <div key={s.key} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                            <span style={{ width:7, height:7, borderRadius:"50%", background:s.color, flexShrink:0 }}/>
                            <span style={{ flex:1, fontSize:12, color:"#57534e" }}>{s.label}</span>
                            <span style={{ fontSize:13, fontWeight:700, color:count>0?s.color:"#d6d3d1" }}>{count}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e5e3e0", padding:"16px 18px" }}>
                      <div style={{ fontSize:13, fontWeight:600, color:"#1c1917", marginBottom:12 }}>Recent Activity</div>
                      {logs.length===0 && <div style={{ fontSize:12, color:"#a8a29e" }}>No activity yet.</div>}
                      {logs.slice(0,6).map(l => (
                        <div key={l.id} style={{ display:"flex", gap:8, marginBottom:7, alignItems:"flex-start" }}>
                          <span style={{ fontSize:11, color:"#a8a29e", flexShrink:0, marginTop:1 }}>
                            {new Date(l.timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                          </span>
                          <span style={{ fontSize:12, color:"#57534e", lineHeight:1.4, flex:1 }}>{l.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── JOBS (split-pane) ──────────────────────────────────────────── */}
            {tab==="jobs" && (
              <div style={{ display:"flex", height:"100%", overflow:"hidden" }}>
                {/* Left: job list */}
                <div style={{ width:340, flexShrink:0, display:"flex", flexDirection:"column", borderRight:"1px solid #e5e3e0", background:"#fff", overflow:"hidden" }}>
                  {/* Search */}
                  <div style={{ padding:"12px 14px", borderBottom:"1px solid #f0eeec" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, background:"#fafaf9", border:"1.5px solid #e5e3e0", borderRadius:9, padding:"8px 12px" }}>
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#a8a29e" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                      </svg>
                      <input placeholder="Search jobs…" value={jobSearch}
                        onChange={e=>{setJobSearch(e.target.value);fetchFoundJobs(e.target.value);}}
                        style={{ flex:1, background:"transparent", border:"none", color:"#1c1917", fontSize:13, outline:"none" }}/>
                      <span style={{ fontSize:11, color:"#d6d3d1", flexShrink:0 }}>{displayedJobs.length}</span>
                    </div>
                  </div>

                  {/* Filters */}
                  <div style={{ padding:"8px 12px", borderBottom:"1px solid #f0eeec", display:"flex", gap:6, flexWrap:"wrap" }}>
                    {[{k:"score",l:"Best match"},{k:"date",l:"Newest"},{k:"company",l:"A–Z"}].map(o => (
                      <button key={o.k} onClick={()=>setSortBy(o.k)} style={{
                        padding:"4px 10px", borderRadius:6, border:"1px solid #e5e3e0", fontSize:11, fontWeight:500, cursor:"pointer",
                        background:sortBy===o.k?"#1c1917":"transparent",
                        color:sortBy===o.k?"#fff":"#78716c",
                      }}>{o.l}</button>
                    ))}
                    <button onClick={()=>setFilterEasyApply(v=>!v)} style={{
                      padding:"4px 10px", borderRadius:6, border:`1px solid ${filterEasyApply?"#bbf7d0":"#e5e3e0"}`,
                      background:filterEasyApply?"#f0fdf4":"transparent",
                      color:filterEasyApply?"#16a34a":"#78716c",
                      fontSize:11, fontWeight:500, cursor:"pointer",
                    }}>Easy Apply</button>
                  </div>

                  {/* Platform chips */}
                  <div style={{ padding:"8px 12px", borderBottom:"1px solid #f5f4f2", display:"flex", gap:5, overflowX:"auto" }}>
                    {uniquePlatforms.map(p => {
                      const m = Object.values(PLATFORM_META).find(pm=>pm.label===p);
                      return (
                        <button key={p} onClick={()=>setFilterPlatform(p)} style={{
                          padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:500, cursor:"pointer", whiteSpace:"nowrap",
                          border:`1px solid ${filterPlatform===p?(m?.color||"#1c1917")+"50":"#e5e3e0"}`,
                          background:filterPlatform===p?(m?.color||"#1c1917")+"10":"transparent",
                          color:filterPlatform===p?(m?.color||"#1c1917"):"#78716c",
                        }}>{p}</button>
                      );
                    })}
                  </div>

                  {/* List */}
                  <div style={{ flex:1, overflowY:"auto" }}>
                    {displayedJobs.length===0 && (
                      <div style={{ padding:"32px 20px", textAlign:"center", color:"#a8a29e", fontSize:13 }}>
                        {foundJobs.length===0 ? "No jobs yet — start the scanner" : "No matches — adjust filters"}
                      </div>
                    )}
                    {displayedJobs.map(job => (
                      <JobRow key={job.id} job={job} selected={selectedJob?.id===job.id} onClick={setSelectedJob}/>
                    ))}
                  </div>
                </div>

                {/* Right: detail */}
                <JobDetailPanel job={selectedJob} onApply={handleApplyNow}/>
              </div>
            )}

            {/* ── PIPELINE ──────────────────────────────────────────────────── */}
            {tab==="pipeline" && (
              <div style={{ height:"100%", overflow:"hidden", display:"flex", flexDirection:"column", background:"#fafaf9" }}>
                {talkingPoints && (
                  <div style={{ background:"#fff", borderBottom:"1px solid #e5e3e0", padding:"14px 28px", position:"relative" }}>
                    <button onClick={()=>setTalkingPoints(null)} style={{
                      position:"absolute", top:14, right:20, background:"none", border:"1px solid #e5e3e0",
                      color:"#a8a29e", borderRadius:6, cursor:"pointer", width:26, height:26, fontSize:12,
                    }}>✕</button>
                    <div style={{ fontSize:12, fontWeight:700, color:"#2563eb", marginBottom:8 }}>
                      Interview Prep — {talkingPoints.jobTitle} @ {talkingPoints.company}
                    </div>
                    <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                      {talkingPoints.matchedSkills?.length > 0 && (
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          {talkingPoints.matchedSkills.map(s => (
                            <span key={s} style={{ background:"#f0fdf4", color:"#16a34a", border:"1px solid #bbf7d0", borderRadius:20, padding:"2px 9px", fontSize:11 }}>✓ {s}</span>
                          ))}
                        </div>
                      )}
                      {talkingPoints.talkingPoints?.slice(0,2).map((tp,i) => (
                        <div key={i} style={{ fontSize:12, color:"#57534e", padding:"5px 10px", background:"#fafaf9", borderRadius:6, border:"1px solid #e5e3e0" }}>{tp}</div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ flex:1, overflowX:"auto", overflowY:"hidden", padding:"20px 24px" }}>
                  <div style={{ display:"flex", gap:14, alignItems:"flex-start", height:"100%" }}>
                    {PIPELINE_STAGES.map(({ key, label, color }) => {
                      const cards = pipeline[key]||[];
                      return (
                        <div key={key} style={{
                          width:200, minWidth:200, flexShrink:0, display:"flex", flexDirection:"column",
                          background:"#fff", borderRadius:12, border:"1px solid #e5e3e0",
                          maxHeight:"calc(100vh - 200px)",
                        }}>
                          <div style={{ padding:"12px 14px", borderBottom:"1px solid #f0eeec", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                              <span style={{ width:8, height:8, borderRadius:"50%", background:color }}/>
                              <span style={{ fontSize:12, fontWeight:600, color:"#1c1917" }}>{label}</span>
                            </div>
                            <span style={{ background:`${color}15`, color, borderRadius:10, padding:"1px 7px", fontSize:11, fontWeight:600 }}>{cards.length}</span>
                          </div>
                          <div style={{ flex:1, overflowY:"auto", padding:"8px" }}>
                            {cards.length===0 && <div style={{ color:"#d6d3d1", fontSize:11, textAlign:"center", padding:"16px 0" }}>Empty</div>}
                            {cards.map(a => (
                              <PipelineCard key={a.id} app={a} stageKey={key}
                                onMove={updateStage}
                                onSelect={(app) => { setSelectedJob(app); fetchTalkingPoints(app); }}/>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── APPLICATIONS ──────────────────────────────────────────────── */}
            {tab==="applications" && (
              <div>
                {/* Summary row */}
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:20 }}>
                  {Object.entries(statusCounts).map(([s,c]) => {
                    const m = STATUS_META[s]; if (!m) return null;
                    return (
                      <div key={s} style={{ display:"flex", alignItems:"center", gap:6, background:"#fff", border:`1px solid ${m.color}25`, borderRadius:8, padding:"6px 14px" }}>
                        <span style={{ width:6, height:6, borderRadius:"50%", background:m.color }}/>
                        <span style={{ fontSize:13, fontWeight:600, color:"#1c1917" }}>{c}</span>
                        <span style={{ fontSize:12, color:"#a8a29e" }}>{m.label}</span>
                      </div>
                    );
                  })}
                </div>

                <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e5e3e0", overflow:"hidden" }}>
                  <div style={{ padding:"14px 20px", borderBottom:"1px solid #f0eeec" }}>
                    <span style={{ fontSize:13, fontWeight:600, color:"#1c1917" }}>{applications.length} Application{applications.length!==1?"s":""}</span>
                  </div>
                  {applications.length===0 && <div style={{ padding:"28px 20px", color:"#a8a29e", fontSize:13 }}>No applications yet.</div>}
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"#fafaf9" }}>
                          {["","Title","Company","Platform","Score","Status","Applied",""].map((h,i) => (
                            <th key={i} style={{ padding:"10px 16px", textAlign:"left", fontSize:11, color:"#a8a29e", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em", borderBottom:"1px solid #f0eeec", whiteSpace:"nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {applications.map(a => (
                          <tr key={a.id} style={{ borderBottom:"1px solid #f5f4f2" }}
                            onMouseEnter={e=>e.currentTarget.style.background="#fafaf9"}
                            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            <td style={{ padding:"11px 16px" }}><Avatar name={a.company} size={28}/></td>
                            <td style={{ padding:"11px 16px" }}>
                              <button onClick={()=>setSelectedJob(a)} style={{ background:"none", border:"none", color:"#1c1917", fontWeight:600, cursor:"pointer", fontSize:13, padding:0 }}
                                onMouseEnter={e=>e.currentTarget.style.color="#2563eb"}
                                onMouseLeave={e=>e.currentTarget.style.color="#1c1917"}>{a.title}</button>
                            </td>
                            <td style={{ padding:"11px 16px", fontSize:13, color:"#78716c" }}>{a.company}</td>
                            <td style={{ padding:"11px 16px" }}><PlatformTag platform={a.platform}/></td>
                            <td style={{ padding:"11px 16px" }}>{a.score!=null&&<ScoreBadge score={a.score} size="sm"/>}</td>
                            <td style={{ padding:"11px 16px" }}><StatusPill status={a.status}/></td>
                            <td style={{ padding:"11px 16px", fontSize:12, color:"#a8a29e", whiteSpace:"nowrap" }}>{a.postedAt?new Date(a.postedAt).toLocaleDateString():"—"}</td>
                            <td style={{ padding:"11px 16px" }}>
                              <button onClick={()=>deleteApplication(a.id)} style={{ background:"none", border:"none", color:"#d6d3d1", cursor:"pointer", fontSize:14, borderRadius:4, padding:"2px 5px" }}
                                onMouseEnter={e=>e.currentTarget.style.color="#dc2626"}
                                onMouseLeave={e=>e.currentTarget.style.color="#d6d3d1"}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── OUTREACH ──────────────────────────────────────────────────── */}
            {tab==="outreach" && (
              <OutreachPage showToast={showToast} profile={settings?.profile||{}} />
            )}

            {/* ── SETTINGS ──────────────────────────────────────────────────── */}
            {tab==="settings" && settingsForm && (
              <div style={{ maxWidth:860 }}>
                {/* Settings tabs */}
                <div style={{ display:"flex", gap:0, borderBottom:"1px solid #e5e3e0", marginBottom:24 }}>
                  {[["profile","Profile"],["search","Search"],["agents","Agents"],["billing","Billing"]].map(([id,lbl]) => (
                    <button key={id} onClick={()=>setSettingsTab(id)} style={{
                      padding:"10px 18px", background:"none", border:"none",
                      borderBottom: settingsTab===id?"2px solid #1c1917":"2px solid transparent",
                      color: settingsTab===id?"#1c1917":"#a8a29e",
                      fontWeight: settingsTab===id?600:400, fontSize:13, cursor:"pointer",
                    }}>{lbl}</button>
                  ))}
                </div>

                {/* Profile tab */}
                {settingsTab==="profile" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

                    {/* ── Resume Upload Card ── */}
                    <ResumeUploadCard onParsed={(profile) => { setSettingsForm(f => ({...f, profile:{...f.profile,...profile}})); showToast("Resume parsed — profile auto-filled!"); }} showToast={showToast} currentResumePath={settingsForm?.profile?.resumePath}/>

                    <div style={{ background:"#fff", borderRadius:14, padding:"22px 24px", border:"1px solid #e5e3e0" }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#1c1917", marginBottom:18 }}>Personal Information</div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:14 }}>
                        <Field label="Full Name"><input style={inp} value={settingsForm.profile?.name||""} placeholder="Jane Smith" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,name:e.target.value}}))} /></Field>
                        <Field label="Email"><input style={inp} type="email" value={settingsForm.profile?.email||""} placeholder="jane@email.com" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,email:e.target.value}}))} /></Field>
                        <Field label="Phone"><input style={inp} value={settingsForm.profile?.phone||""} placeholder="+1 555 000 0000" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,phone:e.target.value}}))} /></Field>
                        <Field label="Location"><input style={inp} value={settingsForm.profile?.location||""} placeholder="Seattle, WA" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,location:e.target.value}}))} /></Field>
                        <Field label="Years Experience"><input style={inp} type="number" min={0} value={settingsForm.profile?.yearsExperience||""} onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,yearsExperience:e.target.value}}))} /></Field>
                        <Field label="School"><input style={inp} value={settingsForm.profile?.school||""} placeholder="MIT, Stanford…" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,school:e.target.value}}))} /></Field>
                      </div>
                      <Field label="Target Roles (comma-separated)"><input style={inp} value={settingsForm.profile?.targetRoles||""} placeholder="Data Scientist, ML Engineer" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,targetRoles:e.target.value}}))} /></Field>
                      <Field label="Skills (comma-separated)">
                        <textarea style={ta} rows={3}
                          value={Array.isArray(settingsForm.profile?.skills)?settingsForm.profile.skills.join(", "):(settingsForm.profile?.skills||"")}
                          placeholder="Python, SQL, PyTorch, AWS…"
                          onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,skills:e.target.value}}))}
                          onBlur={e=>setSettingsForm(f=>({...f,profile:{...f.profile,skills:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)}}))}/>
                      </Field>
                      <Field label="Professional Summary">
                        <textarea style={ta} rows={3} value={settingsForm.profile?.summary||""} placeholder="Results-driven engineer…" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,summary:e.target.value}}))} />
                      </Field>
                    </div>

                    {/* Work Authorization */}
                    <div style={{ background:"#fff", borderRadius:14, padding:"22px 24px", border:"1px solid #e5e3e0" }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#1c1917", marginBottom:14 }}>Work Authorization & Location</div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:14 }}>
                        <Field label="Over 18?">
                          <select style={inp} value={settingsForm.profile?.isOver18===false?"No":"Yes"} onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,isOver18:e.target.value==="Yes"}}))}>
                            <option>Yes</option><option>No</option>
                          </select>
                        </Field>
                        <Field label="Authorized to work?">
                          <select style={inp} value={settingsForm.profile?.workAuthorized===false?"No":"Yes"} onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,workAuthorized:e.target.value==="Yes"}}))}>
                            <option>Yes</option><option>No</option>
                          </select>
                        </Field>
                        <Field label="Needs visa sponsorship?">
                          <select style={inp} value={settingsForm.profile?.requiresSponsorship?"Yes":"No"} onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,requiresSponsorship:e.target.value==="Yes"}}))}>
                            <option>No</option><option>Yes</option>
                          </select>
                        </Field>
                        <Field label="Willing to relocate?">
                          <select style={inp} value={settingsForm.profile?.willingToRelocate===false?"No":"Yes"} onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,willingToRelocate:e.target.value==="Yes"}}))}>
                            <option>Yes</option><option>No</option>
                          </select>
                        </Field>
                        <Field label="In-person 2-3 days/wk?">
                          <select style={inp} value={settingsForm.profile?.inPersonOk===false?"No":"Yes"} onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,inPersonOk:e.target.value==="Yes"}}))}>
                            <option>Yes</option><option>No</option>
                          </select>
                        </Field>
                        <Field label="Preferred office hub">
                          <select style={inp} value={settingsForm.profile?.preferredOfficeHub||"Seattle, Washington"} onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,preferredOfficeHub:e.target.value}}))}>
                            {["Seattle, Washington","San Francisco (Union Square)","New York (1 Penn)","London, UK","No, but willing to relocate","No, and not willing to relocate"].map(v=><option key={v}>{v}</option>)}
                          </select>
                        </Field>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                        <Field label="Python years experience">
                          <select style={inp} value={settingsForm.profile?.pythonYears||"5 - 7 years"} onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,pythonYears:e.target.value}}))}>
                            {["0 - 3 years","3 - 5 years","5 - 7 years","7+ years"].map(v=><option key={v}>{v}</option>)}
                          </select>
                        </Field>
                        <Field label="% day coding">
                          <select style={inp} value={settingsForm.profile?.codingPercentage||"75%"} onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,codingPercentage:e.target.value}}))}>
                            {["0%","25%","50%","75%","100%"].map(v=><option key={v}>{v}</option>)}
                          </select>
                        </Field>
                      </div>
                    </div>

                    {/* EEO Self-Identification */}
                    <div style={{ background:"#fff", borderRadius:14, padding:"22px 24px", border:"1px solid #e5e3e0" }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#1c1917", marginBottom:4 }}>EEO Self-Identification</div>
                      <div style={{ fontSize:12, color:"#a8a29e", marginBottom:14 }}>Used for voluntary EEO sections on job applications. Defaults to "Decline to self-identify".</div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
                        <Field label="Gender">
                          <select style={inp} value={settingsForm.profile?.gender||"Decline to self-identify"} onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,gender:e.target.value}}))}>
                            {["Decline to self-identify","Female","Male"].map(v=><option key={v}>{v}</option>)}
                          </select>
                        </Field>
                        <Field label="Race / Ethnicity">
                          <select style={inp} value={settingsForm.profile?.race||"Decline to self-identify"} onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,race:e.target.value}}))}>
                            {["Decline to self-identify","Asian (Not Hispanic or Latino)","White (Not Hispanic or Latino)","Black or African American (Not Hispanic or Latino)","Hispanic or Latino","Two or More Races (Not Hispanic or Latino)","Native Hawaiian or Other Pacific Islander (Not Hispanic or Latino)","American Indian or Alaska Native (Not Hispanic or Latino)"].map(v=><option key={v}>{v}</option>)}
                          </select>
                        </Field>
                        <Field label="Veteran Status">
                          <select style={inp} value={settingsForm.profile?.veteranStatus||"I am not a protected veteran"} onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,veteranStatus:e.target.value}}))}>
                            {["I am not a protected veteran","I decline to self-identify for protected veteran status","I identify as one or more of the classifications of protected veteran listed above"].map(v=><option key={v}>{v}</option>)}
                          </select>
                        </Field>
                      </div>
                    </div>

                    {/* Open-text Application Answers */}
                    <div style={{ background:"#fff", borderRadius:14, padding:"22px 24px", border:"1px solid #e5e3e0" }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#1c1917", marginBottom:4 }}>Application Essay Answers</div>
                      <div style={{ fontSize:12, color:"#a8a29e", marginBottom:14 }}>Pre-written answers for common open-text questions. The AI will personalise these for each company.</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                        <Field label={`"Why are you interested in joining [company]?"`}>
                          <textarea style={ta} rows={3} value={settingsForm.profile?.whyJoinAnswer||""} placeholder="I'm excited to join [company] because…" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,whyJoinAnswer:e.target.value}}))} />
                        </Field>
                        <Field label={`"Describe an experience aligning with our values / culture"`}>
                          <textarea style={ta} rows={3} value={settingsForm.profile?.culturalValuesAnswer||""} placeholder="At my previous role at [company], I demonstrated ownership by…" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,culturalValuesAnswer:e.target.value}}))} />
                        </Field>
                        <Field label="Additional Information (catch-all)">
                          <textarea style={ta} rows={2} value={settingsForm.profile?.additionalInfo||""} placeholder="Any additional context you'd like to share…" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,additionalInfo:e.target.value}}))} />
                        </Field>
                      </div>
                    </div>

                    {/* Education */}
                    <div style={{ background:"#fff", borderRadius:14, padding:"22px 24px", border:"1px solid #e5e3e0" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:"#1c1917" }}>Education</div>
                        <button onClick={()=>setSettingsForm(f=>{const edu=[...(f.profile?.education||[]),{school:"",degree:"",major:"",startYear:"",endYear:"",gpa:""}];return{...f,profile:{...f.profile,education:edu}};})}
                          style={{ padding:"6px 14px", background:"#1c1917", color:"#fff", border:"none", borderRadius:7, fontSize:12, fontWeight:600, cursor:"pointer" }}>+ Add</button>
                      </div>
                      {!(settingsForm.profile?.education||[]).length && <div style={{ fontSize:13, color:"#a8a29e", textAlign:"center", padding:"16px 0" }}>No education added yet.</div>}
                      {(settingsForm.profile?.education||[]).map((edu,i) => (
                        <div key={i} style={{ background:"#fafaf9", borderRadius:10, padding:"16px", border:"1px solid #f0eeec", marginBottom:10, position:"relative" }}>
                          <button onClick={()=>setSettingsForm(f=>{const a=[...(f.profile?.education||[])];a.splice(i,1);return{...f,profile:{...f.profile,education:a}};})}
                            style={{ position:"absolute", top:12, right:12, background:"none", border:"none", color:"#d6d3d1", cursor:"pointer", fontSize:16 }}
                            onMouseEnter={e=>e.currentTarget.style.color="#dc2626"} onMouseLeave={e=>e.currentTarget.style.color="#d6d3d1"}>✕</button>
                          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:10, marginBottom:10 }}>
                            <Field label="School"><input style={inp} value={edu.school||""} placeholder="MIT" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.education||[])];a[i]={...a[i],school:e.target.value};return{...f,profile:{...f.profile,education:a}};})}/></Field>
                            <Field label="Start Year"><input style={inp} value={edu.startYear||""} placeholder="2018" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.education||[])];a[i]={...a[i],startYear:e.target.value};return{...f,profile:{...f.profile,education:a}};})}/></Field>
                            <Field label="End Year"><input style={inp} value={edu.endYear||""} placeholder="2022" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.education||[])];a[i]={...a[i],endYear:e.target.value};return{...f,profile:{...f.profile,education:a}};})}/></Field>
                          </div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                            <Field label="Degree"><input style={inp} value={edu.degree||""} placeholder="B.S." onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.education||[])];a[i]={...a[i],degree:e.target.value};return{...f,profile:{...f.profile,education:a}};})}/></Field>
                            <Field label="Major"><input style={inp} value={edu.major||""} placeholder="Computer Science" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.education||[])];a[i]={...a[i],major:e.target.value};return{...f,profile:{...f.profile,education:a}};})}/></Field>
                            <Field label="GPA"><input style={inp} value={edu.gpa||""} placeholder="3.9/4.0" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.education||[])];a[i]={...a[i],gpa:e.target.value};return{...f,profile:{...f.profile,education:a}};})}/></Field>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Experience */}
                    <div style={{ background:"#fff", borderRadius:14, padding:"22px 24px", border:"1px solid #e5e3e0" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:"#1c1917" }}>Work Experience</div>
                        <button onClick={()=>setSettingsForm(f=>{const exp=[...(f.profile?.experiences||[]),{company:"",title:"",startDate:"",endDate:"",description:""}];return{...f,profile:{...f.profile,experiences:exp}};})}
                          style={{ padding:"6px 14px", background:"#1c1917", color:"#fff", border:"none", borderRadius:7, fontSize:12, fontWeight:600, cursor:"pointer" }}>+ Add</button>
                      </div>
                      {!(settingsForm.profile?.experiences||[]).length && <div style={{ fontSize:13, color:"#a8a29e", textAlign:"center", padding:"16px 0" }}>No experience added yet.</div>}
                      {(settingsForm.profile?.experiences||[]).map((exp,i) => (
                        <div key={i} style={{ background:"#fafaf9", borderRadius:10, padding:"16px", border:"1px solid #f0eeec", marginBottom:10, position:"relative" }}>
                          <button onClick={()=>setSettingsForm(f=>{const a=[...(f.profile?.experiences||[])];a.splice(i,1);return{...f,profile:{...f.profile,experiences:a}};})}
                            style={{ position:"absolute", top:12, right:12, background:"none", border:"none", color:"#d6d3d1", cursor:"pointer", fontSize:16 }}
                            onMouseEnter={e=>e.currentTarget.style.color="#dc2626"} onMouseLeave={e=>e.currentTarget.style.color="#d6d3d1"}>✕</button>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                            <Field label="Company"><input style={inp} value={exp.company||""} placeholder="Amazon" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.experiences||[])];a[i]={...a[i],company:e.target.value};return{...f,profile:{...f.profile,experiences:a}};})}/></Field>
                            <Field label="Title"><input style={inp} value={exp.title||""} placeholder="Data Scientist" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.experiences||[])];a[i]={...a[i],title:e.target.value};return{...f,profile:{...f.profile,experiences:a}};})}/></Field>
                            <Field label="Start Date"><input style={inp} value={exp.startDate||""} placeholder="Jan 2021" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.experiences||[])];a[i]={...a[i],startDate:e.target.value};return{...f,profile:{...f.profile,experiences:a}};})}/></Field>
                            <Field label="End Date"><input style={inp} value={exp.endDate||""} placeholder="Dec 2023 or Present" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.experiences||[])];a[i]={...a[i],endDate:e.target.value};return{...f,profile:{...f.profile,experiences:a}};})}/></Field>
                          </div>
                          <Field label="Description">
                            <textarea style={ta} rows={3} value={exp.description||""} placeholder="• Led team of 3 engineers&#10;• Built ML pipeline…"
                              onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.experiences||[])];a[i]={...a[i],description:e.target.value};return{...f,profile:{...f.profile,experiences:a}};})}/>
                          </Field>
                        </div>
                      ))}
                    </div>

                    <button onClick={saveSettings} style={{ padding:"11px 24px", borderRadius:9, border:"none", background:"#1c1917", color:"#fff", fontWeight:600, fontSize:13, cursor:"pointer", alignSelf:"flex-start" }}>Save Profile</button>
                  </div>
                )}

                {/* Search tab */}
                {settingsTab==="search" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
                    <div style={{ background:"#fff", borderRadius:14, padding:"22px 24px", border:"1px solid #e5e3e0" }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#1c1917", marginBottom:18 }}>Search Configuration</div>
                      <Field label="Job Titles (comma-separated)">
                        <textarea style={ta} rows={3}
                          value={Array.isArray(settingsForm.jobTitles)?settingsForm.jobTitles.join(", "):settingsForm.jobTitles}
                          onChange={e=>setSettingsForm(f=>({...f,jobTitles:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)}))}/>
                      </Field>
                      <Field label="Locations (comma-separated)">
                        <textarea style={ta} rows={2}
                          value={Array.isArray(settingsForm.locations)?settingsForm.locations.join(", "):settingsForm.locations}
                          onChange={e=>setSettingsForm(f=>({...f,locations:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)}))}/>
                      </Field>
                      <div style={{ marginBottom:16 }}>
                        <div style={{ fontSize:12, color:"#78716c", fontWeight:500, marginBottom:10 }}>Platforms</div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                          {Object.entries(PLATFORM_META).map(([id, m]) => {
                            const active = settingsForm.platforms?.[id] !== false;
                            return (
                              <label key={id} style={{
                                display:"flex", alignItems:"center", gap:7, cursor:"pointer",
                                background:active?m.color+"10":"#fafaf9", border:`1px solid ${active?m.color+"40":"#e5e3e0"}`,
                                borderRadius:8, padding:"6px 12px",
                              }}>
                                <input type="checkbox" checked={active} onChange={e=>setSettingsForm(f=>({...f,platforms:{...f.platforms,[id]:e.target.checked}}))} style={{ accentColor:m.color }}/>
                                <span style={{ fontSize:12, fontWeight:500, color:active?m.color:"#a8a29e" }}>{m.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:16 }}>
                        <Field label="Interval (min)"><input style={inp} type="number" min={1} value={settingsForm.intervalMinutes} onChange={e=>setSettingsForm(f=>({...f,intervalMinutes:parseInt(e.target.value)}))}/></Field>
                        <Field label="Max jobs / run"><input style={inp} type="number" min={1} value={settingsForm.maxApplicationsPerRun} onChange={e=>setSettingsForm(f=>({...f,maxApplicationsPerRun:parseInt(e.target.value)}))}/></Field>
                        <Field label="Max browser / cycle"><input style={inp} type="number" min={1} value={settingsForm.maxBrowserOpensPerCycle??5} onChange={e=>setSettingsForm(f=>({...f,maxBrowserOpensPerCycle:parseInt(e.target.value)}))}/></Field>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
                        {[["autoApplyEnabled","Enable auto-apply (LinkedIn / Indeed)"],["emailNotifications","Email notifications"]].map(([k,lbl]) => (
                          <label key={k} style={{ display:"flex", alignItems:"center", gap:9, cursor:"pointer" }}>
                            <input type="checkbox" checked={!!settingsForm[k]} onChange={e=>setSettingsForm(f=>({...f,[k]:e.target.checked}))} style={{ accentColor:"#2563eb", width:15, height:15 }}/>
                            <span style={{ fontSize:13, color:"#57534e" }}>{lbl}</span>
                          </label>
                        ))}
                      </div>
                      {settingsForm.emailNotifications && (
                        <Field label="Notification email"><input style={inp} type="email" value={settingsForm.notifyEmail||""} onChange={e=>setSettingsForm(f=>({...f,notifyEmail:e.target.value}))}/></Field>
                      )}
                      {/* TickBig credentials */}
                      <div style={{ background:"#fef9f0", borderRadius:10, padding:"14px 16px", border:"1px solid #fde68a", marginTop:4, marginBottom:2 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:"#92400e", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
                          <span>🔐</span> TickBig Credentials
                          <span style={{ fontWeight:400, color:"#a16207", fontSize:11 }}>(browse jobs only — applying requires payment on site)</span>
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                          <Field label="TickBig Email"><input style={inp} type="email" placeholder="your@email.com" value={settingsForm.tickbigEmail||""} onChange={e=>setSettingsForm(f=>({...f,tickbigEmail:e.target.value}))}/></Field>
                          <Field label="TickBig Password"><input style={inp} type="password" placeholder="••••••••" value={settingsForm.tickbigPassword||""} onChange={e=>setSettingsForm(f=>({...f,tickbigPassword:e.target.value}))}/></Field>
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:10 }}>
                        <button onClick={saveSettings} style={{ padding:"9px 22px", borderRadius:8, border:"none", background:"#1c1917", color:"#fff", fontWeight:600, fontSize:13, cursor:"pointer" }}>Save</button>
                        <button onClick={async()=>{const d=await apiFetch(`${API}/test-email`,{method:"POST"}).then(r=>r.json());showToast(d.ok?"Test email sent!":d.message,d.ok?"success":"error");}} style={{ padding:"9px 16px", borderRadius:8, border:"1px solid #e5e3e0", background:"transparent", color:"#57534e", fontSize:13, cursor:"pointer" }}>Test Email</button>
                        <button onClick={async()=>{const d=await apiFetch(`${API}/digest`,{method:"POST"}).then(r=>r.json());showToast(d.ok?"Daily digest sent!":d.message,d.ok?"success":"error");}} style={{ padding:"9px 16px", borderRadius:8, border:"1px solid #bfdbfe", background:"#eff6ff", color:"#2563eb", fontSize:13, fontWeight:600, cursor:"pointer" }}>Send Digest Now</button>
                      </div>
                    </div>

                    {/* API Keys status */}
                    <div style={{ background:"#fff", borderRadius:14, padding:"22px 24px", border:"1px solid #e5e3e0" }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#1c1917", marginBottom:14 }}>API Keys (.env)</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                        {[
                          ["APIFY_TOKEN", settings?.apifyConfigured, "Job scraping"],
                          ["SERPAPI_KEY", settings?.serpApiConfigured, "Google Jobs"],
                          ["LINKEDIN credentials", settings?.linkedinConfigured, "Auto-apply"],
                          ["TICKBIG credentials", settings?.tickbigConfigured, "Job scraping (paid-to-apply)"],
                          ["Email (Gmail)", settings?.emailConfigured, "Notifications"],
                          ["RESUME_PATH", !!settings?.profile?.resumePath, "File"],
                        ].map(([key,ok,desc]) => (
                          <div key={key} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 14px", background:"#fafaf9", borderRadius:8, border:"1px solid #f0eeec" }}>
                            <span style={{ fontSize:13, fontWeight:500, color:"#57534e", fontFamily:"monospace" }}>{key}</span>
                            <span style={{ fontSize:12, fontWeight:600, color:ok?"#16a34a":"#d6d3d1" }}>{ok?`✓ ${desc}`:"not set"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {settingsTab==="agents" && <AgentsTab showToast={showToast}/>}
                {settingsTab==="billing" && <BillingTab showToast={showToast}/>}
              </div>
            )}

          </main>
        </div>
      </div>

      {/* ── Job detail modal (from Applications table click) ─────────────────── */}
      {selectedJob && tab==="applications" && (
        <div onClick={()=>setSelectedJob(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.25)", backdropFilter:"blur(2px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:700, maxHeight:"90vh", overflowY:"auto", border:"1px solid #e5e3e0", boxShadow:"0 20px 60px rgba(0,0,0,.15)" }}>
            <JobDetailPanel job={selectedJob} onApply={handleApplyNow} onClose={()=>setSelectedJob(null)}/>
          </div>
        </div>
      )}

      {/* ── Toast ────────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position:"fixed", bottom:24, right:24, zIndex:9999,
          background:"#fff", border:`1px solid ${toast.type==="error"?"#fecaca":"#bbf7d0"}`,
          color: toast.type==="error"?"#dc2626":"#16a34a",
          borderRadius:12, padding:"12px 18px", fontSize:13, fontWeight:600,
          boxShadow:"0 4px 16px rgba(0,0,0,.1)", animation:"fadeUp .2s ease",
          display:"flex", alignItems:"center", gap:10, maxWidth:300,
        }}>
          <span>{toast.type==="error"?"⚠":"✓"}</span>
          {toast.msg}
        </div>
      )}
    </>
  );
}
