/**
 * OneTouch Apply — Popup Script
 */

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const id = tab.dataset.tab;
    document.getElementById("tab-profile").style.display = id === "profile" ? "" : "none";
    document.getElementById("tab-actions").style.display = id === "actions" ? "" : "none";
    if (id === "actions") detectCurrentJob();
  });
});

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = "info", duration = 2500) {
  const t = document.getElementById("popup-toast");
  t.textContent = msg;
  t.className = `show ${type}`;
  setTimeout(() => t.className = "", duration);
}

// ── Load stats from background ────────────────────────────────────────────────
chrome.runtime.sendMessage({ type: "GET_STATS" }, (resp) => {
  if (resp?.ok) {
    document.getElementById("s-found").textContent   = resp.stats?.found ?? "—";
    document.getElementById("s-applied").textContent = resp.stats?.applied ?? "—";
    document.getElementById("status-dot").classList.toggle("running", resp.stats?.isRunning);
  }
  // Today count from badge
  chrome.action.getBadgeText({}, (text) => {
    document.getElementById("s-today").textContent = text || "0";
  });
});

// ── Load profile ──────────────────────────────────────────────────────────────
chrome.storage.sync.get("profile", ({ profile }) => {
  if (!profile) return;
  const set = (id, val) => { if (val) document.getElementById(id).value = val; };
  set("f-name",     profile.name);
  set("f-email",    profile.email);
  set("f-phone",    profile.phone);
  set("f-location", profile.location);
  set("f-linkedin", profile.linkedinUrl);
  set("f-github",   profile.github);
  set("f-salary",   profile.expectedSalary);
  set("f-exp",      profile.yearsExperience);
  set("f-school",   profile.school);
  const degreeStr = [profile.degree, profile.major].filter(Boolean).join(" ");
  if (degreeStr) document.getElementById("f-degree").value = degreeStr;
  if (Array.isArray(profile.skills)) document.getElementById("f-skills").value = profile.skills.join(", ");
  else if (profile.skills) set("f-skills", profile.skills);
  set("f-roles",   profile.targetRoles);
  if (profile.remotePreference) document.getElementById("f-remote").value = profile.remotePreference;
  set("f-summary", profile.summary);
  set("f-cover",   profile.coverLetter);
});

// Check local storage for resume (stored separately to avoid 100KB sync limit)
chrome.storage.local.get(["resumeData", "resumeFileName"], ({ resumeFileName }) => {
  if (resumeFileName) {
    document.getElementById("resume-name").textContent = `✓ ${resumeFileName}`;
    document.getElementById("resume-name").style.display = "";
    document.getElementById("resume-zone").classList.add("has-file");
  }
});

// ── Save profile ──────────────────────────────────────────────────────────────
document.getElementById("save-btn").addEventListener("click", async () => {
  const nameVal   = document.getElementById("f-name").value.trim();
  const degreeVal = document.getElementById("f-degree").value.trim();
  const skillsRaw = document.getElementById("f-skills").value.trim();
  const profile = {
    name:             nameVal,
    firstName:        nameVal.split(" ")[0],
    lastName:         nameVal.split(" ").slice(-1)[0],
    email:            document.getElementById("f-email").value.trim(),
    phone:            document.getElementById("f-phone").value.trim(),
    location:         document.getElementById("f-location").value.trim(),
    linkedinUrl:      document.getElementById("f-linkedin").value.trim(),
    github:           document.getElementById("f-github").value.trim(),
    expectedSalary:   document.getElementById("f-salary").value.trim(),
    yearsExperience:  document.getElementById("f-exp").value.trim(),
    school:           document.getElementById("f-school").value.trim(),
    degree:           degreeVal.split(" ")[0] || "Bachelor's",
    major:            degreeVal.includes(" ") ? degreeVal.split(" ").slice(1).join(" ") : degreeVal,
    skills:           skillsRaw ? skillsRaw.split(",").map(s => s.trim()).filter(Boolean) : [],
    targetRoles:      document.getElementById("f-roles").value.trim(),
    remotePreference: document.getElementById("f-remote").value,
    summary:          document.getElementById("f-summary").value.trim(),
    coverLetter:      document.getElementById("f-cover").value.trim(),
    zipCode:          "98101",
    savedAt:          new Date().toISOString(),
  };

  // Preserve resumeFileName reference in sync profile (actual data is in local storage)
  chrome.storage.local.get("resumeFileName", ({ resumeFileName }) => {
    if (resumeFileName) profile.resumeFileName = resumeFileName;
    chrome.runtime.sendMessage({ type: "SAVE_PROFILE", profile }, () => {
      showToast("✅ Profile saved!", "success");
    });
  });
});

// ── Resume upload ─────────────────────────────────────────────────────────────
document.getElementById("resume-zone").addEventListener("click", () => {
  document.getElementById("resume-input").click();
});

document.getElementById("resume-zone").addEventListener("dragover", (e) => {
  e.preventDefault();
  document.getElementById("resume-zone").style.borderColor = "#6366f1";
});

document.getElementById("resume-zone").addEventListener("drop", (e) => {
  e.preventDefault();
  handleResumeFile(e.dataTransfer.files[0]);
});

document.getElementById("resume-input").addEventListener("change", (e) => {
  handleResumeFile(e.target.files[0]);
});

function handleResumeFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const resumeData = ev.target.result;
    // Store resume in local storage (no 100KB sync limit)
    chrome.storage.local.set({ resumeData, resumeFileName: file.name }, () => {
      // Also update fileName reference in sync profile
      chrome.storage.sync.get("profile", ({ profile }) => {
        const updated = { ...(profile || {}), resumeFileName: file.name };
        chrome.storage.sync.set({ profile: updated });
      });
      document.getElementById("resume-name").textContent = `✓ ${file.name}`;
      document.getElementById("resume-name").style.display = "";
      document.getElementById("resume-zone").classList.add("has-file");
      showToast("📄 Resume saved!", "success");
    });
  };
  reader.readAsDataURL(file);
}

// ── Detect current job ────────────────────────────────────────────────────────
function detectCurrentJob() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;
    const url = tab.url || "";
    const title = tab.title || "";

    const isJobSite = [
      "linkedin.com/jobs", "indeed.com", "greenhouse.io", "lever.co",
      "ashbyhq.com", "myworkdayjobs.com", "glassdoor.com", "ziprecruiter.com",
    ].some((s) => url.includes(s));

    if (isJobSite) {
      document.getElementById("cj-title").textContent = title.split(" | ")[0] || title;
      document.getElementById("cj-meta").textContent = new URL(url).hostname;
      document.getElementById("fill-btn").disabled = false;
    } else {
      document.getElementById("cj-title").textContent = "No job page detected";
      document.getElementById("cj-meta").textContent = "Navigate to a supported job site";
      document.getElementById("fill-btn").disabled = true;
    }
  });
}

// ── Fill form on active tab ───────────────────────────────────────────────────
document.getElementById("fill-btn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => document.getElementById("onetouch-btn")?.click(),
    });
    showToast("⚡ Filling form…", "info");
    window.close();
  });
});

// ── Scan & Dashboard ──────────────────────────────────────────────────────────
document.getElementById("scan-btn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "TRIGGER_SCAN" }, (resp) => {
    showToast(resp?.ok ? "🔍 Scan started!" : "⚠ Couldn't reach server", resp?.ok ? "success" : "error");
  });
});

document.getElementById("dashboard-btn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
  window.close();
});
