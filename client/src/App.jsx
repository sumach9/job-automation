import { useState, useEffect, useCallback, useMemo } from "react";

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

// ─── Helpers ─────────────────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 4.0) return "#4ade80";
  if (score >= 3.0) return "#a3e635";
  if (score >= 2.0) return "#fbbf24";
  if (score >= 1.0) return "#fb923c";
  return "#f87171";
}

function getPlatformColor(platform = "") {
  const entry = Object.values(PLATFORM_META).find((m) => m.label === platform);
  return entry?.color || "#475569";
}

// ─── Small components ─────────────────────────────────────────────────────────
function ScoreBadge({ score, label }) {
  if (score == null) return null;
  const c = scoreColor(score);
  return (
    <span title={`Match: ${score}/5 — ${label || ""}`}
      style={{ background: c + "22", color: c, border: `1px solid ${c}55`,
        borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>
      ★ {score}
    </span>
  );
}

function PlatformBadge({ platform }) {
  const c = getPlatformColor(platform);
  return (
    <span style={{ background: c + "22", color: c, border: `1px solid ${c}44`,
      borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
      {platform}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = STATUS_META[status] || { bg: "#1e293b", color: "#94a3b8", label: status };
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 6,
      padding: "3px 9px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

function Tag({ children, color }) {
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}44`,
      borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 500 }}>
      {children}
    </span>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 10, color: "#475569", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: 1 }}>{children}</div>;
}

function Chip({ active, color = "#818cf8", onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 12px", borderRadius: 20, border: `1px solid ${active ? color : "#334155"}`,
      background: active ? color + "22" : "transparent",
      color: active ? color : "#475569", fontSize: 12, fontWeight: 600,
      cursor: "pointer", transition: "all .15s", whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}

function SortBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 14px", borderRadius: 8,
      background: active ? "#818cf8" : "#1e293b",
      color: active ? "#fff" : "#64748b",
      border: `1px solid ${active ? "#818cf8" : "#334155"}`,
      fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all .15s" }}>
      {children}
    </button>
  );
}

function StatCard({ label, value, color = "#818cf8", sub }) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 12, padding: "20px 24px",
      flex: "1 1 130px", borderTop: `3px solid ${color}`, position: "relative", overflow: "hidden" }}>
      <div style={{ fontSize: 32, fontWeight: 800, color, letterSpacing: -1 }}>{value}</div>
      <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#334155", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Job Detail Modal ─────────────────────────────────────────────────────────
function JobModal({ job, onClose, onApply }) {
  if (!job) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1e293b", borderRadius: 16,
        width: "100%", maxWidth: 700, maxHeight: "92vh", overflowY: "auto", padding: 28,
        boxShadow: "0 24px 64px rgba(0,0,0,.5)" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div style={{ flex: 1, paddingRight: 12 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>{job.title}</h2>
            <p style={{ color: "#94a3b8", fontSize: 14 }}>{job.company} · {job.location}</p>
          </div>
          <button onClick={onClose} style={{ background: "#0f172a", border: "1px solid #334155",
            color: "#64748b", fontSize: 18, cursor: "pointer", borderRadius: 8,
            width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0 }}>✕</button>
        </div>

        {/* Meta row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <PlatformBadge platform={job.platform} />
          {job.atsProvider && <Tag color="#a855f7">{job.atsProvider}</Tag>}
          {job.score != null && <ScoreBadge score={job.score} label={job.scoreLabel} />}
          <StatusBadge status={job.status} />
          {job.workMode && <Tag color="#8b5cf6">{job.workMode}</Tag>}
          {job.jobType && <Tag color="#0891b2">{job.jobType}</Tag>}
          {job.salary && <Tag color="#16a34a">💰 {job.salary}</Tag>}
          {job.via && <Tag color="#64748b">via {job.via}</Tag>}
        </div>

        {/* Score breakdown */}
        {job.scoreBreakdown && (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "#0f172a",
            borderRadius: 10, fontSize: 12 }}>
            <div style={{ color: "#475569", fontWeight: 700, marginBottom: 8, fontSize: 10,
              textTransform: "uppercase", letterSpacing: 1 }}>Match Breakdown</div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 6 }}>
              {[["Title", job.scoreBreakdown.title], ["Skills", job.scoreBreakdown.skills?.toFixed(1)],
                ["Location", job.scoreBreakdown.location]].map(([k, v]) => (
                <div key={k}>
                  <span style={{ color: "#475569" }}>{k}: </span>
                  <strong style={{ color: scoreColor(job.score) }}>{v}</strong>
                </div>
              ))}
            </div>
            {job.scoreBreakdown.matchedSkills?.length > 0 && (
              <div style={{ color: "#64748b" }}>
                Matched: <span style={{ color: "#94a3b8" }}>{job.scoreBreakdown.matchedSkills.join(", ")}</span>
              </div>
            )}
          </div>
        )}

        {/* Skills */}
        {job.skills?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <SectionLabel>Required Skills</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {job.skills.map((s, i) => (
                <span key={i} style={{ background: "#0f172a", color: "#93c5fd", border: "1px solid #1e3a5f",
                  borderRadius: 6, padding: "3px 10px", fontSize: 12 }}>{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {job.description && (
          <div style={{ marginBottom: 20 }}>
            <SectionLabel>Job Description</SectionLabel>
            <div style={{ marginTop: 8, background: "#0f172a", borderRadius: 10, padding: "14px 16px",
              fontSize: 13, color: "#94a3b8", lineHeight: 1.75, whiteSpace: "pre-wrap",
              maxHeight: 260, overflowY: "auto" }}>
              {job.description}
            </div>
          </div>
        )}

        {job.autoApplyNote && (
          <div style={{ marginBottom: 16, padding: "10px 14px", background: "#0f172a",
            borderRadius: 8, fontSize: 12, color: "#64748b" }}>
            <strong>Note:</strong> {job.autoApplyNote}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href={job.url} target="_blank" rel="noreferrer"
            style={{ flex: 1, minWidth: 140, textAlign: "center", padding: "11px",
              background: "#4f46e5", color: "#fff", borderRadius: 9, fontWeight: 700,
              fontSize: 13, textDecoration: "none" }}>
            Open Job Posting ↗
          </a>
          {(job.status === "easy-apply-pending" || job.status === "apply-failed" || job.status === "queued-manual") && (
            <button onClick={() => onApply(job)} style={{ flex: 1, minWidth: 140, padding: "11px",
              background: "#166534", color: "#4ade80", borderRadius: 9, border: "none",
              fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              ⚡ Auto-Apply Now
            </button>
          )}
          {(job.platform === "ATS Direct" || job.status === "queued-manual" || job.status === "browser-opened") && (
            <a href={job.url} target="_blank" rel="noreferrer"
              style={{ flex: 1, minWidth: 140, textAlign: "center", padding: "11px",
                background: "#3b0764", color: "#c084fc", borderRadius: 9, fontWeight: 700,
                fontSize: 13, textDecoration: "none", border: "1px solid #7c3aed" }}>
              ✨ Open + Simplify
            </a>
          )}
        </div>
        {(job.platform === "ATS Direct" || job.status === "simplify-opened") && (
          <div style={{ marginTop: 10, fontSize: 11, color: "#6b21a8", textAlign: "center" }}>
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
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
      background: active ? "#1e293b" : "#0f172a",
      border: `1px solid ${active ? m.color : "#1e293b"}`,
      borderRadius: 8, padding: "6px 12px", userSelect: "none" }}>
      <input type="checkbox" checked={active} onChange={(e) => onChange(id, e.target.checked)}
        style={{ accentColor: m.color }} />
      <span style={{ width: 22, height: 22, borderRadius: 4, background: m.color,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
        {m.icon.toUpperCase()}
      </span>
      <span style={{ fontSize: 13, color: active ? "#e2e8f0" : "#475569", fontWeight: 500 }}>{m.label}</span>
    </label>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 5, fontWeight: 600 }}>{label}</label>
      <style>{`.fc input,.fc textarea,.fc select{width:100%;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:8px 10px;color:#e2e8f0;font-size:13px;outline:none;resize:vertical}.fc input:focus,.fc textarea:focus{border-color:#818cf8}`}</style>
      <div className="fc">{children}</div>
    </div>
  );
}

function Btn({ onClick, children, primary, danger }) {
  return (
    <button onClick={onClick} style={{ padding: "9px 20px", borderRadius: 7, border: "none",
      cursor: "pointer", fontSize: 13, fontWeight: 600,
      background: primary ? "#4f46e5" : danger ? "#7f1d1d" : "#0f172a",
      color: primary ? "#fff" : danger ? "#fca5a5" : "#94a3b8" }}>
      {children}
    </button>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]                   = useState("dashboard");
  const [foundJobs, setFoundJobs]       = useState([]);
  const [jobSearch, setJobSearch]       = useState("");
  const [sortBy, setSortBy]             = useState("score");
  const [minScore, setMinScore]         = useState(0);
  const [filterPlatform, setFilterPlatform] = useState("All");
  const [filterLocation, setFilterLocation] = useState("All");
  const [filterEasyApply, setFilterEasyApply] = useState(false);
  const [copiedId, setCopiedId]         = useState(null);
  const [isRunning, setIsRunning]       = useState(false);
  const [stats, setStats]               = useState({ applied: 0, found: 0, skipped: 0, errors: 0 });
  const [applications, setApplications] = useState([]);
  const [logs, setLogs]                 = useState([]);
  const [settings, setSettings]         = useState(null);
  const [settingsForm, setSettingsForm] = useState(null);
  const [loading, setLoading]           = useState(false);
  const [toast, setToast]               = useState(null);
  const [selectedJob, setSelectedJob]   = useState(null);
  const [atsCompanies, setAtsCompanies] = useState(null);

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
    fetchStatus(); fetchApplications(); fetchLogs(); fetchFoundJobs();
    const iv = setInterval(() => {
      fetchStatus(); fetchApplications(); fetchLogs(); fetchFoundJobs(jobSearch);
    }, 5000);
    return () => clearInterval(iv);
  }, [fetchStatus, fetchApplications, fetchLogs, fetchFoundJobs, jobSearch]);

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
      const d = await fetch(`${API}/settings`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(settingsForm) }).then((r) => r.json());
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

  const platformCounts = applications.reduce((acc, a) => {
    acc[a.platform] = (acc[a.platform] || 0) + 1; return acc;
  }, {});

  const statusCounts = applications.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1; return acc;
  }, {});

  const tabs = ["dashboard", "jobs", "applications", "logs", "settings"];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg,#4f46e5,#7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🤖</div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", margin: 0 }}>Job Automation</h1>
            <p style={{ fontSize: 12, color: isRunning ? "#4ade80" : "#64748b", margin: 0, marginTop: 2 }}>
              {isRunning ? `● Scanning every ${settings?.intervalMinutes ?? 5} min` : "○ Stopped"}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ textAlign: "right", fontSize: 12, color: "#475569" }}>
            <div>{stats.found} found · {stats.applied} tracked</div>
            <div style={{ color: "#334155" }}>{statusCounts["auto-applied"] || 0} auto-applied · {statusCounts["simplify-opened"] || 0} Simplify</div>
          </div>
          <button onClick={toggleAutomation} disabled={loading}
            style={{ padding: "10px 28px", borderRadius: 9, border: "none",
              cursor: loading ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 14,
              opacity: loading ? 0.6 : 1,
              background: isRunning ? "linear-gradient(135deg,#7f1d1d,#991b1b)" : "linear-gradient(135deg,#166534,#15803d)",
              color: isRunning ? "#fca5a5" : "#86efac",
              boxShadow: isRunning ? "0 0 20px #7f1d1d44" : "0 0 20px #16653444" }}>
            {loading ? "…" : isRunning ? "⏹ Stop" : "▶ Start"}
          </button>
        </div>
      </div>

      {/* ── Search targets banner ── */}
      {settings && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: "14px 20px",
          marginBottom: 20, display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <SectionLabel>Job Titles</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
              {(settings.jobTitles || []).map((t) => (
                <span key={t} style={{ background: "#818cf822", color: "#818cf8",
                  border: "1px solid #818cf844", borderRadius: 20, padding: "3px 10px", fontSize: 11 }}>{t}</span>
              ))}
            </div>
          </div>
          <div>
            <SectionLabel>Locations</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
              {(settings.locations || []).map((l) => (
                <span key={l} style={{ background: "#fb923c22", color: "#fb923c",
                  border: "1px solid #fb923c44", borderRadius: 20, padding: "3px 10px", fontSize: 11 }}>📍 {l}</span>
              ))}
            </div>
          </div>
          <div>
            <SectionLabel>Platforms</SectionLabel>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
              {Object.entries(PLATFORM_META).map(([id, m]) => {
                const active = settings.platforms?.[id] !== false;
                const count = platformCounts[m.label];
                return (
                  <span key={id} style={{ background: active ? m.color + "22" : "#0f172a",
                    color: active ? m.color : "#334155",
                    border: `1px solid ${active ? m.color + "55" : "#1e293b"}`,
                    borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>
                    {active ? "✓" : "✕"} {m.label}{count ? ` (${count})` : ""}
                  </span>
                );
              })}
            </div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <SectionLabel>Browser limit / cycle</SectionLabel>
            <div style={{ marginTop: 7, fontSize: 18, fontWeight: 800, color: "#f97316" }}>
              {settings?.maxBrowserOpensPerCycle ?? 5}
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: "1px solid #1e293b", overflowX: "auto" }}>
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "9px 20px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 600, textTransform: "capitalize", whiteSpace: "nowrap",
            background: tab === t ? "#1e293b" : "transparent",
            color: tab === t ? "#818cf8" : "#64748b",
            borderBottom: tab === t ? "2px solid #818cf8" : "2px solid transparent",
            transition: "all .15s" }}>
            {t}
            {t === "jobs" && foundJobs.length > 0 && (
              <span style={{ marginLeft: 6, background: "#4ade80", color: "#052e16",
                borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 800 }}>
                {foundJobs.length}
              </span>
            )}
            {t === "applications" && applications.length > 0 && (
              <span style={{ marginLeft: 6, background: "#818cf8", color: "#1e1b4b",
                borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 800 }}>
                {applications.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════ DASHBOARD ══════════════════ */}
      {tab === "dashboard" && (
        <>
          {/* Stats row */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <StatCard label="Jobs Found"    value={stats.found}    color="#60a5fa" />
            <StatCard label="Tracked"       value={stats.applied}  color="#818cf8" />
            <StatCard label="Auto-Applied"  value={statusCounts["auto-applied"] || 0}  color="#4ade80" sub="LinkedIn + Indeed" />
            <StatCard label="Simplify"      value={statusCounts["simplify-opened"] || 0} color="#c084fc" sub="Form pre-filled" />
            <StatCard label="Errors"        value={stats.errors}   color="#f87171" />
          </div>

          {/* Platform breakdown */}
          {Object.keys(platformCounts).length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
              {Object.entries(platformCounts).map(([platform, count]) => {
                const color = getPlatformColor(platform);
                return (
                  <div key={platform} style={{ background: "#1e293b", borderRadius: 10,
                    padding: "12px 18px", borderLeft: `3px solid ${color}`,
                    display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                    onClick={() => { setTab("jobs"); setFilterPlatform(platform); }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color }}>{count}</span>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{platform}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Status breakdown */}
          {Object.keys(statusCounts).length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
              {Object.entries(statusCounts).map(([status, count]) => {
                const meta = STATUS_META[status];
                if (!meta) return null;
                return (
                  <div key={status} style={{ background: meta.bg, borderRadius: 8,
                    padding: "8px 14px", border: `1px solid ${meta.color}33`,
                    display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: meta.color }}>{count}</span>
                    <span style={{ fontSize: 11, color: meta.color, opacity: 0.8 }}>{meta.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent activity */}
          <div style={{ background: "#1e293b", borderRadius: 12, padding: 20 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: "#64748b",
              textTransform: "uppercase", letterSpacing: 1 }}>Recent Activity</h2>
            {logs.length === 0 && <p style={{ color: "#475569", fontSize: 13 }}>No activity yet. Click ▶ Start to begin.</p>}
            {logs.slice(0, 25).map((l) => (
              <div key={l.id} style={{ display: "flex", gap: 10, padding: "5px 0",
                borderBottom: "1px solid #0f172a", alignItems: "flex-start" }}>
                <span style={{ color: LEVEL_COLOR[l.level], fontWeight: 700, width: 14, flexShrink: 0, fontSize: 12 }}>{LEVEL_ICON[l.level]}</span>
                <span style={{ color: "#334155", fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }}>
                  {new Date(l.timestamp).toLocaleTimeString()}
                </span>
                <span style={{ color: LEVEL_COLOR[l.level], fontSize: 12 }}>{l.message}</span>
                {l.detail && <span style={{ color: "#475569", fontSize: 11 }}>{l.detail}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ══════════════════ JOBS TAB ══════════════════ */}
      {tab === "jobs" && (
        <div>
          {/* ── Search bar ── */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                color: "#475569", fontSize: 14 }}>🔍</span>
              <input
                placeholder="Search jobs, companies, locations…"
                value={jobSearch}
                onChange={(e) => { setJobSearch(e.target.value); fetchFoundJobs(e.target.value); }}
                style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 9,
                  padding: "10px 14px 10px 36px", color: "#e2e8f0", fontSize: 13, outline: "none",
                  boxSizing: "border-box" }}
              />
            </div>
            <span style={{ color: "#334155", fontSize: 12, whiteSpace: "nowrap" }}>
              {displayedJobs.length} / {foundJobs.length}
            </span>
          </div>

          {/* ── Sort buttons ── */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#475569", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: 1, marginRight: 4 }}>Sort</span>
            {SORT_OPTIONS.map((o) => (
              <SortBtn key={o.key} active={sortBy === o.key} onClick={() => setSortBy(o.key)}>
                {o.label}
              </SortBtn>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8,
              background: "#1e293b", borderRadius: 8, padding: "6px 12px", border: "1px solid #334155" }}>
              <span style={{ fontSize: 11, color: "#64748b" }}>Min ★</span>
              <input type="range" min={0} max={5} step={0.5} value={minScore}
                onChange={(e) => setMinScore(parseFloat(e.target.value))}
                style={{ width: 70, accentColor: "#818cf8" }} />
              <span style={{ fontSize: 12, color: scoreColor(minScore), fontWeight: 700, minWidth: 18 }}>{minScore}</span>
            </div>
          </div>

          {/* ── Location filter chips ── */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#475569", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: 1, marginRight: 4 }}>📍</span>
            {uniqueLocations.map((loc) => (
              <Chip key={loc} active={filterLocation === loc} color="#fb923c"
                onClick={() => setFilterLocation(loc)}>
                {loc}
              </Chip>
            ))}
          </div>

          {/* ── Platform filter chips ── */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#475569", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: 1, marginRight: 4 }}>Platform</span>
            {uniquePlatforms.map((plat) => (
              <Chip key={plat} active={filterPlatform === plat}
                color={getPlatformColor(plat)}
                onClick={() => setFilterPlatform(plat)}>
                {plat}
              </Chip>
            ))}
            <Chip active={filterEasyApply} color="#4ade80"
              onClick={() => setFilterEasyApply((v) => !v)}>
              ⚡ Easy Apply only
            </Chip>
          </div>

          {/* ── ATS info bar ── */}
          {atsCompanies && (
            <div style={{ background: "#1e1a2e", border: "1px solid #3b1a6b", borderRadius: 9,
              padding: "10px 16px", marginBottom: 12, fontSize: 12,
              color: "#7c3aed", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ color: "#a855f7", fontWeight: 700 }}>🏢 ATS Direct — {atsCompanies.total} companies</span>
              <span>Greenhouse ({atsCompanies.greenhouse?.length})</span>
              <span>Lever ({atsCompanies.lever?.length})</span>
              <span>Ashby ({atsCompanies.ashby?.length})</span>
            </div>
          )}

          {displayedJobs.length === 0 && (
            <div style={{ background: "#1e293b", borderRadius: 12, padding: 40,
              textAlign: "center", color: "#475569" }}>
              {foundJobs.length === 0
                ? "No jobs saved yet. Click ▶ Start to begin scanning."
                : "No jobs match your filters. Try adjusting the search or score slider."}
            </div>
          )}

          {/* ── Job cards ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {displayedJobs.map((job) => {
              const scoreC = scoreColor(job.score ?? 0);
              const borderColor = job.score >= 4 ? "#4ade80" : job.score >= 3 ? "#fbbf24" : "#1e293b";
              return (
                <div key={job.id}
                  style={{ background: "#1e293b", borderRadius: 12, padding: "14px 18px",
                    borderLeft: `3px solid ${borderColor}`,
                    transition: "transform .1s, box-shadow .1s", cursor: "default" }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,.3)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>

                  {/* Top row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: "#f1f5f9" }}>{job.title}</span>
                        <ScoreBadge score={job.score} label={job.scoreLabel} />
                        <PlatformBadge platform={job.platform} />
                        {job.atsProvider && <Tag color="#a855f7">{job.atsProvider}</Tag>}
                        {job.easyApply && (
                          <span style={{ background: "#14532d", color: "#4ade80", borderRadius: 5,
                            padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>⚡ Easy Apply</span>
                        )}
                        {job.workMode && <Tag color="#8b5cf6">{job.workMode}</Tag>}
                        {job.salary && <Tag color="#16a34a">💰 {job.salary}</Tag>}
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>
                        {job.company}
                        <span style={{ color: "#475569" }}> · </span>
                        <span style={{ color: "#fb923c" }}>{job.location}</span>
                        {job.via && <span style={{ color: "#334155" }}> · via {job.via}</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: "#334155", whiteSpace: "nowrap", marginLeft: 10 }}>
                      {new Date(job.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>

                  {/* Skills */}
                  {job.skills?.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                      {job.skills.slice(0, 7).map((s, i) => (
                        <span key={i} style={{ background: "#0f172a", color: "#93c5fd",
                          border: "1px solid #1e3a5f", borderRadius: 4, padding: "1px 7px", fontSize: 11 }}>{s}</span>
                      ))}
                      {job.skills.length > 7 && <span style={{ color: "#334155", fontSize: 11 }}>+{job.skills.length - 7}</span>}
                    </div>
                  )}

                  {/* Description snippet */}
                  {job.description && (
                    <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.5, marginBottom: 8,
                      maxHeight: 36, overflow: "hidden" }}>
                      {job.description.slice(0, 180)}{job.description.length > 180 ? "…" : ""}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <a href={job.url} target="_blank" rel="noreferrer"
                      style={{ padding: "5px 12px", background: "#4f46e5", color: "#fff",
                        borderRadius: 6, fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
                      Open ↗
                    </a>
                    <button onClick={() => copyToClipboard(job.url, `url-${job.id}`)}
                      style={{ padding: "5px 12px", background: "transparent",
                        border: "1px solid #334155",
                        color: copiedId === `url-${job.id}` ? "#4ade80" : "#64748b",
                        borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                      {copiedId === `url-${job.id}` ? "✓ Copied" : "Copy URL"}
                    </button>
                    <button onClick={() => copyToClipboard(
                      `Title: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\nPlatform: ${job.platform}\nURL: ${job.url}\nSalary: ${job.salary || "N/A"}\nScore: ${job.score}/5\nSkills: ${(job.skills || []).join(", ")}\n\n${job.description || ""}`,
                      `info-${job.id}`
                    )} style={{ padding: "5px 12px", background: "transparent",
                      border: "1px solid #334155",
                      color: copiedId === `info-${job.id}` ? "#4ade80" : "#64748b",
                      borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                      {copiedId === `info-${job.id}` ? "✓ Copied" : "Copy All"}
                    </button>
                    <button onClick={() => setSelectedJob(job)}
                      style={{ padding: "5px 12px", background: "transparent",
                        border: "1px solid #334155", color: "#818cf8",
                        borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                      Details
                    </button>
                    {job.platform === "ATS Direct" && (
                      <a href={job.url} target="_blank" rel="noreferrer"
                        style={{ padding: "5px 12px", background: "#3b0764",
                          color: "#c084fc", borderRadius: 6, fontSize: 11, fontWeight: 700,
                          textDecoration: "none", border: "1px solid #7c3aed" }}>
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

      {/* ══════════════════ APPLICATIONS ══════════════════ */}
      {tab === "applications" && (
        <div style={{ background: "#1e293b", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #0f172a",
            display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: "#64748b",
              textTransform: "uppercase", letterSpacing: 1, margin: 0 }}>
              Applications ({applications.length})
            </h2>
            <div style={{ display: "flex", gap: 8 }}>
              {Object.entries(statusCounts).map(([s, c]) => {
                const m = STATUS_META[s];
                return m ? (
                  <span key={s} style={{ background: m.bg, color: m.color, borderRadius: 6,
                    padding: "3px 9px", fontSize: 11, fontWeight: 600 }}>
                    {c} {m.label}
                  </span>
                ) : null;
              })}
            </div>
          </div>
          {applications.length === 0 && <p style={{ color: "#475569", fontSize: 13, padding: 20 }}>None yet.</p>}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#0f172a" }}>
                  {["Title", "Company", "Location", "Platform", "Score", "Salary", "Posted", "Status", ""].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11,
                      color: "#64748b", fontWeight: 700, textTransform: "uppercase",
                      whiteSpace: "nowrap", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <tr key={a.id} style={{ borderBottom: "1px solid #0f172a", transition: "background .1s" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#0f172a"}
                    onMouseLeave={(e) => e.currentTarget.style.background = ""}>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>
                      <button onClick={() => setSelectedJob(a)}
                        style={{ background: "none", border: "none", color: "#818cf8",
                          fontWeight: 600, cursor: "pointer", fontSize: 13, textAlign: "left", padding: 0 }}>
                        {a.title}
                      </button>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 13, color: "#e2e8f0" }}>{a.company}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#fb923c" }}>{a.location}</td>
                    <td style={{ padding: "10px 14px" }}><PlatformBadge platform={a.platform} /></td>
                    <td style={{ padding: "10px 14px" }}><ScoreBadge score={a.score} label={a.scoreLabel} /></td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#4ade80" }}>{a.salary || "—"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>
                      {a.postedAt ? new Date(a.postedAt).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ padding: "10px 14px" }}><StatusBadge status={a.status} /></td>
                    <td style={{ padding: "10px 14px" }}>
                      <button onClick={() => deleteApplication(a.id)}
                        style={{ background: "none", border: "none", color: "#334155",
                          cursor: "pointer", fontSize: 16, borderRadius: 4, padding: "2px 6px",
                          transition: "color .15s" }}
                        onMouseEnter={(e) => e.target.style.color = "#f87171"}
                        onMouseLeave={(e) => e.target.style.color = "#334155"}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════ LOGS ══════════════════ */}
      {tab === "logs" && (
        <div style={{ background: "#0a0f1a", borderRadius: 12, padding: 20,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 12, maxHeight: 600, overflowY: "auto",
          border: "1px solid #1e293b" }}>
          {logs.length === 0 && <span style={{ color: "#475569" }}>No logs yet.</span>}
          {logs.map((l) => (
            <div key={l.id} style={{ display: "flex", gap: 12, padding: "3px 0", alignItems: "flex-start" }}>
              <span style={{ color: "#334155", flexShrink: 0, fontSize: 11 }}>
                {new Date(l.timestamp).toLocaleString()}
              </span>
              <span style={{ color: LEVEL_COLOR[l.level], width: 60, flexShrink: 0, fontWeight: 700 }}>
                [{l.level.toUpperCase()}]
              </span>
              <span style={{ color: LEVEL_COLOR[l.level] }}>{l.message}</span>
              {l.detail && <span style={{ color: "#475569" }}>{l.detail}</span>}
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════ SETTINGS ══════════════════ */}
      {tab === "settings" && settingsForm && (
        <div style={{ maxWidth: 660 }}>
          <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginBottom: 16 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 20, color: "#64748b",
              textTransform: "uppercase", letterSpacing: 1 }}>Search Settings</h2>

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
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8, fontWeight: 600 }}>Platforms</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {Object.keys(PLATFORM_META).map((id) => (
                  <PlatformPill key={id} id={id}
                    active={settingsForm.platforms?.[id] !== false}
                    onChange={(pid, val) => setSettingsForm((f) => ({ ...f, platforms: { ...f.platforms, [pid]: val } }))} />
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <Field label="Interval (minutes)">
                <input type="number" min={1} max={60} value={settingsForm.intervalMinutes}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, intervalMinutes: parseInt(e.target.value) }))} />
              </Field>
              <Field label="Max jobs per run">
                <input type="number" min={1} max={50} value={settingsForm.maxApplicationsPerRun}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, maxApplicationsPerRun: parseInt(e.target.value) }))} />
              </Field>
              <Field label="Max browser opens / cycle">
                <input type="number" min={1} max={20} value={settingsForm.maxBrowserOpensPerCycle ?? 5}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, maxBrowserOpensPerCycle: parseInt(e.target.value) }))} />
              </Field>
            </div>

            <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={!!settingsForm.autoApplyEnabled}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, autoApplyEnabled: e.target.checked }))}
                  style={{ accentColor: "#4ade80" }} />
                <span style={{ fontSize: 13, color: "#94a3b8" }}>Enable LinkedIn / Indeed auto-apply</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={!!settingsForm.emailNotifications}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, emailNotifications: e.target.checked }))}
                  style={{ accentColor: "#818cf8" }} />
                <span style={{ fontSize: 13, color: "#94a3b8" }}>Email notifications</span>
              </label>
            </div>

            <Field label="Notification email">
              <input type="email" value={settingsForm.notifyEmail || ""}
                onChange={(e) => setSettingsForm((f) => ({ ...f, notifyEmail: e.target.value }))} />
            </Field>

            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <Btn onClick={saveSettings} primary>Save Settings</Btn>
              <Btn onClick={testEmail}>Test Email</Btn>
            </div>
          </div>

          {/* Simplify card */}
          <div style={{ background: "#1a0a2e", border: "1px solid #581c87", borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 22 }}>✨</span>
              <div>
                <div style={{ fontWeight: 700, color: "#c084fc", fontSize: 15 }}>Simplify Auto-Fill</div>
                <div style={{ color: "#7e22ce", fontSize: 12 }}>Auto-fills Workday, Greenhouse, Lever, Ashby — any job form</div>
              </div>
              <a href="https://simplify.jobs/chrome" target="_blank" rel="noreferrer"
                style={{ marginLeft: "auto", padding: "8px 16px", background: "#7c3aed",
                  color: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 700,
                  textDecoration: "none" }}>
                Install Free ↗
              </a>
            </div>
            <div style={{ fontSize: 12, color: "#6b21a8", lineHeight: 1.9 }}>
              <strong style={{ color: "#a855f7" }}>Setup (one time):</strong><br />
              1. Install Simplify from Chrome Web Store → Log in → fill your profile<br />
              2. Our bot opens each job in Chrome → Simplify fills every field in seconds<br />
              3. You just click <strong>Submit</strong><br /><br />
              <strong style={{ color: "#a855f7" }}>Mode:</strong>{" "}
              <code style={{ color: "#c084fc", background: "#1e0a3e", padding: "1px 6px", borderRadius: 4 }}>
                {settings?.simplifyMode || "shell"}
              </code>{" "}
              · <strong style={{ color: "#a855f7" }}>Auto-submit:</strong>{" "}
              <code style={{ color: "#c084fc", background: "#1e0a3e", padding: "1px 6px", borderRadius: 4 }}>
                {settings?.simplifyAutoSubmit ? "true" : "false"}
              </code>
              <div style={{ marginTop: 6, color: "#4a1272", fontSize: 11 }}>
                Change with SIMPLIFY_MODE and SIMPLIFY_AUTO_SUBMIT in .env
              </div>
            </div>
          </div>

          {/* Credentials */}
          <div style={{ background: "#1e293b", borderRadius: 12, padding: 18, fontSize: 12 }}>
            <div style={{ fontSize: 11, color: "#475569", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: 1, marginBottom: 12 }}>Credentials (.env)</div>
            {[
              ["APIFY_TOKEN",             settings?.apifyConfigured,    "scraping"],
              ["SERPAPI_KEY",             settings?.serpApiConfigured,   "Google Jobs"],
              ["LINKEDIN_EMAIL/PASSWORD", settings?.linkedinConfigured,  "auto-apply"],
              ["EMAIL_USER/PASS",         settings?.emailConfigured,     "notifications"],
            ].map(([key, ok, note]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 10,
                padding: "6px 0", borderBottom: "1px solid #0f172a" }}>
                <span style={{ color: ok ? "#4ade80" : "#f87171", fontWeight: 700, width: 14 }}>
                  {ok ? "✓" : "✕"}
                </span>
                <code style={{ color: "#94a3b8", flex: 1 }}>{key}</code>
                <span style={{ color: "#475569" }}>{note}</span>
              </div>
            ))}
            <div style={{ marginTop: 10, color: "#475569" }}>
              <code>RESUME_PATH</code> — {settings?.profile?.resumePath
                ? <span style={{ color: "#4ade80" }}>✓ configured</span>
                : <span style={{ color: "#f87171" }}>not set</span>}
            </div>
          </div>
        </div>
      )}

      {/* ── Job Modal ── */}
      <JobModal job={selectedJob} onClose={() => setSelectedJob(null)} onApply={handleApplyNow} />

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: "fixed", bottom: 28, right: 28,
          background: toast.type === "error" ? "#7f1d1d" : "#166534",
          color: toast.type === "error" ? "#fca5a5" : "#86efac",
          padding: "13px 22px", borderRadius: 10, fontWeight: 700, fontSize: 13,
          boxShadow: "0 8px 32px rgba(0,0,0,.5)", zIndex: 2000,
          animation: "slideUp .2s ease" }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        * { box-sizing: border-box; }
        body { background: #0f172a; color: #e2e8f0; margin: 0; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
}
