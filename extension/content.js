/**
 * OneTouch Apply — Content Script v3
 * New in v3:
 *  - Button always appears on supported job sites (no longer requires title)
 *  - Resume file upload via DataTransfer API
 *  - LinkedIn Easy Apply: auto-advances through all steps until Review
 *  - Custom dropdown support (role=listbox/option, Lever/Greenhouse widgets)
 *  - Resume loaded from chrome.storage.local (larger, bypasses 100KB sync limit)
 *  - smarter `inferValue` with more patterns
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
  if (h.includes("smartrecruiters.com"))return "smartrecruiters";
  if (h.includes("icims.com"))          return "icims";
  if (h.includes("taleo.net"))          return "taleo";
  if (h.includes("successfactors.com")) return "successfactors";
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
    title:    g("h1.app-title, #app_title, .posting-headline h2, h1"),
    company:  g(".company-name, .header--cobranded .logo img") || document.title.split(" at ").pop()?.trim() || "",
    location: g(".location, .offices, .posting-categories .location"),
    platform: "Greenhouse", atsProvider: "Greenhouse" };

  if (SITE === "lever") return { ...data,
    title:    g(".posting-headline h2, h2"),
    company:  document.querySelector(".main-header-logo img")?.alt || location.pathname.split("/")[1],
    location: g(".posting-categories .location"),
    platform: "Lever", atsProvider: "Lever" };

  if (SITE === "ashby") return { ...data,
    title:    g("h1"),
    company:  g(".ashby-job-posting-company-name") || document.title.split(" at ").pop()?.trim() || "",
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

  if (SITE === "smartrecruiters") return { ...data,
    title:    g("h1.job-title, h1"),
    company:  g(".company-name, h2"),
    location: g(".job-detail-location, [itemprop='jobLocation']"),
    platform: "SmartRecruiters" };

  return { ...data,
    title:    g("h1"),
    company:  g("[class*='company'],[itemprop='hiringOrganization']"),
    location: g("[class*='location'],[itemprop='jobLocation']"),
    platform: SITE.charAt(0).toUpperCase() + SITE.slice(1) };
}

// ── Profile store ─────────────────────────────────────────────────────────────
async function getProfile() {
  // Allow temporary override during tailored fill pass
  if (window.__otProfileOverride) return window.__otProfileOverride;
  // sync: small fields — local: resume data (may be large)
  const sync  = await new Promise((ok) => chrome.storage.sync.get("profile", (d) => ok(d.profile || {})));
  const local = await new Promise((ok) => chrome.storage.local.get(["resumeData","resumeFileName"], (d) => ok(d)));
  return { ...sync, ...local };
}

// ── Value inference ───────────────────────────────────────────────────────────
function inferValue(rawLabel, profile) {
  const l = (rawLabel || "").toLowerCase().replace(/[*:?]/g, "").trim();

  if (/^first(\s*name)?$/.test(l))                                      return profile.firstName || profile.name?.split(" ")[0] || "";
  if (/^last(\s*name)?$/.test(l))                                       return profile.lastName  || profile.name?.split(" ").slice(-1)[0] || "";
  if (/full.?name|your name|legal name/.test(l))                        return profile.name || "";
  if (/middle(\s*name)?/.test(l))                                       return "";
  if (l.includes("email"))                                               return profile.email || "";
  if (l.includes("phone") || l.includes("mobile") || l.includes("tel")) return profile.phone || "";
  if (/\bcity\b/.test(l) && !l.includes("state"))                       return (profile.location || "").split(",")[0]?.trim() || "";
  if (l.includes("state") && !l.includes("country") && !l.includes("united states")) return (profile.location || "").split(",")[1]?.trim() || "";
  if (/city.*state|location|where do you live/.test(l))                 return profile.location || "";
  if (l.includes("linkedin"))                                            return profile.linkedinUrl || "";
  if (l.includes("github"))                                              return profile.github || "";
  if (l.includes("portfolio") || l.includes("website") || l.includes("personal url")) return profile.website || profile.github || "";
  if ((l.includes("year") || l.includes("years")) && l.includes("exp")) return profile.yearsExperience || "";
  if (l.includes("salary") || l.includes("compensation") || l.includes("desired pay") || l.includes("expected")) return profile.expectedSalary || "";
  if (l.includes("zip") || l.includes("postal"))                        return profile.zipCode || "98101";
  if (l.includes("start date") || l.includes("available to start") || l.includes("earliest start")) return "2 weeks";
  if (l.includes("notice"))                                              return "2 weeks";
  if (l.includes("address") && !l.includes("email"))                    return profile.location || "";
  if (/cover.?letter|letter of interest/i.test(l))                                   return profile.coverLetter || "";
  if (/why (do you|are you|this role|us|our|company)|motivat|what excites|interest you/i.test(l)) return profile.whyRole || profile.coverLetter || "";
  if (/summary|about yourself|bio|introduce/i.test(l))                               return profile.summary || "";
  if (l.includes("degree") || l.includes("education"))                  return profile.degree || "Bachelor's Degree";
  if (l.includes("university") || l.includes("school") || l.includes("college"))      return profile.school || "";
  if (l.includes("major") || l.includes("field of study"))              return profile.major || "Computer Science";
  if (l.includes("graduation") || l.includes("grad year"))              return profile.gradYear || "";
  return "";
}

// ── Get label text for any element ───────────────────────────────────────────
function getLabelText(el) {
  // 1. <label for="id">
  if (el.id) {
    const lb = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (lb) {
      const clone = lb.cloneNode(true);
      clone.querySelectorAll("input,select,textarea,span.required,abbr").forEach(n => n.remove());
      const t = clone.innerText.trim();
      if (t) return t;
    }
  }
  // 2. aria-labelledby
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const lbEl = document.getElementById(labelledBy);
    if (lbEl) return lbEl.innerText.trim();
  }
  // 3. Ancestor label wrapping the input
  const wrapping = el.closest("label");
  if (wrapping) {
    const clone = wrapping.cloneNode(true);
    clone.querySelectorAll("input,select,textarea").forEach(n => n.remove());
    return clone.innerText.trim();
  }
  // 4. Sibling / parent label in a form field container
  const field = el.closest(
    ".field,.form-group,.form-row,.input-wrapper,.question,.application-field," +
    "[class*='Field'],[class*='field'],[class*='FormItem'],[class*='formItem']," +
    "[class*='InputGroup'],[class*='inputGroup'],[data-field]"
  );
  if (field) {
    const lb = field.querySelector(
      "label,legend,[class*='label'],[class*='Label'],p.label,.question-label,.field-label"
    );
    if (lb && !lb.contains(el)) return lb.innerText.trim();
  }
  // 5. aria-label / placeholder / name fallback
  return el.getAttribute("aria-label") || el.placeholder || el.name || "";
}

function getGroupLabel(radioOrCheck) {
  const fs = radioOrCheck.closest("fieldset");
  if (fs) return fs.querySelector("legend")?.innerText?.trim() || "";
  const field = radioOrCheck.closest(
    ".field,.form-group,.question,[class*='Field'],[class*='field'],[class*='Question'],.form-row"
  );
  if (field) {
    const heading = field.querySelector("label:not(:has(input)),legend,p,h3,h4,[class*='label'],[class*='Label'],[class*='question-label']");
    if (heading) return heading.innerText.trim();
  }
  return radioOrCheck.name || "";
}

// ── Set value in a way React / Vue / Angular all pick up ─────────────────────
function setNativeValue(el, value) {
  const proto = Object.getPrototypeOf(el);
  const desc  = Object.getOwnPropertyDescriptor(proto, "value")
             || Object.getOwnPropertyDescriptor(window.HTMLInputElement?.prototype,   "value")
             || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement?.prototype,"value");

  if (desc?.set) {
    desc.set.call(el, value);
  } else {
    el.value = value;
  }

  ["keydown","keypress","input","keyup","change","blur"].forEach((evtName) => {
    el.dispatchEvent(new Event(evtName, { bubbles: true, cancelable: true }));
    el.dispatchEvent(new InputEvent(evtName, { bubbles: true, cancelable: true, data: value }));
  });
}

// ── Sleep helper ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Resume file upload via DataTransfer ───────────────────────────────────────
async function uploadResume(fileInput, profile) {
  if (!profile.resumeData || !profile.resumeFileName) return false;
  try {
    // Convert base64 data URL → Blob → File
    const res  = await fetch(profile.resumeData);
    const blob = await res.blob();
    const file = new File([blob], profile.resumeFileName, { type: blob.type || "application/pdf" });
    const dt   = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input",  { bubbles: true }));
    return true;
  } catch (e) {
    console.warn("[OneTouch] Resume upload failed:", e);
    return false;
  }
}

// ── Custom dropdown support (Lever, Greenhouse, React-Select) ─────────────────
async function fillCustomDropdowns(root, profile) {
  let filled = 0;

  // Pattern A: div/button with role="combobox" or role="listbox" trigger
  for (const combo of root.querySelectorAll(
    "[role='combobox']:not(select), [aria-haspopup='listbox']:not(select), " +
    ".select__control, [class*='Select__control'], [class*='select-control']"
  )) {
    if (!combo.offsetParent) continue;
    // Find the surrounding label
    const wrapper = combo.closest(
      ".field,.form-group,.question,[class*='Field'],[class*='field'],.select-field"
    );
    if (!wrapper) continue;
    const lb = wrapper.querySelector("label,legend,[class*='label']");
    if (!lb) continue;
    const labelText = lb.innerText.trim().toLowerCase();
    let preferred = [];

    if (labelText.includes("country"))                   preferred = ["united states","us","usa"];
    else if (labelText.includes("sponsor") || labelText.includes("visa")) preferred = ["no","not required"];
    else if (labelText.includes("authoriz") || labelText.includes("eligible")) preferred = ["yes"];
    else if (labelText.includes("gender") || labelText.includes("pronoun"))    preferred = ["prefer not","decline"];
    else if (labelText.includes("race") || labelText.includes("ethnicity"))    preferred = ["decline","prefer not"];
    else if (labelText.includes("veteran"))              preferred = ["not a protected","not a veteran","no"];
    else if (labelText.includes("disability"))           preferred = ["not have","no","decline"];
    else if (labelText.includes("notice") || labelText.includes("start"))      preferred = ["2 weeks","immediately"];
    else if (labelText.includes("pronoun"))              preferred = ["prefer not"];
    else continue; // don't click unknown dropdowns

    if (!preferred.length) continue;

    try {
      // Open the dropdown
      combo.click();
      await sleep(300);

      // Find option list
      const list = document.querySelector(
        "[role='listbox'], [role='option'][aria-selected], " +
        ".select__menu, [class*='Select__menu'], [class*='dropdown-menu']"
      );
      if (!list) { combo.click(); continue; } // close it

      // Find matching option
      const options = list.querySelectorAll(
        "[role='option'], .select__option, [class*='Select__option'], li, [class*='option']"
      );
      let found = false;
      for (const term of preferred) {
        for (const opt of options) {
          if (opt.innerText.toLowerCase().includes(term.toLowerCase())) {
            opt.click();
            await sleep(200);
            filled++;
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) { combo.click(); } // close
    } catch (e) { /* skip */ }
  }

  return filled;
}

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
    "input[type='text'],input[type='email'],input[type='tel'],input[type='url']," +
    "input[type='number'],input:not([type]):not([role='combobox'])"
  )) {
    if (!inp.offsetParent) continue;
    if (inp.value)         continue;
    if (inp.readOnly || inp.disabled) continue;
    // Skip hidden / honeypot fields
    const style = window.getComputedStyle(inp);
    if (style.visibility === "hidden" || style.display === "none") continue;
    const label = getLabelText(inp);
    const val   = inferValue(label, profile);
    if (val) { setNativeValue(inp, val); filled++; await sleep(30); }
  }

  // 2. TEXTAREA
  for (const area of root.querySelectorAll("textarea")) {
    if (!area.offsetParent || area.value || area.readOnly) continue;
    const label = getLabelText(area).toLowerCase();
    let val = "";
    if (/cover.?letter|letter of interest|why (do you|are you|this)|motivat|tell us/i.test(label))
      val = profile.coverLetter || "";
    else if (/summary|about (yourself|you)|bio|introduce/i.test(label))
      val = profile.summary || "";
    else if (/address(?!.*email)/i.test(label))
      val = profile.location || "";
    else
      val = ""; // don't guess unknown textareas
    if (val) { setNativeValue(area, val); filled++; await sleep(30); }
  }

  // 3. FILE inputs (resume upload)
  for (const fi of root.querySelectorAll("input[type='file']")) {
    if (!fi.offsetParent && fi.style.display !== "none") continue; // many are visually hidden
    const accept  = (fi.accept || "").toLowerCase();
    const wrapper = fi.closest(".field,.form-group,.upload-field,[class*='resume'],[class*='Resume'],[class*='upload']");
    const label   = wrapper ? (wrapper.querySelector("label,p,span")?.innerText || "").toLowerCase() : "";
    const isResume = label.includes("resume") || label.includes("cv") ||
                     fi.name?.toLowerCase().includes("resume") || fi.name?.toLowerCase().includes("cv") ||
                     (accept.includes("pdf") || accept.includes("doc") || accept === "");
    if (isResume) {
      const ok = await uploadResume(fi, profile);
      if (ok) { filled++; await sleep(100); }
    }
  }

  // 4. NATIVE SELECT (dropdowns)
  for (const sel of root.querySelectorAll("select")) {
    if (!sel.offsetParent || sel.disabled) continue;
    if (sel.value && sel.value !== "" && sel.value !== "0") continue; // already chosen
    const label = getLabelText(sel).toLowerCase();
    if (label.includes("country"))                    { pickSelect(sel, ["United States","US","USA"]); filled++; }
    else if (label.includes("sponsor") || label.includes("visa"))
                                                      { pickSelect(sel, ["No","Not Required"]); filled++; }
    else if (label.includes("authoriz") || label.includes("work in") || label.includes("eligible"))
                                                      { pickSelect(sel, ["Yes"]); filled++; }
    else if (label.includes("gender") || label.includes("pronoun"))
                                                      { pickSelect(sel, ["Prefer not","Decline","Rather not"]); filled++; }
    else if (label.includes("race") || label.includes("ethnicity"))
                                                      { pickSelect(sel, ["Decline","Rather not","Prefer not"]); filled++; }
    else if (label.includes("veteran"))               { pickSelect(sel, ["not a protected","not a veteran","No"]); filled++; }
    else if (label.includes("disability"))            { pickSelect(sel, ["not have a disability","No","Decline"]); filled++; }
    else if (label.includes("notice") || label.includes("start"))
                                                      { pickSelect(sel, ["2 weeks","Immediately","1 month"]); filled++; }
    else if (label.includes("degree") || label.includes("education level"))
                                                      { pickSelect(sel, ["Bachelor","B.S.","B.A."]); filled++; }
  }

  // 5. Custom dropdowns (React-Select, Lever, Greenhouse)
  filled += await fillCustomDropdowns(root, profile);

  // 6. RADIO buttons — handle EEO and common questions
  const seen = new Set();
  for (const radio of root.querySelectorAll("input[type='radio']")) {
    if (!radio.offsetParent || seen.has(radio.name)) continue;
    seen.add(radio.name);
    const groupLabel = getGroupLabel(radio).toLowerCase();
    const group = [...root.querySelectorAll(`input[type='radio'][name="${CSS.escape(radio.name)}"]`)];

    const pick = (terms) => {
      for (const term of terms) {
        const r = group.find(r =>
          (r.closest("label")?.innerText || r.parentElement?.innerText || r.value || "")
            .toLowerCase().includes(term.toLowerCase())
        );
        if (r) { r.click(); r.dispatchEvent(new Event("change",{bubbles:true})); filled++; return true; }
      }
      return false;
    };

    if (/gender|pronoun/.test(groupLabel))                      pick(["prefer not","decline","rather not","non-binary"]);
    else if (/race|ethnicity/.test(groupLabel))                 pick(["decline","prefer not","rather not"]);
    else if (/veteran/.test(groupLabel))                        pick(["not a protected","not a veteran","i am not","no"]);
    else if (/disability/.test(groupLabel))                     pick(["not have","i don't","no","decline"]);
    else if (/authoriz|eligible|legally/.test(groupLabel))      pick(["yes"]);
    else if (/sponsor|visa/.test(groupLabel))                   pick(["no"]);
    else if (/currently.*(employ|work)|currently (a |an )?employ/.test(groupLabel)) pick(["yes"]);
    else if (/relocat/.test(groupLabel))                        pick(["yes"]);
    else if (/remote|hybrid|on.?site/.test(groupLabel))         pick(["yes","open to"]);
    else if (group.length === 2) {
      const isPositive = /work|experience|skill|familiar|willing|able to|can you|have you|do you/
                           .test(groupLabel);
      pick(isPositive ? ["yes"] : ["no"]);
    }
  }

  // 7. CHECKBOXES — terms/consent only
  for (const cb of root.querySelectorAll("input[type='checkbox']")) {
    if (!cb.offsetParent || cb.checked || cb.disabled) continue;
    const label = (cb.closest("label")?.innerText || cb.name || cb.id || "").toLowerCase();
    // Only auto-check terms, privacy, consent boxes
    if (/terms|privacy|agree|consent|acknowledge|certify|confirm/i.test(label)) {
      cb.click();
      cb.dispatchEvent(new Event("change",{bubbles:true}));
      filled++;
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
      setNativeValue(sel, opt.value);
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
  }
}

// ── LinkedIn: multi-step Easy Apply ──────────────────────────────────────────
async function handleLinkedIn(job) {
  let modal = document.querySelector(".jobs-easy-apply-content, .jobs-apply-form");
  if (!modal) {
    const easyApplyBtn = document.querySelector(
      "button.jobs-apply-button[aria-label*='Easy Apply'], button.jobs-apply-button"
    );
    if (!easyApplyBtn) {
      showToast("❌ No Easy Apply button — this job doesn't support Easy Apply", "error");
      return 0;
    }
    easyApplyBtn.click();
    showToast("📋 Opening Easy Apply…", "info", 2000);
    for (let i = 0; i < 25; i++) {
      await sleep(200);
      modal = document.querySelector(".jobs-easy-apply-content, .jobs-apply-form, [aria-label='Easy Apply']");
      if (modal) break;
    }
    if (!modal) {
      showToast("⚠ Easy Apply modal didn't open", "error");
      return 0;
    }
    await sleep(600);
  }

  let totalFilled = 0;
  // Walk through all steps (max 8)
  for (let step = 0; step < 8; step++) {
    const currentModal = document.querySelector(".jobs-easy-apply-content, .jobs-apply-form");
    if (!currentModal) break;

    totalFilled += await fillForms(currentModal);
    await sleep(400);

    // Look for Next / Continue / Review button
    const nextBtn = currentModal.querySelector(
      "button[aria-label*='Continue'], button[aria-label*='Next'], " +
      "button[aria-label*='Review'], footer button.artdeco-button--primary"
    );
    if (!nextBtn || nextBtn.disabled) break;

    const btnText = nextBtn.innerText.toLowerCase();
    if (btnText.includes("review") || btnText.includes("submit")) {
      // Reached final review step — highlight submit instead of clicking
      nextBtn.style.outline      = "3px solid #6366f1";
      nextBtn.style.outlineOffset = "3px";
      nextBtn.style.boxShadow    = "0 0 16px rgba(99,102,241,0.6)";
      break;
    }

    nextBtn.click();
    await sleep(1000);
  }

  return totalFilled;
}

// ── Workday: multi-step forms ─────────────────────────────────────────────────
async function handleWorkday(job) {
  let totalFilled = 0;
  const stepContainer = document.querySelector("[data-automation-id='pageContainer'], main, .wd-popup-content") || document;
  totalFilled += await fillForms(stepContainer);

  for (let step = 0; step < 5; step++) {
    await sleep(500);
    const nextBtn = document.querySelector(
      "[data-automation-id='nextButton'], [data-automation-id='bottom-navigation-next-button']"
    );
    if (!nextBtn || nextBtn.disabled) break;
    if (nextBtn.innerText.toLowerCase().includes("submit")) break; // don't auto-submit
    nextBtn.click();
    await sleep(1200);
    totalFilled += await fillForms(document.querySelector("[data-automation-id='pageContainer']") || document);
  }

  return totalFilled;
}

// ── Fetch tailored answers from backend (CareerOps-style) ────────────────────
async function fetchTailoredAnswers(job, profile) {
  try {
    const res = await fetch(`${API_BASE}/generate-answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job, profile }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Master apply handler ──────────────────────────────────────────────────────
async function oneTouchApply(job) {
  if (isFillingNow) return;
  isFillingNow = true;

  setButtonState("loading", "Generating answers…");
  showToast("🧠 Tailoring answers to this role…", "info", 2000);

  try {
    // 1. Get profile
    const profile = await getProfile();

    // 2. Fetch tailored answers from backend (cover letter, why this role, etc.)
    const tailored = await fetchTailoredAnswers(job, profile);

    // Inject tailored cover letter + whyRole into profile so fillForms() uses them
    const enrichedProfile = {
      ...profile,
      coverLetter: tailored?.coverLetter || profile.coverLetter || "",
      whyRole:     tailored?.whyRole     || "",
    };
    // Temporarily override getProfile to return enriched version for this fill pass
    const origGet = window.__otProfileOverride;
    window.__otProfileOverride = enrichedProfile;

    setButtonState("loading", "Filling form…");
    showToast("⚡ Filling all fields…", "info", 2000);

    let filled = 0;
    if (SITE === "linkedin")     filled = await handleLinkedIn(job);
    else if (SITE === "workday") filled = await handleWorkday(job);
    else                         filled = await fillForms();

    window.__otProfileOverride = origGet;

    if (filled === 0) {
      showToast("⚠ No empty fields found — may already be filled or not visible", "error", 4000);
      setButtonState("error", "No fields found");
      setTimeout(() => setButtonState("default", job.company || SITE), 3000);
      isFillingNow = false;
      return;
    }

    // 3. Show success with score + recruiter link
    const score    = tailored?.score ?? null;
    const recruiterUrl = tailored?.recruiterUrl || null;
    const matchedSkills = tailored?.matchedSkills || [];

    const scoreText = score != null ? ` · ★ ${score}` : "";
    const skillText = matchedSkills.length > 0 ? `\nMatched: ${matchedSkills.slice(0, 3).join(", ")}` : "";
    showToast(`✅ ${filled} fields filled${scoreText}${skillText}\nReview then click Submit`, "success", 7000);
    setButtonState("success", `${filled} filled!`);
    highlightSubmitButton();

    // Inject recruiter search button if score is good
    if (recruiterUrl && (score == null || score >= 3.5)) {
      injectRecruiterButton(recruiterUrl, job.company);
    }

    // Notify badge counter
    chrome.runtime.sendMessage({ type: "JOB_APPLIED" });

    // Track to dashboard (include tailored data)
    try {
      await fetch(`${API_BASE}/onetouch-apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...job,
          filledFields: filled,
          matchedSkills,
          tailoredAnswers: !!tailored,
        }),
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
  const sub = otBtn.querySelector(".ot-sub");
  const subText = sub?.textContent || "";
  otBtn.innerHTML = `<span class="ot-icon">${s.icon}</span><div><div class="ot-label">${s.text}</div><div class="ot-sub">${subText}</div></div>`;
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
    "button[type='submit']:not(#onetouch-btn)",
    "input[type='submit']",
    "[data-automation-id='bottom-navigation-next-button']",
    "button[aria-label*='Review']",
    ".postings-btn",
    "button.btn-apply, a.btn-apply",
  ];
  for (const sel of selectors) {
    const btns = document.querySelectorAll(sel);
    for (const btn of btns) {
      if (btn.offsetParent && !btn.disabled && btn !== otBtn) {
        btn.style.outline       = "3px solid #6366f1";
        btn.style.outlineOffset = "3px";
        btn.style.boxShadow     = "0 0 16px rgba(99,102,241,0.6)";
        btn.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
  }
}

// ── Recruiter search button (CareerOps "contacto" feature) ───────────────────
function injectRecruiterButton(recruiterUrl, company) {
  if (document.getElementById("onetouch-recruiter")) return;
  const btn = document.createElement("a");
  btn.id     = "onetouch-recruiter";
  btn.href   = recruiterUrl;
  btn.target = "_blank";
  btn.rel    = "noopener";
  btn.title  = `Find a recruiter at ${company || "this company"} on LinkedIn`;
  btn.style.cssText = `
    position: fixed; bottom: 104px; right: 28px; z-index: 2147483647;
    background: #0a66c2; color: #fff; border: none; border-radius: 50px;
    padding: 10px 18px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none;
    box-shadow: 0 4px 20px rgba(10,102,194,0.5);
    display: flex; align-items: center; gap: 8px;
    animation: otSlideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  `;
  btn.innerHTML = `<span>💼</span> Find Recruiter`;
  // Auto-remove after 30s
  setTimeout(() => btn.remove(), 30_000);
  document.body.appendChild(btn);
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
      title: `OneTouch match: ${score}/5 — ${label}`,
      innerHTML: `${dot} ${score} <small style="font-weight:500;opacity:.7">/ 5</small>`,
    });
    const titleEl = document.querySelector(
      "h1.job-details-jobs-unified-top-card__job-title,h1.t-24,h2.posting-headline," +
      "h1.app-title,h1,[data-automation-id='jobPostingHeader'],h1"
    );
    if (titleEl && !titleEl.querySelector(".ot-score-badge")) titleEl.appendChild(badge);
  } catch {}
}

// ── Inject the floating button ────────────────────────────────────────────────
function injectButton(job) {
  if (document.getElementById("onetouch-btn")) return;
  otBtn = document.createElement("button");
  otBtn.id = "onetouch-btn";
  const company = job.company || job.platform || SITE;
  otBtn.innerHTML = `<span class="ot-icon">⚡</span><div><div class="ot-label">OneTouch Apply</div><div class="ot-sub">${company}</div></div>`;
  otBtn.addEventListener("click", () => oneTouchApply(job));
  document.body.appendChild(otBtn);
}

// ── Is this a job detail / application page? ──────────────────────────────────
function isJobPage() {
  const url = location.href.toLowerCase();

  // URL patterns that indicate a job detail page
  const jobUrlPatterns = [
    /jobs\/\d+/,                        // LinkedIn: /jobs/view/123
    /job-boards\.greenhouse\.io/,
    /boards\.greenhouse\.io/,
    /jobs\.lever\.co\/[^/]+\/[^/]+/,   // Lever: /company/jobid
    /jobs\.ashbyhq\.com/,
    /myworkdayjobs\.com/,
    /ziprecruiter\.com\/jobs\//,
    /dice\.com\/jobs\//,
    /wellfound\.com\/jobs\//,
    /glassdoor\.com\/job-listing\//,
    /glassdoor\.com\/Jobs\//i,
    /indeed\.com\/viewjob/,
    /indeed\.com\/jobs/,
    /smartrecruiters\.com\/.*\/job\//,
    /icims\.com/,
    /taleo\.net/,
    /successfactors\.com/,
  ];

  if (jobUrlPatterns.some((p) => p.test(url))) return true;

  // Fallback: look for a visible submit/apply button on the page
  const hasApplyForm = !!(
    document.querySelector("button.jobs-apply-button, button[aria-label*='Apply'], input[type='submit']") ||
    document.querySelector("form input[name*='first'], form input[name*='email']")
  );

  return hasApplyForm;
}

// ── Init & SPA re-detection ───────────────────────────────────────────────────
let _initTimer = null;
let _lastUrl   = "";

function tryInit() {
  clearTimeout(_initTimer);
  _initTimer = setTimeout(async () => {
    if (SITE === "other") return;
    if (!isJobPage()) return;

    const job = scrapeJobData();
    injectButton(job);       // show button even if title is empty
    if (job.title) injectScoreBadge(job);
  }, 800);
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
