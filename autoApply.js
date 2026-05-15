import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ─── Shared browser state ─────────────────────────────────────────────────────
let _browser = null;
let _linkedinContext = null;
let _indeedContext = null;
let _simplifyContext = null;   // persistent Chrome context with Simplify extension

export async function resetSession() {
  if (_browser) await _browser.close().catch(() => {});
  _browser = null;
  _linkedinContext = null;
  _indeedContext = null;
  if (_simplifyContext) await _simplifyContext.close().catch(() => {});
  _simplifyContext = null;
}

async function getBrowser() {
  if (!_browser) {
    _browser = await chromium.launch({
      headless: true,   // run silently in background — no visible browser windows
      slowMo: 50,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return _browser;
}

// ─── Detect platform from URL ─────────────────────────────────────────────────
export function detectPlatform(url = "") {
  if (!url) return "unknown";
  if (url.includes("linkedin.com"))    return "linkedin";
  if (url.includes("indeed.com"))      return "indeed";
  if (url.includes("glassdoor.com"))   return "glassdoor";
  if (url.includes("ziprecruiter.com"))return "ziprecruiter";
  if (url.includes("dice.com"))        return "dice";
  return "other";
}

// ─── Smart router — picks the right apply method ─────────────────────────────
export async function smartApply({ job, credentials, profile, resumePath }) {
  const applyUrl = job.applyUrl || job.url || "";
  const platform = detectPlatform(applyUrl);

  if (platform === "linkedin") {
    return applyLinkedIn({ jobUrl: applyUrl, credentials, profile, resumePath });
  }
  if (platform === "indeed") {
    return applyIndeed({ jobUrl: applyUrl, credentials, profile, resumePath });
  }
  // For all other platforms (Greenhouse, Lever, Ashby, Workday, Glassdoor, etc.)
  // Fill the form directly with Playwright using the user's profile
  return openWithSimplify(applyUrl, job, profile);
}

// ─── LinkedIn Easy Apply ──────────────────────────────────────────────────────
async function ensureLinkedInLogin(credentials) {
  if (_linkedinContext) return _linkedinContext;
  const browser = await getBrowser();
  _linkedinContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await _linkedinContext.newPage();
  await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
  await delay(1000, 500);
  await page.fill("#username", credentials.linkedinEmail);
  await delay(300, 200);
  await page.fill("#password", credentials.linkedinPassword);
  await delay(200, 300);
  await page.click('[data-litms-control-urn="login-submit"]');
  try {
    await page.waitForURL("**/feed/**", { timeout: 20_000 });
  } catch {
    // 2FA — give user 90s to complete
    await page.waitForURL("**/feed/**", { timeout: 90_000 });
  }
  await page.close();
  return _linkedinContext;
}

export async function applyLinkedIn({ jobUrl, credentials, profile, resumePath }) {
  let context, page;
  try {
    context = await ensureLinkedInLogin(credentials);
    page = await context.newPage();
  } catch (err) {
    // Playwright failed to launch — fall back to opening in Chrome
    _browser = null; _linkedinContext = null;
    try { await execAsync(`start "" "${jobUrl}"`); } catch {}
    return { success: false, reason: `Playwright error, opened in Chrome: ${err.message}`, browserOpened: true, autoApplied: false };
  }
  const result = { success: false, reason: "", autoApplied: false };

  try {
    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await delay(1500, 800);
    const jobDetails = await scrapeJobDetails(page);

    const btn = page.locator("button.jobs-apply-button").first();
    const btnText = (await btn.innerText().catch(() => "")).toLowerCase();
    if (!btnText.includes("easy apply")) {
      return { ...result, reason: "No Easy Apply button", jobDetails };
    }

    await btn.click();
    await delay(2000, 500);

    for (let step = 0; step < 15; step++) {
      await delay(900, 400);
      await fillLinkedInStep(page, profile, resumePath);

      const submitBtn = page.locator(
        "button[aria-label*='Submit application'], button:has-text('Submit application')"
      ).first();
      if (await isVisible(submitBtn)) {
        await submitBtn.click();
        await delay(2000, 300);
        return { success: true, reason: "Submitted via LinkedIn Easy Apply", autoApplied: true, jobDetails };
      }

      const nextBtn = page.locator(
        "button[aria-label*='Continue to next step'], button[aria-label*='Review'], button:has-text('Next'), button:has-text('Review'), button:has-text('Continue')"
      ).first();
      if (await isVisible(nextBtn)) {
        await nextBtn.click();
      } else {
        result.reason = "Could not find Next/Submit";
        break;
      }
    }
    return { ...result, reason: result.reason || "Form exceeded step limit", jobDetails };
  } catch (err) {
    return { ...result, reason: err.message, jobDetails: {} };
  } finally {
    await page.close().catch(() => {});
  }
}

async function fillLinkedInStep(page, profile, resumePath) {
  // Phone
  const phoneInput = page.locator("input[id*='phoneNumber'], input[name*='phone']").first();
  if (await isVisible(phoneInput) && !(await phoneInput.inputValue())) {
    await phoneInput.fill(profile.phone || "");
  }

  // Resume upload
  if (resumePath && fs.existsSync(resumePath)) {
    const fileInput = page.locator("input[type='file']").first();
    if (await isVisible(fileInput)) {
      await fileInput.setInputFiles(resumePath);
      await delay(2500, 500);
    }
  }

  // Yes/No radio buttons — default to Yes
  for (const radio of await page.locator("fieldset label:has-text('Yes')").all()) {
    if (await isVisible(radio)) await radio.click().catch(() => {});
  }

  // Text/number fields
  for (const input of await page.locator("input[type='text']:visible, input[type='tel']:visible, input[type='number']:visible").all()) {
    const val = await input.inputValue().catch(() => "");
    if (val) continue;
    const label = await labelFor(input);
    if (label.includes("city") || label.includes("location")) await input.fill(profile.location || "Seattle, WA");
    else if (label.includes("linkedin") || label.includes("profile url")) await input.fill(profile.linkedinUrl || "");
    else if (label.includes("website") || label.includes("portfolio")) await input.fill(profile.website || "");
    else if (label.includes("year") || label.includes("experience")) await input.fill(profile.yearsExperience || "5");
    else if (label.includes("salary") || label.includes("expected")) await input.fill(profile.expectedSalary || "");
  }

  // Dropdowns
  for (const sel of await page.locator("select:visible").all()) {
    const current = await sel.inputValue().catch(() => "");
    if (current) continue;
    const label = await labelFor(sel);
    if (label.includes("country")) await sel.selectOption({ label: "United States" }).catch(() => {});
    else if (label.includes("authorize") || label.includes("work in")) await sel.selectOption({ index: 1 }).catch(() => {});
  }
}

// ─── Indeed Easy Apply ────────────────────────────────────────────────────────
async function ensureIndeedLogin(credentials) {
  if (_indeedContext) return _indeedContext;
  const browser = await getBrowser();
  _indeedContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await _indeedContext.newPage();
  await page.goto("https://secure.indeed.com/account/login", { waitUntil: "domcontentloaded" });
  await delay(1500, 500);

  // Fill email
  const emailInput = page.locator("input[type='email'], input[name='emailAddress'], #ifl-InputFormField-3").first();
  await emailInput.fill(credentials.indeedEmail || credentials.linkedinEmail);
  const continueBtn = page.locator("button[type='submit'], button:has-text('Continue'), button:has-text('Sign in')").first();
  await continueBtn.click();
  await delay(1500, 500);

  // Fill password
  const pwInput = page.locator("input[type='password']").first();
  if (await isVisible(pwInput)) {
    await pwInput.fill(credentials.indeedPassword || credentials.linkedinPassword);
    await page.locator("button[type='submit']").first().click();
  }

  try {
    await page.waitForURL("**/jobs**", { timeout: 20_000 });
  } catch {
    // May need email verification — keep browser open
    await delay(30_000); // give 30s for user to verify
  }
  await page.close();
  return _indeedContext;
}

export async function applyIndeed({ jobUrl, credentials, profile, resumePath }) {
  let context, page;
  try {
    context = await ensureIndeedLogin(credentials);
    page = await context.newPage();
  } catch (err) {
    // Playwright failed to launch — fall back to opening in Chrome
    _browser = null; _indeedContext = null;
    try { await execAsync(`start "" "${jobUrl}"`); } catch {}
    return { success: false, reason: `Playwright error, opened in Chrome: ${err.message}`, browserOpened: true, autoApplied: false };
  }
  const result = { success: false, reason: "", autoApplied: false };

  try {
    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await delay(2000, 500);

    // Click Apply / Apply Now button
    const applyBtn = page.locator(
      "button:has-text('Apply now'), button:has-text('Apply'), a:has-text('Apply now')"
    ).first();
    if (!await isVisible(applyBtn)) {
      return { ...result, reason: "No Apply button found on Indeed job" };
    }
    await applyBtn.click();
    await delay(2000, 500);

    // Handle multi-step Indeed form
    for (let step = 0; step < 10; step++) {
      await delay(1000, 400);

      // Upload resume
      if (resumePath && fs.existsSync(resumePath)) {
        const fileInput = page.locator("input[type='file']").first();
        if (await isVisible(fileInput)) {
          await fileInput.setInputFiles(resumePath);
          await delay(3000, 500);
        }
      }

      // Fill text inputs
      for (const input of await page.locator("input[type='text']:visible, input[type='tel']:visible").all()) {
        const val = await input.inputValue().catch(() => "");
        if (val) continue;
        const label = await labelFor(input);
        if (label.includes("phone")) await input.fill(profile.phone || "");
        else if (label.includes("city") || label.includes("location")) await input.fill(profile.location || "Seattle, WA");
        else if (label.includes("name")) await input.fill(profile.name || "");
      }

      // Yes/No — default Yes for authorization questions
      for (const radio of await page.locator("label:has-text('Yes') input[type='radio']").all()) {
        if (await isVisible(radio)) await radio.check().catch(() => {});
      }

      // Submit
      const submitBtn = page.locator("button:has-text('Submit'), button[type='submit']:has-text('Submit')").first();
      if (await isVisible(submitBtn)) {
        await submitBtn.click();
        await delay(2000, 300);
        return { success: true, reason: "Submitted via Indeed", autoApplied: true };
      }

      // Continue / Next
      const nextBtn = page.locator("button:has-text('Continue'), button:has-text('Next')").first();
      if (await isVisible(nextBtn)) {
        await nextBtn.click();
      } else break;
    }
    return { ...result, reason: "Could not complete Indeed form" };
  } catch (err) {
    return { ...result, reason: err.message };
  } finally {
    await page.close().catch(() => {});
  }
}

// ─── Detect if running on a cloud server (Railway, Render, etc.) ─────────────
const IS_SERVER = !!(
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.RENDER ||
  process.env.FLY_APP_NAME ||
  process.env.DYNO ||
  (process.env.PORT && !process.env.LOCALAPPDATA)
);

// ─── Direct ATS form filler (no Simplify needed) ─────────────────────────────
// Fills Greenhouse / Lever / Ashby forms directly using the user's profile data.
async function fillATSForm(page, profile, resumePath, atsProvider = "") {
  await delay(3000, 1000); // wait for page to fully render

  const p = profile || {};
  const firstName = p.firstName || (p.name || "").split(" ")[0] || "";
  const lastName  = p.lastName  || (p.name || "").split(" ").slice(1).join(" ") || "";

  // Use most recent education entry as primary school/degree
  const primaryEdu = Array.isArray(p.education) && p.education.length
    ? p.education[0]
    : null;
  const schoolName  = primaryEdu?.school  || p.school  || "";
  const degreeName  = primaryEdu?.degree  || p.degree  || "";
  const majorName   = primaryEdu?.major   || p.major   || "";
  const gpaValue    = primaryEdu?.gpa     || "";

  // Most recent job title and company for "current role" questions
  const latestExp   = Array.isArray(p.experiences) && p.experiences.length ? p.experiences[0] : null;
  const currentTitle   = latestExp?.title   || p.targetRoles?.split(",")[0]?.trim() || "";
  const currentCompany = latestExp?.company || "";

  // ── Upload resume ────────────────────────────────────────────────────────
  if (resumePath && fs.existsSync(resumePath)) {
    const fileInput = page.locator("input[type='file']").first();
    if (await isVisible(fileInput)) {
      await fileInput.setInputFiles(resumePath).catch(() => {});
      await delay(2500, 500);
    }
  }

  // ── Generic field map ─────────────────────────────────────────────────────
  const fieldMap = [
    { selectors: ["input[name*='first_name']", "input[id*='first_name']", "input[placeholder*='First']", "input[autocomplete='given-name']"],   value: firstName },
    { selectors: ["input[name*='last_name']",  "input[id*='last_name']",  "input[placeholder*='Last']",  "input[autocomplete='family-name']"],   value: lastName  },
    { selectors: ["input[name='name']", "input[id*='full_name']", "input[placeholder*='Full name']", "input[autocomplete='name']"],              value: p.name || "" },
    { selectors: ["input[type='email']", "input[name='email']", "input[id*='email']"],                                                          value: p.email || "" },
    { selectors: ["input[type='tel']",   "input[name*='phone']", "input[id*='phone']", "input[placeholder*='Phone']"],                          value: p.phone || "" },
    { selectors: ["input[name*='location']", "input[id*='location']", "input[placeholder*='City']", "input[placeholder*='Location']"],          value: p.location || "" },
    { selectors: ["input[name*='linkedin']", "input[placeholder*='LinkedIn']", "input[id*='linkedin']"],                                         value: p.linkedinUrl || "" },
    { selectors: ["input[name*='website']",  "input[placeholder*='Website']",  "input[placeholder*='Portfolio']"],                              value: p.website || "" },
    { selectors: ["input[name*='github']",   "input[placeholder*='GitHub']"],                                                                   value: p.github || "" },
    { selectors: ["input[name*='school']",  "input[id*='school']",  "input[placeholder*='School']",  "input[placeholder*='University']"],         value: schoolName },
    { selectors: ["input[name*='degree']",  "input[id*='degree']",  "input[placeholder*='Degree']"],                                               value: degreeName },
    { selectors: ["input[name*='major']",   "input[id*='major']",   "input[placeholder*='Field of study']", "input[placeholder*='Major']"],        value: majorName  },
    { selectors: ["input[name*='gpa']",     "input[id*='gpa']",     "input[placeholder*='GPA']"],                                                  value: gpaValue   },
    { selectors: ["input[name*='current_title']", "input[placeholder*='Current title']", "input[placeholder*='Current role']"],                    value: currentTitle },
    { selectors: ["input[name*='current_company']","input[placeholder*='Current company']","input[placeholder*='Employer']"],                      value: currentCompany },
    { selectors: ["input[name*='years']", "input[id*='years_experience']", "input[placeholder*='Years of experience']"],                           value: String(p.yearsExperience || "") },
  ];

  for (const { selectors, value } of fieldMap) {
    if (!value) continue;
    for (const sel of selectors) {
      const el = page.locator(sel).first();
      if (await isVisible(el)) {
        const current = await el.inputValue().catch(() => "");
        if (!current) await el.fill(value).catch(() => {});
        break;
      }
    }
  }

  // ── Textareas (cover letter / summary / experience) ──────────────────────
  // Build experience text block from structured experiences array
  const expBlock = Array.isArray(p.experiences) && p.experiences.length
    ? p.experiences.map(e =>
        `${e.title || ""}${e.company ? " at " + e.company : ""}${e.startDate ? " (" + e.startDate + " – " + (e.endDate || "Present") + ")" : ""}` +
        (e.description ? "\n" + e.description : "")
      ).join("\n\n")
    : "";

  for (const ta of await page.locator("textarea:visible").all()) {
    const lbl = await labelFor(ta);
    const current = await ta.inputValue().catch(() => "");
    if (current) continue;
    if (/cover|letter|why|interest/i.test(lbl) && p.coverLetter) {
      await ta.fill(p.coverLetter).catch(() => {});
    } else if (/summary|about|background/i.test(lbl) && p.summary) {
      await ta.fill(p.summary).catch(() => {});
    } else if (/experience|work history|employment/i.test(lbl) && expBlock) {
      await ta.fill(expBlock).catch(() => {});
    }
  }

  // ── Yes/No radios — default Yes (authorized to work, etc.) ───────────────
  for (const radio of await page.locator("label:has-text('Yes')").all()) {
    if (await isVisible(radio)) await radio.click().catch(() => {});
  }

  // ── Dropdowns ─────────────────────────────────────────────────────────────
  for (const sel of await page.locator("select:visible").all()) {
    const current = await sel.inputValue().catch(() => "");
    if (current) continue;
    const lbl = await labelFor(sel);
    if (/country/i.test(lbl))   await sel.selectOption({ label: "United States" }).catch(() => {});
    else if (/auth|work/i.test(lbl)) await sel.selectOption({ index: 1 }).catch(() => {});
  }

  await delay(800, 200);
}

// ─── Multi-step form navigator ────────────────────────────────────────────────
async function navigateAndSubmit(page, profile, resumePath, atsProvider = "") {
  const SUBMIT_SELECTORS = [
    "button[type='submit']:visible",
    "button:has-text('Submit application'):visible",
    "button:has-text('Submit my application'):visible",
    "button:has-text('Submit'):visible",
    "button:has-text('Send application'):visible",
    "button:has-text('Send my application'):visible",
    "input[type='submit']:visible",
  ].join(", ");

  const NEXT_SELECTORS = [
    "button:has-text('Next'):visible",
    "button:has-text('Continue'):visible",
    "button:has-text('Next step'):visible",
    "button[aria-label*='Next']:visible",
    "button:has-text('Save and continue'):visible",
  ].join(", ");

  // ── Step 0: look for an "Apply" / "Apply Now" button on the job description page
  // Many job sites (Lever, company pages) show the description first, then require
  // clicking Apply to reach the actual form.
  const APPLY_BTN_SELECTORS = [
    "a:has-text('Apply for this job'):visible",
    "a:has-text('Apply Now'):visible",
    "a:has-text('Apply now'):visible",
    "a:has-text('Apply'):visible",
    "button:has-text('Apply for this job'):visible",
    "button:has-text('Apply Now'):visible",
    "button:has-text('Apply now'):visible",
    "a[href*='apply']:visible",
  ].join(", ");

  try {
    const applyBtn = page.locator(APPLY_BTN_SELECTORS).first();
    if (await isVisible(applyBtn)) {
      const href = await applyBtn.getAttribute("href").catch(() => null);
      if (href && href.startsWith("http")) {
        await page.goto(href, { waitUntil: "domcontentloaded", timeout: 20_000 });
      } else {
        await applyBtn.click();
        await page.waitForLoadState("domcontentloaded").catch(() => {});
      }
      await delay(2000, 500);
    }
  } catch { /* ignore — might already be on the form */ }

  for (let step = 0; step < 12; step++) {
    await fillATSForm(page, profile, resumePath, atsProvider);

    const submitBtn = page.locator(SUBMIT_SELECTORS).first();
    if (await isVisible(submitBtn)) {
      await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
      await submitBtn.click();
      await delay(2500, 500);
      return { submitted: true };
    }

    const nextBtn = page.locator(NEXT_SELECTORS).first();
    if (await isVisible(nextBtn)) {
      await nextBtn.scrollIntoViewIfNeeded().catch(() => {});
      await nextBtn.click();
      await delay(1800, 400);
    } else {
      break; // no Next or Submit found
    }
  }
  return { submitted: false };
}

// ─── Apply to ATS job via Playwright (no Simplify needed) ─────────────────────
async function openWithSimplify(url, job, profile) {
  if (!url) return { success: false, reason: "No URL available" };

  let mode = process.env.SIMPLIFY_MODE || "shell";
  if (IS_SERVER && mode === "shell") mode = "playwright";
  const autoSubmit = process.env.SIMPLIFY_AUTO_SUBMIT === "true";

  // ── Off mode: queue for manual review ─────────────────────────────────────
  if (mode === "off") {
    return { success: false, reason: "Auto-apply disabled — queued for manual apply", autoApplied: false };
  }

  // ── Shell mode: open in running Chrome (user submits manually) ────────────
  if (mode === "shell") {
    try {
      if (process.platform === "win32") await execAsync(`start "" "${url}"`);
      else if (process.platform === "darwin") await execAsync(`open -a "Google Chrome" "${url}"`);
      else await execAsync(`google-chrome "${url}" 2>/dev/null || xdg-open "${url}"`);
      return { success: false, reason: "Opened in Chrome — fill and submit manually", browserOpened: true, simplifyUsed: true, autoApplied: false };
    } catch (err) {
      return { success: false, reason: `Could not open Chrome: ${err.message}` };
    }
  }

  // ── Playwright mode: launch headless Chromium, fill form directly, submit ────
  try {
    if (!_simplifyContext) {
      const browser = await getBrowser(); // reuse shared headless Chromium
      _simplifyContext = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      });
    }

    const page = await _simplifyContext.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Detect ATS provider from URL
    const atsHint = url.includes("greenhouse") ? "greenhouse"
      : url.includes("lever.co")   ? "lever"
      : url.includes("ashbyhq")    ? "ashby"
      : url.includes("workday")    ? "workday"
      : "other";

    if (autoSubmit) {
      const { submitted } = await navigateAndSubmit(page, profile, (profile || {}).resumePath, atsHint);
      if (submitted) {
        await page.close().catch(() => {});
        return { success: true, reason: `Auto-filled and submitted (${atsHint})`, autoApplied: true };
      }
      // Form filled but submit not found — leave page open for user
      return { success: false, reason: `Form filled (${atsHint}) — could not find Submit button, left open`, browserOpened: true, autoApplied: false };
    }

    // autoSubmit=false — just fill the form and leave it open
    await fillATSForm(page, profile, (profile || {}).resumePath, atsHint);
    return { success: false, reason: `Form pre-filled (${atsHint}) — click Submit to finish`, browserOpened: true, autoApplied: false };

  } catch (err) {
    _simplifyContext = null;
    // Fallback: open in shell Chrome
    try {
      if (process.platform === "win32") await execAsync(`start "" "${url}"`);
      else await execAsync(`open "${url}"`);
      return { success: false, reason: `Playwright failed (${err.message}) — opened in Chrome`, browserOpened: true };
    } catch {
      return { success: false, reason: `Could not apply: ${err.message}` };
    }
  }
}

// ─── LinkedIn Easy Apply Direct Scraper ──────────────────────────────────────
// Logs into LinkedIn, searches for Easy Apply jobs, returns array of job objects.
// No Apify needed — runs entirely via Playwright.
export async function scrapeLinkedInEasyApply(credentials, titles = [], locations = [], maxJobs = 25) {
  if (!credentials?.linkedinEmail || !credentials?.linkedinPassword) return [];

  let context;
  try {
    context = await ensureLinkedInLogin(credentials);
  } catch (err) {
    return [];
  }

  const jobs = [];
  const seenUrls = new Set();

  for (const title of titles.slice(0, 4)) {
    for (const location of locations.slice(0, 2)) {
      if (jobs.length >= maxJobs) break;
      const page = await context.newPage();
      try {
        const searchUrl =
          `https://www.linkedin.com/jobs/search/?` +
          `keywords=${encodeURIComponent(title)}` +
          `&location=${encodeURIComponent(location)}` +
          `&f_LF=f_AL` +   // Easy Apply filter
          `&sortBy=R` +     // Most recent
          `&start=0`;

        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await delay(2500, 500);

        // Scroll to load more results
        await page.evaluate(() => window.scrollBy(0, 800)).catch(() => {});
        await delay(1500, 300);

        // Grab all job cards
        const jobCards = await page.locator("li.jobs-search-results__list-item, div.job-card-container").all();

        for (const card of jobCards.slice(0, 15)) {
          if (jobs.length >= maxJobs) break;
          try {
            await card.click();
            await delay(1500, 400);

            // Get job URL from the detail pane or card link
            const jobUrl = await page.locator(
              "a.job-details-jobs-unified-top-card__job-title-link, a.jobs-apply-button, .jobs-details__main-content a"
            ).first().getAttribute("href").catch(() => null)
              || page.url();

            const fullUrl = jobUrl?.startsWith("http")
              ? jobUrl
              : jobUrl ? `https://www.linkedin.com${jobUrl}` : page.url();

            if (seenUrls.has(fullUrl)) continue;
            seenUrls.add(fullUrl);

            // Check Easy Apply badge
            const easyApplyBtn = page.locator("button.jobs-apply-button").first();
            const btnText = (await easyApplyBtn.innerText().catch(() => "")).toLowerCase();
            if (!btnText.includes("easy apply")) continue;

            // Scrape title, company, location
            const jobTitle    = await page.locator(".job-details-jobs-unified-top-card__job-title, h1.t-24").first().innerText().catch(() => "");
            const company     = await page.locator(".job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name").first().innerText().catch(() => "");
            const loc         = await page.locator(".job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__workplace-type").first().innerText().catch(() => location);
            const description = await page.locator(".jobs-description__content, .show-more-less-html__markup").first().innerText().catch(() => "");
            const salary      = await page.locator("[class*='salary'], .compensation__salary-range-text").first().innerText().catch(() => "");

            if (!jobTitle || !company) continue;

            jobs.push({
              id:          `li-direct-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
              title:       jobTitle.trim(),
              company:     company.trim(),
              location:    loc.trim() || location,
              applyUrl:    fullUrl,
              url:         fullUrl,
              platform:    "linkedin",
              easyApply:   true,
              description: description.trim().slice(0, 2000),
              salary:      salary.trim(),
              postedAt:    new Date().toISOString(),
              skills:      [],
              via:         "LinkedIn Direct",
            });
          } catch { /* skip card errors */ }
        }
      } catch (err) {
        // continue to next title/location
      } finally {
        await page.close().catch(() => {});
      }
    }
  }

  return jobs;
}

// ─── Extract job details from LinkedIn page ───────────────────────────────────
export async function scrapeJobDetails(page) {
  const get = (sel) => page.locator(sel).first().innerText().catch(() => "");
  const getAll = (sel) => page.locator(sel).allInnerTexts().catch(() => []);
  const [description, salary, skills, insights] = await Promise.all([
    get(".jobs-description__content, .show-more-less-html__markup, .job-details-jobs-unified-top-card__primary-description-without-tagline"),
    get("[class*='salary'], .compensation__salary-range-text"),
    getAll(".job-details-skill-match-status-list li, .job-details-how-you-match__skills-item"),
    getAll(".job-details-jobs-unified-top-card__job-insight span"),
  ]);
  return {
    description: description.trim().slice(0, 3000),
    salary: salary.trim(),
    skills: skills.filter(Boolean).slice(0, 20),
    workMode: insights.find((t) => /remote|hybrid|on.site/i.test(t)) || "",
    jobType: insights.find((t) => /full.time|part.time|contract|intern/i.test(t)) || "",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function delay(base, jitter = 0) {
  return new Promise((r) => setTimeout(r, base + Math.random() * jitter));
}

async function isVisible(locator) {
  return locator.isVisible({ timeout: 600 }).catch(() => false);
}

async function labelFor(inputLocator) {
  return inputLocator.evaluate((el) => {
    const lbl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
    return (lbl?.innerText || el.placeholder || el.getAttribute("aria-label") || "").toLowerCase();
  }).catch(() => "");
}
