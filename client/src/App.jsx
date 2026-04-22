import { useState, useEffect, useCallback } from "react";

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

function scoreColor(score) {
  if (score >= 4.0) return "#4ade80";
  if (score >= 3.0) return "#86efac";
  if (score >= 2.0) return "#fbbf24";
  if (score >= 1.0) return "#fb923c";
  return "#f87171";
}

function ScoreBadge({ score, label }) {
  if (score == null) return null;
  const color = scoreColor(score);
  return (
    <span title={`Match score: ${score}/5 — ${label || ""}`}
      style={{ background: color + "22", color, border: `1px solid ${color}55`,
        borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700,
        display: "inline-flex", alignItems: "center", gap: 4 }}>
      ★ {score}
    </span>
  );
}

const STATUS_META = {
  "auto-applied":       { bg: "#14532d", color: "#4ade80",  label: "✓ Auto Applied" },
  "easy-apply-pending": { bg: "#1e3a5f", color: "#60a5fa",  label: "⚡ Easy Apply" },
  "simplify-opened":    { bg: "#2e1065", color: "#c084fc",  label: "✨ Simplify Filling" },
  "browser-opened":     { bg: "#1c1917", color: "#fb923c",  label: "🌐 Browser Opened" },
  "queued-manual":      { bg: "#1c1917", color: "#a8a29e",  label: "📋 Manual Queue" },
  "apply-failed":       { bg: "#450a0a", color: "#f87171",  label: "✕ Failed" },
};

function StatCard({ label, value, color = "#818cf8" }) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 12, padding: "20px 24px",
      flex: "1 1 130px", borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>{label}</div>
    </div>
  );
}

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

function StatusBadge({ status }) {
  const s = STATUS_META[status] || { bg: "#1e293b", color: "#94a3b8", label: status };
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 6,
      padding: "3px 9px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

function PlatformBadge({ platform }) {
  const entry = Object.values(PLATFORM_META).find((m) => m.label === platform);
  const color = entry?.color || "#475569";
  return (
    <span style={{ background: color + "22", color, borderRadius: 6,
      padding: "2px 8px", fontSize: 11, fontWeight: 600, border: `1px solid ${color}44` }}>
      {platform}
    </span>
  );
}

// ─── Job Detail Modal ─────────────────────────────────────────────────────────
function JobModal({ job, onClose, onApply }) {
  if (!job) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1e293b", borderRadius: 14,
        width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto", padding: 28 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>{job.title}</h2>
            <p style={{ color: "#94a3b8", fontSize: 14 }}>{job.company} · {job.location}</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569",
            fontSize: 22, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>

        {/* Meta row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
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
          <div style={{ marginBottom: 14, padding: "10px 14px", background: "#0f172a",
            borderRadius: 8, fontSize: 12 }}>
            <div style={{ color: "#475569", fontWeight: 700, marginBottom: 6, fontSize: 10,
              textTransform: "uppercase", letterSpacing: 1 }}>Match Breakdown</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span style={{ color: "#94a3b8" }}>Title: <strong style={{ color: scoreColor(job.score) }}>{job.scoreBreakdown.title}</strong></span>
              <span style={{ color: "#94a3b8" }}>Skills: <strong style={{ color: scoreColor(job.score) }}>{job.scoreBreakdown.skills?.toFixed(1)}</strong></span>
              <span style={{ color: "#94a3b8" }}>Location: <strong style={{ color: scoreColor(job.score) }}>{job.scoreBreakdown.location}</strong></span>
            </div>
            {job.scoreBreakdown.matchedSkills?.length > 0 && (
              <div style={{ marginTop: 6, color: "#64748b" }}>
                Matched: {job.scoreBreakdown.matchedSkills.join(", ")}
              </div>
            )}
          </div>
        )}

        {/* Skills */}
        {job.skills?.length > 0 && (
          <div style={{ marginBottom: 18 }}>
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
            <div style={{ marginTop: 8, background: "#0f172a", borderRadius: 8, padding: "14px 16px",
              fontSize: 13, color: "#94a3b8", lineHeight: 1.7, whiteSpace: "pre-wrap",
              maxHeight: 280, overflowY: "auto" }}>
              {job.description}
            </div>
          </div>
        )}

        {/* Auto-apply note */}
        {job.autoApplyNote && (
          <div style={{ marginBottom: 16, padding: "10px 14px", background: "#0f172a",
            borderRadius: 8, fontSize: 12, color: "#64748b" }}>
            <strong>Note:</strong> {job.autoApplyNote}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
          <a href={job.url} target="_blank" rel="noreferrer"
            style={{ flex: 1, minWidth: 140, display: "block", textAlign: "center", padding: "10px",
              background: "#4f46e5", color: "#fff", borderRadius: 8, fontWeight: 600,
              fontSize: 13, textDecoration: "none" }}>
            Open Job Posting ↗
          </a>
          {(job.status === "easy-apply-pending" || job.status === "apply-failed" || job.status === "queued-manual") && (
            <button onClick={() => onApply(job)} style={{ flex: 1, minWidth: 140, padding: "10px",
              background: "#166534", color: "#4ade80", borderRadius: 8, border: "none",
              fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              ⚡ Auto-Apply Now
            </button>
          )}
          {(job.platform === "ATS Direct" || job.status === "queued-manual" || job.status === "browser-opened") && (
            <a href={job.url} target="_blank" rel="noreferrer"
              style={{ flex: 1, minWidth: 140, display: "block", textAlign: "center", padding: "10px",
                background: "#3b0764", color: "#c084fc", borderRadius: 8, fontWeight: 600,
                fontSize: 13, textDecoration: "none", border: "1px solid #7c3aed" }}>
              ✨ Open + Simplify Fills
            </a>
          )}
        </div>
        {(job.platform === "ATS Direct" || job.status === "simplify-opened") && (
          <div style={{ marginTop: 10, fontSize: 11, color: "#6b21a8", textAlign: "center" }}>
            Simplify extension auto-fills the form when the page opens — just click Submit
          </div>
        )}
      </div>
    </div>
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
  return <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{children}</div>;
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [foundJobs, setFoundJobs] = useState([]);
  const [jobSearch, setJobSearch] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [atsCompanies, setAtsCompanies] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState({ applied: 0, found: 0, skipped: 0, errors: 0 });
  const [applications, setApplications] = useState([]);
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState(null);
  const [settingsForm, setSettingsForm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/status`);
      const data = await res.json();
      setIsRunning(data.isRunning);
      setStats(data.stats);
      setSettings(data.settings);
      setSettingsForm((prev) => prev ?? data.settings);
    } catch {}
  }, []);

  const fetchApplications = useCallback(async () => {
    try {
      const res = await fetch(`${API}/applications?limit=200`);
      const data = await res.json();
      setApplications(data.items || []);
    } catch {}
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`${API}/logs?limit=100`);
      setLogs(await res.json());
    } catch {}
  }, []);

  const fetchFoundJobs = useCallback(async (q = "") => {
    try {
      const res = await fetch(`${API}/jobs?limit=200${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      const data = await res.json();
      setFoundJobs(data.items || []);
    } catch {}
  }, []);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  // Fetch ATS company list once
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

  const toggleAutomation = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/${isRunning ? "stop" : "start"}`, { method: "POST" });
      const data = await res.json();
      if (data.ok) { setIsRunning(!isRunning); showToast(isRunning ? "Automation stopped" : "Automation started!"); }
      else showToast(data.message || "Action failed", "error");
    } catch { showToast("Cannot reach server", "error"); }
    setLoading(false);
  };

  const handleApplyNow = async (job) => {
    setSelectedJob(null);
    showToast(`Starting auto-apply for ${job.title}...`);
    try {
      await fetch(`${API}/apply/${job.id}`, { method: "POST" });
      showToast("Auto-apply running — watch the browser window!");
    } catch { showToast("Failed to trigger auto-apply", "error"); }
  };

  const saveSettings = async () => {
    try {
      const res = await fetch(`${API}/settings`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (data.ok) { setSettings(data.settings); showToast("Settings saved"); }
    } catch { showToast("Failed to save", "error"); }
  };

  const testEmail = async () => {
    try {
      const res = await fetch(`${API}/test-email`, { method: "POST" });
      const data = await res.json();
      showToast(data.ok ? "Test email sent!" : data.message, data.ok ? "success" : "error");
    } catch { showToast("Failed", "error"); }
  };

  const deleteApplication = async (id) => {
    await fetch(`${API}/applications/${id}`, { method: "DELETE" });
    setApplications((prev) => prev.filter((a) => a.id !== id));
  };

  const platformCounts = applications.reduce((acc, a) => {
    acc[a.platform] = (acc[a.platform] || 0) + 1; return acc;
  }, {});

  const easyApplyCount = applications.filter((a) =>
    a.status === "easy-apply-pending" || a.status === "auto-applied"
  ).length;

  const tabs = ["dashboard", "jobs", "applications", "logs", "settings"];

  return (
    <div style={{ maxWidth: 1140, margin: "0 auto", padding: "24px 16px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9" }}>Job Automation</h1>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
            {isRunning ? `Running — scanning every ${settings?.intervalMinutes ?? 5} min` : "Stopped"}
          </p>
        </div>
        <button onClick={toggleAutomation} disabled={loading}
          style={{ padding: "10px 28px", borderRadius: 8, border: "none",
            cursor: loading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 14,
            opacity: loading ? 0.6 : 1,
            background: isRunning ? "#7f1d1d" : "#166534",
            color: isRunning ? "#fca5a5" : "#86efac" }}>
          {loading ? "..." : isRunning ? "⏹ Stop" : "▶ Start"}
        </button>
      </div>

      {/* ── Search Targets banner ── */}
      {settings && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: "16px 20px",
          marginBottom: 20, display: "flex", gap: 32, flexWrap: "wrap" }}>
          <div>
            <SectionLabel>Job Titles ({settings.jobTitles?.length ?? 0})</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {(settings.jobTitles || []).map((t) => (
                <span key={t} style={{ background: "#818cf822", color: "#818cf8",
                  border: "1px solid #818cf844", borderRadius: 6, padding: "3px 10px", fontSize: 12 }}>{t}</span>
              ))}
            </div>
          </div>
          <div>
            <SectionLabel>Locations</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {(settings.locations || []).map((l) => (
                <span key={l} style={{ background: "#fb923c22", color: "#fb923c",
                  border: "1px solid #fb923c44", borderRadius: 6, padding: "3px 10px", fontSize: 12 }}>📍 {l}</span>
              ))}
            </div>
          </div>
          <div>
            <SectionLabel>Platforms</SectionLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {Object.entries(PLATFORM_META).map(([id, m]) => {
                const active = settings.platforms?.[id] !== false;
                return (
                  <span key={id} style={{
                    background: active ? m.color + "22" : "#0f172a",
                    color: active ? m.color : "#334155",
                    border: `1px solid ${active ? m.color + "55" : "#1e293b"}`,
                    borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>
                    {active ? "✓" : "✕"} {m.label}{platformCounts[m.label] ? ` (${platformCounts[m.label]})` : ""}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #1e293b" }}>
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 18px", borderRadius: "8px 8px 0 0", border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 600, textTransform: "capitalize",
            background: tab === t ? "#1e293b" : "transparent",
            color: tab === t ? "#818cf8" : "#64748b",
            borderBottom: tab === t ? "2px solid #818cf8" : "2px solid transparent" }}>
            {t}
            {t === "jobs" && foundJobs.length > 0 && (
              <span style={{ marginLeft: 6, background: "#4ade80", color: "#0f172a",
                borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>
                {foundJobs.length}
              </span>
            )}
            {t === "applications" && applications.length > 0 && (
              <span style={{ marginLeft: 6, background: "#818cf8", color: "#0f172a",
                borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>
                {applications.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Dashboard ── */}
      {tab === "dashboard" && (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
            <StatCard label="Total Found" value={stats.found} color="#60a5fa" />
            <StatCard label="Tracked" value={stats.applied} color="#818cf8" />
            <StatCard label="Easy Apply" value={easyApplyCount} color="#4ade80" />
            <StatCard label="Errors" value={stats.errors} color="#f87171" />
          </div>

          {Object.keys(platformCounts).length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
              {Object.entries(platformCounts).map(([platform, count]) => {
                const entry = Object.values(PLATFORM_META).find((m) => m.label === platform);
                const color = entry?.color || "#475569";
                return (
                  <div key={platform} style={{ background: "#1e293b", borderRadius: 8,
                    padding: "10px 16px", borderLeft: `3px solid ${color}`,
                    display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color }}>{count}</span>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{platform}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Easy Apply ready list */}
          {applications.filter((a) => a.status === "easy-apply-pending").length > 0 && (
            <div style={{ background: "#1e293b", borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: "#4ade80",
                textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>
                ⚡ Easy Apply Ready ({applications.filter((a) => a.status === "easy-apply-pending").length})
              </h2>
              {applications.filter((a) => a.status === "easy-apply-pending").slice(0, 8).map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 0", borderBottom: "1px solid #0f172a", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <button onClick={() => setSelectedJob(a)} style={{ background: "none", border: "none",
                      color: "#818cf8", fontWeight: 600, fontSize: 13, cursor: "pointer",
                      textAlign: "left", padding: 0 }}>{a.title}</button>
                    <span style={{ color: "#64748b", fontSize: 12 }}> · {a.company}</span>
                  </div>
                  <PlatformBadge platform={a.platform} />
                  <button onClick={() => handleApplyNow(a)}
                    style={{ padding: "5px 14px", background: "#166534", color: "#4ade80",
                      border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      whiteSpace: "nowrap" }}>
                    Apply ⚡
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ background: "#1e293b", borderRadius: 12, padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: "#64748b",
              textTransform: "uppercase", letterSpacing: 1 }}>Recent Activity</h2>
            {logs.length === 0 && <p style={{ color: "#475569", fontSize: 13 }}>No activity yet. Click Start to begin.</p>}
            {logs.slice(0, 20).map((l) => (
              <div key={l.id} style={{ display: "flex", gap: 10, padding: "6px 0",
                borderBottom: "1px solid #0f172a", alignItems: "flex-start" }}>
                <span style={{ color: LEVEL_COLOR[l.level], fontWeight: 700, width: 14, flexShrink: 0 }}>{LEVEL_ICON[l.level]}</span>
                <span style={{ color: "#475569", fontSize: 11, whiteSpace: "nowrap", flexShrink: 0 }}>
                  {new Date(l.timestamp).toLocaleTimeString()}
                </span>
                <span style={{ color: LEVEL_COLOR[l.level], fontSize: 13 }}>{l.message}</span>
                {l.detail && <span style={{ color: "#475569", fontSize: 12 }}>{l.detail}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Jobs (all scraped, for manual review) ── */}
      {tab === "jobs" && (
        <div>
          {/* Search + filter bar */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            <input
              placeholder="Search jobs, companies, locations…"
              value={jobSearch}
              onChange={(e) => { setJobSearch(e.target.value); fetchFoundJobs(e.target.value); }}
              style={{ flex: 1, minWidth: 200, background: "#1e293b", border: "1px solid #334155", borderRadius: 8,
                padding: "9px 14px", color: "#e2e8f0", fontSize: 13, outline: "none" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#1e293b",
              borderRadius: 8, padding: "7px 14px", border: "1px solid #334155" }}>
              <span style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>Min score ★</span>
              <input type="range" min={0} max={5} step={0.5} value={minScore}
                onChange={(e) => setMinScore(parseFloat(e.target.value))}
                style={{ width: 80, accentColor: "#818cf8" }} />
              <span style={{ fontSize: 12, color: scoreColor(minScore), fontWeight: 700, width: 20 }}>{minScore}</span>
            </div>
            <span style={{ color: "#475569", fontSize: 13, whiteSpace: "nowrap" }}>
              {foundJobs.filter((j) => (j.score ?? 0) >= minScore).length} / {foundJobs.length} jobs
            </span>
          </div>

          {/* ATS companies info bar */}
          {atsCompanies && (
            <div style={{ background: "#1e293b", borderRadius: 8, padding: "10px 16px",
              marginBottom: 12, fontSize: 12, color: "#64748b", display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span style={{ color: "#a855f7", fontWeight: 600 }}>🏢 ATS Direct</span>
              <span>Greenhouse: {atsCompanies.greenhouse?.length} companies</span>
              <span>Lever: {atsCompanies.lever?.length} companies</span>
              <span>Ashby: {atsCompanies.ashby?.length} companies</span>
              <span style={{ color: "#475569" }}>OpenAI · Anthropic · Databricks · Expedia · Stripe · Palantir · Scale AI · Cohere + more</span>
            </div>
          )}

          {foundJobs.length === 0 && (
            <div style={{ background: "#1e293b", borderRadius: 12, padding: 32, textAlign: "center", color: "#475569" }}>
              No jobs saved yet. Click ▶ Start on the dashboard to begin scanning.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {foundJobs.filter((j) => (j.score ?? 0) >= minScore).map((job) => (
              <div key={job.id} style={{ background: "#1e293b", borderRadius: 12, padding: "16px 20px",
                borderLeft: job.score >= 4 ? "3px solid #4ade80" : job.score >= 3 ? "3px solid #fbbf24" : "3px solid #1e293b" }}>
                {/* Top row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>{job.title}</span>
                      <ScoreBadge score={job.score} label={job.scoreLabel} />
                      <PlatformBadge platform={job.platform} />
                      {job.atsProvider && <Tag color="#a855f7">{job.atsProvider}</Tag>}
                      {job.easyApply && <span style={{ background: "#14532d", color: "#4ade80", borderRadius: 5, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>⚡ Easy Apply</span>}
                      {job.workMode && <Tag color="#8b5cf6">{job.workMode}</Tag>}
                      {job.salary && <Tag color="#16a34a">💰 {job.salary}</Tag>}
                    </div>
                    <div style={{ fontSize: 13, color: "#94a3b8" }}>
                      {job.company} · {job.location}
                      {job.via && <span style={{ color: "#475569" }}> · via {job.via}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#334155", whiteSpace: "nowrap", marginLeft: 12 }}>
                    {new Date(job.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>

                {/* Skills */}
                {job.skills?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                    {job.skills.slice(0, 8).map((s, i) => (
                      <span key={i} style={{ background: "#0f172a", color: "#93c5fd", border: "1px solid #1e3a5f",
                        borderRadius: 5, padding: "2px 8px", fontSize: 11 }}>{s}</span>
                    ))}
                    {job.skills.length > 8 && <span style={{ color: "#475569", fontSize: 11 }}>+{job.skills.length - 8} more</span>}
                  </div>
                )}

                {/* Description snippet */}
                {job.description && (
                  <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6, marginBottom: 10,
                    maxHeight: 60, overflow: "hidden", position: "relative" }}>
                    {job.description.slice(0, 200)}{job.description.length > 200 ? "…" : ""}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a href={job.url} target="_blank" rel="noreferrer"
                    style={{ padding: "6px 14px", background: "#4f46e5", color: "#fff",
                      borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                    Open Job ↗
                  </a>
                  <button onClick={() => copyToClipboard(job.url, `url-${job.id}`)}
                    style={{ padding: "6px 14px", background: "#1e293b", border: "1px solid #334155",
                      color: copiedId === `url-${job.id}` ? "#4ade80" : "#94a3b8",
                      borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {copiedId === `url-${job.id}` ? "✓ Copied!" : "Copy URL"}
                  </button>
                  <button onClick={() => copyToClipboard(
                    `Job Title: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\nPlatform: ${job.platform}\nURL: ${job.url}\nSalary: ${job.salary || "N/A"}\nSkills: ${(job.skills || []).join(", ")}\n\nDescription:\n${job.description || ""}`, `info-${job.id}`
                  )}
                    style={{ padding: "6px 14px", background: "#1e293b", border: "1px solid #334155",
                      color: copiedId === `info-${job.id}` ? "#4ade80" : "#94a3b8",
                      borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {copiedId === `info-${job.id}` ? "✓ Copied!" : "Copy All Info"}
                  </button>
                  <button onClick={() => setSelectedJob(job)}
                    style={{ padding: "6px 14px", background: "#1e293b", border: "1px solid #334155",
                      color: "#94a3b8", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Full Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Applications ── */}
      {tab === "applications" && (
        <div style={{ background: "#1e293b", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #0f172a" }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>
              All Applications ({applications.length})
            </h2>
          </div>
          {applications.length === 0 && <p style={{ color: "#475569", fontSize: 13, padding: 20 }}>None yet.</p>}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#0f172a" }}>
                  {["Title", "Company", "Location", "Platform", "Skills", "Salary", "Posted", "Status", ""].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11,
                      color: "#64748b", fontWeight: 600, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <tr key={a.id} style={{ borderBottom: "1px solid #0f172a" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#0f172a"}
                    onMouseLeave={(e) => e.currentTarget.style.background = ""}>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>
                      <button onClick={() => setSelectedJob(a)}
                        style={{ background: "none", border: "none", color: "#818cf8",
                          fontWeight: 500, cursor: "pointer", fontSize: 13, textAlign: "left", padding: 0 }}>
                        {a.title}
                      </button>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>{a.company}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#94a3b8" }}>{a.location}</td>
                    <td style={{ padding: "10px 14px" }}><PlatformBadge platform={a.platform} /></td>
                    <td style={{ padding: "10px 14px", fontSize: 11, color: "#64748b", maxWidth: 160 }}>
                      {a.skills?.slice(0, 3).join(", ") || "—"}
                      {a.skills?.length > 3 ? ` +${a.skills.length - 3}` : ""}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#4ade80" }}>{a.salary || "—"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>
                      {a.postedAt ? new Date(a.postedAt).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ padding: "10px 14px" }}><StatusBadge status={a.status} /></td>
                    <td style={{ padding: "10px 14px" }}>
                      <button onClick={() => deleteApplication(a.id)}
                        style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 16 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Logs ── */}
      {tab === "logs" && (
        <div style={{ background: "#0f172a", borderRadius: 12, padding: 20, fontFamily: "monospace",
          fontSize: 12, maxHeight: 600, overflowY: "auto" }}>
          {logs.length === 0 && <span style={{ color: "#475569" }}>No logs yet.</span>}
          {logs.map((l) => (
            <div key={l.id} style={{ display: "flex", gap: 12, padding: "3px 0", color: LEVEL_COLOR[l.level] }}>
              <span style={{ color: "#334155", flexShrink: 0 }}>{new Date(l.timestamp).toLocaleString()}</span>
              <span style={{ color: "#64748b", width: 64, flexShrink: 0 }}>[{l.level.toUpperCase()}]</span>
              <span>{l.message}{l.detail ? ` — ${l.detail}` : ""}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Settings ── */}
      {tab === "settings" && settingsForm && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, maxWidth: 640 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 20, color: "#64748b",
            textTransform: "uppercase", letterSpacing: 1 }}>Settings</h2>

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
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8, fontWeight: 600 }}>Platforms to Search</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {Object.keys(PLATFORM_META).map((id) => (
                <PlatformPill key={id} id={id}
                  active={settingsForm.platforms?.[id] !== false}
                  onChange={(pid, val) => setSettingsForm((f) => ({ ...f, platforms: { ...f.platforms, [pid]: val } }))} />
              ))}
            </div>
            {atsCompanies && (
              <div style={{ marginTop: 8, fontSize: 11, color: "#475569" }}>
                ATS Direct covers {atsCompanies.total} companies: {[...(atsCompanies.greenhouse || []), ...(atsCompanies.lever || []), ...(atsCompanies.ashby || [])].slice(0, 6).join(", ")} + more
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 14 }}>
            <Field label="Interval (minutes)" style={{ flex: 1 }}>
              <input type="number" min={1} max={60} value={settingsForm.intervalMinutes}
                onChange={(e) => setSettingsForm((f) => ({ ...f, intervalMinutes: parseInt(e.target.value) }))} />
            </Field>
            <Field label="Max jobs per run" style={{ flex: 1 }}>
              <input type="number" min={1} max={50} value={settingsForm.maxApplicationsPerRun}
                onChange={(e) => setSettingsForm((f) => ({ ...f, maxApplicationsPerRun: parseInt(e.target.value) }))} />
            </Field>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <input type="checkbox" id="autoApply" checked={!!settingsForm.autoApplyEnabled}
              onChange={(e) => setSettingsForm((f) => ({ ...f, autoApplyEnabled: e.target.checked }))} />
            <label htmlFor="autoApply" style={{ fontSize: 13, color: "#94a3b8" }}>
              Enable LinkedIn Easy Apply automation (requires credentials in .env)
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <input type="checkbox" id="emailNotif" checked={!!settingsForm.emailNotifications}
              onChange={(e) => setSettingsForm((f) => ({ ...f, emailNotifications: e.target.checked }))} />
            <label htmlFor="emailNotif" style={{ fontSize: 13, color: "#94a3b8" }}>Enable email notifications</label>
          </div>

          <Field label="Notification email">
            <input type="email" value={settingsForm.notifyEmail || ""}
              onChange={(e) => setSettingsForm((f) => ({ ...f, notifyEmail: e.target.value }))} />
          </Field>

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Btn onClick={saveSettings} primary>Save Settings</Btn>
            <Btn onClick={testEmail}>Test Email</Btn>
          </div>

          {/* Simplify setup card */}
          <div style={{ marginTop: 20, background: "#1a0a2e", border: "1px solid #581c87",
            borderRadius: 10, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 20 }}>✨</span>
              <div>
                <div style={{ fontWeight: 700, color: "#c084fc", fontSize: 14 }}>Simplify Auto-Fill</div>
                <div style={{ color: "#7e22ce", fontSize: 12 }}>Fills Workday, Greenhouse, Lever, Ashby forms automatically</div>
              </div>
              <a href="https://simplify.jobs/chrome" target="_blank" rel="noreferrer"
                style={{ marginLeft: "auto", padding: "7px 14px", background: "#7c3aed",
                  color: "#fff", borderRadius: 7, fontSize: 12, fontWeight: 700,
                  textDecoration: "none", whiteSpace: "nowrap" }}>
                Install Free ↗
              </a>
            </div>
            <div style={{ fontSize: 12, color: "#6b21a8", lineHeight: 1.8 }}>
              <strong style={{ color: "#a855f7" }}>How it works:</strong><br />
              1. Install Simplify Chrome extension (free) and log in<br />
              2. Fill your profile once in Simplify<br />
              3. Our bot opens each job in Chrome → Simplify fills every field instantly<br />
              4. You just click <strong>Submit</strong> (or set <code>SIMPLIFY_AUTO_SUBMIT=true</code> to auto-submit)<br /><br />
              <strong style={{ color: "#a855f7" }}>Current mode:</strong>{" "}
              <code style={{ color: "#c084fc" }}>{settings?.simplifyMode || "shell"}</code>
              {settings?.simplifyMode === "shell"
                ? " — opens jobs in your running Chrome (recommended)"
                : " — Playwright controls Chrome (can auto-submit)"}
            </div>
          </div>

          <div style={{ marginTop: 14, padding: 14, background: "#0f172a", borderRadius: 8,
            fontSize: 12, color: "#64748b", lineHeight: 1.9 }}>
            <strong style={{ color: "#475569" }}>Credentials</strong> (set in <code>.env</code>, never sent to browser)<br />
            <code>APIFY_TOKEN</code> — {settings?.apifyConfigured ? "✓ configured" : "not set"}<br />
            <code>SERPAPI_KEY</code> — {settings?.serpApiConfigured ? "✓ configured" : "not set"}<br />
            <code>LINKEDIN_EMAIL / PASSWORD</code> — {settings?.linkedinConfigured ? "✓ configured" : "⚠ not set — needed for auto-apply"}<br />
            <code>EMAIL_USER / EMAIL_PASS</code> — {settings?.emailConfigured ? "✓ configured" : "not set"}<br />
            <code>RESUME_PATH</code> — {settings?.profile?.resumePath ? "✓ " + settings.profile.resumePath : "not set"}<br />
            <code>SIMPLIFY_MODE</code> — {settings?.simplifyMode || "shell"} | <code>SIMPLIFY_AUTO_SUBMIT</code> — {settings?.simplifyAutoSubmit ? "true" : "false"}
          </div>
        </div>
      )}

      {/* ── Job Detail Modal ── */}
      <JobModal job={selectedJob} onClose={() => setSelectedJob(null)} onApply={handleApplyNow} />

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24,
          background: toast.type === "error" ? "#7f1d1d" : "#166534",
          color: toast.type === "error" ? "#fca5a5" : "#86efac",
          padding: "12px 20px", borderRadius: 8, fontWeight: 600, fontSize: 13,
          boxShadow: "0 4px 20px rgba(0,0,0,.4)", zIndex: 2000 }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 14, ...style }}>
      <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 5, fontWeight: 600 }}>{label}</label>
      <style>{`
        .fc input, .fc textarea { width:100%; background:#0f172a; border:1px solid #334155;
          border-radius:6px; padding:8px 10px; color:#e2e8f0; font-size:13px; outline:none; resize:vertical; }
        .fc input:focus, .fc textarea:focus { border-color:#818cf8; }
      `}</style>
      <div className="fc">{children}</div>
    </div>
  );
}

function Btn({ onClick, children, primary }) {
  return (
    <button onClick={onClick} style={{ padding: "9px 20px", borderRadius: 7, border: "none",
      cursor: "pointer", fontSize: 13, fontWeight: 600,
      background: primary ? "#4f46e5" : "#0f172a", color: primary ? "#fff" : "#94a3b8" }}>
      {children}
    </button>
  );
}
