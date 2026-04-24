/**
 * OneTouch Apply — Content Script
 * Injected into every supported job page.
 * Detects the job, injects the floating button, handles one-touch apply.
 */

const API_BASE = "http://localhost:3004/api";
const DEBOUNCE_MS = 800;

// ── Site detectors ────────────────────────────────────────────────────────────
const SITES = {
  linkedin:    () => location.hostname.includes("linkedin.com"),
  indeed:      () => location.hostname.includes("indeed.com"),
  greenhouse:  () => location.hostname.includes("greenhouse.io"),
  lever:       () => location.hostname.includes("lever.co"),
  ashby:       () => location.hostname.includes("ashbyhq.com"),
  workday:     () => location.hostname.includes("myworkdayjobs.com") || location.hostname.includes("workday.com"),
  glassdoor:   () => location.hostname.includes("glassdoor.com"),
  ziprecruiter:() => location.hostname.includes("ziprecruiter.com"),
  dice:        () => location.hostname.includes("dice.com"),
  wellfound:   () => location.hostname.includes("wellfound.com"),
};

function detectSite() {
  return Object.keys(SITES).find((k) => SITES[k]()) || "other";
}

// ── Job data scrapers per site ────────────────────────────────────────────────
function scrapeJobData() {
  const site = detectSite();
  const url = location.href;
  const base = { url, site, scrapedAt: new Date().toISOString() };

  if (site === "linkedin") {
    return {
      ...base,
      title:    getText(".job-details-jobs-unified-top-card__job-title, h1.t-24") || document.title,
      company:  getText(".job-details-jobs-unified-top-card__company-name, .topcard__org-name-link"),
      location: getText(".job-details-jobs-unified-top-card__bullet, .topcard__flavor--bullet"),
      easyApply: !!document.querySelector("button.jobs-apply-button[aria-label*='Easy Apply']"),
      platform: "LinkedIn",
    };
  }
  if (site === "indeed") {
    return {
      ...base,
      title:    getText("h1.jobsearch-JobInfoHeader-title, h1[data-testid='jobsearch-JobInfoHeader-title']") || document.title,
      company:  getText("[data-testid='inlineHeader-companyName'] a, .icl-u-lg-mr--sm"),
      location: getText("[data-testid='inlineHeader-companyLocation']"),
      platform: "Indeed",
    };
  }
  if (site === "greenhouse") {
    return {
      ...base,
      title:    getText("h1.app-title") || document.title,
      company:  getText(".company-name") || location.hostname,
      location: getText(".location") || getText(".offices"),
      platform: "Greenhouse",
      atsProvider: "Greenhouse",
    };
  }
  if (site === "lever") {
    return {
      ...base,
      title:    getText(".posting-headline h2") || document.title,
      company:  getText(".main-header-logo img")?.alt || location.pathname.split("/")[1],
      location: getText(".posting-categories .location"),
      platform: "Lever",
      atsProvider: "Lever",
    };
  }
  if (site === "ashby") {
    return {
      ...base,
      title:    getText("h1") || document.title,
      company:  getText(".ashby-job-posting-company-name") || document.title.split(" at ")[1],
      location: getText(".ashby-job-posting-brief-location"),
      platform: "Ashby",
      atsProvider: "Ashby",
    };
  }
  if (site === "workday") {
    return {
      ...base,
      title:    getText("[data-automation-id='jobPostingHeader'], h2[data-automation-id]") || document.title,
      company:  document.title.split("|").pop()?.trim() || "",
      location: getText("[data-automation-id='locations']"),
      platform: "Workday",
      atsProvider: "Workday",
    };
  }
  // Generic fallback
  return {
    ...base,
    title:    getText("h1") || document.title,
    company:  getText("[class*='company'], [class*='employer'], [itemprop='hiringOrganization']") || "",
    location: getText("[class*='location'], [itemprop='jobLocation']") || "",
    platform: "Other",
  };
}

function getText(selector) {
  return document.querySelector(selector)?.innerText?.trim() || "";
}

// ── Form filler ───────────────────────────────────────────────────────────────
async function getProfile() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("profile", (d) => resolve(d.profile || {}));
  });
}

async function fillForms() {
  const profile = await getProfile();
  const site = detectSite();
  let filled = 0;

  // ── Text inputs ──
  const inputs = document.querySelectorAll(
    "input[type='text'], input[type='email'], input[type='tel'], input[type='url'], input[type='number']"
  );
  for (const input of inputs) {
    if (input.value) continue;
    const label = getLabelText(input).toLowerCase();
    let val = inferValue(label, profile);
    if (val) { await setNativeValue(input, val); filled++; }
  }

  // ── Textareas ──
  const areas = document.querySelectorAll("textarea");
  for (const area of areas) {
    if (area.value) continue;
    const label = getLabelText(area).toLowerCase();
    if (label.includes("cover") || label.includes("letter") || label.includes("message")) {
      if (profile.coverLetter) { await setNativeValue(area, profile.coverLetter); filled++; }
    } else if (label.includes("summary") || label.includes("about")) {
      if (profile.summary) { await setNativeValue(area, profile.summary); filled++; }
    }
  }

  // ── Selects / dropdowns ──
  const selects = document.querySelectorAll("select");
  for (const sel of selects) {
    if (sel.value) continue;
    const label = getLabelText(sel).toLowerCase();
    if (label.includes("country")) setSelectByText(sel, "United States");
    else if (label.includes("authorize") || label.includes("work")) setSelectByIndex(sel, 1);
    else if (label.includes("gender") || label.includes("pronoun")) setSelectByText(sel, "Prefer not to say");
    else if (label.includes("race") || label.includes("ethnicity")) setSelectByText(sel, "Decline to state");
    else if (label.includes("veteran")) setSelectByText(sel, "I am not a protected veteran");
    else if (label.includes("disability")) setSelectByText(sel, "I do not have a disability");
    filled++;
  }

  // ── Yes/No radios ──
  for (const radio of document.querySelectorAll("input[type='radio']")) {
    const label = getLabelText(radio).toLowerCase();
    if (label === "yes" || label === "no") {
      const groupLabel = getGroupLabel(radio).toLowerCase();
      const shouldCheckYes =
        groupLabel.includes("authorize") || groupLabel.includes("eligible") ||
        groupLabel.includes("legally") || groupLabel.includes("work in");
      if ((shouldCheckYes && label === "yes") || (!shouldCheckYes && label === "no")) {
        radio.click(); filled++;
      }
    }
  }

  // ── Resume upload ──
  if (profile.resumeData && profile.resumeFileName) {
    const fileInputs = document.querySelectorAll("input[type='file']");
    for (const fi of fileInputs) {
      if (fi.accept?.includes("pdf") || fi.accept?.includes("doc") || !fi.accept) {
        try {
          const blob = dataURLtoBlob(profile.resumeData);
          const file = new File([blob], profile.resumeFileName, { type: blob.type });
          const dt = new DataTransfer();
          dt.items.add(file);
          fi.files = dt.files;
          fi.dispatchEvent(new Event("change", { bubbles: true }));
          filled++;
        } catch {}
      }
    }
  }

  return filled;
}

function inferValue(label, profile) {
  if (label.includes("first name") || label === "first") return profile.firstName || profile.name?.split(" ")[0] || "";
  if (label.includes("last name") || label === "last") return profile.lastName || profile.name?.split(" ").slice(-1)[0] || "";
  if (label.includes("full name") || label === "name") return profile.name || "";
  if (label.includes("email")) return profile.email || "";
  if (label.includes("phone") || label.includes("mobile")) return profile.phone || "";
  if (label.includes("city") || label.includes("location")) return profile.location || "Seattle, WA";
  if (label.includes("linkedin")) return profile.linkedinUrl || "";
  if (label.includes("github")) return profile.github || "";
  if (label.includes("portfolio") || label.includes("website")) return profile.website || "";
  if (label.includes("year") && label.includes("experience")) return profile.yearsExperience || "3";
  if (label.includes("salary") || label.includes("expected comp")) return profile.expectedSalary || "";
  if (label.includes("start date") || label.includes("available")) return "2 weeks";
  if (label.includes("zip") || label.includes("postal")) return profile.zipCode || "98101";
  return "";
}

function getLabelText(el) {
  if (el.id) {
    const lbl = document.querySelector(`label[for="${el.id}"]`);
    if (lbl) return lbl.innerText.trim();
  }
  const parent = el.closest("label, [class*='field'], [class*='form-group'], [class*='input-container']");
  if (parent) {
    const lbl = parent.querySelector("label, [class*='label'], legend");
    if (lbl && lbl !== el) return lbl.innerText.trim();
  }
  return el.placeholder || el.getAttribute("aria-label") || el.name || "";
}

function getGroupLabel(radio) {
  const fieldset = radio.closest("fieldset");
  if (fieldset) return fieldset.querySelector("legend")?.innerText || "";
  const parent = radio.closest("[class*='field'], [class*='form-group'], [class*='question']");
  return parent?.querySelector("[class*='label'], p, h3, h4")?.innerText || "";
}

async function setNativeValue(el, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
    || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input",  { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur",   { bubbles: true }));
  await sleep(60);
}

function setSelectByText(sel, text) {
  const opt = [...sel.options].find((o) => o.text.toLowerCase().includes(text.toLowerCase()));
  if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
}

function setSelectByIndex(sel, idx) {
  if (sel.options[idx]) { sel.selectedIndex = idx; sel.dispatchEvent(new Event("change", { bubbles: true })); }
}

function dataURLtoBlob(dataURL) {
  const [header, data] = dataURL.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── OneTouch button ───────────────────────────────────────────────────────────
let otBtn = null;
let otToast = null;

function injectButton(job) {
  if (document.getElementById("onetouch-btn")) return;

  otBtn = document.createElement("button");
  otBtn.id = "onetouch-btn";
  otBtn.innerHTML = `
    <span class="ot-icon">⚡</span>
    <div>
      <div class="ot-label">OneTouch Apply</div>
      <div class="ot-sub">${job.company || job.site}</div>
    </div>
  `;
  otBtn.addEventListener("click", () => oneTouchApply(job));
  document.body.appendChild(otBtn);
}

function showToast(msg, type = "info", duration = 3500) {
  if (otToast) otToast.remove();
  otToast = document.createElement("div");
  otToast.id = "onetouch-toast";
  otToast.className = `ot-toast-${type}`;
  otToast.innerText = msg;
  document.body.appendChild(otToast);
  setTimeout(() => otToast?.remove(), duration);
}

async function oneTouchApply(job) {
  // Update button state
  otBtn.className = "ot-loading";
  otBtn.innerHTML = `<span class="ot-icon">⏳</span><div><div class="ot-label">Filling form…</div></div>`;
  showToast("🔍 Scanning form fields…", "info");

  try {
    // 1. Fill all form fields
    const filled = await fillForms();
    showToast(`✅ Filled ${filled} fields — scroll down to review`, "success", 4000);

    // 2. Send job to dashboard backend for tracking
    const jobData = { ...job, status: "onetouch-filled", filledFields: filled };
    try {
      await fetch(`${API_BASE}/onetouch-apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobData),
      });
    } catch {} // silently fail if server not running

    // 3. Update button to success
    otBtn.className = "ot-success";
    otBtn.innerHTML = `
      <span class="ot-icon">✅</span>
      <div>
        <div class="ot-label">Filled! Click Submit</div>
        <div class="ot-sub">${filled} fields auto-filled</div>
      </div>
    `;

    // 4. Highlight submit button
    highlightSubmit();

  } catch (err) {
    otBtn.className = "ot-error";
    otBtn.innerHTML = `<span class="ot-icon">⚠</span><div><div class="ot-label">Error — try again</div></div>`;
    showToast(`Error: ${err.message}`, "error");
    setTimeout(() => {
      otBtn.className = "";
      otBtn.innerHTML = `<span class="ot-icon">⚡</span><div><div class="ot-label">OneTouch Apply</div></div>`;
    }, 3000);
  }
}

function highlightSubmit() {
  const submitSelectors = [
    "button[aria-label*='Submit application']",
    "button[type='submit']:not([disabled])",
    "input[type='submit']",
    "button:last-of-type[type='button']",
  ];
  for (const sel of submitSelectors) {
    const btn = document.querySelector(sel);
    if (btn && btn.offsetParent) {
      btn.style.outline = "3px solid #6366f1";
      btn.style.outlineOffset = "3px";
      btn.scrollIntoView({ behavior: "smooth", block: "center" });
      break;
    }
  }
}

// ── Score badge injection ─────────────────────────────────────────────────────
async function injectScoreBadge(job) {
  try {
    const res = await fetch(`${API_BASE}/score-job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job),
    });
    if (!res.ok) return;
    const { score, label } = await res.json();
    if (score == null) return;

    const stars = score >= 4 ? "🟢" : score >= 3 ? "🟡" : "🔴";
    const badge = document.createElement("span");
    badge.className = "ot-score-badge";
    badge.title = `OneTouch Match Score: ${score}/5 — ${label}`;
    badge.innerHTML = `${stars} ${score} <small style="opacity:.7;font-weight:500">/ 5 match</small>`;

    // Inject near the job title
    const titleEl = document.querySelector(
      "h1.job-details-jobs-unified-top-card__job-title, h1.t-24, h1.posting-headline, h1, .app-title"
    );
    if (titleEl) titleEl.appendChild(badge);
  } catch {}
}

// ── Init ──────────────────────────────────────────────────────────────────────
let initTimer = null;

function init() {
  clearTimeout(initTimer);
  initTimer = setTimeout(async () => {
    const site = detectSite();
    if (site === "other") return;

    const job = scrapeJobData();
    if (!job.title) return; // not a job page

    injectButton(job);
    injectScoreBadge(job);
  }, DEBOUNCE_MS);
}

// Re-init on SPA navigation (LinkedIn, Indeed are SPAs)
const observer = new MutationObserver(() => {
  const existing = document.getElementById("onetouch-btn");
  if (existing) {
    // Check if still on a job page
    if (!scrapeJobData().title) existing.remove();
  } else {
    init();
  }
});

observer.observe(document.body, { childList: true, subtree: true });
init();
