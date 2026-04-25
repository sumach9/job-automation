/**
 * OneTouch Apply — Content Script v2
 * Fixed: React synthetic events, LinkedIn Easy Apply flow, radio detection,
 *        dynamic form retry, better label matching.
 */

const API_BASE   = "http://localhost:3004/api";
const SITE       = detectSite();
let   otBtn      = null;
let   otToast    = null;
let   isFillingNow = false;

// ── Site detection ────────────────────────────────────────────────────────────
function detectSite() {
  const h = location.hostname;
  if (h.includes("linkedin.com"))       return "linkedin";
  if (h.includes("indeed.com"))         return "indeed";
  if (h.includes("greenhouse.io"))      return "greenhouse";
  if (h.includes("lever.co"))           return "lever";
  if (h.includes("ashbyhq.com"))        return "ashby";
  if (h.includes("myworkdayjobs.com") ||
      h.includes("workday.com"))        return "workday";
  if (h.includes("glassdoor.com"))      return "glassdoor";
  if (h.includes("ziprecruiter.com"))   return "ziprecruiter";
  if (h.includes("dice.com"))           return "dice";
  if (h.includes("wellfound.com"))      return "wellfound";
  return "other";
}

// ── Scrape job metadata from the current page ─────────────────────────────────
function scrapeJobData() {
  const g  = (sel) => document.querySelector(sel)?.innerText?.trim() || "";
  const url = location.href;

  const data = { url, site: SITE, scrapedAt: new Date().toISOString() };

  if (SITE === "linkedin") return { ...data,
    title:    g("h1.job-details-jobs-unified-top-card__job-title, h1.t-24, h1"),
    company:  g(".job-details-jobs-unified-top-card__company-name a, .job-details-jobs-unified-top-card__company-name"),
    location: g(".job-details-jobs-unified-top-card__bullet"),
    platform: "LinkedIn", easyApply: !!document.querySelector("button.jobs-apply-button") };

  if (SITE === "greenhouse") return { ...data,
    title:    g("h1.app-title, #app_title, h1"),
    company:  g(".company-name") || location.hostname.split(".")[0],
    location: g(".location, .offices"),
    platform: "Greenhouse", atsProvider: "Greenhouse" };

  if (SITE === "lever") return { ...data,
    title:    g(".posting-headline h2, h2"),
    company:  g(".main-header-logo img")?.alt || location.pathname.split("/")[1],
    location: g(".posting-categories .location"),
    platform: "Lever", atsProvider: "Lever" };

  if (SITE === "ashby") return { ...data,
    title:    g("h1"),
    company:  g(".ashby-job-posting-company-name") || document.title.split(" at ").pop(),
    location: g(".ashby-job-posting-brief-location"),
    platform: "Ashby", atsProvider: "Ashby" };

  if (SITE === "workday") return { ...data,
    title:    g("[data-automation-id='jobPostingHeader'], h2"),
    company:  document.title.split("|").pop()?.trim() || "",
    location: g("[data-automation-id='locations']"),
    platform: "Workday", atsProvider: "Workday" };

  if (SITE === "indeed") return { ...data,
    title:    g("h1[data-testid='jobsearch-JobInfoHeader-title'], h1"),
    company:  g("[data-testid='inlineHeader-companyName'] a"),
    location: g("[data-testid='inlineHeader-companyLocation']"),
    platform: "Indeed" };

  return { ...data,
    title:    g("h1"),
    company:  g("[class*='company'],[itemprop='hiringOrganization']"),
    location: g("[class*='location'],[itemprop='jobLocation']"),
    platform: "Other" };
}

// ── Profile store ─────────────────────────────────────────────────────────────
async function getProfile() {
  return new Promise((ok) => chrome.storage.sync.get("profile", (d) => ok(d.profile || {})));
}

// ── Value inference ───────────────────────────────────────────────────────────
function inferValue(rawLabel, profile) {
  const l = (rawLabel || "").toLowerCase().replace(/[*:]/g, "").trim();
  if (/^first(\s*name)?$/.test(l))             return profile.firstName || profile.name?.split(" ")[0] || "";
  if (/^last(\s*name)?$/.test(l))              return profile.lastName  || profile.name?.split(" ").slice(-1)[0] || "";
  if (/full.?name|your name/.test(l))          return profile.name || "";
  if (l.includes("email"))                     return profile.email || "";
  if (l.includes("phone") || l.includes("mobile") || l.includes("tel")) return profile.phone || "";
  if (l.includes("city") || l.includes("location") || l.includes("city, state")) return profile.location || "";
  if (l.includes("linkedin"))                  return profile.linkedinUrl || "";
  if (l.includes("github"))                    return profile.github || "";
  if (l.includes("portfolio") || l.includes("website") || l.includes("personal url")) return profile.website || "";
  if ((l.includes("year") || l.includes("years")) && l.includes("exp")) return profile.yearsExperience || "";
  if (l.includes("salary") || l.includes("compensation") || l.includes("pay")) return profile.expectedSalary || "";
  if (l.includes("zip") || l.includes("postal"))     return profile.zipCode || "";
  if (l.includes("start date") || l.includes("available")) return "2 weeks";
  if (l.includes("address") && !l.includes("email")) return profile.location || "";
  return "";
}

// ── Get label text for any element ───────────────────────────────────────────
function getLabelText(el) {
  // 1. <label for="id">
  if (el.id) {
    const lb = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (lb) return lb.innerText.replace(lb.querySelector("*")?.innerText || "", "").trim() || lb.innerText.trim();
  }
  // 2. Ancestor label wrapping the input
  const wrapping = el.closest("label");
  if (wrapping) {
    const clone = wrapping.cloneNode(true);
    clone.querySelectorAll("input,select,textarea").forEach(n => n.remove());
    return clone.innerText.trim();
  }
  // 3. Sibling / parent label in a form field container
  const field = el.closest(".field,.form-group,.form-row,.input-wrapper,.question,[class*='Field'],[class*='field'],[class*='FormItem']");
  if (field) {
    const lb = field.querySelector("label,legend,[class*='label'],[class*='Label'],p.label");
    if (lb && !lb.contains(el)) return lb.innerText.trim();
  }
  // 4. aria-label / placeholder / name fallback
  return el.getAttribute("aria-label") || el.placeholder || el.name || "";
}

function getGroupLabel(radioOrCheck) {
  const fs = radioOrCheck.closest("fieldset");
  if (fs) return fs.querySelector("legend")?.innerText?.trim() || "";
  const field = radioOrCheck.closest(".field,.form-group,.question,[class*='Field'],[class*='field'],[class*='Question']");
  if (field) {
    const heading = field.querySelector("label:not(:has(input)),legend,p,h3,h4,[class*='label'],[class*='Label']");
    if (heading) return heading.innerText.trim();
  }
  return radioOrCheck.name || "";
}

// ── Set value in a way React / Vue / Angular all pick up ─────────────────────
function setNativeValue(el, value) {
  // React stores its internal state via a property descriptor on the prototype
  const proto = Object.getPrototypeOf(el);
  const desc  = Object.getOwnPropertyDescriptor(proto, "value")
             || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,  "value")
             || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,"value");

  if (desc?.set) {
    desc.set.call(el, value);
  } else {
    el.value = value;
  }

  // Fire a full suite of events so every framework sees the change
  ["keydown","keypress","input","keyup","change","blur"].forEach((evtName) => {
    el.dispatchEvent(new Event(evtName, { bubbles: true, cancelable: true }));
  });
}

// ── Sleep helper ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Core fill function ────────────────────────────────────────────────────────
async function fillForms(root = document) {
  const profile = await getProfile();
  if (!profile.email && !profile.name) {
    showToast("⚠ Set your profile first — click the ⚡ extension icon", "error", 5000);
    return 0;
  }

  let filled = 0;

  // 1. TEXT / EMAIL / TEL / URL / NUMBER inputs
  for (const inp of root.querySelectorAll(
    "input[type='text'],input[type='email'],input[type='tel'],input[type='url'],input[type='number'],input:not([type])"
  )) {
    if (!inp.offsetParent) continue;                   // hidden
    if (inp.value)          continue;                   // already filled
    if (inp.readOnly || inp.disabled) continue;
    const label = getLabelText(inp);
    const val   = inferValue(label, profile);
    if (val) { setNativeValue(inp, val); filled++; await sleep(40); }
  }

  // 2. TEXTAREA
  for (const area of root.querySelectorAll("textarea")) {
    if (!area.offsetParent || area.value || area.readOnly) continue;
    const label = getLabelText(area).toLowerCase();
    let val = "";
    if (label.includes("cover") || label.includes("letter") || label.includes("message") || label.includes("note"))
      val = profile.coverLetter || "";
    else if (label.includes("summary") || label.includes("about") || label.includes("bio"))
      val = profile.summary || "";
    else if (label.includes("address") && !label.includes("email"))
      val = profile.location || "";
    if (val) { setNativeValue(area, val); filled++; await sleep(40); }
  }

  // 3. SELECT (dropdowns)
  for (const sel of root.querySelectorAll("select")) {
    if (!sel.offsetParent || sel.disabled) continue;
    const label = getLabelText(sel).toLowerCase();
    if (label.includes("country"))              { pickSelect(sel, ["United States","US","USA"]); filled++; }
    else if (label.includes("sponsor") || label.includes("visa"))
                                                { pickSelect(sel, ["No","Not Required"]); filled++; }
    else if (label.includes("authoriz") || label.includes("work in") || label.includes("eligible"))
                                                { pickSelect(sel, ["Yes"]); filled++; }
    else if (label.includes("gender") || label.includes("pronoun"))
                                                { pickSelect(sel, ["Prefer not","Decline","Rather not"]); filled++; }
    else if (label.includes("race") || label.includes("ethnicity"))
                                                { pickSelect(sel, ["Decline","Rather not","Prefer not"]); filled++; }
    else if (label.includes("veteran"))         { pickSelect(sel, ["not a protected","not a veteran","No"]); filled++; }
    else if (label.includes("disability"))      { pickSelect(sel, ["not have a disability","No","Decline"]); filled++; }
    else if (label.includes("notice") || label.includes("start"))
                                                { pickSelect(sel, ["2 weeks","Immediately","1 month"]); filled++; }
  }

  // 4. RADIO buttons — handle sensitive ones safely
  const seen = new Set();
  for (const radio of root.querySelectorAll("input[type='radio']")) {
    if (!radio.offsetParent || seen.has(radio.name)) continue;
    seen.add(radio.name);
    const groupLabel = getGroupLabel(radio).toLowerCase();
    const group      = [...root.querySelectorAll(`input[type='radio'][name="${CSS.escape(radio.name)}"]`)];

    const pick = (terms) => {
      for (const term of terms) {
        const r = group.find(r => (r.closest("label")?.innerText || r.value || "").toLowerCase().includes(term.toLowerCase()));
        if (r) { r.click(); r.dispatchEvent(new Event("change",{bubbles:true})); filled++; return true; }
      }
      return false;
    };

    if (groupLabel.includes("gender") || groupLabel.includes("pronoun"))
      pick(["prefer not","decline","rather not","non-binary"]);
    else if (groupLabel.includes("race") || groupLabel.includes("ethnicity"))
      pick(["decline","prefer not","rather not"]);
    else if (groupLabel.includes("veteran"))
      pick(["not a protected","not a veteran","i am not","no"]);
    else if (groupLabel.includes("disability"))
      pick(["not have","i don't","no","decline"]);
    else if (groupLabel.includes("authoriz") || groupLabel.includes("eligible") || groupLabel.includes("legally"))
      pick(["yes"]);
    else if (groupLabel.includes("sponsor") || groupLabel.includes("visa"))
      pick(["no"]);
    // generic yes/no: default to yes for capability questions
    else if (group.length === 2) {
      const isCapability = groupLabel.includes("work") || groupLabel.includes("experience") ||
                           groupLabel.includes("skill") || groupLabel.includes("familiar") ||
                           groupLabel.includes("willing") || groupLabel.includes("able to");
      pick(isCapability ? ["yes"] : ["no"]);
    }
  }

  return filled;
}

// ── Select helpers ────────────────────────────────────────────────────────────
function pickSelect(sel, terms) {
  const opts = [...sel.options];
  for (const term of terms) {
    const opt = opts.find(o => o.text.toLowerCase().includes(term.toLowerCase()));
    if (opt) {
      sel.value = opt.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
  }
}

// ── LinkedIn specific: click Easy Apply, wait for modal, fill ─────────────────
async function handleLinkedIn(job) {
  // Check if Easy Apply modal is already open
  const modal = document.querySelector(".jobs-easy-apply-content, .jobs-apply-form");
  if (modal) {
    return await fillForms(modal);
  }

  // Click the Easy Apply button
  const easyApplyBtn = document.querySelector(
    "button.jobs-apply-button[aria-label*='Easy Apply'], button.jobs-apply-button"
  );
  if (!easyApplyBtn) {
    showToast("❌ No Easy Apply button — opening job page in new tab", "error");
    return 0;
  }

  easyApplyBtn.click();
  showToast("📋 Opening Easy Apply form…", "info", 2000);

  // Wait for modal to appear (up to 5s)
  for (let i = 0; i < 25; i++) {
    await sleep(200);
    const m = document.querySelector(".jobs-easy-apply-content, .jobs-apply-form, [aria-label='Easy Apply']");
    if (m) {
      await sleep(600); // let form fully render
      return await fillForms(m);
    }
  }
  showToast("⚠ Easy Apply modal didn't open — try clicking Easy Apply manually", "error");
  return 0;
}

// ── Workday specific: multi-step forms ───────────────────────────────────────
async function handleWorkday(job) {
  let totalFilled = 0;

  // Fill current visible step
  const stepContainer = document.querySelector("[data-automation-id='pageContainer'], main, .wd-popup-content") || document;
  totalFilled += await fillForms(stepContainer);

  // Try to advance through steps automatically
  for (let step = 0; step < 5; step++) {
    await sleep(500);
    const nextBtn = document.querySelector(
      "[data-automation-id='nextButton'], [data-automation-id='bottom-navigation-next-button']"
    );
    if (!nextBtn || nextBtn.disabled) break;
    nextBtn.click();
    await sleep(1200);
    totalFilled += await fillForms(document.querySelector("[data-automation-id='pageContainer']") || document);
  }

  return totalFilled;
}

// ── Master apply handler ──────────────────────────────────────────────────────
async function oneTouchApply(job) {
  if (isFillingNow) return;
  isFillingNow = true;

  setButtonState("loading", "Filling form…");
  showToast("⚡ Scanning and filling fields…", "info");

  try {
    let filled = 0;

    if (SITE === "linkedin")   filled = await handleLinkedIn(job);
    else if (SITE === "workday") filled = await handleWorkday(job);
    else                         filled = await fillForms();

    if (filled === 0) {
      showToast("⚠ No empty fields found — form may already be filled or not visible yet", "error", 4000);
      setButtonState("error", "No fields found");
      setTimeout(() => setButtonState("default", job.company || SITE), 3000);
      return;
    }

    showToast(`✅ ${filled} fields filled — review and click Submit`, "success", 5000);
    setButtonState("success", `${filled} fields filled!`);
    highlightSubmitButton();

    // Track to dashboard
    try {
      await fetch(`${API_BASE}/onetouch-apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...job, filledFields: filled }),
      });
    } catch {}

  } catch (err) {
    showToast(`⚠ Error: ${err.message}`, "error");
    setButtonState("error", "Error — retry");
    setTimeout(() => setButtonState("default", job.company || SITE), 4000);
  } finally {
    isFillingNow = false;
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function setButtonState(state, label) {
  if (!otBtn) return;
  const states = {
    default: { cls: "",           icon: "⚡", text: "OneTouch Apply" },
    loading: { cls: "ot-loading", icon: "⏳", text: label },
    success: { cls: "ot-success", icon: "✅", text: label },
    error:   { cls: "ot-error",   icon: "⚠",  text: label },
  };
  const s = states[state] || states.default;
  otBtn.className = s.cls;
  otBtn.innerHTML = `<span class="ot-icon">${s.icon}</span><div><div class="ot-label">${s.text}</div></div>`;
}

function showToast(msg, type = "info", duration = 3500) {
  if (otToast) otToast.remove();
  otToast = document.createElement("div");
  otToast.id = "onetouch-toast";
  otToast.className = `ot-toast-${type}`;
  otToast.innerText = msg;
  document.body.appendChild(otToast);
  if (duration > 0) setTimeout(() => otToast?.remove(), duration);
}

function highlightSubmitButton() {
  const selectors = [
    "button[aria-label*='Submit application']",
    "button[type='submit']",
    "input[type='submit']",
    "[data-automation-id='bottom-navigation-next-button']",
    "button[aria-label*='Review']",
    "button:last-of-type",
  ];
  for (const sel of selectors) {
    const btns = document.querySelectorAll(sel);
    for (const btn of btns) {
      if (btn.offsetParent && !btn.disabled && btn !== otBtn) {
        btn.style.outline      = "3px solid #6366f1";
        btn.style.outlineOffset = "3px";
        btn.style.boxShadow    = "0 0 16px rgba(99,102,241,0.6)";
        btn.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
  }
}

// ── Score badge ───────────────────────────────────────────────────────────────
async function injectScoreBadge(job) {
  if (!job.title) return;
  try {
    const res = await fetch(`${API_BASE}/score-job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job),
    });
    if (!res.ok) return;
    const { score, label } = await res.json();
    if (score == null) return;
    const dot = score >= 4 ? "🟢" : score >= 3 ? "🟡" : "🔴";
    const badge = Object.assign(document.createElement("span"), {
      className: "ot-score-badge",
      title:     `OneTouch match: ${score}/5 — ${label}`,
      innerHTML: `${dot} ${score} <small style="font-weight:500;opacity:.7">/ 5</small>`,
    });
    const title = document.querySelector(
      "h1.job-details-jobs-unified-top-card__job-title,h1.t-24,h2.posting-headline,h1.app-title,h1,[data-automation-id='jobPostingHeader'],h1"
    );
    if (title && !title.querySelector(".ot-score-badge")) title.appendChild(badge);
  } catch {}
}

// ── Inject the floating button ────────────────────────────────────────────────
function injectButton(job) {
  if (document.getElementById("onetouch-btn")) return;
  otBtn = document.createElement("button");
  otBtn.id = "onetouch-btn";
  otBtn.innerHTML = `<span class="ot-icon">⚡</span><div><div class="ot-label">OneTouch Apply</div><div class="ot-sub">${job.company || SITE}</div></div>`;
  otBtn.addEventListener("click", () => oneTouchApply(job));
  document.body.appendChild(otBtn);
}

// ── Init & SPA re-detection ───────────────────────────────────────────────────
let _initTimer = null;
let _lastUrl   = "";

function tryInit() {
  clearTimeout(_initTimer);
  _initTimer = setTimeout(() => {
    if (SITE === "other") return;
    const job = scrapeJobData();
    if (!job.title) return;                    // not a job detail page
    injectButton(job);
    injectScoreBadge(job);
  }, 900);
}

// Watch for SPA URL changes (LinkedIn, Indeed, Glassdoor are SPAs)
new MutationObserver(() => {
  if (location.href !== _lastUrl) {
    _lastUrl = location.href;
    document.getElementById("onetouch-btn")?.remove();
    otBtn = null;
    tryInit();
  } else {
    // Re-check if button got removed by a framework re-render
    if (!document.getElementById("onetouch-btn")) tryInit();
  }
}).observe(document.body, { childList: true, subtree: true });

tryInit();
