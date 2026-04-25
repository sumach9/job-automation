import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const API = "/api";

const LEVEL_COLOR = { info: "#94a3b8", success: "#4ade80", warning: "#fb923c", error: "#f87171" };
const LEVEL_ICON  = { info: "ℹ", success: "✓", warning: "⚠", error: "✕" };

const PLATFORM_META = {
  linkedin:    { label: "LinkedIn",    color: "#0a66c2", icon: "in" },
  indeed:      { label: "Indeed",      color: "#2164f3", icon: "id" },
  glassdoor:   { label: "Glassdoor",   color: "#0caa41", icon: "gd" },
  ziprecruiter:{ label: "ZipRecruiter",color: "#4a90e2", icon: "zr" },
  googlejobs:  { label: "Google Jobs", color: "#ea4335", icon: "gj" },
  atsDirect:   { label: "ATS Direct",  color: "#a855f7", icon: "ats" },
};

const STATUS_META = {
  "auto-applied":       { bg: "#14532d", color: "#4ade80",  label: "✓ Auto Applied" },
  "easy-apply-pending": { bg: "#1e3a5f", color: "#60a5fa",  label: "⚡ Easy Apply" },
  "simplify-opened":    { bg: "#2e1065", color: "#c084fc",  label: "✨ Simplify" },
  "onetouch-filled":    { bg: "#1e1040", color: "#818cf8",  label: "⚡ OneTouch" },
  "browser-opened":     { bg: "#431407", color: "#fb923c",  label: "🌐 Opened" },
  "queued-manual":      { bg: "#1c1917", color: "#a8a29e",  label: "📋 Queued" },
  "apply-failed":       { bg: "#450a0a", color: "#f87171",  label: "✕ Failed" },
};

const SORT_OPTIONS = [
  { key: "score",    label: "★ Score" },
  { key: "date",     label: "🕐 Newest" },
  { key: "company",  label: "A–Z" },
  { key: "platform", label: "Platform" },
];

const NAV_ITEMS = [
  { id: "dashboard",    label: "Dashboard",    icon: "📊" },
  { id: "pipeline",     label: "Pipeline",     icon: "🔀" },
  { id: "jobs",         label: "Jobs",         icon: "💼" },
  { id: "applications", label: "Applications", icon: "📋" },
  { id: "logs",         label: "Logs",         icon: "🖥" },
  { id: "settings",     label: "Settings",     icon: "⚙️" },
];

const PIPELINE_STAGES = [
  { key: "queued-manual",   label: "Queued",       icon: "📋", color: "#a8a29e" },
  { key: "onetouch-filled", label: "OneTouch",     icon: "⚡", color: "#818cf8" },
  { key: "applied",         label: "Applied",      icon: "✓",  color: "#4ade80" },
  { key: "interviewing",    label: "Interviewing", icon: "💬", color: "#38bdf8" },
  { key: "offered",         label: "Offered 🎉",   icon: "🏆", color: "#f59e0b" },
  { key: "rejected",        label: "Rejected",     icon: "✕",  color: "#f87171" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 4.0) return "#3fb950";
  if (score >= 3.0) return "#a3e635";
  if (score >= 2.0) return "#d29922";
  if (score >= 1.0) return "#fb923c";
  return "#f85149";
}

function getPlatformColor(platform = "") {
  const entry = Object.values(PLATFORM_META).find((m) => m.label === platform);
  return entry?.color || "#475569";
}

// ─── Small Components ─────────────────────────────────────────────────────────
function ScoreBadge({ score, label }) {
  if (score == null) return null;
  const c = scoreColor(score);
  return (
    <span title={`Match: ${score}/5 — ${label || ""}`} style={{
      background: c + "22", color: c, border: `1px solid ${c}55`,
      borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700,
    }}>
      ★ {score}
    </span>
  );
}

function PlatformBadge({ platform }) {
  const c = getPlatformColor(platform);
  return (
    <span style={{
      background: c + "22", color: c, border: `1px solid ${c}44`,
      borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600,
    }}>
      {platform}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = STATUS_META[status] || { bg: "#1e293b", color: "#8b949e", label: status };
  return (
    <span style={{
      background: s.bg, color: s.color, borderRadius: 6,
      padding: "3px 9px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

function Tag({ children, color }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}44`,
      borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 500,
    }}>
      {children}
    </span>
  );
}

function Chip({ active, color = "#6366f1", onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 12px", borderRadius: 20,
      border: `1px solid ${active ? color : "#30363d"}`,
      background: active ? color + "22" : "transparent",
      color: active ? color : "#8b949e",
      fontSize: 12, fontWeight: 600, cursor: "pointer",
      transition: "all .15s", whiteSpace: "nowrap",
    }}>
      {children}
    </button>
  );
}

function SortBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 14px", borderRadius: 8,
      background: active ? "#6366f1" : "#21262d",
      color: active ? "#fff" : "#8b949e",
      border: `1px solid ${active ? "#6366f1" : "#30363d"}`,
      fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all .15s",
    }}>
      {children}
    </button>
  );
}

function StatCard({ label, value, color = "#6366f1", icon, sub }) {
  return (
    <div style={{
      background: "var(--surface)", borderRadius: 16, padding: "20px 22px",
      flex: "1 1 130px", borderTop: `3px solid ${color}`,
      position: "relative", overflow: "hidden", animation: "fadeIn .2s ease",
    }}>
      {icon && (
        <div style={{
          position: "absolute", right: 16, top: 16,
          fontSize: 22, opacity: 0.12,
        }}>{icon}</div>
      )}
      <div style={{ fontSize: 34, fontWeight: 800, color, letterSpacing: -1, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Btn({ onClick, children, primary, danger, small }) {
  return (
    <button onClick={onClick} style={{
      padding: small ? "6px 14px" : "9px 20px",
      borderRadius: 7, border: "none", cursor: "pointer",
      fontSize: small ? 12 : 13, fontWeight: 600,
      background: primary ? "#6366f1" : danger ? "#450a0a" : "#21262d",
      color: primary ? "#fff" : danger ? "#f85149" : "var(--text-muted)",
      transition: "opacity .15s",
    }}
      onMouseEnter={(e) => e.currentTarget.style.opacity = "0.8"}
      onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 5, fontWeight: 600 }}>
        {label}
      </label>
      <div className="fc">{children}</div>
    </div>
  );
}

// ─── Job Detail Modal ─────────────────────────────────────────────────────────
function JobModal({ job, onClose, onApply }) {
  if (!job) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.8)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 16, animation: "fadeIn .15s ease",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "var(--surface)", borderRadius: 20,
        width: "100%", maxWidth: 740, maxHeight: "92vh", overflowY: "auto",
        padding: 28, boxShadow: "0 24px 80px rgba(0,0,0,.7)",
        border: "1px solid var(--border)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div style={{ flex: 1, paddingRight: 12 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>{job.title}</h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>{job.company} · {job.location}</p>
          </div>
          <button onClick={onClose} style={{
            background: "var(--surface2)", border: "1px solid var(--border)",
            color: "var(--text-muted)", fontSize: 16, cursor: "pointer", borderRadius: 8,
            width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, transition: "color .15s",
          }}
            onMouseEnter={(e) => e.currentTarget.style.color = "var(--text)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}
          >✕</button>
        </div>

        {/* Meta row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          <PlatformBadge platform={job.platform} />
          {job.atsProvider && <Tag color="#a855f7">{job.atsProvider}</Tag>}
          {job.score != null && <ScoreBadge score={job.score} label={job.scoreLabel} />}
          <StatusBadge status={job.status} />
          {job.workMode && <Tag color="#8b5cf6">{job.workMode}</Tag>}
          {job.jobType && <Tag color="#0891b2">{job.jobType}</Tag>}
          {job.salary && <Tag color="#3fb950">💰 {job.salary}</Tag>}
          {job.via && <Tag color="#8b949e">via {job.via}</Tag>}
        </div>

        {/* Score breakdown */}
        {job.scoreBreakdown && (
          <div style={{
            marginBottom: 18, padding: "14px 16px",
            background: "var(--bg)", borderRadius: 10, fontSize: 12,
            border: "1px solid var(--border)",
          }}>
            <div style={{
              color: "var(--text-dim)", fontWeight: 700, marginBottom: 10, fontSize: 10,
              textTransform: "uppercase", letterSpacing: 1,
            }}>Match Breakdown</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 10 }}>
              {[["Title", job.scoreBreakdown.title], ["Skills", job.scoreBreakdown.skills?.toFixed(1)],
                ["Location", job.scoreBreakdown.location]].map(([k, v]) => (
                <div key={k} style={{ background: "var(--surface)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ color: "var(--text-dim)", fontSize: 10, marginBottom: 4 }}>{k}</div>
                  <div style={{ color: scoreColor(job.score), fontWeight: 700, fontSize: 18 }}>{v}</div>
                </div>
              ))}
            </div>
            {job.scoreBreakdown.matchedSkills?.length > 0 && (
              <div style={{ color: "var(--text-dim)", fontSize: 11 }}>
                Matched: <span style={{ color: "var(--text-muted)" }}>{job.scoreBreakdown.matchedSkills.join(", ")}</span>
              </div>
            )}
          </div>
        )}

        {/* Skills */}
        {job.skills?.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Required Skills</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {job.skills.map((s, i) => (
                <span key={i} style={{
                  background: "#58a6ff15", color: "#58a6ff",
                  border: "1px solid #58a6ff30", borderRadius: 6, padding: "3px 10px", fontSize: 12,
                }}>{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {job.description && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Job Description</div>
            <div style={{
              background: "var(--bg)", borderRadius: 10, padding: "14px 16px",
              fontSize: 13, color: "var(--text-muted)", lineHeight: 1.75,
              whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto",
              border: "1px solid var(--border)",
            }}>
              {job.description}
            </div>
          </div>
        )}

        {job.autoApplyNote && (
          <div style={{
            marginBottom: 16, padding: "10px 14px", background: "var(--bg)",
            borderRadius: 8, fontSize: 12, color: "var(--text-muted)",
            border: "1px solid var(--border)",
          }}>
            <strong>Note:</strong> {job.autoApplyNote}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href={job.url} target="_blank" rel="noreferrer" style={{
            flex: 1, minWidth: 140, textAlign: "center", padding: "11px",
            background: "#6366f1", color: "#fff", borderRadius: 9, fontWeight: 700,
            fontSize: 13, textDecoration: "none",
          }}>
            Open Job Posting ↗
          </a>
          {/* CareerOps-style "contacto" — find recruiter on LinkedIn */}
          <a
            href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent((job.company || "") + " recruiter talent acquisition")}&origin=GLOBAL_SEARCH_HEADER`}
            target="_blank" rel="noreferrer"
            style={{
              flex: 1, minWidth: 140, textAlign: "center", padding: "11px",
              background: "#0a66c222", color: "#0a66c2", borderRadius: 9, fontWeight: 700,
              fontSize: 13, textDecoration: "none", border: "1px solid #0a66c240",
            }}>
            💼 Find Recruiter
          </a>
          {(job.status === "easy-apply-pending" || job.status === "apply-failed" || job.status === "queued-manual") && (
            <button onClick={() => onApply(job)} style={{
              flex: 1, minWidth: 140, padding: "11px",
              background: "#14532d", color: "#3fb950", borderRadius: 9,
              border: "1px solid #3fb95040", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>
              ⚡ Auto-Apply Now
            </button>
          )}
          {(job.platform === "ATS Direct" || job.status === "queued-manual" || job.status === "browser-opened") && (
            <a href={job.url} target="_blank" rel="noreferrer" style={{
              flex: 1, minWidth: 140, textAlign: "center", padding: "11px",
              background: "#2e1065", color: "#c084fc", borderRadius: 9, fontWeight: 700,
              fontSize: 13, textDecoration: "none", border: "1px solid #7c3aed",
            }}>
              ✨ Open + Simplify
            </a>
          )}
        </div>
        {(job.platform === "ATS Direct" || job.status === "simplify-opened") && (
          <div style={{ marginTop: 10, fontSize: 11, color: "#7e22ce", textAlign: "center" }}>
            Simplify auto-fills every field when the page opens — just click Submit
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Platform pill (settings) ─────────────────────────────────────────────────
function PlatformPill({ id, active, onChange }) {
  const m = PLATFORM_META[id];
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
      background: active ? m.color + "15" : "var(--surface2)",
      border: `1px solid ${active ? m.color + "50" : "var(--border)"}`,
      borderRadius: 8, padding: "7px 12px", userSelect: "none", transition: "all .15s",
    }}>
      <input type="checkbox" checked={active} onChange={(e) => onChange(id, e.target.checked)}
        style={{ accentColor: m.color }} />
      <span style={{
        width: 22, height: 22, borderRadius: 4, background: m.color,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0,
      }}>
        {m.icon.toUpperCase()}
      </span>
      <span style={{ fontSize: 13, color: active ? "var(--text)" : "var(--text-muted)", fontWeight: 500 }}>{m.label}</span>
    </label>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
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
  const [stats, setStats]                   = useState({ applied: 0, found: 0, skipped: 0, errors: 0 });
  const [applications, setApplications]     = useState([]);
  const [logs, setLogs]                     = useState([]);
  const [settings, setSettings]             = useState(null);
  const [settingsForm, setSettingsForm]     = useState(null);
  const [loading, setLoading]               = useState(false);
  const [toast, setToast]                   = useState(null);
  const [selectedJob, setSelectedJob]       = useState(null);
  const [atsCompanies, setAtsCompanies]     = useState(null);
  const [pipeline, setPipeline]             = useState({});
  const [talkingPoints, setTalkingPoints]   = useState(null); // CareerOps-style report card
  const logsEndRef                          = useRef(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const d = await fetch(`${API}/status`).then((r) => r.json());
      setIsRunning(d.isRunning); setStats(d.stats); setSettings(d.settings);
      setSettingsForm((p) => p ?? d.settings);
    } catch {}
  }, []);

  const fetchApplications = useCallback(async () => {
    try {
      const d = await fetch(`${API}/applications?limit=500`).then((r) => r.json());
      setApplications(d.items || []);
    } catch {}
  }, []);

  const fetchLogs = useCallback(async () => {
    try { setLogs(await fetch(`${API}/logs?limit=200`).then((r) => r.json())); } catch {}
  }, []);

  const fetchFoundJobs = useCallback(async (q = "") => {
    try {
      const d = await fetch(`${API}/jobs?limit=500${q ? `&q=${encodeURIComponent(q)}` : ""}`).then((r) => r.json());
      setFoundJobs(d.items || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetch(`${API}/ats-companies`).then((r) => r.json()).then(setAtsCompanies).catch(() => {});
  }, []);

  useEffect(() => {
    fetchStatus(); fetchApplications(); fetchLogs(); fetchFoundJobs(); fetchPipeline();
    const iv = setInterval(() => {
      fetchStatus(); fetchApplications(); fetchLogs(); fetchFoundJobs(jobSearch); fetchPipeline();
    }, 5000);
    return () => clearInterval(iv);
  }, [fetchStatus, fetchApplications, fetchLogs, fetchFoundJobs, fetchPipeline, jobSearch]);

  useEffect(() => {
    if (tab === "logs") logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, tab]);

  // ── Derived: unique locations & platforms in found jobs ──
  const uniqueLocations = useMemo(() => {
    const locs = [...new Set(foundJobs.map((j) => j.location).filter(Boolean))].sort();
    return ["All", ...locs];
  }, [foundJobs]);

  const uniquePlatforms = useMemo(() => {
    const plats = [...new Set(foundJobs.map((j) => j.platform).filter(Boolean))].sort();
    return ["All", ...plats];
  }, [foundJobs]);

  // ── Filtered + sorted jobs ──
  const displayedJobs = useMemo(() => {
    let jobs = [...foundJobs];
    if (jobSearch) {
      const q = jobSearch.toLowerCase();
      jobs = jobs.filter((j) => `${j.title} ${j.company} ${j.location} ${j.platform}`.toLowerCase().includes(q));
    }
    if (minScore > 0) jobs = jobs.filter((j) => (j.score ?? 0) >= minScore);
    if (filterPlatform !== "All") jobs = jobs.filter((j) => j.platform === filterPlatform);
    if (filterLocation !== "All") jobs = jobs.filter((j) => j.location === filterLocation);
    if (filterEasyApply) jobs = jobs.filter((j) => j.easyApply);

    jobs.sort((a, b) => {
      if (sortBy === "score")    return (b.score ?? 0) - (a.score ?? 0);
      if (sortBy === "date")     return new Date(b.savedAt) - new Date(a.savedAt);
      if (sortBy === "company")  return (a.company || "").localeCompare(b.company || "");
      if (sortBy === "platform") return (a.platform || "").localeCompare(b.platform || "");
      return 0;
    });
    return jobs;
  }, [foundJobs, jobSearch, minScore, filterPlatform, filterLocation, filterEasyApply, sortBy]);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id); setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const toggleAutomation = async () => {
    setLoading(true);
    try {
      const d = await fetch(`${API}/${isRunning ? "stop" : "start"}`, { method: "POST" }).then((r) => r.json());
      if (d.ok) { setIsRunning(!isRunning); showToast(isRunning ? "Stopped" : "Automation started!"); }
      else showToast(d.message || "Failed", "error");
    } catch { showToast("Cannot reach server", "error"); }
    setLoading(false);
  };

  const handleApplyNow = async (job) => {
    setSelectedJob(null);
    showToast(`Starting auto-apply for ${job.title}…`);
    try { await fetch(`${API}/apply/${job.id}`, { method: "POST" }); showToast("Auto-apply running!"); }
    catch { showToast("Failed to trigger auto-apply", "error"); }
  };

  const saveSettings = async () => {
    try {
      const d = await fetch(`${API}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsForm),
      }).then((r) => r.json());
      if (d.ok) { setSettings(d.settings); showToast("Settings saved"); }
    } catch { showToast("Failed to save", "error"); }
  };

  const testEmail = async () => {
    try {
      const d = await fetch(`${API}/test-email`, { method: "POST" }).then((r) => r.json());
      showToast(d.ok ? "Test email sent!" : d.message, d.ok ? "success" : "error");
    } catch { showToast("Failed", "error"); }
  };

  const deleteApplication = async (id) => {
    await fetch(`${API}/applications/${id}`, { method: "DELETE" });
    setApplications((p) => p.filter((a) => a.id !== id));
  };

  const fetchPipeline = useCallback(async () => {
    try {
      const d = await fetch(`${API}/pipeline`).then((r) => r.json());
      setPipeline(d.stages || {});
    } catch {}
  }, []);

  const updateStage = async (id, stage) => {
    try {
      await fetch(`${API}/applications/${id}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      // Optimistic update
      setApplications((prev) => prev.map((a) => a.id === id ? { ...a, status: stage } : a));
      fetchPipeline();
      showToast(`Moved to ${stage}`);
    } catch { showToast("Failed to update stage", "error"); }
  };

  const fetchTalkingPoints = async (job) => {
    try {
      const d = await fetch(`${API}/generate-answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job }),
      }).then((r) => r.json());
      setTalkingPoints({ ...d, jobTitle: job.title, company: job.company });
    } catch { showToast("Could not generate report", "error"); }
  };

  const platformCounts = applications.reduce((acc, a) => {
    acc[a.platform] = (acc[a.platform] || 0) + 1; return acc;
  }, {});

  const statusCounts = applications.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1; return acc;
  }, {});

  const currentNavLabel = NAV_ITEMS.find((n) => n.id === tab)?.label ?? "";

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #0d1117;
          --surface: #161b22;
          --surface2: #21262d;
          --border: #30363d;
          --text: #e6edf3;
          --text-muted: #8b949e;
          --text-dim: #484f58;
          --indigo: #6366f1;
          --purple: #a855f7;
          --green: #3fb950;
          --amber: #d29922;
          --red: #f85149;
          --cyan: #58a6ff;
        }
        body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: var(--bg); }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #484f58; }
        .fc input, .fc textarea, .fc select {
          width: 100%; background: var(--bg); border: 1px solid var(--border);
          border-radius: 7px; padding: 8px 11px; color: var(--text);
          font-size: 13px; outline: none; resize: vertical;
          transition: border-color .15s;
        }
        .fc input:focus, .fc textarea:focus, .fc select:focus { border-color: var(--indigo); }
        .nav-link {
          display: flex; align-items: center; gap: 10px; padding: 9px 14px;
          border-radius: 8px; border: none; background: transparent;
          color: var(--text-muted); font-size: 13px; font-weight: 500;
          cursor: pointer; text-align: left; width: 100%; transition: all .15s;
          position: relative;
        }
        .nav-link:hover { background: var(--surface2); color: var(--text); }
        .nav-link.active { background: #6366f115; color: var(--text); }
        .nav-link.active::before {
          content: ''; position: absolute; left: 0; top: 4px; bottom: 4px;
          width: 3px; background: var(--indigo); border-radius: 0 3px 3px 0;
        }
        .job-card { animation: fadeIn .2s ease; }
        .job-card:hover { transform: translateY(-1px); box-shadow: 0 4px 24px rgba(0,0,0,.4); }
        .app-row:hover td { background: var(--surface2) !important; }
        .app-row:nth-child(even) td { background: #0d111788; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
      `}</style>

      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

        {/* ══ SIDEBAR ══════════════════════════════════════════════════════════ */}
        <aside style={{
          width: 220, flexShrink: 0, background: "var(--bg)",
          borderRight: "1px solid var(--border)",
          display: "flex", flexDirection: "column", height: "100vh",
        }}>
          {/* Brand */}
          <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "linear-gradient(135deg, #6366f1, #a855f7)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, flexShrink: 0,
              }}>⚡</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text)", letterSpacing: -.3 }}>OneTouch</div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 1 }}>Apply in one click</div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className={`nav-link${tab === item.id ? " active" : ""}`}
                onClick={() => setTab(item.id)}
              >
                <span style={{ fontSize: 15 }}>{item.icon}</span>
                <span>{item.label}</span>
                {item.id === "jobs" && foundJobs.length > 0 && (
                  <span style={{
                    marginLeft: "auto", background: "#3fb95020", color: "#3fb950",
                    borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700,
                  }}>
                    {foundJobs.length}
                  </span>
                )}
                {item.id === "applications" && applications.length > 0 && (
                  <span style={{
                    marginLeft: "auto", background: "#6366f120", color: "#6366f1",
                    borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700,
                  }}>
                    {applications.length}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Bot status */}
          <div style={{
            padding: "14px 16px", borderTop: "1px solid var(--border)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: isRunning ? "#3fb950" : "#484f58",
              animation: isRunning ? "pulse 2s ease infinite" : "none",
              boxShadow: isRunning ? "0 0 6px #3fb950" : "none",
            }} />
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              <div style={{ fontWeight: 600, color: isRunning ? "#3fb950" : "var(--text-muted)" }}>
                {isRunning ? "Running" : "Stopped"}
              </div>
              {isRunning && settings?.intervalMinutes && (
                <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
                  every {settings.intervalMinutes}m
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ══ MAIN PANEL ══════════════════════════════════════════════════════ */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Header bar */}
          <header style={{
            height: 60, flexShrink: 0,
            background: "var(--bg)", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 24px", gap: 16,
          }}>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{currentNavLabel}</h1>

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "right" }}>
                <span style={{ color: "var(--cyan)" }}>{stats.found}</span>
                <span style={{ color: "var(--text-dim)" }}> found · </span>
                <span style={{ color: "var(--indigo)" }}>{stats.applied}</span>
                <span style={{ color: "var(--text-dim)" }}> applied</span>
              </div>
              <button
                onClick={toggleAutomation}
                disabled={loading}
                style={{
                  padding: "8px 22px", borderRadius: 8, border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontWeight: 700, fontSize: 13, opacity: loading ? 0.6 : 1,
                  background: isRunning
                    ? "linear-gradient(135deg, #450a0a, #7f1d1d)"
                    : "linear-gradient(135deg, #14532d, #166534)",
                  color: isRunning ? "#f85149" : "#3fb950",
                  boxShadow: isRunning ? "0 0 16px #f8514930" : "0 0 16px #3fb95030",
                  transition: "opacity .15s",
                }}
              >
                {loading ? "…" : isRunning ? "⏹ Stop" : "▶ Start"}
              </button>
            </div>
          </header>

          {/* Scrollable content */}
          <main style={{ flex: 1, overflowY: "auto", padding: "24px" }}>

            {/* ══ DASHBOARD ════════════════════════════════════════════════ */}
            {tab === "dashboard" && (
              <div>
                {/* Stat cards */}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
                  <StatCard label="Jobs Found"   value={stats.found}  color="var(--cyan)"   icon="🔍" />
                  <StatCard label="Tracked"      value={stats.applied} color="var(--indigo)" icon="📌" />
                  <StatCard label="Auto-Applied" value={statusCounts["auto-applied"] || 0}  color="var(--green)"  icon="✓" sub="LinkedIn + Indeed" />
                  <StatCard label="Simplify"     value={statusCounts["simplify-opened"] || 0} color="var(--purple)" icon="✨" sub="Form pre-filled" />
                  <StatCard label="Errors"       value={stats.errors} color="var(--red)"    icon="⚠" />
                </div>

                {/* Platform breakdown pills */}
                {Object.keys(platformCounts).length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Platform Breakdown</div>
                    <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
                      {Object.entries(platformCounts).map(([platform, count]) => {
                        const color = getPlatformColor(platform);
                        return (
                          <button
                            key={platform}
                            onClick={() => { setTab("jobs"); setFilterPlatform(platform); }}
                            style={{
                              background: "var(--surface)", borderRadius: 12, padding: "12px 18px",
                              border: `1px solid ${color}40`, cursor: "pointer",
                              display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
                              transition: "all .15s", animation: "fadeIn .2s ease",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = color + "15"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = color + "40"; e.currentTarget.style.background = "var(--surface)"; }}
                          >
                            <span style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{count}</span>
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{platform}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Status breakdown */}
                {Object.keys(statusCounts).length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Status Breakdown</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {Object.entries(statusCounts).map(([status, count]) => {
                        const meta = STATUS_META[status];
                        if (!meta) return null;
                        return (
                          <div key={status} style={{
                            background: meta.bg, borderRadius: 8,
                            padding: "8px 14px", border: `1px solid ${meta.color}33`,
                            display: "flex", alignItems: "center", gap: 8,
                            animation: "fadeIn .2s ease",
                          }}>
                            <span style={{ fontSize: 20, fontWeight: 800, color: meta.color, lineHeight: 1 }}>{count}</span>
                            <span style={{ fontSize: 11, color: meta.color, opacity: 0.85 }}>{meta.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Recent activity */}
                <div style={{ background: "var(--surface)", borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Recent Activity</div>
                  </div>
                  <div style={{ padding: "8px 20px 16px" }}>
                    {logs.length === 0 && (
                      <p style={{ color: "var(--text-dim)", fontSize: 13, padding: "12px 0" }}>
                        No activity yet. Click ▶ Start to begin.
                      </p>
                    )}
                    {logs.slice(0, 25).map((l) => (
                      <div key={l.id} style={{
                        display: "flex", gap: 12, padding: "6px 0",
                        borderBottom: "1px solid var(--border)", alignItems: "flex-start",
                      }}>
                        <span style={{ color: "var(--text-dim)", fontSize: 11, whiteSpace: "nowrap", flexShrink: 0, paddingTop: 1 }}>
                          {new Date(l.timestamp).toLocaleTimeString()}
                        </span>
                        <span style={{
                          background: LEVEL_COLOR[l.level] + "20",
                          color: LEVEL_COLOR[l.level],
                          borderRadius: 4, padding: "1px 6px",
                          fontSize: 10, fontWeight: 700, flexShrink: 0,
                          textTransform: "uppercase",
                        }}>
                          {l.level}
                        </span>
                        <span style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>{l.message}</span>
                        {l.detail && <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{l.detail}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ══ JOBS ══════════════════════════════════════════════════════ */}
            {tab === "jobs" && (
              <div>
                {/* Search bar */}
                <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
                  <div style={{ flex: 1, position: "relative" }}>
                    <span style={{
                      position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                      color: "var(--text-dim)", fontSize: 14, pointerEvents: "none",
                    }}>🔍</span>
                    <input
                      placeholder="Search jobs, companies, locations…"
                      value={jobSearch}
                      onChange={(e) => { setJobSearch(e.target.value); fetchFoundJobs(e.target.value); }}
                      style={{
                        width: "100%", background: "var(--surface)",
                        border: "1px solid var(--border)", borderRadius: 9,
                        padding: "10px 14px 10px 38px", color: "var(--text)",
                        fontSize: 13, outline: "none", boxSizing: "border-box",
                        transition: "border-color .15s",
                      }}
                      onFocus={(e) => e.target.style.borderColor = "#6366f1"}
                      onBlur={(e) => e.target.style.borderColor = "var(--border)"}
                    />
                  </div>
                  <span style={{ color: "var(--text-dim)", fontSize: 12, whiteSpace: "nowrap", fontWeight: 600 }}>
                    {displayedJobs.length} / {foundJobs.length}
                  </span>
                </div>

                {/* Sort + min score */}
                <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginRight: 4 }}>Sort</span>
                  {SORT_OPTIONS.map((o) => (
                    <SortBtn key={o.key} active={sortBy === o.key} onClick={() => setSortBy(o.key)}>
                      {o.label}
                    </SortBtn>
                  ))}
                  <div style={{
                    marginLeft: "auto", display: "flex", alignItems: "center", gap: 8,
                    background: "var(--surface)", borderRadius: 8, padding: "6px 12px",
                    border: "1px solid var(--border)",
                  }}>
                    <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Min ★</span>
                    <input type="range" min={0} max={5} step={0.5} value={minScore}
                      onChange={(e) => setMinScore(parseFloat(e.target.value))}
                      style={{ width: 70, accentColor: "#6366f1" }} />
                    <span style={{ fontSize: 12, color: scoreColor(minScore), fontWeight: 700, minWidth: 18 }}>{minScore}</span>
                  </div>
                </div>

                {/* Location chips */}
                <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginRight: 4 }}>📍</span>
                  {uniqueLocations.map((loc) => (
                    <Chip key={loc} active={filterLocation === loc} color="#fb923c" onClick={() => setFilterLocation(loc)}>
                      {loc}
                    </Chip>
                  ))}
                </div>

                {/* Platform chips */}
                <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginRight: 4 }}>Platform</span>
                  {uniquePlatforms.map((plat) => (
                    <Chip key={plat} active={filterPlatform === plat}
                      color={getPlatformColor(plat)}
                      onClick={() => setFilterPlatform(plat)}>
                      {plat}
                    </Chip>
                  ))}
                  <Chip active={filterEasyApply} color="var(--green)" onClick={() => setFilterEasyApply((v) => !v)}>
                    ⚡ Easy Apply only
                  </Chip>
                </div>

                {/* ATS info bar */}
                {atsCompanies && (
                  <div style={{
                    background: "#2e106520", border: "1px solid #7c3aed40", borderRadius: 9,
                    padding: "10px 16px", marginBottom: 14, fontSize: 12,
                    display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center",
                  }}>
                    <span style={{ color: "#a855f7", fontWeight: 700 }}>🏢 ATS Direct — {atsCompanies.total} companies</span>
                    <span style={{ color: "var(--text-dim)" }}>Greenhouse ({atsCompanies.greenhouse?.length})</span>
                    <span style={{ color: "var(--text-dim)" }}>Lever ({atsCompanies.lever?.length})</span>
                    <span style={{ color: "var(--text-dim)" }}>Ashby ({atsCompanies.ashby?.length})</span>
                  </div>
                )}

                {displayedJobs.length === 0 && (
                  <div style={{
                    background: "var(--surface)", borderRadius: 14, padding: 48,
                    textAlign: "center", color: "var(--text-dim)",
                    border: "1px solid var(--border)",
                  }}>
                    {foundJobs.length === 0
                      ? "No jobs saved yet. Click ▶ Start to begin scanning."
                      : "No jobs match your filters. Try adjusting the search or score slider."}
                  </div>
                )}

                {/* Job cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {displayedJobs.map((job) => {
                    const borderColor = job.score >= 4 ? "#3fb950" : job.score >= 3 ? "#d29922" : "var(--border)";
                    return (
                      <div key={job.id} className="job-card"
                        style={{
                          background: "var(--surface)", borderRadius: 12,
                          padding: "14px 18px", borderLeft: `3px solid ${borderColor}`,
                          border: `1px solid var(--border)`, borderLeftColor: borderColor,
                          transition: "transform .15s, box-shadow .15s", cursor: "default",
                        }}>

                        {/* Top row */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 5 }}>
                              <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{job.title}</span>
                              <ScoreBadge score={job.score} label={job.scoreLabel} />
                              <PlatformBadge platform={job.platform} />
                              {job.atsProvider && <Tag color="#a855f7">{job.atsProvider}</Tag>}
                              {job.easyApply && (
                                <span style={{ background: "#14532d", color: "#3fb950", borderRadius: 5, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>
                                  ⚡ Easy Apply
                                </span>
                              )}
                              {job.workMode && <Tag color="#8b5cf6">{job.workMode}</Tag>}
                              {job.salary && <Tag color="#3fb950">💰 {job.salary}</Tag>}
                            </div>
                            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                              <span style={{ fontWeight: 600 }}>{job.company}</span>
                              <span style={{ color: "var(--text-dim)" }}> · </span>
                              <span style={{ color: "#fb923c" }}>📍 {job.location}</span>
                              {job.via && <span style={{ color: "var(--text-dim)" }}> · via {job.via}</span>}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap", marginLeft: 10 }}>
                            {new Date(job.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>

                        {/* Skills */}
                        {job.skills?.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                            {job.skills.slice(0, 6).map((s, i) => (
                              <span key={i} style={{
                                background: "#58a6ff12", color: "#58a6ff",
                                border: "1px solid #58a6ff25", borderRadius: 5, padding: "2px 8px", fontSize: 11,
                              }}>{s}</span>
                            ))}
                            {job.skills.length > 6 && (
                              <span style={{ color: "var(--text-dim)", fontSize: 11, padding: "2px 4px" }}>
                                +{job.skills.length - 6}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Description snippet */}
                        {job.description && (
                          <div style={{
                            fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 10,
                            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}>
                            {job.description}
                          </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <a href={job.url} target="_blank" rel="noreferrer"
                            style={{
                              padding: "5px 13px", background: "#6366f1", color: "#fff",
                              borderRadius: 6, fontSize: 11, fontWeight: 700, textDecoration: "none",
                            }}>
                            Open ↗
                          </a>
                          <button
                            onClick={() => copyToClipboard(job.url, `url-${job.id}`)}
                            style={{
                              padding: "5px 13px", background: "transparent",
                              border: "1px solid var(--border)",
                              color: copiedId === `url-${job.id}` ? "#3fb950" : "var(--text-muted)",
                              borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                              transition: "all .15s",
                            }}>
                            {copiedId === `url-${job.id}` ? "✓ Copied" : "Copy URL"}
                          </button>
                          <button
                            onClick={() => copyToClipboard(
                              `Title: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\nPlatform: ${job.platform}\nURL: ${job.url}\nSalary: ${job.salary || "N/A"}\nScore: ${job.score}/5\nSkills: ${(job.skills || []).join(", ")}\n\n${job.description || ""}`,
                              `info-${job.id}`
                            )}
                            style={{
                              padding: "5px 13px", background: "transparent",
                              border: "1px solid var(--border)",
                              color: copiedId === `info-${job.id}` ? "#3fb950" : "var(--text-muted)",
                              borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                              transition: "all .15s",
                            }}>
                            {copiedId === `info-${job.id}` ? "✓ Copied" : "Copy All"}
                          </button>
                          <button
                            onClick={() => setSelectedJob(job)}
                            style={{
                              padding: "5px 13px", background: "transparent",
                              border: "1px solid var(--border)", color: "#6366f1",
                              borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                            }}>
                            Details
                          </button>
                          {job.platform === "ATS Direct" && (
                            <a href={job.url} target="_blank" rel="noreferrer"
                              style={{
                                padding: "5px 13px", background: "#2e1065",
                                color: "#c084fc", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                textDecoration: "none", border: "1px solid #7c3aed",
                              }}>
                              ✨ Simplify
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ══ PIPELINE KANBAN ═══════════════════════════════════════════ */}
            {tab === "pipeline" && (
              <div>
                {/* Talking points report card (CareerOps-style) */}
                {talkingPoints && (
                  <div style={{
                    background: "var(--surface)", borderRadius: 14, padding: 20,
                    border: "1px solid #6366f140", marginBottom: 20, position: "relative",
                    animation: "fadeIn .2s ease",
                  }}>
                    <button onClick={() => setTalkingPoints(null)} style={{
                      position: "absolute", top: 14, right: 14,
                      background: "var(--surface2)", border: "1px solid var(--border)",
                      color: "var(--text-muted)", borderRadius: 6, cursor: "pointer",
                      width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>✕</button>
                    <div style={{ fontSize: 11, color: "var(--indigo)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                      ⚡ Talking Points — {talkingPoints.jobTitle} @ {talkingPoints.company}
                    </div>
                    {talkingPoints.matchedSkills?.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 5 }}>MATCHED SKILLS</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {talkingPoints.matchedSkills.map((s) => (
                            <span key={s} style={{ background: "#3fb95020", color: "#3fb950", border: "1px solid #3fb95040", borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 600 }}>
                              ✓ {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {talkingPoints.talkingPoints?.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>PREP CHECKLIST</div>
                        {talkingPoints.talkingPoints.map((tp, i) => (
                          <div key={i} style={{ fontSize: 12, color: "var(--text-muted)", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>{tp}</div>
                        ))}
                      </div>
                    )}
                    {talkingPoints.coverLetter && (
                      <details style={{ marginTop: 8 }}>
                        <summary style={{ fontSize: 12, color: "var(--indigo)", cursor: "pointer", fontWeight: 600 }}>View generated cover letter ▾</summary>
                        <pre style={{
                          marginTop: 10, background: "var(--bg)", borderRadius: 8,
                          padding: "12px 16px", fontSize: 12, color: "var(--text-muted)",
                          whiteSpace: "pre-wrap", lineHeight: 1.7, border: "1px solid var(--border)",
                        }}>{talkingPoints.coverLetter}</pre>
                      </details>
                    )}
                  </div>
                )}

                {/* Kanban columns */}
                <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" }}>
                  {PIPELINE_STAGES.map(({ key, label, icon, color }) => {
                    const cards = pipeline[key] || [];
                    return (
                      <div key={key} style={{
                        minWidth: 220, width: 220, flexShrink: 0,
                        background: "var(--surface)", borderRadius: 12,
                        border: `1px solid ${color}30`,
                        display: "flex", flexDirection: "column",
                        maxHeight: "calc(100vh - 180px)",
                      }}>
                        {/* Column header */}
                        <div style={{
                          padding: "10px 14px",
                          borderBottom: `2px solid ${color}40`,
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 14 }}>{icon}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span>
                          </div>
                          <span style={{
                            background: color + "22", color, borderRadius: 10,
                            padding: "1px 7px", fontSize: 11, fontWeight: 700,
                          }}>{cards.length}</span>
                        </div>

                        {/* Cards */}
                        <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                          {cards.length === 0 && (
                            <div style={{ color: "var(--text-dim)", fontSize: 11, textAlign: "center", padding: "12px 0" }}>
                              No applications
                            </div>
                          )}
                          {cards.map((a) => (
                            <div key={a.id} style={{
                              background: "var(--bg)", borderRadius: 8, padding: "10px 12px",
                              border: "1px solid var(--border)", animation: "fadeIn .15s ease",
                              cursor: "pointer",
                            }}
                              onClick={() => { setSelectedJob(a); fetchTalkingPoints(a); }}
                            >
                              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 3, lineHeight: 1.3 }}>
                                {a.title}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
                                {a.company}
                              </div>
                              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                                {a.score != null && <ScoreBadge score={a.score} />}
                                <PlatformBadge platform={a.platform} />
                              </div>
                              {/* Stage advance buttons */}
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                                {PIPELINE_STAGES
                                  .filter(s => s.key !== key)
                                  .slice(0, 3)
                                  .map((s) => (
                                    <button key={s.key} onClick={(e) => { e.stopPropagation(); updateStage(a.id, s.key); }}
                                      title={`Move to ${s.label}`}
                                      style={{
                                        background: s.color + "15", color: s.color,
                                        border: `1px solid ${s.color}40`,
                                        borderRadius: 5, padding: "2px 7px", fontSize: 10,
                                        fontWeight: 600, cursor: "pointer",
                                      }}>
                                      → {s.label}
                                    </button>
                                  ))
                                }
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

            {/* ══ APPLICATIONS ══════════════════════════════════════════════ */}
            {tab === "applications" && (
              <div style={{ background: "var(--surface)", borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)" }}>
                {/* Sticky header */}
                <div style={{
                  padding: "14px 20px", borderBottom: "1px solid var(--border)",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  flexWrap: "wrap", gap: 10, position: "sticky", top: 0,
                  background: "var(--surface)", zIndex: 10,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)" }}>
                    {applications.length} Application{applications.length !== 1 ? "s" : ""}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {Object.entries(statusCounts).map(([s, c]) => {
                      const m = STATUS_META[s];
                      return m ? (
                        <span key={s} style={{
                          background: m.bg, color: m.color,
                          borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 600,
                        }}>
                          {c} {m.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>

                {applications.length === 0 && (
                  <p style={{ color: "var(--text-dim)", fontSize: 13, padding: "28px 20px" }}>
                    No applications tracked yet.
                  </p>
                )}

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "var(--bg)" }}>
                        {["Title", "Company", "Location", "Platform", "Score", "Salary", "Status", "Posted", ""].map((h) => (
                          <th key={h} style={{
                            padding: "10px 14px", textAlign: "left", fontSize: 11,
                            color: "var(--text-dim)", fontWeight: 700, textTransform: "uppercase",
                            whiteSpace: "nowrap", letterSpacing: 0.5, borderBottom: "1px solid var(--border)",
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {applications.map((a) => (
                        <tr key={a.id} className="app-row" style={{ borderBottom: "1px solid var(--border)", transition: "background .1s" }}>
                          <td style={{ padding: "10px 14px", fontSize: 13 }}>
                            <button onClick={() => setSelectedJob(a)} style={{
                              background: "none", border: "none", color: "var(--cyan)",
                              fontWeight: 600, cursor: "pointer", fontSize: 13,
                              textAlign: "left", padding: 0, transition: "color .15s",
                            }}
                              onMouseEnter={(e) => e.currentTarget.style.color = "#6366f1"}
                              onMouseLeave={(e) => e.currentTarget.style.color = "var(--cyan)"}
                            >
                              {a.title}
                            </button>
                          </td>
                          <td style={{ padding: "10px 14px", fontSize: 13, color: "var(--text)" }}>{a.company}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, color: "#fb923c" }}>{a.location}</td>
                          <td style={{ padding: "10px 14px" }}><PlatformBadge platform={a.platform} /></td>
                          <td style={{ padding: "10px 14px" }}><ScoreBadge score={a.score} label={a.scoreLabel} /></td>
                          <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--green)" }}>{a.salary || "—"}</td>
                          <td style={{ padding: "10px 14px" }}><StatusBadge status={a.status} /></td>
                          <td style={{ padding: "10px 14px", fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                            {a.postedAt ? new Date(a.postedAt).toLocaleDateString() : "—"}
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <button
                              onClick={() => deleteApplication(a.id)}
                              style={{
                                background: "none", border: "none", color: "var(--text-dim)",
                                cursor: "pointer", fontSize: 15, borderRadius: 4,
                                padding: "3px 7px", transition: "color .15s",
                              }}
                              onMouseEnter={(e) => e.target.style.color = "var(--red)"}
                              onMouseLeave={(e) => e.target.style.color = "var(--text-dim)"}
                            >✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ══ LOGS ══════════════════════════════════════════════════════ */}
            {tab === "logs" && (
              <div style={{
                background: "#010409",
                borderRadius: 14, padding: "16px 20px",
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                fontSize: 12, minHeight: 400,
                border: "1px solid var(--border)",
              }}>
                {logs.length === 0 && (
                  <span style={{ color: "var(--text-dim)" }}>No logs yet.</span>
                )}
                {logs.map((l) => (
                  <div key={l.id} style={{
                    display: "flex", gap: 14, padding: "3px 0",
                    alignItems: "flex-start", animation: "fadeIn .15s ease",
                  }}>
                    <span style={{ color: "var(--text-dim)", flexShrink: 0, fontSize: 11, letterSpacing: -0.3 }}>
                      {new Date(l.timestamp).toLocaleString()}
                    </span>
                    <span style={{
                      color: LEVEL_COLOR[l.level], width: 64, flexShrink: 0,
                      fontWeight: 700, fontSize: 11,
                    }}>
                      [{l.level.toUpperCase()}]
                    </span>
                    <span style={{ color: LEVEL_COLOR[l.level], lineHeight: 1.6 }}>{l.message}</span>
                    {l.detail && <span style={{ color: "var(--text-dim)" }}>{l.detail}</span>}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}

            {/* ══ SETTINGS ══════════════════════════════════════════════════ */}
            {tab === "settings" && settingsForm && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>

                {/* Left column: search settings */}
                <div>
                  <div style={{
                    background: "var(--surface)", borderRadius: 14, padding: 24,
                    border: "1px solid var(--border)", marginBottom: 16,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>Search Settings</div>

                    <Field label="Job Titles (comma-separated)">
                      <textarea rows={3}
                        value={Array.isArray(settingsForm.jobTitles) ? settingsForm.jobTitles.join(", ") : settingsForm.jobTitles}
                        onChange={(e) => setSettingsForm((f) => ({ ...f, jobTitles: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))} />
                    </Field>

                    <Field label="Locations (comma-separated)">
                      <textarea rows={2}
                        value={Array.isArray(settingsForm.locations) ? settingsForm.locations.join(", ") : settingsForm.locations}
                        onChange={(e) => setSettingsForm((f) => ({ ...f, locations: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))} />
                    </Field>

                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10, fontWeight: 600 }}>Platforms</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {Object.keys(PLATFORM_META).map((id) => (
                          <PlatformPill key={id} id={id}
                            active={settingsForm.platforms?.[id] !== false}
                            onChange={(pid, val) => setSettingsForm((f) => ({ ...f, platforms: { ...f.platforms, [pid]: val } }))} />
                        ))}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                      <Field label="Interval (min)">
                        <input type="number" min={1} max={60} value={settingsForm.intervalMinutes}
                          onChange={(e) => setSettingsForm((f) => ({ ...f, intervalMinutes: parseInt(e.target.value) }))} />
                      </Field>
                      <Field label="Max jobs / run">
                        <input type="number" min={1} max={50} value={settingsForm.maxApplicationsPerRun}
                          onChange={(e) => setSettingsForm((f) => ({ ...f, maxApplicationsPerRun: parseInt(e.target.value) }))} />
                      </Field>
                      <Field label="Max browser / cycle">
                        <input type="number" min={1} max={20} value={settingsForm.maxBrowserOpensPerCycle ?? 5}
                          onChange={(e) => setSettingsForm((f) => ({ ...f, maxBrowserOpensPerCycle: parseInt(e.target.value) }))} />
                      </Field>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                        <input type="checkbox" checked={!!settingsForm.autoApplyEnabled}
                          onChange={(e) => setSettingsForm((f) => ({ ...f, autoApplyEnabled: e.target.checked }))}
                          style={{ accentColor: "var(--green)", width: 15, height: 15 }} />
                        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Enable LinkedIn / Indeed auto-apply</span>
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                        <input type="checkbox" checked={!!settingsForm.emailNotifications}
                          onChange={(e) => setSettingsForm((f) => ({ ...f, emailNotifications: e.target.checked }))}
                          style={{ accentColor: "var(--indigo)", width: 15, height: 15 }} />
                        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Email notifications</span>
                      </label>
                    </div>

                    <Field label="Notification email">
                      <input type="email" value={settingsForm.notifyEmail || ""}
                        onChange={(e) => setSettingsForm((f) => ({ ...f, notifyEmail: e.target.value }))} />
                    </Field>

                    <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                      <Btn onClick={saveSettings} primary>Save Settings</Btn>
                      <Btn onClick={testEmail}>Test Email</Btn>
                    </div>
                  </div>
                </div>

                {/* Right column: credentials + simplify */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Simplify card */}
                  <div style={{
                    background: "linear-gradient(135deg, #1a0a2e 0%, #2e1065 100%)",
                    border: "1px solid #7c3aed50", borderRadius: 14, padding: 22,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                      <span style={{ fontSize: 26 }}>✨</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: "#c084fc", fontSize: 15 }}>Simplify Auto-Fill</div>
                        <div style={{ color: "#7e22ce", fontSize: 11, marginTop: 2 }}>Workday · Greenhouse · Lever · Ashby — any form</div>
                      </div>
                      <a href="https://simplify.jobs/chrome" target="_blank" rel="noreferrer"
                        style={{
                          padding: "8px 16px", background: "#7c3aed",
                          color: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 700,
                          textDecoration: "none", whiteSpace: "nowrap",
                        }}>
                        Install Free ↗
                      </a>
                    </div>
                    <div style={{ fontSize: 12, color: "#6b21a8", lineHeight: 1.9 }}>
                      <strong style={{ color: "#a855f7" }}>Setup (one time):</strong><br />
                      1. Install from Chrome Web Store → Log in → fill your profile<br />
                      2. Bot opens each job → Simplify fills every field in seconds<br />
                      3. Just click <strong>Submit</strong>
                    </div>
                    <div style={{ marginTop: 12, display: "flex", gap: 12, fontSize: 12 }}>
                      <div style={{ background: "#1e0a3e", borderRadius: 6, padding: "6px 12px" }}>
                        <span style={{ color: "#6b21a8" }}>Mode: </span>
                        <code style={{ color: "#c084fc" }}>{settings?.simplifyMode || "shell"}</code>
                      </div>
                      <div style={{ background: "#1e0a3e", borderRadius: 6, padding: "6px 12px" }}>
                        <span style={{ color: "#6b21a8" }}>Auto-submit: </span>
                        <code style={{ color: "#c084fc" }}>{settings?.simplifyAutoSubmit ? "true" : "false"}</code>
                      </div>
                    </div>
                  </div>

                  {/* Credentials card */}
                  <div style={{
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: 14, padding: 22,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>Credentials (.env)</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {[
                        ["APIFY_TOKEN",             settings?.apifyConfigured,    "scraping"],
                        ["SERPAPI_KEY",             settings?.serpApiConfigured,   "Google Jobs"],
                        ["LINKEDIN_EMAIL/PASSWORD", settings?.linkedinConfigured,  "auto-apply"],
                        ["EMAIL_USER/PASS",         settings?.emailConfigured,     "notifications"],
                      ].map(([key, ok, note]) => (
                        <div key={key} style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "9px 12px", borderRadius: 8,
                          background: ok ? "#3fb95010" : "#f8514910",
                          border: `1px solid ${ok ? "#3fb95025" : "#f8514925"}`,
                        }}>
                          <span style={{ color: ok ? "var(--green)" : "var(--red)", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                            {ok ? "✓" : "✕"}
                          </span>
                          <code style={{ color: "var(--text-muted)", fontSize: 12, flex: 1 }}>{key}</code>
                          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{note}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 8, background: "var(--surface2)", border: "1px solid var(--border)", fontSize: 12, display: "flex", alignItems: "center", gap: 10 }}>
                      <code style={{ color: "var(--text-muted)", flex: 1 }}>RESUME_PATH</code>
                      {settings?.profile?.resumePath
                        ? <span style={{ color: "var(--green)", fontSize: 11 }}>✓ configured</span>
                        : <span style={{ color: "var(--red)", fontSize: 11 }}>not set</span>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ── Job Modal ── */}
      <JobModal job={selectedJob} onClose={() => setSelectedJob(null)} onApply={handleApplyNow} />

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, right: 28,
          background: toast.type === "error" ? "#450a0a" : "#14532d",
          color: toast.type === "error" ? "#f85149" : "#3fb950",
          border: `1px solid ${toast.type === "error" ? "#f8514940" : "#3fb95040"}`,
          padding: "12px 22px", borderRadius: 10, fontWeight: 700, fontSize: 13,
          boxShadow: "0 8px 32px rgba(0,0,0,.6)", zIndex: 2000,
          animation: "slideUp .2s ease",
        }}>
          {toast.msg}
        </div>
      )}
    </>
  );
}
