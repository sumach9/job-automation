import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const API = "/api";

function apiFetch(url, opts = {}) {
  const token = localStorage.getItem("jobpilot_token");
  return fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

// --- Constants ----------------------------------------------------------------
const PLATFORM_META = {
  linkedin:     { label:"LinkedIn",     color:"#0a66c2" },
  indeed:       { label:"Indeed",       color:"#2557a7" },
  glassdoor:    { label:"Glassdoor",    color:"#0caa41" },
  ziprecruiter: { label:"ZipRecruiter", color:"#4a90e2" },
  googlejobs:   { label:"Google Jobs",  color:"#ea4335" },
  atsDirect:    { label:"ATS Direct",   color:"#6c47ff" },
};

const STATUS_META = {
  "auto-applied":       { color:"#16a34a", label:"Auto Applied" },
  "easy-apply-pending": { color:"#6c47ff", label:"Easy Apply" },
  "simplify-opened":    { color:"#7c3aed", label:"Simplify" },
  "onetouch-filled":    { color:"#6c47ff", label:"JobPilot" },
  "browser-opened":     { color:"#d97706", label:"Opened" },
  "queued-manual":      { color:"#78716c", label:"Queued" },
  "apply-failed":       { color:"#dc2626", label:"Failed" },
  "interviewing":       { color:"#0891b2", label:"Interviewing" },
  "offered":            { color:"#d97706", label:"Offered" },
  "rejected":           { color:"#dc2626", label:"Rejected" },
};

const PIPELINE_STAGES = [
  { key:"queued-manual",   label:"Queued",       color:"#78716c" },
  { key:"onetouch-filled", label:"Applied",      color:"#6c47ff" },
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
  { id:"assistant",    label:"SAM Assistant", icon:"M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" },
  { id:"interview",    label:"Interview",     icon:"M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" },
  { id:"settings",     label:"Settings",      icon:"M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

// --- Helpers ------------------------------------------------------------------
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
  const palette = ["#6c47ff","#4f46e5","#db2777","#dc2626","#ea580c","#ca8a04","#16a34a","#0d9488","#0284c7","#0891b2"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

function initials(name = "") {
  return name.trim().split(/\s+/).slice(0,2).map(w => w[0]||"").join("").toUpperCase() || "?";
}

function fmt(n) { return (n||0).toLocaleString(); }

function relTime(iso) {
  if (!iso) return "�";
  const diff = Date.now() - new Date(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

// --- SVG Icon helper ----------------------------------------------------------
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

// --- Avatar -------------------------------------------------------------------
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

// --- Status Pill --------------------------------------------------------------
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

// --- Score Badge --------------------------------------------------------------
function ScoreBadge({ score, size="md" }) {
  if (score == null) return null;
  const c = scoreColor(score);
  if (size === "sm") {
    return (
      <span style={{
        background:c, color:"#fff",
        borderRadius:20, padding:"1px 7px", fontSize:11, fontWeight:700,
        letterSpacing:-0.2,
      }}>
        {score}
      </span>
    );
  }
  return (
    <span style={{
      background:c+"15", color:c, border:`1.5px solid ${c}35`,
      borderRadius:8, padding:"4px 11px", fontSize:13, fontWeight:700,
    }}>
      {score}
    </span>
  );
}

// --- Platform Tag -------------------------------------------------------------
function PlatformTag({ platform }) {
  const p = Object.values(PLATFORM_META).find(m => m.label===platform)
         || { label:platform||"Other", color:"#18181b" };
  return (
    <span style={{
      background:p.color+"10", color:p.color, border:`1px solid ${p.color}20`,
      borderRadius:5, padding:"2px 8px", fontSize:11, fontWeight:500,
    }}>
      {p.label}
    </span>
  );
}

// --- Stat Card ----------------------------------------------------------------
function StatCard({ label, value, sub, accent="#18181b" }) {
  return (
    <div style={{
      background:"#f4f4f5", borderRadius:12, padding:"20px 22px",
      border:"1px solid rgba(0,0,0,0.08)", flex:"1 1 150px", minWidth:130,
      position:"relative", overflow:"hidden",
    }}>
      <div style={{
        position:"absolute", top:0, right:0, width:80, height:80,
        background:`radial-gradient(circle at top right, ${accent}18, transparent 70%)`,
        borderRadius:"0 12px 0 0",
      }}/>
      <div style={{ fontSize:11, color:"#71717a", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:12 }}>
        {label}
      </div>
      <div style={{ fontSize:30, fontWeight:800, color:"#09090b", letterSpacing:-1, lineHeight:1, fontFamily:"'Syne',sans-serif" }}>
        {fmt(value)}
      </div>
      {sub && <div style={{ fontSize:12, color:"#71717a", marginTop:8 }}>{sub}</div>}
    </div>
  );
}

// --- Shared Resume View -------------------------------------------------------
function ResumeView({ resume, onRegenerate }) {
  if (!resume) return null;
  const contactParts = [resume.email, resume.phone, resume.location, resume.linkedinUrl, resume.github].filter(Boolean);

  function copyText() {
    const lines = [
      resume.name,
      contactParts.join(" · "),
      "",
      "SUMMARY",
      resume.tailoredSummary,
      "",
      "TECHNICAL SKILLS",
      resume.orderedSkills?.join(", "),
      "",
      "EXPERIENCE HIGHLIGHTS",
      ...(resume.experienceBullets || []).map(b => `• ${b}`),
      "",
      "EDUCATION",
      resume.education?.degree,
      resume.education?.school,
    ].filter(l => l != null).join("\n");
    navigator.clipboard.writeText(lines);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:11, fontWeight:700, color:"#a8a29e", textTransform:"uppercase", letterSpacing:1 }}>
          Tailored for {resume.targetTitle}{resume.targetCompany ? ` @ ${resume.targetCompany}` : ""}
        </span>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={copyText} style={{ padding:"5px 13px", background:"#f4f4f5", color:"#57534e", border:"1px solid #e5e3e0", borderRadius:6, fontSize:11, fontWeight:600, cursor:"pointer" }}>Copy</button>
          {onRegenerate && (
            <button onClick={onRegenerate} style={{ padding:"5px 13px", background:"#6c47ff10", color:"#6c47ff", border:"1px solid #6c47ff30", borderRadius:6, fontSize:11, fontWeight:600, cursor:"pointer" }}>Regenerate</button>
          )}
        </div>
      </div>
      <div style={{ background:"#fff", border:"1px solid #e5e3e0", borderRadius:12, overflow:"hidden" }}>
        {/* CV header */}
        <div style={{ background:"linear-gradient(135deg,#6c47ff,#8b5cf6)", padding:"18px 22px", color:"#fff" }}>
          <div style={{ fontSize:17, fontWeight:800, fontFamily:"'Syne',sans-serif", marginBottom:4 }}>{resume.name}</div>
          <div style={{ fontSize:11, opacity:.85, lineHeight:1.7 }}>{contactParts.join(" · ")}</div>
          {resume.seniority && (
            <div style={{ marginTop:8, display:"inline-block", background:"#ffffff25", borderRadius:20, padding:"3px 12px", fontSize:11, fontWeight:600 }}>
              {resume.seniority} {resume.targetTitle}
            </div>
          )}
        </div>
        <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:14 }}>
          {resume.tailoredSummary && (
            <div>
              <div style={{ fontSize:10, fontWeight:800, color:"#6c47ff", textTransform:"uppercase", letterSpacing:1.5, marginBottom:6 }}>Professional Summary</div>
              <div style={{ fontSize:13, color:"#3f3f46", lineHeight:1.75 }}>{resume.tailoredSummary}</div>
            </div>
          )}
          {resume.orderedSkills?.length > 0 && (
            <div>
              <div style={{ fontSize:10, fontWeight:800, color:"#6c47ff", textTransform:"uppercase", letterSpacing:1.5, marginBottom:6 }}>Technical Skills</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                {resume.orderedSkills.map((s, i) => {
                  const isMatch = resume.matchedSkills?.includes(s);
                  return (
                    <span key={i} style={{
                      background: isMatch ? "#dcfce7" : "#f4f4f5",
                      color:      isMatch ? "#16a34a" : "#3f3f46",
                      border:     `1px solid ${isMatch ? "#bbf7d0" : "#e4e4e7"}`,
                      borderRadius:4, padding:"3px 8px", fontSize:11, fontWeight:500,
                    }}>{isMatch ? "✓ " : ""}{s}</span>
                  );
                })}
              </div>
              {resume.missingSkills?.length > 0 && (
                <div style={{ marginTop:8, fontSize:11, color:"#a8a29e" }}>
                  Skills in JD to consider adding:{" "}
                  {resume.missingSkills.slice(0, 5).map((s, i) => (
                    <span key={i} style={{ background:"#fff7ed", color:"#ea580c", border:"1px solid #fed7aa", borderRadius:4, padding:"2px 6px", fontSize:11, marginLeft:4 }}>{s}</span>
                  ))}
                </div>
              )}
            </div>
          )}
          {resume.experienceBullets?.length > 0 && (
            <div>
              <div style={{ fontSize:10, fontWeight:800, color:"#6c47ff", textTransform:"uppercase", letterSpacing:1.5, marginBottom:6 }}>Experience Highlights</div>
              <ul style={{ paddingLeft:16, margin:0, display:"flex", flexDirection:"column", gap:7 }}>
                {resume.experienceBullets.map((b, i) => (
                  <li key={i} style={{ fontSize:13, color:"#3f3f46", lineHeight:1.65 }}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {(resume.education?.school || resume.education?.degree) && (
            <div>
              <div style={{ fontSize:10, fontWeight:800, color:"#6c47ff", textTransform:"uppercase", letterSpacing:1.5, marginBottom:6 }}>Education</div>
              <div style={{ fontWeight:600, fontSize:13, color:"#3f3f46" }}>{resume.education.degree}</div>
              {resume.education.school && <div style={{ fontSize:12, color:"#71717a", marginTop:2 }}>{resume.education.school}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Job Detail Panel (right-pane) --------------------------------------------
function JobDetailPanel({ job, onApply, onClose }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [skillGap, setSkillGap]       = useState(null);
  const [resume, setResume]           = useState(null);
  const [coverLetter, setCoverLetter] = useState(null);
  const [loadingGap, setLoadingGap]   = useState(false);
  const [loadingResume, setLoadingResume] = useState(false);
  const [loadingCover, setLoadingCover]   = useState(false);

  useEffect(() => { setSkillGap(null); setResume(null); setCoverLetter(null); setActiveTab("overview"); }, [job]);
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

  async function loadCoverLetter() {
    setLoadingCover(true); setActiveTab("cover");
    try {
      const d = await apiFetch(`${API}/generate-cover-letter`, {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({job}),
      }).then(r=>r.json());
      setCoverLetter(d.letter || null);
    } catch {}
    setLoadingCover(false);
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
              {job.company}{job.location && ` � ${job.location}`}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <ScoreBadge score={job.score}/>
            {onClose && (
              <button onClick={onClose} style={{ background:"none", border:"1px solid #e5e3e0", color:"#a8a29e", borderRadius:7, width:30, height:30, cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" }}>?</button>
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
          padding:"7px 16px", background:"#6c47ff", color:"#fff", borderRadius:8,
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
        <button onClick={loadCoverLetter} style={{
          padding:"7px 14px", background:"#fff", color:"#6c47ff", border:"1px solid #6c47ff40",
          borderRadius:8, fontWeight:600, fontSize:12, cursor:"pointer",
        }}>Cover Letter</button>
        {(job.status==="easy-apply-pending"||job.status==="apply-failed"||job.status==="queued-manual") && (
          <button onClick={() => onApply(job)} style={{
            padding:"7px 16px", background:"#6c47ff", color:"#fff", border:"none",
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
        {[["overview","Overview"],["gap","Skill Gap"],["resume","Resume"],["cover","Cover Letter"],["salary","Salary"]].map(([id,lbl]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            padding:"10px 0", marginRight:20, background:"none", border:"none",
            borderBottom: activeTab===id ? "2px solid #6c47ff" : "2px solid transparent",
            color: activeTab===id ? "#6c47ff" : "#a8a29e",
            fontWeight: activeTab===id ? 600 : 400, fontSize:13, cursor:"pointer",
          }}>{lbl}</button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>
        {activeTab==="overview" && <>
          {job.scoreBreakdown && (
            <div style={{ background:"#fafaf9", borderRadius:10, padding:"14px 16px", border:"1px solid #e5e3e0", marginBottom:16 }}>
              <div style={{ fontSize:11, color:"#a8a29e", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>NLP Fit Breakdown</div>
              {/* Score tiles */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:10 }}>
                {[
                  ["Title",    job.scoreBreakdown.title,            "/2"],
                  ["NLP Skills",job.scoreBreakdown.nlpSkills?.toFixed(1) ?? job.scoreBreakdown.skills?.toFixed(1), "/2"],
                  ["Location", job.scoreBreakdown.location,         "/1"],
                  ["Exp",      job.scoreBreakdown.experienceBonus?.toFixed(1), "+"],
                ].map(([k,v,max]) => (
                  <div key={k} style={{ background:"#fff", borderRadius:8, padding:"10px 12px", textAlign:"center", border:"1px solid #f0eeec" }}>
                    <div style={{ fontSize:10, color:"#a8a29e", marginBottom:4 }}>{k}</div>
                    <div style={{ fontSize:18, fontWeight:700, color:scoreColor(job.score) }}>{v??"-"}</div>
                    <div style={{ fontSize:10, color:"#d6d3d1" }}>{max}</div>
                  </div>
                ))}
              </div>
              {/* NLP similarity meters */}
              {(job.scoreBreakdown.jaccardPct || job.scoreBreakdown.cosinePct) && (
                <div style={{ display:"flex", gap:12, marginBottom:10 }}>
                  {[
                    { label:"Skills Jaccard", val:job.scoreBreakdown.jaccardPct, tip:"Skill set overlap: matched � union" },
                    { label:"TF-Cosine",      val:job.scoreBreakdown.cosinePct,  tip:"Profile text similarity to job description" },
                  ].map(({ label, val, tip }) => (
                    <div key={label} style={{ flex:1, background:"#fff", borderRadius:8, padding:"8px 12px", border:"1px solid #f0eeec" }} title={tip}>
                      <div style={{ fontSize:10, color:"#a8a29e", marginBottom:4 }}>{label}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ flex:1, height:6, background:"#f0eeec", borderRadius:3, overflow:"hidden" }}>
                          <div style={{ width: val, height:"100%", background: scoreColor(job.score), borderRadius:3, transition:"width .4s" }}/>
                        </div>
                        <span style={{ fontSize:12, fontWeight:700, color:scoreColor(job.score), minWidth:34 }}>{val}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Matched skills */}
              {job.scoreBreakdown.matchedSkills?.length > 0 && (
                <div style={{ marginBottom:6 }}>
                  <div style={{ fontSize:10, color:"#16a34a", fontWeight:700, marginBottom:4 }}>? Matched Skills</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                    {job.scoreBreakdown.matchedSkills.map((s,i) => (
                      <span key={i} style={{ background:"#dcfce7", color:"#16a34a", border:"1px solid #bbf7d0", borderRadius:4, padding:"2px 7px", fontSize:11 }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {/* Missing skills */}
              {job.scoreBreakdown.missingSkills?.length > 0 && (
                <div>
                  <div style={{ fontSize:10, color:"#dc2626", fontWeight:700, marginBottom:4 }}>? Not mentioned</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                    {job.scoreBreakdown.missingSkills.map((s,i) => (
                      <span key={i} style={{ background:"#fee2e2", color:"#dc2626", border:"1px solid #fecaca", borderRadius:4, padding:"2px 7px", fontSize:11 }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {job.skills?.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:"#a8a29e", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Required Skills</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {job.skills.map((s,i) => (
                  <span key={i} style={{ background:"#f4f4f5", color:"#18181b", border:"1px solid #e4e4e7", borderRadius:5, padding:"3px 9px", fontSize:12 }}>{s}</span>
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
            {loadingGap && <div style={{ textAlign:"center", color:"#a8a29e", padding:40 }}>Analysing skill gap�</div>}
            {!loadingGap && !skillGap && (
              <div style={{ textAlign:"center", padding:40 }}>
                <button onClick={loadSkillGap} style={{ padding:"9px 20px", background:"#18181b", color:"#fff", border:"none", borderRadius:8, fontWeight:600, cursor:"pointer" }}>
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
                {skillGap.advice && <div style={{ background:"#f4f4f5", border:"1px solid #e4e4e7", borderRadius:10, padding:"12px 14px", fontSize:13, color:"#09090b", lineHeight:1.65 }}>{skillGap.advice}</div>}
              </div>
            )}
          </div>
        )}

        {activeTab==="cover" && (
          <div>
            {loadingCover && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:14, padding:"48px 0" }}>
                <div style={{ width:36, height:36, border:"3px solid #e5e3e0", borderTopColor:"#6c47ff", borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
                <span style={{ color:"#a8a29e", fontSize:13 }}>Writing your cover letter…</span>
              </div>
            )}
            {!loadingCover && !coverLetter && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:16, padding:"48px 0" }}>
                <div style={{ width:56, height:56, borderRadius:16, background:"linear-gradient(135deg,#6c47ff15,#8b5cf615)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="#6c47ff" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                  </svg>
                </div>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:14, fontWeight:600, color:"#1c1917", marginBottom:6 }}>AI Cover Letter</div>
                  <div style={{ fontSize:12, color:"#a8a29e", maxWidth:240 }}>Personalised to {job.title} at {job.company} using your profile</div>
                </div>
                <button onClick={loadCoverLetter} style={{
                  padding:"10px 24px", background:"linear-gradient(135deg,#6c47ff,#8b5cf6)", color:"#fff",
                  border:"none", borderRadius:9, fontWeight:700, fontSize:13, cursor:"pointer",
                }}>Generate Cover Letter</button>
              </div>
            )}
            {coverLetter && (
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:"#a8a29e", textTransform:"uppercase", letterSpacing:1 }}>Cover Letter</span>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => navigator.clipboard.writeText(coverLetter)} style={{
                      padding:"5px 13px", background:"#f4f4f5", color:"#57534e", border:"1px solid #e5e3e0",
                      borderRadius:6, fontSize:11, fontWeight:600, cursor:"pointer",
                    }}>Copy</button>
                    <button onClick={loadCoverLetter} style={{
                      padding:"5px 13px", background:"#6c47ff10", color:"#6c47ff", border:"1px solid #6c47ff30",
                      borderRadius:6, fontSize:11, fontWeight:600, cursor:"pointer",
                    }}>Regenerate</button>
                  </div>
                </div>
                <div style={{
                  background:"#fafaf9", border:"1px solid #e5e3e0", borderRadius:12,
                  padding:"20px 22px", fontSize:13, color:"#3f3f46", lineHeight:1.85,
                  whiteSpace:"pre-wrap", fontFamily:"'Georgia',serif",
                }}>
                  {coverLetter}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab==="resume" && (
          <div>
            {loadingResume && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:14, padding:"48px 0" }}>
                <div style={{ width:36, height:36, border:"3px solid #e5e3e0", borderTopColor:"#6c47ff", borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
                <span style={{ color:"#a8a29e", fontSize:13 }}>Tailoring your resume...</span>
              </div>
            )}
            {!loadingResume && !resume && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:16, padding:"48px 0" }}>
                <div style={{ width:56, height:56, borderRadius:16, background:"linear-gradient(135deg,#6c47ff15,#8b5cf615)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="#6c47ff" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                  </svg>
                </div>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:14, fontWeight:600, color:"#1c1917", marginBottom:6 }}>AI Resume Builder</div>
                  <div style={{ fontSize:12, color:"#a8a29e", maxWidth:260 }}>Generates a tailored CV draft for {job.title} at {job.company}, highlighting your matched skills</div>
                </div>
                <button onClick={loadResume} style={{
                  padding:"10px 24px", background:"linear-gradient(135deg,#6c47ff,#8b5cf6)", color:"#fff",
                  border:"none", borderRadius:9, fontWeight:700, fontSize:13, cursor:"pointer",
                }}>Generate Tailored Resume</button>
              </div>
            )}
            {!loadingResume && resume && <ResumeView resume={resume} onRegenerate={loadResume}/>}
          </div>
        )}

        {activeTab==="salary" && (() => {
          const title   = job.title || "";
          const company = job.company || "";
          const yrs     = 3;
          const ranges = [
            { level:"Entry (0-2 yrs)",  low:65,  high:95  },
            { level:"Mid (3-5 yrs)",    low:95,  high:140 },
            { level:"Senior (6-9 yrs)", low:140, high:185 },
            { level:"Staff / Principal",low:185, high:240 },
          ];
          const tips = [
            "Always negotiate — 85% of employers expect it. The first offer is rarely the best.",
            "Anchor high: give a range starting $15-20k above your target.",
            "Never share your current salary. Deflect: \"I'm focused on market rate for this role.\"",
            "Get the offer in writing before you counter. Verbal offers don't count.",
            "Counter via email — it gives you time to think and creates a paper trail.",
            "Ask about sign-on bonus if base salary is inflexible — easier to give.",
            "Use competing offers as leverage, even if you don't plan to take them.",
            "Research on Levels.fyi, Glassdoor, and Blind before your first call.",
          ];
          return (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            {/* Salary ranges */}
            <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e5e3e0", overflow:"hidden" }}>
              <div style={{ padding:"14px 18px", borderBottom:"1px solid #f0eeec", display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:13, fontWeight:700, color:"#09090b" }}>Market Salary Ranges</span>
                <span style={{ fontSize:11, color:"#a8a29e" }}>for {title||"this role"} in USA</span>
              </div>
              <div style={{ padding:"14px 18px" }}>
                {ranges.map((r,i) => (
                  <div key={i} style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                      <span style={{ fontSize:12, color:"#57534e", fontWeight:500 }}>{r.level}</span>
                      <span style={{ fontSize:13, fontWeight:700, color:"#09090b" }}>${r.low}k – ${r.high}k</span>
                    </div>
                    <div style={{ height:6, background:"#f4f4f5", borderRadius:6, overflow:"hidden" }}>
                      <div style={{ width:`${Math.round((r.high/240)*100)}%`, height:"100%", background:"linear-gradient(90deg,#6c47ff,#8b5cf6)", borderRadius:6 }}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Research links */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:"#a8a29e", textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>Research Salary Data</div>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                {[
                  { name:"Levels.fyi",  url:`https://www.levels.fyi/t/${encodeURIComponent(title)}`, color:"#6c47ff", desc:"TC at big tech" },
                  { name:"Glassdoor",   url:`https://www.glassdoor.com/Salaries/index.htm`,           color:"#00b34a", desc:"Company salaries" },
                  { name:"Blind",       url:`https://www.teamblind.com`,                              color:"#234099", desc:"Honest comp talks" },
                  { name:"LinkedIn",    url:`https://www.linkedin.com/salary/`,                       color:"#0a66c2", desc:"Role benchmarks" },
                  { name:"Payscale",    url:`https://www.payscale.com/research/US/Job`,               color:"#f97316", desc:"By experience" },
                ].map(l=>(
                  <a key={l.name} href={l.url} target="_blank" rel="noreferrer" style={{
                    padding:"10px 14px", borderRadius:9, border:`1px solid ${l.color}25`,
                    background:`${l.color}08`, textDecoration:"none", minWidth:110,
                  }}
                    onMouseEnter={e=>{ e.currentTarget.style.borderColor=l.color+"50"; e.currentTarget.style.background=l.color+"14"; }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor=l.color+"25"; e.currentTarget.style.background=l.color+"08"; }}>
                    <div style={{ fontSize:12, fontWeight:700, color:l.color }}>{l.name} ↗</div>
                    <div style={{ fontSize:10, color:"#a8a29e", marginTop:2 }}>{l.desc}</div>
                  </a>
                ))}
              </div>
            </div>

            {/* Negotiation tips */}
            <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e5e3e0", padding:"18px 20px" }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#09090b", marginBottom:12 }}>Negotiation Playbook</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {tips.map((t,i) => (
                  <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                    <span style={{ width:20, height:20, borderRadius:"50%", background:"#6c47ff15", color:"#6c47ff", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1 }}>{i+1}</span>
                    <span style={{ fontSize:13, color:"#57534e", lineHeight:1.6 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          );
        })()}
      </div>
    </div>
  );
}

// --- Job Row (left pane) ------------------------------------------------------
function JobRow({ job, selected, onClick }) {
  const c = companyColor(job.company);
  return (
    <div onClick={() => onClick(job)} style={{
      padding:"14px 16px", borderBottom:"1px solid #f5f4f2", cursor:"pointer",
      background: selected ? "#f4f4f5" : "#fff",
      borderLeft: selected ? "3px solid #6c47ff" : "3px solid transparent",
      transition:"background .1s",
    }}
      onMouseEnter={e => { if (!selected) { e.currentTarget.style.background="#fafafa"; e.currentTarget.style.boxShadow="inset 0 0 0 1px rgba(108,71,255,0.12)"; } }}
      onMouseLeave={e => { if (!selected) { e.currentTarget.style.background="#fff"; e.currentTarget.style.boxShadow="none"; } }}
    >
      <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
        <Avatar name={job.company} size={36}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, color:"#1c1917", lineHeight:1.3, marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {job.title}
          </div>
          <div style={{ fontSize:12, color:"#78716c", marginBottom:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {job.company}{job.location ? ` � ${job.location}` : ""}
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

// --- Pipeline Card ------------------------------------------------------------
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

// --- Resume Upload Card -------------------------------------------------------
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
          <div style={{ fontSize:12, color:"#a8a29e", marginTop:2 }}>Upload your PDF or DOCX � we'll auto-fill your profile</div>
        </div>
        {currentResumePath && <span style={{ fontSize:11, color:"#16a34a", background:"#dcfce7", border:"1px solid #bbf7d0", borderRadius:20, padding:"3px 10px", fontWeight:600 }}>? Resume on file</span>}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e=>{e.preventDefault();setDragging(true);}}
        onDragLeave={()=>setDragging(false)}
        onDrop={onDrop}
        onClick={()=>inputRef.current?.click()}
        style={{
          margin:16, borderRadius:10, border:`2px dashed ${dragging?"#18181b":"#e5e3e0"}`,
          background:dragging?"#f4f4f5":"#fafaf9", padding:"28px 20px",
          textAlign:"center", cursor:"pointer", transition:"all .15s",
        }}
      >
        <input ref={inputRef} type="file" accept=".pdf,.docx,.doc,.txt" style={{display:"none"}}
          onChange={e => upload(e.target.files[0])}/>
        {uploading ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
            <div style={{ width:28, height:28, border:"3px solid #e5e3e0", borderTopColor:"#18181b", borderRadius:"50%", animation:"spin .7s linear infinite" }}/>
            <span style={{ fontSize:13, color:"#18181b", fontWeight:600 }}>Parsing resume�</span>
          </div>
        ) : (
          <>
            <div style={{ fontSize:28, marginBottom:8 }}>??</div>
            <div style={{ fontSize:13, fontWeight:600, color:"#1c1917", marginBottom:4 }}>Drop your resume here or click to browse</div>
            <div style={{ fontSize:12, color:"#a8a29e" }}>PDF, DOCX, or TXT � Max 10 MB</div>
          </>
        )}
      </div>

      {/* Parse result preview */}
      {result && (
        <div style={{ margin:"0 16px 16px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"14px 16px" }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#16a34a", marginBottom:10 }}>? Profile auto-filled from resume</div>
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

// --- Settings Field -----------------------------------------------------------
function Field({ label, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:"block", fontSize:12, color:"#78716c", marginBottom:5, fontWeight:500 }}>{label}</label>
      {children}
    </div>
  );
}

// --- Agents Tab ---------------------------------------------------------------
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
      <div style={{ background:"#f4f4f5", borderRadius:10, padding:"14px 18px", border:"1px solid #e4e4e7" }}>
        <div style={{ fontSize:14, fontWeight:700, color:"#09090b" }}>AI Agent Suite</div>
        <div style={{ fontSize:12, color:"#3b82f6", marginTop:3 }}>5 autonomous agents � no LLM API key required.</div>
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
                }}>{isRun?"Running�":"Run"}</button>
                {res && <button onClick={() => setExpanded(e => ({...e,[agent.id]:!isOpen}))} style={{ background:"#f5f4f2", border:"1px solid #e5e3e0", color:"#78716c", borderRadius:7, cursor:"pointer", width:30, height:30, fontSize:12 }}>{isOpen?"?":"?"}</button>}
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
                      <a href={item.recruiterSearchUrl} target="_blank" rel="noreferrer" style={{ marginLeft:"auto", fontSize:10, color:"#18181b", border:"1px solid #e4e4e7", borderRadius:5, padding:"3px 9px", textDecoration:"none", fontWeight:600 }}>Find Recruiter ?</a>
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

// --- Billing Tab --------------------------------------------------------------
// --- Google Sheets Card -------------------------------------------------------
function GoogleSheetsCard({ showToast }) {
  const [status, setStatus] = useState(null);   // { configured, sheetId }
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null); // { ok, jobsWritten, appsWritten, ts }

  useEffect(() => {
    apiFetch(`${API}/sheets-status`).then(r => r.json()).then(setStatus).catch(() => {});
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      const d = await apiFetch(`${API}/sync-sheets`, { method:"POST" }).then(r => r.json());
      if (d.ok) {
        setLastSync({ ok:true, jobsWritten:d.jobsWritten, appsWritten:d.appsWritten, ts:new Date().toLocaleTimeString() });
        showToast(`Synced! ${d.jobsWritten} jobs + ${d.appsWritten} apps ? Google Sheets`, "success");
      } else {
        showToast(d.message || "Sync failed", "error");
      }
    } catch (e) {
      showToast("Sync error: " + e.message, "error");
    } finally {
      setSyncing(false);
    }
  }

  const configured = status?.configured;

  return (
    <div style={{ background:"#fff", borderRadius:14, padding:"22px 24px", border:"1px solid #e5e3e0" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {/* Google Sheets green icon */}
          <div style={{ width:34, height:34, borderRadius:8, background:"#e8f5e9", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>??</div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"#1c1917" }}>Google Sheets Export</div>
            <div style={{ fontSize:12, color:"#78716c" }}>Auto-syncs jobs + applications after each run</div>
          </div>
        </div>
        <span style={{ fontSize:12, fontWeight:600, padding:"3px 10px", borderRadius:20,
          background: configured ? "#dcfce7" : "#fef3c7",
          color:      configured ? "#16a34a" : "#d97706",
          border:     `1px solid ${configured ? "#bbf7d0" : "#fde68a"}`,
        }}>
          {configured ? "? Connected" : "? Not configured"}
        </span>
      </div>

      {configured ? (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ padding:"10px 14px", background:"#f0fdf4", borderRadius:8, border:"1px solid #bbf7d0", fontSize:12, color:"#15803d" }}>
            Sheet ID ending in <strong>�{status.sheetId}</strong> � Two tabs: <em>Jobs Found</em> + <em>Applications</em>
          </div>
          {lastSync && (
            <div style={{ padding:"8px 14px", background:"#f4f4f5", borderRadius:8, border:"1px solid #e4e4e7", fontSize:12, color:"#18181b" }}>
              Last sync at {lastSync.ts} � {lastSync.jobsWritten} jobs, {lastSync.appsWritten} applications written
            </div>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{ padding:"9px 18px", borderRadius:8, border:"none", background: syncing?"#d1fae5":"#16a34a", color:"#fff", fontWeight:600, fontSize:13, cursor:syncing?"not-allowed":"pointer", alignSelf:"flex-start" }}
          >
            {syncing ? "Syncing�" : "Sync to Sheets Now"}
          </button>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ fontSize:13, color:"#57534e", lineHeight:1.6 }}>
            Add these 3 lines to your <code style={{ background:"#f5f4f2", padding:"1px 5px", borderRadius:4 }}>.env</code> file, then restart the server:
          </div>
          <div style={{ background:"#1c1917", borderRadius:8, padding:"14px 16px", fontFamily:"monospace", fontSize:12, color:"#a8a29e", lineHeight:1.8, overflowX:"auto" }}>
            <span style={{ color:"#86efac" }}>GOOGLE_SHEET_ID</span>=<span style={{ color:"#fcd34d" }}>your_sheet_id_from_url</span><br/>
            <span style={{ color:"#86efac" }}>GOOGLE_SERVICE_ACCOUNT_EMAIL</span>=<span style={{ color:"#fcd34d" }}>sa@project.iam.gserviceaccount.com</span><br/>
            <span style={{ color:"#86efac" }}>GOOGLE_PRIVATE_KEY</span>=<span style={{ color:"#fcd34d" }}>"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"</span>
          </div>
          <div style={{ fontSize:12, color:"#78716c", lineHeight:1.6 }}>
            <strong>Steps:</strong> Google Cloud Console ? Enable Sheets API ? Create Service Account ? Download JSON key ?{" "}
            Share your Google Sheet with the service account email (Editor) ? copy the 3 values above.
          </div>
        </div>
      )}
    </div>
  );
}

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
              border: active ? "2px solid #18181b" : "1px solid #e5e3e0",
              display:"flex", flexDirection:"column", position:"relative",
            }}>
              {active && <div style={{ position:"absolute", top:-10, right:16, background:"#18181b", color:"#fff", borderRadius:20, padding:"3px 12px", fontSize:10, fontWeight:700 }}>CURRENT</div>}
              {plan.popular && !active && <div style={{ position:"absolute", top:-10, left:"50%", transform:"translateX(-50%)", background:"#1c1917", color:"#fff", borderRadius:20, padding:"3px 12px", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>MOST POPULAR</div>}
              <div style={{ fontSize:13, fontWeight:600, color:"#57534e", marginBottom:8 }}>{plan.name}</div>
              <div style={{ fontSize:32, fontWeight:700, color:"#1c1917", marginBottom:4 }}>{plan.price===0?"Free":`$${plan.price}`}{plan.price>0&&<span style={{ fontSize:14, fontWeight:400, color:"#a8a29e" }}>/mo</span>}</div>
              <div style={{ flex:1, margin:"16px 0" }}>
                {plan.features.map((f,i) => (
                  <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"4px 0", fontSize:13, color:"#57534e" }}>
                    <span style={{ color:"#16a34a", flexShrink:0, marginTop:1 }}>?</span>{f}
                  </div>
                ))}
              </div>
              {active ? (
                <button onClick={openPortal} style={{ padding:"10px", borderRadius:8, border:"1px solid #e4e4e7", background:"transparent", color:"#18181b", fontWeight:600, fontSize:13, cursor:"pointer" }}>Manage</button>
              ) : plan.price===0 ? (
                <button disabled style={{ padding:"10px", borderRadius:8, border:"1px solid #e5e3e0", background:"transparent", color:"#a8a29e", fontWeight:600, fontSize:13 }}>Free Plan</button>
              ) : (
                <button onClick={() => checkout(plan.id)} disabled={loading||!stripeReady} style={{
                  padding:"10px", borderRadius:8, border:"none", background:stripeReady?"#1c1917":"#f5f4f2",
                  color:stripeReady?"#fff":"#a8a29e", fontWeight:600, fontSize:13, cursor:stripeReady?"pointer":"not-allowed",
                }}>{loading?"�":`Upgrade to ${plan.name}`}</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Login Page ---------------------------------------------------------------
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
    } catch { setError("Cannot reach server � make sure it is running"); }
    setLoading(false);
  };

  return (
    <div style={{ background:"#ffffff", minHeight:"100vh", fontFamily:"'Inter',sans-serif", overflowX:"hidden" }}>
      <style>{`
        @keyframes floatBadge { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        .lp-nav-link { font-size:14px; color:#52525b; cursor:pointer; transition:color .2s; }
        .lp-nav-link:hover { color:#09090b; }
        .lp-cta-primary { transition:transform .15s,box-shadow .15s; }
        .lp-cta-primary:hover { transform:translateY(-2px); box-shadow:0 0 60px rgba(0,0,0,0.08) !important; }
        .lp-cta-ghost { transition:background .2s,color .2s; }
        .lp-cta-ghost:hover { background:rgba(0,0,0,0.08) !important; color:#09090b !important; }
        .lp-feature-card { transition:border-color .25s,transform .2s; }
        .lp-feature-card:hover { border-color:rgba(0,0,0,0.35) !important; transform:translateY(-3px); }
        .lp-testimonial { transition:border-color .25s; }
        .lp-testimonial:hover { border-color:rgba(0,0,0,0.25) !important; }
      `}</style>

      {/* -- STICKY NAV ------------------------------------------- */}
      <nav style={{
        position:"fixed", top:0, left:0, right:0, zIndex:200,
        padding:"0 48px", height:64,
        background:"rgba(255,255,255,0.75)",
        backdropFilter:"blur(20px) saturate(200%)",
        WebkitBackdropFilter:"blur(20px) saturate(200%)",
        borderBottom:"1px solid rgba(0,0,0,0.07)",
        display:"flex", alignItems:"center", justifyContent:"space-between",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:9, background:"#18181b", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </div>
          <span style={{ fontSize:18, fontWeight:800, color:"#09090b", fontFamily:"'Syne',sans-serif", letterSpacing:-0.5 }}>JobPilot</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:36 }}>
          {["Features","SAM AI","Pricing"].map(l => (
            <span key={l} className="lp-nav-link">{l}</span>
          ))}
        </div>
        <button
          className="lp-cta-primary"
          onClick={()=>document.getElementById("jp-login").scrollIntoView({behavior:"smooth"})}
          style={{ padding:"9px 22px", borderRadius:8, background:"#18181b", border:"none", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer", boxShadow:"0 0 30px rgba(0,0,0,0.3)" }}>
          Sign in ?
        </button>
      </nav>

      {/* -- HERO ------------------------------------------------- */}
      <section style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"140px 40px 80px", position:"relative", overflow:"hidden", textAlign:"center" }}>
        <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
          <div style={{ position:"absolute", width:900, height:900, borderRadius:"50%", background:"radial-gradient(circle,rgba(0,0,0,0.16) 0%,transparent 68%)", top:"50%", left:"50%", transform:"translate(-50%,-58%)" }}/>
          <div style={{ position:"absolute", width:500, height:500, borderRadius:"50%", background:"radial-gradient(circle,rgba(0,0,0,0.09) 0%,transparent 70%)", bottom:0, right:"15%" }}/>
          <div style={{ position:"absolute", inset:0, backgroundImage:"linear-gradient(rgba(0,0,0,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.025) 1px,transparent 1px)", backgroundSize:"64px 64px" }}/>
        </div>

        <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"6px 18px", borderRadius:100, background:"rgba(0,0,0,0.1)", border:"1px solid rgba(0,0,0,0.28)", marginBottom:34, animation:"fadeUp .5s ease" }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:"#3f3f46", display:"inline-block", animation:"pulse 2s infinite" }}/>
          <span style={{ fontSize:13, color:"#3f3f46", fontWeight:500, letterSpacing:.2 }}>SAM AI � Your Intelligent Career Co-pilot</span>
        </div>

        <h1 style={{ fontSize:"clamp(52px,7.5vw,96px)", fontWeight:800, fontFamily:"'Syne',sans-serif", lineHeight:1.03, letterSpacing:-3, marginBottom:28, maxWidth:950, animation:"fadeUp .55s .08s ease both" }}>
          <span style={{ color:"#09090b" }}>Land your dream job,</span><br/>
          <span style={{ background:"linear-gradient(115deg,#09090b,#3f3f46)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>10� faster.</span>
        </h1>

        <p style={{ fontSize:18, color:"#52525b", maxWidth:540, lineHeight:1.75, marginBottom:48, animation:"fadeUp .55s .16s ease both" }}>
          AI job scoring, automated applications, mock interview coaching, and SAM � your personal career assistant. All in one platform.
        </p>

        <div style={{ display:"flex", gap:14, marginBottom:88, animation:"fadeUp .55s .24s ease both" }}>
          <button className="lp-cta-primary"
            onClick={()=>document.getElementById("jp-login").scrollIntoView({behavior:"smooth"})}
            style={{ padding:"15px 36px", borderRadius:11, background:"#18181b", border:"none", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", boxShadow:"0 0 44px rgba(0,0,0,0.1)" }}>
            Get Started Free ?
          </button>
          <button className="lp-cta-ghost"
            style={{ padding:"15px 32px", borderRadius:11, background:"rgba(0,0,0,0.04)", border:"1px solid rgba(0,0,0,0.1)", color:"#52525b", fontSize:15, fontWeight:500, cursor:"pointer" }}>
            Watch a demo
          </button>
        </div>

        {/* Dashboard mockup */}
        <div style={{ position:"relative", width:"100%", maxWidth:1020, animation:"fadeUp .6s .32s ease both" }}>
          <div style={{ position:"absolute", top:-18, left:"8%", zIndex:10, background:"rgba(244,244,245,0.92)", border:"1px solid rgba(16,185,129,0.35)", borderRadius:12, padding:"10px 18px", backdropFilter:"blur(12px)", animation:"floatBadge 4s ease-in-out infinite", boxShadow:"0 8px 32px rgba(0,0,0,0.1)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:9 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:"#10b981", boxShadow:"0 0 8px #10b981" }}/>
              <span style={{ fontSize:13, color:"#09090b", fontWeight:600 }}>2,847 jobs found today</span>
            </div>
          </div>
          <div style={{ position:"absolute", top:48, right:"4%", zIndex:10, background:"rgba(244,244,245,0.92)", border:"1px solid rgba(0,0,0,0.35)", borderRadius:12, padding:"10px 18px", backdropFilter:"blur(12px)", animation:"floatBadge 5s 1s ease-in-out infinite", boxShadow:"0 8px 32px rgba(0,0,0,0.1)" }}>
            <span style={{ fontSize:13, color:"#3f3f46", fontWeight:600 }}>? 94% match score</span>
          </div>
          <div style={{ position:"absolute", bottom:-14, left:"4%", zIndex:10, background:"rgba(244,244,245,0.92)", border:"1px solid rgba(0,0,0,0.35)", borderRadius:12, padding:"10px 18px", backdropFilter:"blur(12px)", animation:"floatBadge 4.5s .6s ease-in-out infinite", boxShadow:"0 8px 32px rgba(0,0,0,0.1)" }}>
            <span style={{ fontSize:13, color:"#27272a", fontWeight:600 }}>? 341 auto-applied</span>
          </div>

          <div style={{ borderRadius:18, border:"1px solid rgba(0,0,0,0.09)", background:"rgba(248,250,252,0.96)", backdropFilter:"blur(24px)", padding:20, boxShadow:"0 48px 120px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04), inset 0 1px 0 rgba(0,0,0,0.07)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:18, paddingBottom:14, borderBottom:"1px solid rgba(0,0,0,0.05)" }}>
              <div style={{ display:"flex", gap:5 }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:"#ef4444" }}/>
                <div style={{ width:10, height:10, borderRadius:"50%", background:"#f59e0b" }}/>
                <div style={{ width:10, height:10, borderRadius:"50%", background:"#10b981" }}/>
              </div>
              <div style={{ flex:1, background:"rgba(0,0,0,0.04)", borderRadius:6, height:24, display:"flex", alignItems:"center", paddingLeft:10, gap:6 }}>
                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="#a1a1aa" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span style={{ fontSize:11, color:"#a1a1aa" }}>jobpilot.app � Dashboard</span>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"170px 1fr", gap:16, height:320, overflow:"hidden" }}>
              <div style={{ borderRight:"1px solid rgba(0,0,0,0.05)", paddingRight:14 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:18, padding:"6px 8px", background:"rgba(0,0,0,0.12)", borderRadius:8, border:"1px solid rgba(0,0,0,0.18)" }}>
                  <div style={{ width:22, height:22, borderRadius:6, background:"#18181b", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  </div>
                  <span style={{ fontSize:12, fontWeight:700, color:"#09090b", fontFamily:"'Syne',sans-serif" }}>JobPilot</span>
                </div>
                {[
                  { label:"Dashboard",     color:"#3f3f46", active:true },
                  { label:"Job Scanner",   color:"#71717a", active:false },
                  { label:"Applications",  color:"#71717a", active:false },
                  { label:"Interviews",    color:"#71717a", active:false },
                  { label:"SAM Assistant", color:"#27272a", active:false },
                ].map((item,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:7, padding:"6px 8px", borderRadius:7, marginBottom:3, background:item.active?"rgba(0,0,0,0.1)":"transparent" }}>
                    <div style={{ width:5, height:5, borderRadius:"50%", background:item.color, opacity:item.active?1:0.5 }}/>
                    <span style={{ fontSize:12, color:item.color }}>{item.label}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
                  {[
                    { label:"Jobs Found",   value:"2,847", color:"#3f3f46" },
                    { label:"Auto-Applied", value:"341",   color:"#10b981" },
                    { label:"Interviews",   value:"12",    color:"#27272a" },
                  ].map((s,i)=>(
                    <div key={i} style={{ background:"rgba(0,0,0,0.03)", border:"1px solid rgba(0,0,0,0.07)", borderRadius:10, padding:"12px 14px" }}>
                      <div style={{ fontSize:10, color:"#71717a", marginBottom:4, textTransform:"uppercase", letterSpacing:.5 }}>{s.label}</div>
                      <div style={{ fontSize:22, fontWeight:800, color:s.color, fontFamily:"'Syne',sans-serif" }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:11, color:"#a1a1aa", marginBottom:10, fontWeight:600, letterSpacing:.5, textTransform:"uppercase" }}>Top Matches</div>
                {[
                  { title:"Senior ML Engineer",    company:"Google", score:9.2, bg:"#09090b" },
                  { title:"Data Scientist II",      company:"Meta",   score:8.7, bg:"#1877f2" },
                  { title:"AI Research Engineer",   company:"OpenAI", score:8.1, bg:"#10b981" },
                  { title:"Applied Scientist",      company:"Amazon", score:7.9, bg:"#f59e0b" },
                ].map((j,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", background:"rgba(0,0,0,0.025)", borderRadius:8, marginBottom:5, border:"1px solid rgba(0,0,0,0.04)" }}>
                    <div style={{ width:28, height:28, borderRadius:7, background:j.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#fff", flexShrink:0 }}>{j.company[0]}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:"#09090b" }}>{j.title}</div>
                      <div style={{ fontSize:10, color:"#71717a" }}>{j.company}</div>
                    </div>
                    <div style={{ padding:"2px 9px", borderRadius:20, background:j.score>9?"rgba(16,185,129,0.15)":"rgba(245,158,11,0.12)", border:`1px solid ${j.score>9?"rgba(16,185,129,0.3)":"rgba(245,158,11,0.25)"}`, fontSize:11, fontWeight:700, color:j.score>9?"#10b981":"#f59e0b" }}>{j.score}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -- STATS STRIP ------------------------------------------ */}
      <section style={{ borderTop:"1px solid rgba(0,0,0,0.05)", borderBottom:"1px solid rgba(0,0,0,0.05)", background:"rgba(248,250,252,0.7)", padding:"52px 40px", display:"grid", gridTemplateColumns:"repeat(4,1fr)" }}>
        {[
          { value:"50K+",  label:"Jobs tracked weekly" },
          { value:"94%",   label:"Match accuracy" },
          { value:"10�",   label:"Faster applications" },
          { value:"3 min", label:"Avg time to apply" },
        ].map((s,i)=>(
          <div key={i} style={{ textAlign:"center", padding:"16px 0", borderRight:i<3?"1px solid rgba(0,0,0,0.05)":undefined }}>
            <div style={{ fontSize:44, fontWeight:800, fontFamily:"'Syne',sans-serif", background:"linear-gradient(115deg,#3f3f46,#27272a)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text", marginBottom:8 }}>{s.value}</div>
            <div style={{ fontSize:14, color:"#71717a" }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* -- FEATURES BENTO --------------------------------------- */}
      <section style={{ padding:"120px 40px", maxWidth:1100, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:68 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"5px 16px", borderRadius:100, background:"rgba(0,0,0,0.08)", border:"1px solid rgba(0,0,0,0.2)", marginBottom:22 }}>
            <span style={{ fontSize:11, color:"#27272a", fontWeight:600, letterSpacing:1, textTransform:"uppercase" }}>Everything you need</span>
          </div>
          <h2 style={{ fontSize:"clamp(32px,4vw,54px)", fontWeight:800, fontFamily:"'Syne',sans-serif", letterSpacing:-1.5, color:"#09090b", marginBottom:16 }}>Built for serious job seekers</h2>
          <p style={{ fontSize:16, color:"#71717a", maxWidth:440, margin:"0 auto", lineHeight:1.7 }}>Every tool you need to go from search to offer, powered by the latest AI models.</p>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          <div className="lp-feature-card" style={{ gridRow:"1/3", background:"linear-gradient(160deg,#ffffff 0%,#f9f9f9 100%)", border:"1px solid rgba(0,0,0,0.08)", borderRadius:22, padding:40, position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:-60, right:-60, width:240, height:240, borderRadius:"50%", background:"radial-gradient(circle,rgba(0,0,0,0.18),transparent 70%)", pointerEvents:"none" }}/>
            <div style={{ width:48, height:48, borderRadius:14, background:"rgba(0,0,0,0.13)", border:"1px solid rgba(0,0,0,0.22)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:22 }}>
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#3f3f46" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <h3 style={{ fontSize:24, fontWeight:800, color:"#09090b", marginBottom:12, fontFamily:"'Syne',sans-serif" }}>AI Job Scoring</h3>
            <p style={{ fontSize:14, color:"#71717a", lineHeight:1.75, marginBottom:32 }}>Every job gets a personalized score out of 10 based on your exact skills, experience, and target roles. Cut through the noise instantly.</p>
            {[
              { role:"ML Engineer @ Google",   score:9.2, c:"#10b981" },
              { role:"Data Scientist @ Meta",   score:8.7, c:"#10b981" },
              { role:"AI Engineer @ OpenAI",    score:8.1, c:"#f59e0b" },
              { role:"Applied Scientist @ AWS", score:7.4, c:"#f59e0b" },
            ].map((r,i)=>(
              <div key={i} style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ fontSize:13, color:"#52525b" }}>{r.role}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:r.c }}>{r.score}</span>
                </div>
                <div style={{ height:5, background:"rgba(0,0,0,0.05)", borderRadius:5 }}>
                  <div style={{ height:"100%", width:`${r.score*10}%`, background:`linear-gradient(90deg,${r.c},${r.c}88)`, borderRadius:5 }}/>
                </div>
              </div>
            ))}
          </div>

          <div className="lp-feature-card" style={{ background:"linear-gradient(160deg,#ffffff 0%,#f9f9f9 100%)", border:"1px solid rgba(0,0,0,0.08)", borderRadius:22, padding:34, position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:-50, right:-50, width:180, height:180, borderRadius:"50%", background:"radial-gradient(circle,rgba(0,0,0,0.14),transparent 70%)", pointerEvents:"none" }}/>
            <div style={{ width:48, height:48, borderRadius:14, background:"rgba(0,0,0,0.1)", border:"1px solid rgba(0,0,0,0.2)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:20 }}>
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#27272a" strokeWidth="1.7" strokeLinecap="round"><path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
            </div>
            <h3 style={{ fontSize:22, fontWeight:800, color:"#09090b", marginBottom:10, fontFamily:"'Syne',sans-serif" }}>SAM Assistant</h3>
            <p style={{ fontSize:14, color:"#71717a", lineHeight:1.7 }}>Your AI career co-pilot. Ask anything � resume tips, salary negotiation, skill gaps. SAM knows your profile inside out and gives expert advice, instantly.</p>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div className="lp-feature-card" style={{ background:"linear-gradient(160deg,#ffffff 0%,#f9f9f9 100%)", border:"1px solid rgba(0,0,0,0.08)", borderRadius:22, padding:28, position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", top:-40, right:-40, width:120, height:120, borderRadius:"50%", background:"radial-gradient(circle,rgba(16,185,129,0.12),transparent 70%)", pointerEvents:"none" }}/>
              <div style={{ width:42, height:42, borderRadius:12, background:"rgba(16,185,129,0.1)", border:"1px solid rgba(16,185,129,0.2)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:16 }}>
                <svg width="21" height="21" fill="none" viewBox="0 0 24 24" stroke="#10b981" strokeWidth="1.7" strokeLinecap="round"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>
              </div>
              <h3 style={{ fontSize:17, fontWeight:700, color:"#09090b", marginBottom:8, fontFamily:"'Syne',sans-serif" }}>Mock Interviews</h3>
              <p style={{ fontSize:13, color:"#71717a", lineHeight:1.65 }}>STAR-method coaching with real questions from your target companies.</p>
            </div>
            <div className="lp-feature-card" style={{ background:"linear-gradient(160deg,#ffffff 0%,#f9f9f9 100%)", border:"1px solid rgba(0,0,0,0.08)", borderRadius:22, padding:28, position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", top:-40, right:-40, width:120, height:120, borderRadius:"50%", background:"radial-gradient(circle,rgba(245,158,11,0.1),transparent 70%)", pointerEvents:"none" }}/>
              <div style={{ width:42, height:42, borderRadius:12, background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.2)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:16 }}>
                <svg width="21" height="21" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" strokeWidth="1.7" strokeLinecap="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              </div>
              <h3 style={{ fontSize:17, fontWeight:700, color:"#09090b", marginBottom:8, fontFamily:"'Syne',sans-serif" }}>Auto-Apply</h3>
              <p style={{ fontSize:13, color:"#71717a", lineHeight:1.65 }}>Apply to hundreds of matched roles automatically while you sleep.</p>
            </div>
          </div>
        </div>
      </section>

      {/* -- TESTIMONIALS ----------------------------------------- */}
      <section style={{ padding:"80px 40px 120px", background:"rgba(248,250,252,0.5)", borderTop:"1px solid rgba(0,0,0,0.04)" }}>
        <div style={{ maxWidth:1100, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:56 }}>
            <h2 style={{ fontSize:"clamp(28px,3.5vw,46px)", fontWeight:800, fontFamily:"'Syne',sans-serif", color:"#09090b", letterSpacing:-1, marginBottom:12 }}>Loved by job seekers</h2>
            <p style={{ fontSize:15, color:"#71717a" }}>Join thousands who landed their dream roles with JobPilot</p>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:18 }}>
            {[
              { name:"Sarah K.",  role:"Data Scientist @ Google", avatar:"SK", text:"JobPilot scored 200+ jobs in seconds and auto-applied to the top 30. I had 6 interviews in a week. Nothing else comes close." },
              { name:"Marcus T.", role:"ML Engineer @ Meta",       avatar:"MT", text:"SAM helped me nail every technical screen. It knew exactly which skills I was missing and how to talk about my projects. Landed the job in 3 weeks." },
              { name:"Priya R.",  role:"AI Researcher @ OpenAI",   avatar:"PR", text:"From sign-up to offer letter in 3 weeks. The mock interview tool is insane � felt like I had a dedicated career coach on call 24/7." },
            ].map((t,i)=>(
              <div key={i} className="lp-testimonial" style={{ background:"rgba(244,244,245,0.7)", border:"1px solid rgba(0,0,0,0.08)", borderRadius:18, padding:28 }}>
                <div style={{ display:"flex", gap:2, marginBottom:18 }}>
                  {[...Array(5)].map((_,j)=>(
                    <svg key={j} width="14" height="14" fill="#f59e0b" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>
                  ))}
                </div>
                <p style={{ fontSize:14, color:"#52525b", lineHeight:1.75, marginBottom:22, fontStyle:"italic" }}>"{t.text}"</p>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:40, height:40, borderRadius:"50%", background:"#18181b", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#fff", flexShrink:0 }}>{t.avatar}</div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600, color:"#09090b" }}>{t.name}</div>
                    <div style={{ fontSize:12, color:"#71717a" }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -- LOGIN CTA --------------------------------------------- */}
      <section id="jp-login" style={{ padding:"120px 40px 140px", display:"flex", flexDirection:"column", alignItems:"center", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
          <div style={{ position:"absolute", width:700, height:700, borderRadius:"50%", background:"radial-gradient(circle,rgba(0,0,0,0.11),transparent 70%)", top:"50%", left:"50%", transform:"translate(-50%,-50%)" }}/>
          <div style={{ position:"absolute", inset:0, backgroundImage:"linear-gradient(rgba(255,255,255,0.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.015) 1px,transparent 1px)", backgroundSize:"64px 64px" }}/>
        </div>
        <div style={{ textAlign:"center", marginBottom:52, position:"relative", zIndex:1 }}>
          <h2 style={{ fontSize:"clamp(32px,4.5vw,60px)", fontWeight:800, fontFamily:"'Syne',sans-serif", color:"#09090b", letterSpacing:-2, marginBottom:16 }}>
            Start your job search<br/>
            <span style={{ background:"linear-gradient(115deg,#3f3f46,#27272a)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>today.</span>
          </h2>
          <p style={{ fontSize:16, color:"#71717a" }}>Sign in to your dashboard and let SAM do the heavy lifting.</p>
        </div>

        <div style={{ width:"100%", maxWidth:420, background:"rgba(248,250,252,0.92)", border:"1px solid rgba(0,0,0,0.09)", borderRadius:22, padding:40, position:"relative", zIndex:1, backdropFilter:"blur(24px)", boxShadow:"0 48px 96px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04), inset 0 1px 0 rgba(0,0,0,0.07)" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:30 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:"#18181b", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            </div>
            <span style={{ fontSize:20, fontWeight:800, color:"#09090b", fontFamily:"'Syne',sans-serif" }}>JobPilot</span>
          </div>
          <h3 style={{ fontSize:19, fontWeight:700, color:"#09090b", textAlign:"center", marginBottom:6 }}>Welcome back</h3>
          <p style={{ fontSize:13, color:"#71717a", textAlign:"center", marginBottom:30 }}>Sign in to your AI career dashboard</p>
          <form onSubmit={handleLogin} style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:500, color:"#52525b", marginBottom:8 }}>Username</label>
              <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="admin" autoComplete="username" required
                style={{ width:"100%", background:"rgba(0,0,0,0.04)", border:"1px solid rgba(0,0,0,0.09)", borderRadius:10, padding:"12px 14px", fontSize:14, color:"#09090b", outline:"none", fontFamily:"inherit", transition:"border-color .2s, box-shadow .2s", boxSizing:"border-box" }}
                onFocus={e=>{ e.target.style.borderColor="#18181b"; e.target.style.boxShadow="0 0 0 3px rgba(0,0,0,0.15)"; }}
                onBlur={e=>{ e.target.style.borderColor="rgba(0,0,0,0.09)"; e.target.style.boxShadow="none"; }}/>
            </div>
            <div>
              <label style={{ display:"block", fontSize:12, fontWeight:500, color:"#52525b", marginBottom:8 }}>Password</label>
              <div style={{ position:"relative" }}>
                <input type={showPass?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="��������" autoComplete="current-password" required
                  style={{ width:"100%", background:"rgba(0,0,0,0.04)", border:"1px solid rgba(0,0,0,0.09)", borderRadius:10, padding:"12px 44px 12px 14px", fontSize:14, color:"#09090b", outline:"none", fontFamily:"inherit", transition:"border-color .2s, box-shadow .2s", boxSizing:"border-box" }}
                  onFocus={e=>{ e.target.style.borderColor="#18181b"; e.target.style.boxShadow="0 0 0 3px rgba(0,0,0,0.15)"; }}
                  onBlur={e=>{ e.target.style.borderColor="rgba(0,0,0,0.09)"; e.target.style.boxShadow="none"; }}/>
                <button type="button" onClick={()=>setShowPass(v=>!v)} style={{ position:"absolute", right:13, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#71717a", cursor:"pointer", padding:0, lineHeight:1 }}>
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    {showPass
                      ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                      : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                    }
                  </svg>
                </button>
              </div>
            </div>
            {error && (
              <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:9, padding:"10px 14px", fontSize:13, color:"#fca5a5" }}>{error}</div>
            )}
            <button type="submit" disabled={loading} style={{ padding:"13px", borderRadius:11, border:"none", background:"#18181b", color:"#fff", fontSize:14, fontWeight:600, cursor:loading?"not-allowed":"pointer", opacity:loading?0.8:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginTop:6, boxShadow:"0 0 36px rgba(0,0,0,0.35)", transition:"opacity .2s, transform .15s" }}
              onMouseEnter={e=>{ if(!loading){ e.currentTarget.style.transform="translateY(-1px)"; e.currentTarget.style.boxShadow="0 0 48px rgba(0,0,0,0.08)"; }}}
              onMouseLeave={e=>{ e.currentTarget.style.transform="none"; e.currentTarget.style.boxShadow="0 0 36px rgba(0,0,0,0.35)"; }}>
              {loading
                ? <><span style={{ width:14, height:14, border:"2px solid rgba(0,0,0,0.18)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .7s linear infinite", display:"inline-block" }}/> Signing in�</>
                : "Sign in to JobPilot ?"}
            </button>
          </form>
          <p style={{ textAlign:"center", marginTop:22, fontSize:12, color:"#71717a" }}>Default: admin / jobpilot2024</p>
        </div>
      </section>

      {/* -- FOOTER ----------------------------------------------- */}
      <footer style={{ borderTop:"1px solid rgba(0,0,0,0.04)", padding:"28px 48px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:26, height:26, borderRadius:7, background:"#18181b", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </div>
          <span style={{ fontSize:14, fontWeight:800, color:"#a1a1aa", fontFamily:"'Syne',sans-serif" }}>JobPilot</span>
        </div>
        <span style={{ fontSize:12, color:"#d4d4d8" }}>� 2024 JobPilot � AI-Powered Career Platform</span>
        <div style={{ display:"flex", gap:22 }}>
          {["Privacy","Terms","Contact"].map(l=>(
            <span key={l} style={{ fontSize:12, color:"#71717a", cursor:"pointer" }}>{l}</span>
          ))}
        </div>
      </footer>
    </div>
  );
}

// --- Outreach Page ------------------------------------------------------------
function OutreachPage({ showToast, profile }) {
  const [outreachTab, setOutreachTab] = useState("finder");

  // Email Finder state
  const [company,   setCompany]   = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [role,      setRole]      = useState("Hiring Manager");
  const [result,    setResult]    = useState(null);
  const [searching, setSearching] = useState(false);

  // LinkedIn Outreach state
  const [stats,     setStats]     = useState({ today:0, total:0, connected:0, running:false });
  const [log,       setLog]       = useState([]);
  const [companies, setCompanies] = useState("Amazon, Microsoft, Google, Meta, Expedia, Salesforce, Databricks, Snowflake, Adobe, Nvidia");
  const [loading,   setLoading]   = useState(false);

  const fetchOutreach = async () => {
    try {
      const d = await apiFetch(`${API}/outreach`).then(r=>r.json());
      if (d.ok) { setStats(d.stats); setLog(d.log||[]); }
    } catch {}
  };
  useEffect(() => { fetchOutreach(); }, []);

  const findHiringManager = async () => {
    if (!company.trim()) { showToast("Enter a company name","error"); return; }
    setSearching(true); setResult(null);
    try {
      const d = await apiFetch(`${API}/find-hiring-manager`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ company: company.trim(), firstName: firstName.trim(), lastName: lastName.trim(), role }),
      }).then(r=>r.json());
      if (d.ok) setResult(d);
      else showToast(d.error||"Search failed","error");
    } catch (e) { showToast("Error: "+e.message,"error"); }
    setSearching(false);
  };

  const startOutreach = async () => {
    setLoading(true);
    try {
      const companyList = companies.split(",").map(c=>c.trim()).filter(Boolean);
      const d = await apiFetch(`${API}/outreach/run`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ companies: companyList }),
      }).then(r=>r.json());
      showToast(d.message, d.ok ? "success" : "error");
      if (d.ok) setTimeout(fetchOutreach, 5000);
    } catch(e) { showToast("Outreach failed: "+e.message,"error"); }
    finally { setLoading(false); }
  };

  const TAB_STYLE = (active) => ({
    padding:"9px 18px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13,
    fontWeight: active?700:500,
    background: active?"#6c47ff":"transparent",
    color: active?"#fff":"#71717a",
    transition:"all .15s",
  });

  return (
    <div style={{ maxWidth:920 }}>
      {/* Page header */}
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:22, fontWeight:800, color:"#09090b", margin:0, fontFamily:"'Syne',sans-serif" }}>Outreach</h2>
        <p style={{ color:"#71717a", marginTop:4, fontSize:14 }}>Find hiring manager emails and reach out to recruiters directly.</p>
      </div>

      {/* Tab switcher */}
      <div style={{ display:"flex", gap:4, marginBottom:24, background:"#f4f4f5", borderRadius:10, padding:4, width:"fit-content" }}>
        <button style={TAB_STYLE(outreachTab==="finder")}   onClick={()=>setOutreachTab("finder")}>Email Finder</button>
        <button style={TAB_STYLE(outreachTab==="linkedin")} onClick={()=>setOutreachTab("linkedin")}>LinkedIn Outreach</button>
        <button style={TAB_STYLE(outreachTab==="platforms")} onClick={()=>setOutreachTab("platforms")}>Job Boards</button>
      </div>

      {/* ---- EMAIL FINDER ---- */}
      {outreachTab==="finder" && (
        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
          {/* Hero card */}
          <div style={{ background:"linear-gradient(135deg,#6c47ff08,#8b5cf608)", border:"1px solid #6c47ff20", borderRadius:14, padding:"20px 24px", display:"flex", gap:16, alignItems:"flex-start" }}>
            <div style={{ width:44, height:44, borderRadius:12, background:"linear-gradient(135deg,#6c47ff,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:"#09090b", marginBottom:4 }}>Hiring Manager Email Finder</div>
              <div style={{ fontSize:13, color:"#71717a", lineHeight:1.6 }}>
                Enter a company and hiring manager name to generate likely email patterns. Then verify with Hunter.io or RocketReach for a confirmed address.
              </div>
            </div>
          </div>

          {/* Search form */}
          <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e5e3e0", padding:"22px 24px" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:14, marginBottom:14 }}>
              <div>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#52525b", marginBottom:6 }}>Company *</label>
                <input value={company} onChange={e=>setCompany(e.target.value)} placeholder="Google, Stripe, Databricks..."
                  onKeyDown={e=>e.key==="Enter"&&findHiringManager()}
                  style={{ width:"100%", border:"1.5px solid #e5e3e0", borderRadius:8, padding:"9px 12px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }}
                  onFocus={e=>e.target.style.borderColor="#6c47ff"}
                  onBlur={e=>e.target.style.borderColor="#e5e3e0"}/>
              </div>
              <div>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#52525b", marginBottom:6 }}>First Name</label>
                <input value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="Sarah"
                  onKeyDown={e=>e.key==="Enter"&&findHiringManager()}
                  style={{ width:"100%", border:"1.5px solid #e5e3e0", borderRadius:8, padding:"9px 12px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }}
                  onFocus={e=>e.target.style.borderColor="#6c47ff"}
                  onBlur={e=>e.target.style.borderColor="#e5e3e0"}/>
              </div>
              <div>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#52525b", marginBottom:6 }}>Last Name</label>
                <input value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Chen"
                  onKeyDown={e=>e.key==="Enter"&&findHiringManager()}
                  style={{ width:"100%", border:"1.5px solid #e5e3e0", borderRadius:8, padding:"9px 12px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }}
                  onFocus={e=>e.target.style.borderColor="#6c47ff"}
                  onBlur={e=>e.target.style.borderColor="#e5e3e0"}/>
              </div>
            </div>
            <div style={{ display:"flex", gap:12, alignItems:"flex-end" }}>
              <div style={{ flex:1 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#52525b", marginBottom:6 }}>Role / Title</label>
                <input value={role} onChange={e=>setRole(e.target.value)} placeholder="Hiring Manager, Tech Recruiter..."
                  style={{ width:"100%", border:"1.5px solid #e5e3e0", borderRadius:8, padding:"9px 12px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }}
                  onFocus={e=>e.target.style.borderColor="#6c47ff"}
                  onBlur={e=>e.target.style.borderColor="#e5e3e0"}/>
              </div>
              <button onClick={findHiringManager} disabled={searching} style={{
                padding:"10px 28px", background:"linear-gradient(135deg,#6c47ff,#8b5cf6)", color:"#fff",
                border:"none", borderRadius:9, fontWeight:700, fontSize:13, cursor:searching?"wait":"pointer", whiteSpace:"nowrap",
              }}>
                {searching ? "Searching..." : "Find Email"}
              </button>
            </div>
          </div>

          {/* Results */}
          {result && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {/* Email patterns */}
              {result.patterns?.length > 0 && (
                <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e5e3e0", overflow:"hidden" }}>
                  <div style={{ padding:"14px 20px", borderBottom:"1px solid #f0eeec", display:"flex", alignItems:"center", gap:8 }}>
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#6c47ff" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                    </svg>
                    <span style={{ fontSize:13, fontWeight:700, color:"#09090b" }}>Email Patterns for {company}</span>
                    <span style={{ fontSize:11, color:"#a8a29e", marginLeft:4 }}>domain: {result.domain}</span>
                  </div>
                  {result.patterns.map((p,i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 20px", borderBottom:"1px solid #f5f4f2" }}
                      onMouseEnter={e=>e.currentTarget.style.background="#fafaf9"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <div>
                        <span style={{ fontFamily:"monospace", fontSize:13, color:"#18181b", fontWeight:600 }}>{p.pattern}</span>
                        <span style={{ fontSize:11, color:"#a8a29e", marginLeft:10 }}>{p.label}</span>
                      </div>
                      <button onClick={()=>{ navigator.clipboard.writeText(p.pattern); showToast("Copied!"); }} style={{
                        padding:"4px 12px", background:"#f4f4f5", color:"#57534e", border:"1px solid #e5e3e0",
                        borderRadius:6, fontSize:11, fontWeight:600, cursor:"pointer",
                      }}>Copy</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Verification links */}
              <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e5e3e0", padding:"18px 20px" }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#09090b", marginBottom:12 }}>Verify & Find on These Platforms</div>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  {[
                    { name:"LinkedIn", url:result.linkedinUrl, color:"#0a66c2", desc:"Search people" },
                    { name:"Hunter.io", url:result.hunterUrl, color:"#f97316", desc:"Verify email" },
                    { name:"Apollo.io", url:result.apolloUrl, color:"#6c47ff", desc:"Find + export" },
                    { name:"RocketReach", url:result.rocketUrl, color:"#dc2626", desc:"Phone + email" },
                  ].map(l=>(
                    <a key={l.name} href={l.url} target="_blank" rel="noreferrer" style={{
                      display:"flex", flexDirection:"column", padding:"12px 16px", borderRadius:10,
                      border:`1px solid ${l.color}25`, background:`${l.color}08`,
                      textDecoration:"none", minWidth:130,
                    }}>
                      <span style={{ fontSize:13, fontWeight:700, color:l.color }}>{l.name}</span>
                      <span style={{ fontSize:11, color:"#a8a29e", marginTop:2 }}>{l.desc}</span>
                    </a>
                  ))}
                </div>
              </div>

              {/* LinkedIn search link (no name needed) */}
              <div style={{ background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#1e40af" }}>
                <strong>Tip:</strong> If you don't have a name yet, search LinkedIn for "{role}" at {company} first.
                <a href={result.linkedinUrl} target="_blank" rel="noreferrer" style={{ color:"#1e40af", fontWeight:700, marginLeft:8 }}>Search LinkedIn</a>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!result && !searching && (
            <div style={{ textAlign:"center", padding:"40px 0", color:"#a8a29e", fontSize:13 }}>
              Enter a company name above and click "Find Email" to generate patterns
            </div>
          )}
        </div>
      )}

      {/* ---- LINKEDIN OUTREACH ---- */}
      {outreachTab==="linkedin" && (
        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
          {/* Stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
            {[
              { label:"Sent Today",  val:stats.today,     color:"#6c47ff" },
              { label:"Total Sent",  val:stats.total,     color:"#09090b" },
              { label:"Connected",   val:stats.connected, color:"#16a34a" },
              { label:"Daily Limit", val:10,              color:"#d97706" },
            ].map(s=>(
              <div key={s.label} style={{ background:"#fff", border:"1px solid #e5e3e0", borderRadius:12, padding:"16px 18px", textAlign:"center" }}>
                <div style={{ fontSize:28, fontWeight:800, color:s.color, fontFamily:"'Syne',sans-serif" }}>{s.val}</div>
                <div style={{ fontSize:12, color:"#78716c", marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ background:"#f0f0ff", border:"1px solid #6c47ff20", borderRadius:10, padding:"13px 16px", fontSize:13, color:"#4338ca", lineHeight:1.6 }}>
            JobPilot searches LinkedIn for recruiters at your target companies and sends personalised connection requests (max 10/day to protect your account).
          </div>

          {/* Target companies */}
          <div style={{ background:"#fff", border:"1px solid #e5e3e0", borderRadius:12, padding:"20px 22px" }}>
            <label style={{ display:"block", fontWeight:700, fontSize:13, marginBottom:8, color:"#09090b" }}>
              Target Companies
            </label>
            <textarea value={companies} onChange={e=>setCompanies(e.target.value)} rows={3}
              style={{ width:"100%", border:"1.5px solid #e5e3e0", borderRadius:8, padding:"10px 12px", fontSize:13, fontFamily:"inherit", resize:"vertical", boxSizing:"border-box", outline:"none" }}
              onFocus={e=>e.target.style.borderColor="#6c47ff"}
              onBlur={e=>e.target.style.borderColor="#e5e3e0"}
              placeholder="Amazon, Microsoft, Google, Meta..."/>
            <div style={{ marginTop:12, display:"flex", gap:10, alignItems:"center" }}>
              <button onClick={startOutreach} disabled={loading||stats.running||stats.today>=10}
                style={{
                  background: loading||stats.running||stats.today>=10?"#d1d5db":"linear-gradient(135deg,#6c47ff,#8b5cf6)",
                  color:"#fff", border:"none", borderRadius:9, padding:"10px 22px",
                  fontWeight:700, cursor:loading||stats.running||stats.today>=10?"not-allowed":"pointer", fontSize:13,
                }}>
                {loading||stats.running?"Running...":stats.today>=10?"Daily limit reached":"Start Outreach"}
              </button>
              <button onClick={fetchOutreach} style={{ background:"none", border:"1px solid #e5e3e0", borderRadius:8, padding:"9px 16px", fontSize:13, cursor:"pointer", color:"#78716c" }}>
                Refresh
              </button>
              <span style={{ fontSize:12, color:"#a8a29e" }}>{10-stats.today} slots remaining today</span>
            </div>
          </div>

          {/* Outreach log */}
          <div style={{ background:"#fff", border:"1px solid #e5e3e0", borderRadius:12, overflow:"hidden" }}>
            <div style={{ padding:"14px 20px", borderBottom:"1px solid #f0eeec", fontWeight:700, fontSize:13, color:"#09090b" }}>
              Outreach Log ({log.length})
            </div>
            {log.length===0
              ? <div style={{ padding:40, textAlign:"center", color:"#a8a29e", fontSize:13 }}>No outreach sent yet. Click "Start Outreach" to begin.</div>
              : (
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                    <thead>
                      <tr style={{ background:"#fafaf9" }}>
                        {["Recruiter","Company","Title","Status","Sent At"].map(h=>(
                          <th key={h} style={{ padding:"10px 16px", textAlign:"left", fontWeight:600, color:"#a8a29e", fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em", borderBottom:"1px solid #f0eeec", whiteSpace:"nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {log.map((r,i)=>(
                        <tr key={i} style={{ borderBottom:"1px solid #f5f4f2" }}
                          onMouseEnter={e=>e.currentTarget.style.background="#fafaf9"}
                          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <td style={{ padding:"10px 16px", fontWeight:600, color:"#1c1917" }}>
                            {r.profileUrl?<a href={r.profileUrl} target="_blank" rel="noreferrer" style={{ color:"#0a66c2", textDecoration:"none" }}>{r.recruiter||"-"}</a>:(r.recruiter||"-")}
                          </td>
                          <td style={{ padding:"10px 16px", color:"#57534e" }}>{r.company||"-"}</td>
                          <td style={{ padding:"10px 16px", color:"#78716c", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.title||"-"}</td>
                          <td style={{ padding:"10px 16px" }}>
                            {r.connected
                              ? <span style={{ background:"#dcfce7", color:"#16a34a", borderRadius:20, padding:"2px 9px", fontWeight:700, fontSize:11 }}>Connected</span>
                              : r.sent
                                ? <span style={{ background:"#6c47ff15", color:"#6c47ff", borderRadius:20, padding:"2px 9px", fontWeight:700, fontSize:11 }}>Sent</span>
                                : <span style={{ background:"#fee2e2", color:"#dc2626", borderRadius:20, padding:"2px 9px", fontWeight:700, fontSize:11 }}>Failed</span>
                            }
                          </td>
                          <td style={{ padding:"10px 16px", color:"#a8a29e", whiteSpace:"nowrap", fontSize:11 }}>{r.sentAt?new Date(r.sentAt).toLocaleString():"-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        </div>
      )}

      {/* ---- JOB BOARDS ---- */}
      {outreachTab==="platforms" && (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={{ fontSize:13, color:"#71717a", marginBottom:4 }}>Create a profile on these platforms — recruiters actively search here for candidates.</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            {[
              { name:"Hired.com",       url:"https://hired.com",                    desc:"Companies bid on you — best for $100k+ roles", accent:"#6c47ff" },
              { name:"Wellfound",       url:"https://wellfound.com",                desc:"Startup jobs — YC-backed companies",            accent:"#16a34a" },
              { name:"Dice",            url:"https://dice.com",                     desc:"Tech-specific — recruiters search daily",       accent:"#dc2626" },
              { name:"Indeed Resume",   url:"https://indeed.com/create-resume",     desc:"Make yourself searchable on Indeed",            accent:"#003087" },
              { name:"Otta",            url:"https://otta.com",                     desc:"Curated tech roles — no noise",                 accent:"#0d9488" },
              { name:"LinkedIn",        url:"https://linkedin.com/in/",             desc:"Primary recruiter sourcing platform",           accent:"#0a66c2" },
              { name:"Handshake",       url:"https://joinhandshake.com",            desc:"Students & new grads — campus recruiting",      accent:"#e11d48" },
              { name:"AngelList / A!",  url:"https://wellfound.com",                desc:"Startup equity roles",                         accent:"#f59e0b" },
            ].map(p=>(
              <a key={p.name} href={p.url} target="_blank" rel="noreferrer" style={{
                display:"flex", gap:14, padding:"16px 18px", border:`1px solid ${p.accent}20`,
                borderRadius:12, textDecoration:"none", background:`${p.accent}06`, alignItems:"center",
              }}
                onMouseEnter={e=>{ e.currentTarget.style.borderColor=p.accent+"50"; e.currentTarget.style.background=p.accent+"10"; }}
                onMouseLeave={e=>{ e.currentTarget.style.borderColor=p.accent+"20"; e.currentTarget.style.background=p.accent+"06"; }}>
                <div style={{ width:40, height:40, borderRadius:10, background:p.accent+"18", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <span style={{ fontSize:16, fontWeight:800, color:p.accent }}>{p.name[0]}</span>
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#09090b" }}>{p.name} <span style={{ fontSize:11, color:p.accent }}>↗</span></div>
                  <div style={{ fontSize:12, color:"#78716c", marginTop:2 }}>{p.desc}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
// --- Mock Interview Studio ----------------------------------------------------
function MockInterviewStudio({ showToast, applications, profile }) {
  const [phase, setPhase]               = useState("setup");
  const [jobInput, setJobInput]         = useState({ title:"", company:"", description:"" });
  const [questions, setQuestions]       = useState([]);
  const [currentQ, setCurrentQ]         = useState(0);
  const [isRecording, setIsRecording]   = useState(false);
  const [liveText, setLiveText]         = useState("");
  const [typedText, setTypedText]       = useState("");
  const [fillerCount, setFillerCount]   = useState(0);
  const [timer, setTimer]               = useState(0);
  const [sessionAnswers, setSessionAnswers] = useState([]);
  const [currentFeedback, setCurrentFeedback] = useState(null);
  const [fbLoading, setFbLoading]       = useState(false);
  const [qLoading, setQLoading]         = useState(false);
  const [sessions, setSessions]         = useState([]);
  const [hasSpeech, setHasSpeech]       = useState(false);
  const recRef   = useRef(null);
  const timerRef = useRef(null);

  const FILLERS = ["um","uh","like","you know","basically","actually","literally","so,","right,","i mean"];

  useEffect(() => {
    setHasSpeech(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
    try { const s = localStorage.getItem("jp_interview_sessions"); if (s) setSessions(JSON.parse(s)); } catch {}
  }, []);

  function countFillers(t) {
    const low = t.toLowerCase();
    return FILLERS.reduce((c, f) => c + ((low.match(new RegExp("\\b" + f.replace(/,/,"").trim() + "\\b","g")) || []).length), 0);
  }

  async function generateQuestions() {
    setQLoading(true);
    try {
      const d = await apiFetch(`${API}/interview/questions`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ job: jobInput, profile }),
      }).then(r => r.json());
      if (d.ok && d.questions?.length > 0) {
        setQuestions(d.questions); setPhase("session");
        setCurrentQ(0); setSessionAnswers([]); setCurrentFeedback(null);
      } else { showToast("Could not generate questions � check GROQ_API_KEY", "error"); }
    } catch(e) { showToast("Error: "+e.message, "error"); }
    setQLoading(false);
  }

  function startRecording() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = "en-US";
    let final = "";
    r.onresult = e => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
        else interim = e.results[i][0].transcript;
      }
      const full = final + interim;
      setLiveText(full); setFillerCount(countFillers(full));
    };
    r.onerror = () => { clearInterval(timerRef.current); setIsRecording(false); };
    r.onend   = () => { if (recRef.current?.active) r.start(); };
    recRef.current = { r, active:true, getText:() => final };
    r.start();
    setIsRecording(true); setLiveText(""); setFillerCount(0); setTimer(0);
    timerRef.current = setInterval(() => setTimer(t => t+1), 1000);
  }

  function stopRecording() {
    if (recRef.current) { recRef.current.active = false; recRef.current.r.stop(); }
    clearInterval(timerRef.current); setIsRecording(false);
  }

  async function submitAnswer() {
    const text = (liveText || typedText).trim();
    if (!text) { showToast("No answer to submit","error"); return; }
    setFbLoading(true);
    try {
      const d = await apiFetch(`${API}/interview/feedback`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ question: questions[currentQ]?.question, answer: text, jobTitle: jobInput.title }),
      }).then(r => r.json());
      setCurrentFeedback({ ...d, transcript:text, fillers:fillerCount, duration:timer });
    } catch {
      setCurrentFeedback({ strength:3, feedback:"Answer saved.", starScore:{}, transcript:text, fillers:fillerCount, duration:timer });
    }
    setFbLoading(false);
  }

  function nextQuestion() {
    const ans = { question:questions[currentQ]?.question, type:questions[currentQ]?.type, ...currentFeedback };
    const updated = [...sessionAnswers, ans];
    setSessionAnswers(updated); setCurrentFeedback(null);
    setLiveText(""); setTypedText(""); setFillerCount(0); setTimer(0);
    if (currentQ + 1 >= questions.length) {
      const sess = { id:Date.now(), job:jobInput, date:new Date().toISOString(), answers:updated,
        overallScore: +(updated.reduce((s,a)=>s+(a.strength||3),0)/updated.length).toFixed(1) };
      const all = [sess, ...sessions].slice(0,10);
      setSessions(all);
      try { localStorage.setItem("jp_interview_sessions", JSON.stringify(all)); } catch {}
      setPhase("summary");
    } else { setCurrentQ(q => q+1); }
  }

  const fmtTime = s => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,"0")}`;
  const sColor  = n => n >= 4 ? "#16a34a" : n >= 3 ? "#d97706" : "#dc2626";
  const btn = (label, onClick, opts={}) => (
    <button onClick={onClick} disabled={opts.disabled} style={{
      background: opts.disabled ? "#e5e3e0" : (opts.bg||"#1c1917"),
      color: opts.disabled ? "#a8a29e" : (opts.color||"#fff"),
      border: opts.outline ? "1px solid #e5e3e0" : "none",
      borderRadius:9, padding:"11px "+(opts.wide?"28px":"20px"), fontWeight:700, fontSize:13,
      cursor: opts.disabled ? "not-allowed":"pointer", transition:".15s",
    }}>{label}</button>
  );

  // -- SETUP --
  if (phase === "setup") {
    const recent = (applications||[]).filter(a=>["auto-applied","browser-opened","interviewing"].includes(a.status)).slice(0,6);
    return (
      <div style={{ maxWidth:680 }}>
        <div style={{ marginBottom:24 }}>
          <h2 style={{ fontSize:22, fontWeight:700, color:"#1c1917", margin:0 }}>Mock Interview Studio</h2>
          <p style={{ color:"#78716c", marginTop:4, fontSize:14 }}>AI-powered practice � STAR coaching, filler word tracking, real-time feedback.</p>
        </div>

        {recent.length > 0 && (
          <div style={{ background:"#fff", border:"1px solid #e5e3e0", borderRadius:12, padding:18, marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#a8a29e", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12 }}>Quick Start � Your Applications</div>
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {recent.map((a,i) => {
                const sel = jobInput.title===a.title && jobInput.company===a.company;
                return (
                  <button key={i} onClick={()=>setJobInput({title:a.title||"",company:a.company||"",description:a.description||""})}
                    style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:sel?"#f4f4f5":"#fafaf9", border:`1px solid ${sel?"#e4e4e7":"#e5e3e0"}`, borderRadius:8, padding:"10px 14px", cursor:"pointer", textAlign:"left" }}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:13, color:"#1c1917" }}>{a.title}</div>
                      <div style={{ fontSize:11, color:"#78716c" }}>{a.company}{a.location?" � "+a.location:""}</div>
                    </div>
                    {sel && <span style={{ fontSize:12, color:"#18181b", fontWeight:600 }}>? Selected</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ background:"#fff", border:"1px solid #e5e3e0", borderRadius:12, padding:18, marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#a8a29e", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12 }}>Enter Role Manually</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:"#57534e", display:"block", marginBottom:4 }}>Job Title *</label>
              <input value={jobInput.title} onChange={e=>setJobInput(j=>({...j,title:e.target.value}))} placeholder="Data Scientist"
                style={{ width:"100%", border:"1px solid #d6d3d1", borderRadius:7, padding:"8px 10px", fontSize:13, boxSizing:"border-box" }}/>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:"#57534e", display:"block", marginBottom:4 }}>Company</label>
              <input value={jobInput.company} onChange={e=>setJobInput(j=>({...j,company:e.target.value}))} placeholder="Amazon"
                style={{ width:"100%", border:"1px solid #d6d3d1", borderRadius:7, padding:"8px 10px", fontSize:13, boxSizing:"border-box" }}/>
            </div>
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:"#57534e", display:"block", marginBottom:4 }}>Job Description (optional � improves question quality)</label>
            <textarea value={jobInput.description} onChange={e=>setJobInput(j=>({...j,description:e.target.value}))}
              rows={3} placeholder="Paste job description here�"
              style={{ width:"100%", border:"1px solid #d6d3d1", borderRadius:7, padding:"8px 10px", fontSize:13, fontFamily:"inherit", resize:"vertical", boxSizing:"border-box" }}/>
          </div>
        </div>

        {!hasSpeech && (
          <div style={{ background:"#fef9c3", border:"1px solid #fde68a", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#b45309" }}>
            Voice input works best in Chrome or Edge. You can also type your answers.
          </div>
        )}

        {btn(qLoading ? "Generating questions�" : "Start Interview ?", generateQuestions, { disabled:!jobInput.title||qLoading, bg:"#18181b" })}

        {sessions.length > 0 && (
          <div style={{ marginTop:32 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#1c1917", marginBottom:10 }}>Past Sessions</div>
            {sessions.map((s,i)=>(
              <div key={i} style={{ background:"#fff", border:"1px solid #e5e3e0", borderRadius:10, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:13, color:"#1c1917" }}>{s.job.title} @ {s.job.company||"�"}</div>
                  <div style={{ fontSize:11, color:"#a8a29e", marginTop:2 }}>{new Date(s.date).toLocaleDateString()} � {s.answers.length} questions</div>
                </div>
                <span style={{ background:sColor(s.overallScore)+"18", color:sColor(s.overallScore), border:`1px solid ${sColor(s.overallScore)}30`, borderRadius:6, padding:"3px 10px", fontWeight:700, fontSize:13 }}>{s.overallScore}/5</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // -- SESSION --
  if (phase === "session") {
    const q     = questions[currentQ];
    const pct   = (currentQ / questions.length) * 100;
    const ansText = liveText || typedText;

    return (
      <div style={{ maxWidth:700 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
          <div>
            <div style={{ fontSize:12, color:"#a8a29e" }}>{jobInput.title}{jobInput.company?" @ "+jobInput.company:""}</div>
            <div style={{ fontSize:14, fontWeight:700, color:"#1c1917", marginTop:2 }}>Question {currentQ+1} of {questions.length}</div>
          </div>
          <button onClick={()=>{ if(recRef.current){recRef.current.active=false;recRef.current.r.stop();} clearInterval(timerRef.current); setIsRecording(false); setPhase("setup"); }}
            style={{ background:"none", border:"1px solid #e5e3e0", color:"#a8a29e", borderRadius:7, padding:"6px 12px", cursor:"pointer", fontSize:12 }}>
            End Session
          </button>
        </div>

        {/* Progress */}
        <div style={{ height:4, background:"#f0eeec", borderRadius:4, marginBottom:22, overflow:"hidden" }}>
          <div style={{ height:"100%", width:pct+"%", background:"#18181b", borderRadius:4, transition:"width .4s" }}/>
        </div>

        {/* Question card */}
        <div style={{ background:"#fff", border:"1px solid #e5e3e0", borderRadius:14, padding:22, marginBottom:14 }}>
          <span style={{ background:q?.type==="behavioral"?"#f4f4f5":"#f3e8ff", color:q?.type==="behavioral"?"#18181b":"#18181b", borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600 }}>
            {q?.type==="behavioral" ? "Behavioral (STAR)" : "Technical"}
          </span>
          <div style={{ fontSize:16, fontWeight:600, color:"#1c1917", marginTop:12, lineHeight:1.55 }}>{q?.question}</div>
          {q?.hint && <div style={{ fontSize:12, color:"#78716c", marginTop:8, borderTop:"1px solid #f5f4f2", paddingTop:8 }}>?? {q.hint}</div>}
        </div>

        {!currentFeedback ? (
          <>
            {/* Answer area */}
            <div style={{ background:"#fff", border:`2px solid ${isRecording?"#dc2626":"#e5e3e0"}`, borderRadius:14, padding:18, marginBottom:14, transition:"border-color .2s" }}>
              {isRecording && (
                <div style={{ display:"flex", gap:16, marginBottom:10, alignItems:"center" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:"#dc2626", display:"inline-block",
                      boxShadow:"0 0 0 0 rgba(220,38,38,.4)", animation:"pulse 1.4s ease infinite" }}/>
                    <span style={{ fontSize:13, fontWeight:600, color:"#dc2626" }}>Recording {fmtTime(timer)}</span>
                  </div>
                  <span style={{ fontSize:12, color:fillerCount>3?"#dc2626":"#78716c", fontWeight:fillerCount>3?700:400 }}>
                    {fillerCount} filler word{fillerCount!==1?"s":""}{fillerCount>3?" ??":""}
                  </span>
                </div>
              )}

              {hasSpeech ? (
                <div style={{ fontSize:13, color:liveText?"#1c1917":"#a8a29e", lineHeight:1.65, minHeight:70 }}>
                  {liveText || (isRecording ? "Listening� speak your answer" : "Click Record to start")}
                </div>
              ) : (
                <textarea value={typedText} onChange={e=>setTypedText(e.target.value)}
                  rows={4} placeholder="Type your answer here�"
                  style={{ width:"100%", border:"none", outline:"none", fontSize:13, fontFamily:"inherit", resize:"vertical", background:"transparent", color:"#1c1917" }}/>
              )}
            </div>

            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              {hasSpeech && !isRecording && (
                <button onClick={startRecording} style={{ background:"#dc2626", color:"#fff", border:"none", borderRadius:9, padding:"11px 22px", fontWeight:700, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                  ?? Record Answer
                </button>
              )}
              {isRecording && (
                <button onClick={stopRecording} style={{ background:"#1c1917", color:"#fff", border:"none", borderRadius:9, padding:"11px 22px", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                  ? Stop Recording
                </button>
              )}
              {ansText && !isRecording && btn(fbLoading?"Analyzing�":"Get AI Feedback ?", submitAnswer, { disabled:fbLoading, bg:"#18181b" })}
              {ansText && !isRecording && (
                <button onClick={()=>{setLiveText("");setTypedText("");setFillerCount(0);setTimer(0);}}
                  style={{ background:"none", border:"1px solid #e5e3e0", color:"#78716c", borderRadius:9, padding:"11px 16px", cursor:"pointer", fontSize:13 }}>
                  Re-record
                </button>
              )}
            </div>
          </>
        ) : (
          /* Feedback */
          <div style={{ background:"#fff", border:"1px solid #e5e3e0", borderRadius:14, padding:22 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:700, color:"#1c1917" }}>AI Feedback</div>
              <span style={{ background:sColor(currentFeedback.strength)+"18", color:sColor(currentFeedback.strength), border:`1px solid ${sColor(currentFeedback.strength)}30`, borderRadius:6, padding:"4px 12px", fontWeight:700, fontSize:15 }}>
                {currentFeedback.strength}/5
              </span>
            </div>

            {/* STAR tags */}
            <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:14 }}>
              {["situation","task","action","result"].map(k=>(
                <span key={k} style={{ background:currentFeedback.starScore?.[k]?"#dcfce7":"#fee2e2", color:currentFeedback.starScore?.[k]?"#16a34a":"#dc2626", border:`1px solid ${currentFeedback.starScore?.[k]?"#bbf7d0":"#fecaca"}`, borderRadius:4, padding:"2px 9px", fontSize:11, fontWeight:600 }}>
                  {currentFeedback.starScore?.[k]?"?":"?"} {k[0].toUpperCase()+k.slice(1)}
                </span>
              ))}
              <span style={{ background:currentFeedback.fillers>3?"#fee2e2":"#f0fdf4", color:currentFeedback.fillers>3?"#dc2626":"#16a34a", borderRadius:4, padding:"2px 9px", fontSize:11, fontWeight:600 }}>
                {currentFeedback.fillers} fillers
              </span>
              <span style={{ background:"#f5f4f2", color:"#57534e", borderRadius:4, padding:"2px 9px", fontSize:11 }}>{fmtTime(currentFeedback.duration||0)}</span>
            </div>

            <div style={{ fontSize:13, color:"#44403c", lineHeight:1.65, marginBottom:12 }}>{currentFeedback.feedback}</div>
            {currentFeedback.improvement && (
              <div style={{ background:"#fef9c3", border:"1px solid #fde68a", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#b45309", marginBottom:18 }}>
                <strong>To improve:</strong> {currentFeedback.improvement}
              </div>
            )}
            {btn(currentQ+1>=questions.length?"See Final Results ?":`Next Question (${currentQ+2}/${questions.length}) ?`, nextQuestion)}
          </div>
        )}
      </div>
    );
  }

  // -- SUMMARY --
  if (phase === "summary") {
    const avg   = sessionAnswers.length ? +(sessionAnswers.reduce((s,a)=>s+(a.strength||3),0)/sessionAnswers.length).toFixed(1) : 0;
    const fillers = sessionAnswers.reduce((s,a)=>s+(a.fillers||0),0);
    const best  = [...sessionAnswers].sort((a,b)=>(b.strength||0)-(a.strength||0))[0];
    const worst = [...sessionAnswers].sort((a,b)=>(a.strength||5)-(b.strength||5))[0];

    return (
      <div style={{ maxWidth:660 }}>
        <div style={{ background:"#fff", border:"1px solid #e5e3e0", borderRadius:14, padding:28, marginBottom:16 }}>
          {/* Score header */}
          <div style={{ textAlign:"center", marginBottom:26 }}>
            <div style={{ fontSize:52, fontWeight:800, color:sColor(avg), lineHeight:1 }}>{avg}<span style={{ fontSize:20, color:"#a8a29e" }}>/5</span></div>
            <div style={{ fontSize:16, fontWeight:700, color:"#1c1917", marginTop:6 }}>Session Complete</div>
            <div style={{ fontSize:13, color:"#78716c", marginTop:3 }}>{jobInput.title}{jobInput.company?" @ "+jobInput.company:""}</div>
          </div>

          {/* Stats row */}
          <div style={{ display:"flex", gap:10, justifyContent:"center", marginBottom:24 }}>
            {[["Questions",sessionAnswers.length,"#1c1917"],["Avg Score",avg+"/5",sColor(avg)],["Filler Words",fillers,fillers>10?"#dc2626":"#16a34a"]].map(([l,v,c])=>(
              <div key={l} style={{ background:"#fafaf9", borderRadius:10, padding:"14px 20px", textAlign:"center", flex:1 }}>
                <div style={{ fontSize:22, fontWeight:700, color:c }}>{v}</div>
                <div style={{ fontSize:11, color:"#78716c", marginTop:2 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Best / worst */}
          {best && worst && best.question !== worst.question && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:22 }}>
              <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"14px 16px" }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>Strongest Answer</div>
                <div style={{ fontSize:12, color:"#1c1917", lineHeight:1.5 }}>{best.question?.slice(0,90)}�</div>
                <div style={{ fontSize:11, color:"#16a34a", marginTop:6, fontWeight:700 }}>{best.strength}/5</div>
              </div>
              <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, padding:"14px 16px" }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#dc2626", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:6 }}>Needs Work</div>
                <div style={{ fontSize:12, color:"#1c1917", lineHeight:1.5 }}>{worst.question?.slice(0,90)}�</div>
                <div style={{ fontSize:11, color:"#dc2626", marginTop:6, fontWeight:700 }}>{worst.strength}/5</div>
              </div>
            </div>
          )}

          {/* Per-answer list */}
          <div style={{ borderTop:"1px solid #f0eeec", paddingTop:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#a8a29e", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:10 }}>All Answers</div>
            {sessionAnswers.map((a,i)=>(
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"9px 0", borderBottom:i<sessionAnswers.length-1?"1px solid #f5f4f2":"none" }}>
                <div style={{ flex:1 }}>
                  <span style={{ background:a.type==="behavioral"?"#f4f4f5":"#f3e8ff", color:a.type==="behavioral"?"#18181b":"#18181b", borderRadius:4, padding:"1px 6px", fontSize:10, fontWeight:600, marginRight:6 }}>{a.type==="behavioral"?"B":"T"}</span>
                  <span style={{ fontSize:12, color:"#44403c" }}>{a.question?.slice(0,80)}�</span>
                  <div style={{ fontSize:11, color:"#a8a29e", marginTop:3, paddingLeft:24 }}>{a.fillers} fillers � {fmtTime(a.duration||0)}</div>
                </div>
                <span style={{ background:sColor(a.strength)+"18", color:sColor(a.strength), borderRadius:5, padding:"2px 9px", fontSize:12, fontWeight:700, flexShrink:0, marginLeft:12 }}>{a.strength}/5</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display:"flex", gap:10 }}>
          {btn("Practice Again", ()=>{ setPhase("session"); setCurrentQ(0); setSessionAnswers([]); setCurrentFeedback(null); setLiveText(""); setTypedText(""); }, { bg:"#18181b" })}
          {btn("New Role", ()=>setPhase("setup"), { bg:"#fff", color:"#1c1917", outline:true })}
        </div>
      </div>
    );
  }
  return null;
}

// --- SAM Assistant Chat -------------------------------------------------------
function AssistantChat({ showToast, profile }) {
  const welcome = { role:"assistant", content:"", isWelcome:true, ts:Date.now() };
  const [messages, setMessages]   = useState([welcome]);
  const [input, setInput]         = useState("");
  const [streaming, setStreaming] = useState(false);
  const [steps, setSteps]         = useState([]);
  const [wfData, setWfData]       = useState(null);
  const [jobCtx, setJobCtx]       = useState(null);
  const [samMode, setSamMode]     = useState("chat");
  const [rJob, setRJob]           = useState({ title:"", company:"", description:"" });
  const [rResume, setRResume]     = useState(null);
  const [rLoading, setRLoading]   = useState(false);
  const bottomRef = useRef(null);
  const textaRef  = useRef(null);

  async function generateSamResume() {
    if (!rJob.title) { showToast("Enter a job title first", "error"); return; }
    setRLoading(true); setRResume(null);
    try {
      const d = await apiFetch(`${API}/generate-resume`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ job: rJob }),
      }).then(r => r.json());
      if (d.ok) setRResume(d);
      else showToast(d.error || "Failed to generate", "error");
    } catch { showToast("Resume generation failed", "error"); }
    setRLoading(false);
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  const STARTERS = [
    { icon:"🔍", label:"Find me matching jobs",       prompt:"Find me matching jobs based on my profile" },
    { icon:"💼", label:"Analyse my skill gaps",        prompt:"Analyse my skill gaps for my target roles" },
    { icon:"✉️", label:"Write recruiter outreach",     prompt:"Write a LinkedIn outreach message for a recruiter" },
    { icon:"💰", label:"Salary negotiation advice",    prompt:"Give me salary negotiation advice for my target role" },
    { icon:"🎓", label:"Career change roadmap",        prompt:"I want to change careers. Give me a roadmap to transition into a new field." },
    { icon:"📋", label:"Resume review & tips",         prompt:"Review my resume and give me improvement tips" },
  ];

  function renderContent(text) {
    if (!text) return null;
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[SCORE:([\d.]+)\]/g, (_, s) => `<span style="background:${scoreColor(+s)}20;color:${scoreColor(+s)};border:1px solid ${scoreColor(+s)}40;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700">★ ${s}</span>`)
      .replace(/\[SKILL:([^\]]+)\]/g, '<span style="background:#dcfce7;color:#16a34a;border:1px solid #bbf7d0;border-radius:4px;padding:1px 6px;font-size:11px">✓ $1</span>')
      .replace(/\[MISSING:([^\]]+)\]/g, '<span style="background:#fee2e2;color:#dc2626;border:1px solid #fecaca;border-radius:4px;padding:1px 6px;font-size:11px">✗ $1</span>')
      .replace(/\[OUTREACH_DRAFT\]/g, '<span style="background:#f4f4f5;color:#18181b;border:1px solid #e4e4e7;border-radius:4px;padding:1px 8px;font-size:11px;font-weight:600">📨 Outreach Draft</span>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');
  }

  async function sendMessage(text) {
    const userText = (text || input).trim();
    if (!userText || streaming) return;
    setInput("");
    setSteps([]);
    setWfData(null);
    const newMsgs = [...messages.filter(m=>!m.isWelcome), { role:"user", content:userText, ts:Date.now() }];
    setMessages(newMsgs);
    setStreaming(true);
    const assistantMsg = { role:"assistant", content:"", ts:Date.now() };
    setMessages(m => [...m, assistantMsg]);
    try {
      const res = await apiFetch(`${API}/chat`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ messages: newMsgs.map(m=>({role:m.role,content:m.content})), jobContext:jobCtx }),
      });
      if (!res.ok) throw new Error("Chat API error");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream:true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const part of parts) {
          if (!part.startsWith("data:")) continue;
          try {
            const ev = JSON.parse(part.slice(5).trim());
            if (ev.type === "step")           { setSteps(s => { const n=[...s].map(x=>x?{...x,done:true}:x); n[ev.step-1]={label:ev.label,done:false}; return n; }); }
            else if (ev.type==="workflow-data"){ setWfData(ev.data); }
            else if (ev.type==="delta")       { setMessages(m => { const n=[...m]; n[n.length-1]={...n[n.length-1],content:n[n.length-1].content+ev.content}; return n; }); }
            else if (ev.type==="done")        { setStreaming(false); setSteps([]); }
            else if (ev.type==="error")       { throw new Error(ev.message); }
          } catch {}
        }
      }
    } catch (e) {
      setMessages(m => [...m, { role:"assistant", content:"Error: "+e.message, ts:Date.now() }]);
      showToast("SAM error: "+e.message, "error");
    }
    setStreaming(false);
    setSteps([]);
  }

  const handleKey = (e) => {
    if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", background:"#fff" }}>
      {/* Header */}
      <div style={{ padding:"16px 24px", borderBottom:"1px solid #f0eeec" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,#6c47ff,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:"#09090b" }}>SAM Assistant</div>
            <div style={{ fontSize:11, color:"#a8a29e" }}>AI career co-pilot · powered by Groq</div>
          </div>
          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:"#16a34a" }}/>
            <span style={{ fontSize:11, color:"#71717a" }}>Online</span>
          </div>
        </div>
        {/* Mode tabs */}
        <div style={{ display:"flex", gap:4 }}>
          {[["chat","💬 Chat"],["resume","📄 Resume Builder"]].map(([m,lbl]) => (
            <button key={m} onClick={() => setSamMode(m)} style={{
              padding:"6px 14px", borderRadius:7, border:"none", cursor:"pointer", fontSize:12, fontWeight:600,
              background: samMode===m ? "#6c47ff" : "#f4f4f5",
              color:      samMode===m ? "#fff"    : "#71717a",
            }}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* Resume Builder Panel */}
      {samMode==="resume" && (
        <div style={{ flex:1, overflowY:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>
          <div style={{ background:"#fafaf9", border:"1px solid #e5e3e0", borderRadius:12, padding:"18px 20px", display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#09090b" }}>Job Details</div>
            <div style={{ display:"flex", gap:10 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:"#a8a29e", fontWeight:600, marginBottom:4 }}>Job Title *</div>
                <input value={rJob.title} onChange={e=>setRJob(j=>({...j,title:e.target.value}))}
                  placeholder="e.g. Senior Data Engineer"
                  style={{ width:"100%", padding:"8px 11px", border:"1.5px solid #e5e3e0", borderRadius:8, fontSize:13, color:"#1c1917", outline:"none", boxSizing:"border-box", background:"#fff" }}
                  onFocus={e=>e.target.style.borderColor="#6c47ff"} onBlur={e=>e.target.style.borderColor="#e5e3e0"}/>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:"#a8a29e", fontWeight:600, marginBottom:4 }}>Company</div>
                <input value={rJob.company} onChange={e=>setRJob(j=>({...j,company:e.target.value}))}
                  placeholder="e.g. Stripe"
                  style={{ width:"100%", padding:"8px 11px", border:"1.5px solid #e5e3e0", borderRadius:8, fontSize:13, color:"#1c1917", outline:"none", boxSizing:"border-box", background:"#fff" }}
                  onFocus={e=>e.target.style.borderColor="#6c47ff"} onBlur={e=>e.target.style.borderColor="#e5e3e0"}/>
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, color:"#a8a29e", fontWeight:600, marginBottom:4 }}>Job Description (optional — paste for better skill matching)</div>
              <textarea value={rJob.description} onChange={e=>setRJob(j=>({...j,description:e.target.value}))}
                placeholder="Paste the job description here to improve skill matching and tailoring..."
                rows={5}
                style={{ width:"100%", padding:"8px 11px", border:"1.5px solid #e5e3e0", borderRadius:8, fontSize:12, color:"#1c1917", outline:"none", boxSizing:"border-box", background:"#fff", resize:"vertical", fontFamily:"inherit" }}
                onFocus={e=>e.target.style.borderColor="#6c47ff"} onBlur={e=>e.target.style.borderColor="#e5e3e0"}/>
            </div>
            <button onClick={generateSamResume} disabled={rLoading || !rJob.title} style={{
              padding:"10px 22px", background: rJob.title ? "linear-gradient(135deg,#6c47ff,#8b5cf6)" : "#e5e3e0",
              color: rJob.title ? "#fff" : "#a8a29e", border:"none", borderRadius:9,
              fontWeight:700, fontSize:13, cursor: rJob.title ? "pointer" : "default", alignSelf:"flex-start",
            }}>
              {rLoading ? "Generating..." : "Generate Tailored Resume"}
            </button>
          </div>
          {rLoading && (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, padding:"32px 0" }}>
              <div style={{ width:36, height:36, border:"3px solid #e5e3e0", borderTopColor:"#6c47ff", borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
              <span style={{ color:"#a8a29e", fontSize:13 }}>Tailoring your resume for {rJob.title}...</span>
            </div>
          )}
          {rResume && !rLoading && <ResumeView resume={rResume} onRegenerate={generateSamResume}/>}
        </div>
      )}

      {/* Chat Messages (hidden when in resume mode) */}
      {samMode==="chat" && <div style={{ flex:1, overflowY:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>

        {/* Welcome state */}
        {messages.length===1 && messages[0].isWelcome && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:20, padding:"32px 0" }}>
            <div style={{ width:64, height:64, borderRadius:18, background:"linear-gradient(135deg,#6c47ff,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:800, color:"#09090b", fontFamily:"'Syne',sans-serif", marginBottom:6 }}>Hi{profile?.name?" "+profile.name.split(" ")[0]:""}, I'm SAM</div>
              <div style={{ fontSize:13, color:"#71717a", maxWidth:380, lineHeight:1.6 }}>Your AI career co-pilot. Ask me anything about jobs, your resume, skill gaps, salary negotiation, or interview prep.</div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, width:"100%", maxWidth:520 }}>
              {STARTERS.map(s => (
                <button key={s.label} onClick={() => sendMessage(s.prompt)} style={{
                  padding:"11px 14px", borderRadius:10, border:"1px solid #e5e3e0",
                  background:"#fafafa", cursor:"pointer", textAlign:"left",
                  display:"flex", gap:8, alignItems:"center",
                  fontSize:12, fontWeight:500, color:"#3f3f46",
                  transition:"all .15s",
                }}
                  onMouseEnter={e=>{ e.currentTarget.style.borderColor="#6c47ff40"; e.currentTarget.style.background="#6c47ff08"; }}
                  onMouseLeave={e=>{ e.currentTarget.style.borderColor="#e5e3e0"; e.currentTarget.style.background="#fafafa"; }}>
                  <span style={{ fontSize:16 }}>{s.icon}</span>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step indicators */}
        {steps.length > 0 && (
          <div style={{ display:"flex", flexDirection:"column", gap:6, padding:"12px 14px", background:"#6c47ff08", borderRadius:10, border:"1px solid #6c47ff20" }}>
            {steps.map((s,i) => s && (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:s.done?"#16a34a":"#6c47ff" }}>
                {s.done
                  ? <span style={{ fontSize:13 }}>✓</span>
                  : <div style={{ width:12, height:12, border:"2px solid #6c47ff", borderTopColor:"transparent", borderRadius:"50%", animation:"spin .7s linear infinite" }}/>
                }
                {s.label}
              </div>
            ))}
          </div>
        )}

        {/* Workflow data cards */}
        {wfData && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {wfData.totalFound != null && (
              <div style={{ background:"#f4f4f5", borderRadius:10, padding:"12px 14px" }}>
                <div style={{ fontSize:11, color:"#a8a29e", marginBottom:4 }}>JOBS FOUND</div>
                <div style={{ fontSize:24, fontWeight:800, color:"#6c47ff", fontFamily:"'Syne',sans-serif" }}>{wfData.totalFound}</div>
              </div>
            )}
            {wfData.topSkills?.length > 0 && (
              <div style={{ background:"#f4f4f5", borderRadius:10, padding:"12px 14px" }}>
                <div style={{ fontSize:11, color:"#a8a29e", marginBottom:6 }}>TOP SKILLS DEMANDED</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                  {wfData.topSkills.slice(0,5).map(s=>(
                    <span key={s} style={{ background:"#6c47ff15", color:"#6c47ff", border:"1px solid #6c47ff30", borderRadius:20, padding:"2px 8px", fontSize:11 }}>{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Chat messages */}
        {messages.filter(m=>!m.isWelcome).map((m,i) => (
          <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start", flexDirection:m.role==="user"?"row-reverse":"row" }}>
            <div style={{
              width:28, height:28, borderRadius:"50%", flexShrink:0,
              background: m.role==="user"?"#1c1917":"linear-gradient(135deg,#6c47ff,#8b5cf6)",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:11, fontWeight:700, color:"#fff",
            }}>
              {m.role==="user" ? (profile?.name?.[0]?.toUpperCase()||"U") : "S"}
            </div>
            <div style={{
              maxWidth:"76%", padding:"11px 14px", borderRadius:12,
              background: m.role==="user"?"#1c1917":"#f4f4f5",
              color: m.role==="user"?"#fff":"#1c1917",
              fontSize:13, lineHeight:1.7,
              borderTopRightRadius: m.role==="user"?0:12,
              borderTopLeftRadius:  m.role==="user"?12:0,
            }}>
              {m.role==="assistant" && m.content
                ? <div dangerouslySetInnerHTML={{ __html: renderContent(m.content) }}/>
                : m.content || (streaming && i===messages.filter(m=>!m.isWelcome).length-1
                    ? <div style={{ width:14, height:14, border:"2px solid #a8a29e", borderTopColor:"#6c47ff", borderRadius:"50%", animation:"spin .7s linear infinite" }}/>
                    : null)
              }
            </div>
          </div>
        ))}
        <div ref={bottomRef}/>
      </div>}

      {/* Chat Input — only in chat mode */}
      {samMode==="chat" && (
        <div style={{ padding:"14px 24px", borderTop:"1px solid #f0eeec", background:"#fff" }}>
          <div style={{ display:"flex", gap:8, alignItems:"flex-end", background:"#fafaf9", border:"1.5px solid #e5e3e0", borderRadius:12, padding:"8px 12px" }}
            onFocus={e=>e.currentTarget.style.borderColor="#6c47ff"}
            onBlur={e=>e.currentTarget.style.borderColor="#e5e3e0"}>
            <textarea ref={textaRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
              placeholder="Ask SAM anything — jobs, resume, salary, interview prep..."
              rows={1} disabled={streaming}
              style={{ flex:1, background:"transparent", border:"none", resize:"none", fontSize:13, color:"#1c1917", outline:"none", fontFamily:"inherit", lineHeight:1.6, maxHeight:100, overflowY:"auto" }}/>
            <button onClick={() => sendMessage()} disabled={!input.trim()||streaming} style={{
              width:32, height:32, borderRadius:8, border:"none", flexShrink:0,
              background: input.trim()&&!streaming?"linear-gradient(135deg,#6c47ff,#8b5cf6)":"#e5e3e0",
              color: input.trim()&&!streaming?"#fff":"#a8a29e",
              cursor: input.trim()&&!streaming?"pointer":"default",
              display:"flex", alignItems:"center", justifyContent:"center",
            }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          </div>
          <div style={{ fontSize:11, color:"#d4d4d8", marginTop:6, textAlign:"center" }}>Shift+Enter for new line · Enter to send</div>
        </div>
      )}
    </div>
  );
}

// --- Main App -----------------------------------------------------------------
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
  const [appStatusFilter, setAppStatusFilter] = useState("all");

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
    showToast(`Auto-applying to ${job.title}�`);
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

  // -- Auth gate ----------------------------------------------------------------
  if (!authChecked) return (
    <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#ffffff" }}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
        <div style={{ width:44, height:44, borderRadius:12, background:"#18181b", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        </div>
        <div style={{ width:24, height:24, border:"2.5px solid rgba(0,0,0,0.3)", borderTopColor:"#18181b", borderRadius:"50%", animation:"spin .7s linear infinite" }}/>
      </div>
    </div>
  );
  if (!authed) return <LoginPage onLogin={handleLogin}/>;

  // -- Input style helper --------------------------------------------------------
  const inp = { width:"100%", background:"#fff", border:"1.5px solid #e5e3e0", borderRadius:8, padding:"9px 11px", fontSize:13, color:"#1c1917", outline:"none" };
  const ta  = { ...inp, resize:"vertical" };

  return (
    <>
      <div style={{ display:"flex", height:"100vh", overflow:"hidden", background:"#ffffff" }}>

        {/* -- SIDEBAR ----------------------------------------------------------- */}
        <aside style={{
          width:230, flexShrink:0, background:"#fafafa",
          borderRight:"1px solid rgba(0,0,0,0.07)",
          display:"flex", flexDirection:"column", height:"100vh",
        }}>
          {/* Brand */}
          <div style={{ padding:"20px 18px 16px", borderBottom:"1px solid rgba(0,0,0,0.07)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:34, height:34, borderRadius:10, background:"linear-gradient(135deg,#6c47ff,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              </div>
              <div>
                <div style={{ fontWeight:800, fontSize:15, color:"#09090b", letterSpacing:-0.4, fontFamily:"'Syne',sans-serif" }}>JobPilot</div>
                <div style={{ fontSize:10, color:"#a1a1aa", marginTop:1 }}>AI Career Co-pilot</div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ flex:1, padding:"10px 10px", display:"flex", flexDirection:"column", gap:2, overflowY:"auto" }}>
            {NAV.map(item => {
              const isActive = tab === item.id;
              return (
                <button key={item.id} onClick={() => setTab(item.id)} style={{
                  display:"flex", alignItems:"center", gap:10, padding:"9px 10px",
                  borderRadius:8, border:"none", cursor:"pointer", width:"100%", textAlign:"left",
                  background: isActive ? "#6c47ff" : "transparent",
                  color: isActive ? "#ffffff" : "#71717a",
                  fontWeight: isActive ? 600 : 400,
                  fontSize:13, transition:"all .15s",
                  boxShadow: "none",
                }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background="rgba(108,71,255,0.07)"; e.currentTarget.style.color="#6c47ff"; } }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background="transparent"; e.currentTarget.style.color="#71717a"; } }}
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
                    {item.icon.split(" M").map((seg,i) => <path key={i} d={i===0?seg:"M"+seg}/>)}
                  </svg>
                  <span>{item.label}</span>
                  {item.id==="jobs" && foundJobs.length>0 && (
                    <span style={{ marginLeft:"auto", background: isActive ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.07)", color: isActive ? "#ffffff" : "#71717a", borderRadius:20, padding:"1px 7px", fontSize:11, fontWeight:600 }}>
                      {foundJobs.length}
                    </span>
                  )}
                  {item.id==="applications" && applications.length>0 && (
                    <span style={{ marginLeft:"auto", background: isActive ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.07)", color: isActive ? "#ffffff" : "#71717a", borderRadius:20, padding:"1px 7px", fontSize:11, fontWeight:600 }}>
                      {applications.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Status & profile */}
          <div style={{ borderTop:"1px solid rgba(0,0,0,0.07)", padding:"14px 14px" }}>
            {settings?.profile?.name && (
              <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:12, padding:"8px 8px", background:"rgba(0,0,0,0.04)", borderRadius:8, border:"1px solid rgba(0,0,0,0.07)" }}>
                <Avatar name={settings.profile.name} size={30}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:"#09090b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{settings.profile.name}</div>
                  <div style={{ fontSize:10, color:"#a1a1aa" }}>{(settings.profile.targetRoles||"").split(",")[0]?.trim()||"Job Seeker"}</div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* -- MAIN -------------------------------------------------------------- */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>

          {/* Topbar */}
          <header style={{
            height:58, flexShrink:0, background:"#fafafa",
            borderBottom:"1px solid rgba(0,0,0,0.07)",
            display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 28px",
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ fontSize:16, fontWeight:700, color:"#09090b", fontFamily:"'Syne',sans-serif" }}>
                {NAV.find(n=>n.id===tab)?.label}
              </div>
              <div style={{ fontSize:12, color:"#a1a1aa", marginLeft:8 }}>
                <span style={{ color:"#71717a" }}>{fmt(stats.found)}</span>
                <span style={{ color:"#d4d4d8", margin:"0 6px" }}>�</span>
                <span style={{ color:"#71717a" }}>{fmt(applications.length)} tracked</span>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <button onClick={handleLogout} title="Sign out" style={{
                padding:"7px 14px", borderRadius:8,
                background:"rgba(0,0,0,0.04)", border:"1px solid rgba(0,0,0,0.08)",
                color:"#71717a", cursor:"pointer", fontSize:12, fontWeight:500,
              }}
                onMouseEnter={e=>{ e.currentTarget.style.color="#fca5a5"; e.currentTarget.style.borderColor="rgba(239,68,68,0.3)"; e.currentTarget.style.background="rgba(239,68,68,0.08)"; }}
                onMouseLeave={e=>{ e.currentTarget.style.color="#71717a"; e.currentTarget.style.borderColor="rgba(0,0,0,0.08)"; e.currentTarget.style.background="rgba(0,0,0,0.04)"; }}
              >Sign out</button>
            </div>
          </header>

          {/* Content area */}
          <main style={{ flex:1, overflowY: tab==="jobs"||tab==="pipeline" ? "hidden" : "auto", padding: tab==="jobs"||tab==="pipeline" ? 0 : "28px 32px", background:"#ffffff" }}>

            {/* -- OVERVIEW ---------------------------------------------------- */}
            {tab==="dashboard" && (() => {
              const todayStr = new Date().toDateString();
              const appliedToday = applications.filter(a => new Date(a.appliedAt||a.savedAt||0).toDateString()===todayStr).length;
              const dailyTarget = 50;
              const quotaPct = Math.min(100, Math.round((appliedToday/dailyTarget)*100));
              const completeness = profileCompleteness(settings?.profile);
              return (
              <div style={{ display:"flex", flexDirection:"column", gap:24 }}>

                {/* Quick actions row */}
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  <button onClick={() => setTab("jobs")} style={{
                    padding:"9px 18px", borderRadius:9, border:"none",
                    background:"linear-gradient(135deg,#6c47ff,#8b5cf6)", color:"#fff",
                    fontWeight:700, fontSize:13, cursor:"pointer",
                  }}>Find Jobs</button>
                  <button onClick={() => setTab("applications")} style={{
                    padding:"9px 18px", borderRadius:9, border:"1px solid #e5e3e0",
                    background:"#fff", color:"#3f3f46", fontWeight:600, fontSize:13, cursor:"pointer",
                  }}>View Applications</button>
                  <button onClick={() => setTab("pipeline")} style={{
                    padding:"9px 18px", borderRadius:9, border:"1px solid #e5e3e0",
                    background:"#fff", color:"#3f3f46", fontWeight:600, fontSize:13, cursor:"pointer",
                  }}>Pipeline Board</button>
                  <button onClick={() => setTab("outreach")} style={{
                    padding:"9px 18px", borderRadius:9, border:"1px solid #e5e3e0",
                    background:"#fff", color:"#3f3f46", fontWeight:600, fontSize:13, cursor:"pointer",
                  }}>Outreach</button>
                </div>

                {/* Daily quota + profile completeness row */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                  <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e5e3e0", padding:"18px 20px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                      <span style={{ fontSize:13, fontWeight:600, color:"#09090b" }}>Today's Applications</span>
                      <span style={{ fontSize:13, fontWeight:700, color: quotaPct>=100?"#16a34a":"#6c47ff" }}>{appliedToday} / {dailyTarget}</span>
                    </div>
                    <div style={{ height:8, background:"#f4f4f5", borderRadius:8, overflow:"hidden" }}>
                      <div style={{ width:`${quotaPct}%`, height:"100%", background: quotaPct>=100?"#16a34a":"linear-gradient(90deg,#6c47ff,#8b5cf6)", borderRadius:8, transition:"width .4s" }}/>
                    </div>
                    <div style={{ fontSize:11, color:"#a8a29e", marginTop:6 }}>{quotaPct>=100?"Daily goal reached!":`${dailyTarget-appliedToday} more to hit your daily goal`}</div>
                  </div>
                  <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e5e3e0", padding:"18px 20px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                      <span style={{ fontSize:13, fontWeight:600, color:"#09090b" }}>Profile Completeness</span>
                      <span style={{ fontSize:13, fontWeight:700, color: completeness>=80?"#16a34a":completeness>=50?"#d97706":"#dc2626" }}>{completeness}%</span>
                    </div>
                    <div style={{ height:8, background:"#f4f4f5", borderRadius:8, overflow:"hidden" }}>
                      <div style={{ width:`${completeness}%`, height:"100%", background: completeness>=80?"#16a34a":completeness>=50?"#d97706":"#dc2626", borderRadius:8, transition:"width .4s" }}/>
                    </div>
                    <div style={{ fontSize:11, color:"#a8a29e", marginTop:6 }}>
                      {completeness>=80?"Great profile!":"Complete your profile to improve job matching"}
                      {completeness<100&&<button onClick={()=>setTab("settings")} style={{ marginLeft:6, background:"none", border:"none", color:"#6c47ff", fontSize:11, fontWeight:600, cursor:"pointer", padding:0 }}>Edit</button>}
                    </div>
                  </div>
                </div>

                {/* Stat cards */}
                <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                  <StatCard label="Jobs Found"   value={stats.found}            sub={`${stats.skipped||0} filtered out`}/>
                  <StatCard label="Applications" value={applications.length}    sub="total tracked"/>
                  <StatCard label="Interviews"   value={statusCounts["interviewing"]||0} sub="in progress"/>
                  <StatCard label="Hot Matches"  value={hotJobs.length}          sub="score = 3.5"/>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:20 }}>
                  {/* Top matches */}
                  <div style={{ background:"#f4f4f5", borderRadius:14, border:"1px solid rgba(0,0,0,0.08)", overflow:"hidden" }}>
                    <div style={{ padding:"16px 20px", borderBottom:"1px solid rgba(0,0,0,0.07)", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontSize:13, fontWeight:600, color:"#09090b" }}>Top Matches</span>
                      <button onClick={() => setTab("jobs")} style={{ background:"none", border:"none", color:"#3f3f46", fontSize:12, cursor:"pointer", fontWeight:500 }}>View all ?</button>
                    </div>
                    {hotJobs.length===0 && (
                      <div style={{ padding:"28px 20px", display:"flex", flexDirection:"column", gap:8 }}>
                        <span style={{ color:"#a1a1aa", fontSize:13 }}>No jobs found yet.</span>
                        <span style={{ fontSize:12, color:"#a1a1aa" }}>Configure search settings to start finding jobs.</span>
                      </div>
                    )}
                    {hotJobs.map(job => (
                      <div key={job.id} onClick={() => { setSelectedJob(job); setTab("jobs"); }} style={{
                        padding:"13px 20px", borderBottom:"1px solid rgba(0,0,0,0.04)", cursor:"pointer",
                        display:"flex", gap:12, alignItems:"center", transition:"background .15s",
                      }}
                        onMouseEnter={e=>e.currentTarget.style.background="rgba(0,0,0,0.04)"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                      >
                        <Avatar name={job.company} size={34}/>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:"#09090b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job.title}</div>
                          <div style={{ fontSize:12, color:"#71717a" }}>{job.company}</div>
                        </div>
                        <ScoreBadge score={job.score} size="sm"/>
                      </div>
                    ))}
                  </div>

                  {/* Pipeline summary + activity */}
                  <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                    <div style={{ background:"#f4f4f5", borderRadius:14, border:"1px solid rgba(0,0,0,0.08)", padding:"16px 18px" }}>
                      <div style={{ fontSize:13, fontWeight:600, color:"#09090b", marginBottom:14 }}>Pipeline</div>
                      {PIPELINE_STAGES.slice(0,5).map(s => {
                        const count = (pipeline[s.key]||[]).length;
                        return (
                          <div key={s.key} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                            <span style={{ width:7, height:7, borderRadius:"50%", background:s.color, flexShrink:0 }}/>
                            <span style={{ flex:1, fontSize:12, color:"#71717a" }}>{s.label}</span>
                            <span style={{ fontSize:13, fontWeight:700, color:count>0?s.color:"#d4d4d8" }}>{count}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ background:"#f4f4f5", borderRadius:14, border:"1px solid rgba(0,0,0,0.08)", padding:"16px 18px" }}>
                      <div style={{ fontSize:13, fontWeight:600, color:"#09090b", marginBottom:12 }}>Recent Activity</div>
                      {logs.length===0 && <div style={{ fontSize:12, color:"#a1a1aa" }}>No activity yet.</div>}
                      {logs.slice(0,6).map(l => (
                        <div key={l.id} style={{ display:"flex", gap:8, marginBottom:7, alignItems:"flex-start" }}>
                          <span style={{ fontSize:11, color:"#a1a1aa", flexShrink:0, marginTop:1 }}>
                            {new Date(l.timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                          </span>
                          <span style={{ fontSize:12, color:"#52525b", lineHeight:1.4, flex:1 }}>{l.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              );
            })()}

            {/* -- JOBS (split-pane) -------------------------------------------- */}
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
                      <input placeholder="Search jobs�" value={jobSearch}
                        onChange={e=>{setJobSearch(e.target.value);fetchFoundJobs(e.target.value);}}
                        style={{ flex:1, background:"transparent", border:"none", color:"#1c1917", fontSize:13, outline:"none" }}/>
                      <span style={{ fontSize:11, color:"#d6d3d1", flexShrink:0 }}>{displayedJobs.length}</span>
                    </div>
                  </div>

                  {/* Filters */}
                  <div style={{ padding:"8px 12px", borderBottom:"1px solid #f0eeec", display:"flex", gap:6, flexWrap:"wrap" }}>
                    {[{k:"score",l:"Best match"},{k:"date",l:"Newest"},{k:"company",l:"A�Z"}].map(o => (
                      <button key={o.k} onClick={()=>setSortBy(o.k)} style={{
                        padding:"4px 10px", borderRadius:6, border:"1px solid #e5e3e0", fontSize:11, fontWeight:500, cursor:"pointer",
                        background:sortBy===o.k?"#6c47ff":"transparent",
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
                        {foundJobs.length===0 ? "No jobs yet � start the scanner" : "No matches � adjust filters"}
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

            {/* -- PIPELINE ---------------------------------------------------- */}
            {tab==="pipeline" && (
              <div style={{ height:"100%", overflow:"hidden", display:"flex", flexDirection:"column", background:"#fafaf9" }}>
                {talkingPoints && (
                  <div style={{ background:"#fff", borderBottom:"1px solid #e5e3e0", padding:"14px 28px", position:"relative" }}>
                    <button onClick={()=>setTalkingPoints(null)} style={{
                      position:"absolute", top:14, right:20, background:"none", border:"1px solid #e5e3e0",
                      color:"#a8a29e", borderRadius:6, cursor:"pointer", width:26, height:26, fontSize:12,
                    }}>?</button>
                    <div style={{ fontSize:12, fontWeight:700, color:"#18181b", marginBottom:8 }}>
                      Interview Prep � {talkingPoints.jobTitle} @ {talkingPoints.company}
                    </div>
                    <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                      {talkingPoints.matchedSkills?.length > 0 && (
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          {talkingPoints.matchedSkills.map(s => (
                            <span key={s} style={{ background:"#f0fdf4", color:"#16a34a", border:"1px solid #bbf7d0", borderRadius:20, padding:"2px 9px", fontSize:11 }}>? {s}</span>
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

            {/* -- APPLICATIONS ------------------------------------------------ */}
            {tab==="applications" && (() => {
              const STATUS_GROUPS = [
                { key:"all",         label:"All",          match: ()=>true },
                { key:"queued",      label:"Queued",       match: s=>["queued-manual","browser-opened"].includes(s) },
                { key:"applied",     label:"Applied",      match: s=>["easy-apply-pending","simplify-opened","onetouch-filled","auto-applied","applied"].includes(s) },
                { key:"interviewing",label:"Interviewing", match: s=>["interviewing"].includes(s) },
                { key:"offered",     label:"Offered",      match: s=>["offered"].includes(s) },
                { key:"failed",      label:"Failed / Rejected", match: s=>["apply-failed","rejected","ghosted"].includes(s) },
              ];
              const activeGroup = STATUS_GROUPS.find(g=>g.key===appStatusFilter)||STATUS_GROUPS[0];
              const filteredApps = applications.filter(a => activeGroup.match(a.status));
              return (
              <div>
                {/* Status filter tabs */}
                <div style={{ display:"flex", gap:0, marginBottom:20, background:"#fff", borderRadius:12, border:"1px solid #e5e3e0", padding:4, width:"fit-content" }}>
                  {STATUS_GROUPS.map(g => {
                    const cnt = g.key==="all" ? applications.length : applications.filter(a=>g.match(a.status)).length;
                    const active = appStatusFilter===g.key;
                    return (
                      <button key={g.key} onClick={()=>setAppStatusFilter(g.key)} style={{
                        padding:"6px 14px", borderRadius:8, border:"none", cursor:"pointer", fontSize:12, fontWeight:active?700:500,
                        background: active?"#6c47ff":"transparent",
                        color: active?"#fff":"#71717a",
                        transition:"all .15s",
                      }}>
                        {g.label}{cnt>0&&<span style={{ fontSize:10, opacity:0.7 }}> ({cnt})</span>}
                      </button>
                    );
                  })}
                </div>

                <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e5e3e0", overflow:"hidden" }}>
                  <div style={{ padding:"14px 20px", borderBottom:"1px solid #f0eeec", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span style={{ fontSize:13, fontWeight:600, color:"#1c1917" }}>{filteredApps.length} Application{filteredApps.length!==1?"s":""}</span>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      {Object.entries(statusCounts).slice(0,4).map(([s,c]) => {
                        const m = STATUS_META[s]; if (!m) return null;
                        return (
                          <div key={s} style={{ display:"flex", alignItems:"center", gap:4 }}>
                            <span style={{ width:5, height:5, borderRadius:"50%", background:m.color }}/>
                            <span style={{ fontSize:11, color:"#a8a29e" }}>{c} {m.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {filteredApps.length===0 && <div style={{ padding:"28px 20px", color:"#a8a29e", fontSize:13 }}>No applications in this category yet.</div>}
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"#fafaf9" }}>
                          {["","Title","Company","Platform","Score","Status","Applied","Apply",""].map((h,i) => (
                            <th key={i} style={{ padding:"10px 16px", textAlign:"left", fontSize:11, color:"#a8a29e", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em", borderBottom:"1px solid #f0eeec", whiteSpace:"nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredApps.map(a => (
                          <tr key={a.id} style={{ borderBottom:"1px solid #f5f4f2" }}
                            onMouseEnter={e=>e.currentTarget.style.background="#fafaf9"}
                            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            <td style={{ padding:"11px 16px" }}><Avatar name={a.company} size={28}/></td>
                            <td style={{ padding:"11px 16px" }}>
                              <button onClick={()=>setSelectedJob(a)} style={{ background:"none", border:"none", color:"#1c1917", fontWeight:600, cursor:"pointer", fontSize:13, padding:0 }}
                                onMouseEnter={e=>e.currentTarget.style.color="#6c47ff"}
                                onMouseLeave={e=>e.currentTarget.style.color="#1c1917"}>{a.title}</button>
                            </td>
                            <td style={{ padding:"11px 16px", fontSize:13, color:"#78716c" }}>{a.company}</td>
                            <td style={{ padding:"11px 16px" }}><PlatformTag platform={a.platform}/></td>
                            <td style={{ padding:"11px 16px" }}>{a.score!=null&&<ScoreBadge score={a.score} size="sm"/>}</td>
                            <td style={{ padding:"11px 16px" }}><StatusPill status={a.status}/></td>
                            <td style={{ padding:"11px 16px", fontSize:12, color:"#a8a29e", whiteSpace:"nowrap" }}>{a.postedAt?new Date(a.postedAt).toLocaleDateString():"-"}</td>
                            <td style={{ padding:"11px 16px", whiteSpace:"nowrap" }}>
                              {a.url
                                ? <a href={a.url} target="_blank" rel="noreferrer"
                                    style={{ background:"#6c47ff", color:"#fff", borderRadius:6, padding:"4px 11px", fontSize:11, fontWeight:700, textDecoration:"none", display:"inline-block" }}
                                    onMouseEnter={e=>e.currentTarget.style.background="#5b3dd6"}
                                    onMouseLeave={e=>e.currentTarget.style.background="#6c47ff"}>
                                    Apply
                                  </a>
                                : <span style={{ color:"#d6d3d1", fontSize:11 }}>no url</span>
                              }
                            </td>
                            <td style={{ padding:"11px 16px" }}>
                              <button onClick={()=>deleteApplication(a.id)} style={{ background:"none", border:"none", color:"#d6d3d1", cursor:"pointer", fontSize:14, borderRadius:4, padding:"2px 5px" }}
                                onMouseEnter={e=>e.currentTarget.style.color="#dc2626"}
                                onMouseLeave={e=>e.currentTarget.style.color="#d6d3d1"}>x</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              );
            })()}

                        {/* -- OUTREACH ---------------------------------------------------- */}
            {tab==="outreach" && (
              <OutreachPage showToast={showToast} profile={settings?.profile||{}} />
            )}

            {/* -- AI ASSISTANT ------------------------------------------------ */}
            {tab==="assistant" && (
              <AssistantChat showToast={showToast} profile={settings?.profile||{}} />
            )}

            {/* -- MOCK INTERVIEW ---------------------------------------------- */}
            {tab==="interview" && (
              <MockInterviewStudio showToast={showToast} applications={applications} profile={settings?.profile||{}} />
            )}

            {/* -- SETTINGS ---------------------------------------------------- */}
            {tab==="settings" && settingsForm && (
              <div style={{ maxWidth:860 }}>
                {/* Settings tabs */}
                <div style={{ display:"flex", gap:0, borderBottom:"1px solid #e5e3e0", marginBottom:24 }}>
                  {[["profile","Profile"],["search","Search"],["agents","Agents"],["billing","Billing"]].map(([id,lbl]) => (
                    <button key={id} onClick={()=>setSettingsTab(id)} style={{
                      padding:"10px 18px", background:"none", border:"none",
                      borderBottom: settingsTab===id?"2px solid #6c47ff":"2px solid transparent",
                      color: settingsTab===id?"#6c47ff":"#a8a29e",
                      fontWeight: settingsTab===id?600:400, fontSize:13, cursor:"pointer",
                    }}>{lbl}</button>
                  ))}
                </div>

                {/* Profile tab */}
                {settingsTab==="profile" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

                    {/* -- Resume Upload Card -- */}
                    <ResumeUploadCard onParsed={(profile) => { setSettingsForm(f => ({...f, profile:{...f.profile,...profile}})); showToast("Resume parsed � profile auto-filled!"); }} showToast={showToast} currentResumePath={settingsForm?.profile?.resumePath}/>

                    <div style={{ background:"#fff", borderRadius:14, padding:"22px 24px", border:"1px solid #e5e3e0" }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"#1c1917", marginBottom:18 }}>Personal Information</div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:14 }}>
                        <Field label="Full Name"><input style={inp} value={settingsForm.profile?.name||""} placeholder="Jane Smith" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,name:e.target.value}}))} /></Field>
                        <Field label="Email"><input style={inp} type="email" value={settingsForm.profile?.email||""} placeholder="jane@email.com" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,email:e.target.value}}))} /></Field>
                        <Field label="Phone"><input style={inp} value={settingsForm.profile?.phone||""} placeholder="+1 555 000 0000" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,phone:e.target.value}}))} /></Field>
                        <Field label="Location"><input style={inp} value={settingsForm.profile?.location||""} placeholder="Seattle, WA" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,location:e.target.value}}))} /></Field>
                        <Field label="Years Experience"><input style={inp} type="number" min={0} value={settingsForm.profile?.yearsExperience||""} onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,yearsExperience:e.target.value}}))} /></Field>
                        <Field label="School"><input style={inp} value={settingsForm.profile?.school||""} placeholder="MIT, Stanford�" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,school:e.target.value}}))} /></Field>
                      </div>
                      <Field label="Target Roles (comma-separated)"><input style={inp} value={settingsForm.profile?.targetRoles||""} placeholder="Data Scientist, ML Engineer" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,targetRoles:e.target.value}}))} /></Field>
                      <Field label="Skills (comma-separated)">
                        <textarea style={ta} rows={3}
                          value={Array.isArray(settingsForm.profile?.skills)?settingsForm.profile.skills.join(", "):(settingsForm.profile?.skills||"")}
                          placeholder="Python, SQL, PyTorch, AWS�"
                          onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,skills:e.target.value}}))}
                          onBlur={e=>setSettingsForm(f=>({...f,profile:{...f.profile,skills:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)}}))}/>
                      </Field>
                      <Field label="Professional Summary">
                        <textarea style={ta} rows={3} value={settingsForm.profile?.summary||""} placeholder="Results-driven engineer�" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,summary:e.target.value}}))} />
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
                          <textarea style={ta} rows={3} value={settingsForm.profile?.whyJoinAnswer||""} placeholder="I'm excited to join [company] because�" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,whyJoinAnswer:e.target.value}}))} />
                        </Field>
                        <Field label={`"Describe an experience aligning with our values / culture"`}>
                          <textarea style={ta} rows={3} value={settingsForm.profile?.culturalValuesAnswer||""} placeholder="At my previous role at [company], I demonstrated ownership by�" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,culturalValuesAnswer:e.target.value}}))} />
                        </Field>
                        <Field label="Additional Information (catch-all)">
                          <textarea style={ta} rows={2} value={settingsForm.profile?.additionalInfo||""} placeholder="Any additional context you'd like to share�" onChange={e=>setSettingsForm(f=>({...f,profile:{...f.profile,additionalInfo:e.target.value}}))} />
                        </Field>
                      </div>
                    </div>

                    {/* Education */}
                    <div style={{ background:"#fff", borderRadius:14, padding:"22px 24px", border:"1px solid #e5e3e0" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:"#1c1917" }}>Education</div>
                        <button onClick={()=>setSettingsForm(f=>{const edu=[...(f.profile?.education||[]),{school:"",degree:"",major:"",startYear:"",endYear:"",gpa:""}];return{...f,profile:{...f.profile,education:edu}};})}
                          style={{ padding:"6px 14px", background:"#6c47ff", color:"#fff", border:"none", borderRadius:7, fontSize:12, fontWeight:600, cursor:"pointer" }}>+ Add</button>
                      </div>
                      {!(settingsForm.profile?.education||[]).length && <div style={{ fontSize:13, color:"#a8a29e", textAlign:"center", padding:"16px 0" }}>No education added yet.</div>}
                      {(settingsForm.profile?.education||[]).map((edu,i) => (
                        <div key={i} style={{ background:"#fafaf9", borderRadius:10, padding:"16px", border:"1px solid #f0eeec", marginBottom:10, position:"relative" }}>
                          <button onClick={()=>setSettingsForm(f=>{const a=[...(f.profile?.education||[])];a.splice(i,1);return{...f,profile:{...f.profile,education:a}};})}
                            style={{ position:"absolute", top:12, right:12, background:"none", border:"none", color:"#d6d3d1", cursor:"pointer", fontSize:16 }}
                            onMouseEnter={e=>e.currentTarget.style.color="#dc2626"} onMouseLeave={e=>e.currentTarget.style.color="#d6d3d1"}>?</button>
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
                          style={{ padding:"6px 14px", background:"#6c47ff", color:"#fff", border:"none", borderRadius:7, fontSize:12, fontWeight:600, cursor:"pointer" }}>+ Add</button>
                      </div>
                      {!(settingsForm.profile?.experiences||[]).length && <div style={{ fontSize:13, color:"#a8a29e", textAlign:"center", padding:"16px 0" }}>No experience added yet.</div>}
                      {(settingsForm.profile?.experiences||[]).map((exp,i) => (
                        <div key={i} style={{ background:"#fafaf9", borderRadius:10, padding:"16px", border:"1px solid #f0eeec", marginBottom:10, position:"relative" }}>
                          <button onClick={()=>setSettingsForm(f=>{const a=[...(f.profile?.experiences||[])];a.splice(i,1);return{...f,profile:{...f.profile,experiences:a}};})}
                            style={{ position:"absolute", top:12, right:12, background:"none", border:"none", color:"#d6d3d1", cursor:"pointer", fontSize:16 }}
                            onMouseEnter={e=>e.currentTarget.style.color="#dc2626"} onMouseLeave={e=>e.currentTarget.style.color="#d6d3d1"}>?</button>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                            <Field label="Company"><input style={inp} value={exp.company||""} placeholder="Amazon" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.experiences||[])];a[i]={...a[i],company:e.target.value};return{...f,profile:{...f.profile,experiences:a}};})}/></Field>
                            <Field label="Title"><input style={inp} value={exp.title||""} placeholder="Data Scientist" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.experiences||[])];a[i]={...a[i],title:e.target.value};return{...f,profile:{...f.profile,experiences:a}};})}/></Field>
                            <Field label="Start Date"><input style={inp} value={exp.startDate||""} placeholder="Jan 2021" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.experiences||[])];a[i]={...a[i],startDate:e.target.value};return{...f,profile:{...f.profile,experiences:a}};})}/></Field>
                            <Field label="End Date"><input style={inp} value={exp.endDate||""} placeholder="Dec 2023 or Present" onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.experiences||[])];a[i]={...a[i],endDate:e.target.value};return{...f,profile:{...f.profile,experiences:a}};})}/></Field>
                          </div>
                          <Field label="Description">
                            <textarea style={ta} rows={3} value={exp.description||""} placeholder="� Led team of 3 engineers&#10;� Built ML pipeline�"
                              onChange={e=>setSettingsForm(f=>{const a=[...(f.profile?.experiences||[])];a[i]={...a[i],description:e.target.value};return{...f,profile:{...f.profile,experiences:a}};})}/>
                          </Field>
                        </div>
                      ))}
                    </div>

                    <button onClick={saveSettings} style={{ padding:"11px 24px", borderRadius:9, border:"none", background:"linear-gradient(135deg,#6c47ff,#8b5cf6)", color:"#fff", fontWeight:600, fontSize:13, cursor:"pointer", alignSelf:"flex-start" }}>Save Profile</button>
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
                      {/* Date Posted Filter */}
                      <div style={{ marginBottom:16 }}>
                        <div style={{ fontSize:12, color:"#78716c", fontWeight:500, marginBottom:8 }}>Date Posted</div>
                        <div style={{ display:"flex", gap:8 }}>
                          {[
                            { val:"today", label:"Today",  icon:"?" },
                            { val:"week",  label:"1 Week",  icon:"??" },
                            { val:"month", label:"1 Month", icon:"??" },
                          ].map(({ val, label, icon }) => {
                            const active = (settingsForm.datePostedFilter || "week") === val;
                            return (
                              <button key={val} onClick={()=>setSettingsForm(f=>({...f,datePostedFilter:val}))}
                                style={{
                                  flex:1, padding:"9px 0", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600,
                                  border: active ? "2px solid #18181b" : "1px solid #e5e3e0",
                                  background: active ? "#f4f4f5" : "#fafaf9",
                                  color: active ? "#18181b" : "#78716c",
                                  transition:"all .15s",
                                }}>
                                {icon} {label}
                              </button>
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
                            <input type="checkbox" checked={!!settingsForm[k]} onChange={e=>setSettingsForm(f=>({...f,[k]:e.target.checked}))} style={{ accentColor:"#18181b", width:15, height:15 }}/>
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
                          <span>??</span> TickBig Credentials
                          <span style={{ fontWeight:400, color:"#a16207", fontSize:11 }}>(browse jobs only � applying requires payment on site)</span>
                        </div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                          <Field label="TickBig Email"><input style={inp} type="email" placeholder="your@email.com" value={settingsForm.tickbigEmail||""} onChange={e=>setSettingsForm(f=>({...f,tickbigEmail:e.target.value}))}/></Field>
                          <Field label="TickBig Password"><input style={inp} type="password" placeholder="��������" value={settingsForm.tickbigPassword||""} onChange={e=>setSettingsForm(f=>({...f,tickbigPassword:e.target.value}))}/></Field>
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:10 }}>
                        <button onClick={saveSettings} style={{ padding:"9px 22px", borderRadius:8, border:"none", background:"#1c1917", color:"#fff", fontWeight:600, fontSize:13, cursor:"pointer" }}>Save</button>
                        <button onClick={async()=>{const d=await apiFetch(`${API}/test-email`,{method:"POST"}).then(r=>r.json());showToast(d.ok?"Test email sent!":d.message,d.ok?"success":"error");}} style={{ padding:"9px 16px", borderRadius:8, border:"1px solid #e5e3e0", background:"transparent", color:"#57534e", fontSize:13, cursor:"pointer" }}>Test Email</button>
                        <button onClick={async()=>{const d=await apiFetch(`${API}/digest`,{method:"POST"}).then(r=>r.json());showToast(d.ok?"Daily digest sent!":d.message,d.ok?"success":"error");}} style={{ padding:"9px 16px", borderRadius:8, border:"1px solid #e4e4e7", background:"#f4f4f5", color:"#18181b", fontSize:13, fontWeight:600, cursor:"pointer" }}>Send Digest Now</button>
                      </div>
                    </div>

                    {/* Google Sheets Export */}
                    <GoogleSheetsCard showToast={showToast} />

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
                          ["GOOGLE_SHEET_ID", settings?.sheetsConfigured, "Sheets export"],
                          ["RESUME_PATH", !!settings?.profile?.resumePath, "File"],
                        ].map(([key,ok,desc]) => (
                          <div key={key} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 14px", background:"#fafaf9", borderRadius:8, border:"1px solid #f0eeec" }}>
                            <span style={{ fontSize:13, fontWeight:500, color:"#57534e", fontFamily:"monospace" }}>{key}</span>
                            <span style={{ fontSize:12, fontWeight:600, color:ok?"#16a34a":"#d6d3d1" }}>{ok?`? ${desc}`:"not set"}</span>
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

      {/* -- Job detail modal (from Applications table click) ------------------- */}
      {selectedJob && tab==="applications" && (
        <div onClick={()=>setSelectedJob(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.25)", backdropFilter:"blur(2px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:700, maxHeight:"90vh", overflowY:"auto", border:"1px solid #e5e3e0", boxShadow:"0 20px 60px rgba(0,0,0,.15)" }}>
            <JobDetailPanel job={selectedJob} onApply={handleApplyNow} onClose={()=>setSelectedJob(null)}/>
          </div>
        </div>
      )}

      {/* -- Toast -------------------------------------------------------------- */}
      {toast && (
        <div style={{
          position:"fixed", bottom:24, right:24, zIndex:9999,
          background:"#fff", border:`1px solid ${toast.type==="error"?"#fecaca":"#bbf7d0"}`,
          color: toast.type==="error"?"#dc2626":"#16a34a",
          borderRadius:12, padding:"12px 18px", fontSize:13, fontWeight:600,
          boxShadow:"0 4px 16px rgba(0,0,0,.1)", animation:"fadeUp .2s ease",
          display:"flex", alignItems:"center", gap:10, maxWidth:300,
        }}>
          <span>{toast.type==="error"?"?":"?"}</span>
          {toast.msg}
        </div>
      )}
    </>
  );
}
