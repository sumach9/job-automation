import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { extractFormFields, aiMapFields, applyFieldMapping } from "./src/ai/formMapper.js";

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

  // LinkedIn Easy Apply — only works if the URL is a direct job post (not a search page)
  // SerpAPI returns linkedin.com/jobs/view/... URLs which have an Easy Apply button
  if (platform === "linkedin") {
    if (!credentials?.linkedinEmail) {
      return { success: false, reason: "No LinkedIn credentials — set LINKEDIN_EMAIL in .env", autoApplied: false };
    }
    return applyLinkedIn({ jobUrl: applyUrl, credentials, profile, resumePath });
  }

  // Indeed — skip listing pages (they redirect to company ATS anyway)
  // Extract the actual apply URL from Indeed if possible, else fall through to AI filler
  if (platform === "indeed") {
    if (!credentials?.linkedinEmail) {
      // No credentials — try the AI filler on the Indeed apply page directly
      return openWithSimplify(applyUrl, job, profile);
    }
    return applyIndeed({ jobUrl: applyUrl, credentials, profile, resumePath });
  }

  // Glassdoor / ZipRecruiter / direct company ATS pages — use AI form filler
  if (platform === "glassdoor" || platform === "ziprecruiter") {
    // These are listing pages, not apply forms — skip to avoid useless tab opens
    return { success: false, reason: `${platform} listing page — not a direct apply form`, autoApplied: false };
  }

  // Greenhouse, Lever, Ashby, Workday, company sites — AI fills the form directly
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
    await delay(2000, 500);
    const jobDetails = await scrapeJobDetails(page);

    // ── Find Easy Apply button (updated 2024-2025 selectors) ────────────────
    const easyApplySelectors = [
      "button[aria-label*='Easy Apply']",
      "button.jobs-apply-button",
      "button[class*='jobs-apply-button']",
      ".jobs-apply-button--top-card",
      "button:has-text('Easy Apply')",
    ];
    let btn = null;
    for (const sel of easyApplySelectors) {
      const el = page.locator(sel).first();
      if (await isVisible(el)) { btn = el; break; }
    }
    if (!btn) {
      // Not an Easy Apply job — log and skip (don't open browser)
      return { ...result, reason: "No Easy Apply button — external application", jobDetails };
    }

    await btn.click();
    await delay(2500, 500);

    // ── Multi-step form loop ─────────────────────────────────────────────────
    for (let step = 0; step < 20; step++) {
      await delay(1000, 400);
      await fillLinkedInStep(page, profile, resumePath);

      // Check for submit button first
      const submitBtn = page.locator([
        "button[aria-label*='Submit application']",
        "button:has-text('Submit application')",
        "button:has-text('Submit Application')",
      ].join(", ")).first();

      if (await isVisible(submitBtn)) {
        await submitBtn.click();
        await delay(2500, 300);
        // Check for success confirmation
        const confirmed = await page.locator([
          "h3:has-text('application was sent')",
          "div:has-text('Your application was sent')",
          ".artdeco-inline-feedback--success",
          "h2:has-text('applied')",
        ].join(", ")).first().isVisible({ timeout: 3000 }).catch(() => false);
        return {
          success: true,
          reason: confirmed ? "Submitted via LinkedIn Easy Apply ✅" : "Clicked Submit (unconfirmed)",
          autoApplied: true,
          jobDetails,
        };
      }

      // Check for Next / Review / Continue
      const nextBtn = page.locator([
        "button[aria-label*='Continue to next step']",
        "button[aria-label*='Review your application']",
        "button:has-text('Next')",
        "button:has-text('Review')",
        "button:has-text('Continue')",
      ].join(", ")).first();

      if (await isVisible(nextBtn)) {
        await nextBtn.click();
        continue;
      }

      // Dismiss any error/warning modals
      const dismissBtn = page.locator("button[aria-label*='Dismiss']").first();
      if (await isVisible(dismissBtn)) {
        await dismissBtn.click();
        continue;
      }

      result.reason = "Could not find Next or Submit button";
      break;
    }
    return { ...result, reason: result.reason || "Form exceeded step limit", jobDetails };
  } catch (err) {
    return { ...result, reason: err.message, jobDetails: {} };
  } finally {
    await page.close().catch(() => {});
  }
}

async function fillLinkedInStep(page, profile, resumePath) {
  // ── Phone number ─────────────────────────────────────────────────────────
  const phoneInput = page.locator([
    "input[id*='phoneNumber']",
    "input[name*='phone']",
    "input[id*='phone']",
  ].join(", ")).first();
  if (await isVisible(phoneInput) && !(await phoneInput.inputValue().catch(() => ""))) {
    await phoneInput.fill(profile.phone || "");
  }

  // ── Resume upload ─────────────────────────────────────────────────────────
  if (resumePath && fs.existsSync(resumePath)) {
    const fileInput = page.locator("input[type='file']").first();
    if (await isVisible(fileInput)) {
      await fileInput.setInputFiles(resumePath).catch(() => {});
      await delay(2500, 500);
    }
  }

  // ── Yes/No questions — click "Yes" labels ──────────────────────────────────
  const yesLabels = await page.locator("label:has-text('Yes')").all();
  for (const label of yesLabels) {
    if (await isVisible(label)) await label.click().catch(() => {});
  }
  // Also handle radio inputs with value "Yes"
  for (const r of await page.locator("input[type='radio'][value='Yes'], input[type='radio'][value='yes']").all()) {
    await r.check().catch(() => {});
  }

  // ── Text / number / tel inputs ─────────────────────────────────────────────
  const inputs = await page.locator("input[type='text']:visible, input[type='tel']:visible, input[type='number']:visible").all();
  for (const input of inputs) {
    const val = await input.inputValue().catch(() => "");
    if (val) continue;   // already filled
    const lbl = await labelFor(input);
    if (!lbl) continue;
    if      (lbl.match(/city|location|address/))         await input.fill(profile.location   || "Seattle, WA").catch(() => {});
    else if (lbl.match(/linkedin|profile.*url/))          await input.fill(profile.linkedinUrl || "").catch(() => {});
    else if (lbl.match(/website|portfolio|github/))       await input.fill(profile.website    || "").catch(() => {});
    else if (lbl.match(/year|experience/))                await input.fill(String(profile.yearsExperience || "5")).catch(() => {});
    else if (lbl.match(/salary|compensation|expected/))   await input.fill(profile.expectedSalary || "").catch(() => {});
    else if (lbl.match(/first.*name|fname/))              await input.fill(profile.name?.split(" ")[0] || "").catch(() => {});
    else if (lbl.match(/last.*name|lname|surname/))       await input.fill(profile.name?.split(" ").slice(1).join(" ") || "").catch(() => {});
  }

  // ── Dropdowns ──────────────────────────────────────────────────────────────
  for (const sel of await page.locator("select:visible").all()) {
    const current = await sel.inputValue().catch(() => "");
    if (current) continue;
    const lbl = await labelFor(sel);
    if      (lbl.includes("country"))                     await sel.selectOption({ label: "United States" }).catch(() => {});
    else if (lbl.match(/authorize|work.*in|eligible/))    await sel.selectOption({ index: 1 }).catch(() => {});
    else if (lbl.includes("sponsor"))                     await sel.selectOption({ label: "No" }).catch(() => {});
    else if (lbl.match(/gender|ethnicity|veteran|disability/)) { /* skip demographic fields */ }
    else                                                   await sel.selectOption({ index: 1 }).catch(() => {});
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

  // ── Playwright + AI mapper mode ───────────────────────────────────────────
  let page = null;
  try {
    if (!_simplifyContext) {
      const browser = await getBrowser();
      _simplifyContext = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      });
    }

    page = await _simplifyContext.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await delay(1500, 500);

    // ── Detect login/auth walls early — skip instead of timing out ────────────
    const isLoginPage = await page.evaluate(() => {
      const hasUserPass = document.querySelector('input[type="password"]') &&
        (document.querySelector('#username,input[name="username"],input[name="email"],input[type="email"]'));
      const hasLoginText = /sign\s*in|log\s*in|create\s*account|register\s*to\s*apply/i.test(
        document.title + " " + (document.querySelector("h1,h2")?.innerText || "")
      );
      const fieldCount = document.querySelectorAll('input:not([type="hidden"]),textarea,select').length;
      return (hasUserPass || hasLoginText) && fieldCount <= 4;
    }).catch(() => false);

    if (isLoginPage) {
      await page.close().catch(() => {});
      return { success: false, reason: "Login/auth wall detected — skipping", autoApplied: false };
    }

    // Click Apply / Apply Now if this is a job description page (not the form yet)
    const applyBtnSel = [
      "a:has-text('Apply for this job')", "a:has-text('Apply Now')", "a:has-text('Apply now')",
      "button:has-text('Apply for this job')", "button:has-text('Apply Now')", "button:has-text('Apply now')",
      "button:has-text('Start Application')", "button:has-text('Apply Online')",
    ].join(", ");
    try {
      const applyBtn = page.locator(applyBtnSel).first();
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
    } catch { /* already on form */ }

    // ── AI-powered multi-step filling loop ────────────────────────────────
    const SUBMIT_SEL = [
      "button[type='submit']:visible", "input[type='submit']:visible",
      "button:has-text('Submit application'):visible", "button:has-text('Submit my application'):visible",
      "button:has-text('Submit'):visible", "button:has-text('Send application'):visible",
      "button:has-text('Send my application'):visible",
    ].join(", ");

    const NEXT_SEL = [
      "button:has-text('Next'):visible", "button:has-text('Continue'):visible",
      "button:has-text('Next step'):visible", "button:has-text('Save and continue'):visible",
      "button[aria-label*='Next']:visible",
    ].join(", ");

    let filledTotal = 0;
    const MAX_STEPS = 10;

    for (let step = 0; step < MAX_STEPS; step++) {
      // Extract fields on this step and ask AI to map them
      try {
        const formFields = await extractFormFields(page);
        if (formFields.length > 0) {
          const mapping = await aiMapFields(formFields, profile || {}, job || {});
          if (Object.keys(mapping).length > 0) {
            const { filled } = await applyFieldMapping(page, mapping, profile || {}, formFields);
            filledTotal += filled;
          }
        }
      } catch (aiErr) {
        // AI mapper failed — fall back to keyword filler for this step
        await fillATSForm(page, profile, (profile || {}).resumePath, "other");
      }

      await delay(800, 200);

      // Check for Submit button
      const submitBtn = page.locator(SUBMIT_SEL).first();
      if (await isVisible(submitBtn)) {
        if (autoSubmit) {
          await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
          await submitBtn.click();
          await delay(2500, 500);
          await page.close().catch(() => {});
          return { success: true, reason: `AI-filled and submitted (${filledTotal} fields)`, autoApplied: true };
        } else {
          await page.close().catch(() => {});
          return { success: false, reason: `Form filled (${filledTotal} fields) — autoSubmit is off`, autoApplied: false };
        }
      }

      // Click Next/Continue if available
      const nextBtn = page.locator(NEXT_SEL).first();
      if (await isVisible(nextBtn)) {
        await nextBtn.scrollIntoViewIfNeeded().catch(() => {});
        await nextBtn.click();
        await delay(1800, 400);
      } else {
        break; // no Next or Submit found
      }
    }

    // No submit button found — close tab, don't leave it hanging
    await page.close().catch(() => {});
    return {
      success: false,
      reason: filledTotal > 0
        ? `Filled ${filledTotal} fields but no Submit button found`
        : `No form fields found — URL may require login or is a listing page`,
      autoApplied: false,
    };

  } catch (err) {
    if (page) await page.close().catch(() => {}); // always close on error
    _simplifyContext = null;
    return { success: false, reason: `Apply error: ${err.message}`, autoApplied: false };
  }
}

// ─── LinkedIn Easy Apply Direct Scraper ──────────────────────────────────────
// Strategy 1: LinkedIn guest API (no login needed, fast, returns JSON)
// Strategy 2: Playwright with authenticated session (fallback)
export async function scrapeLinkedInEasyApply(credentials, titles = [], locations = [], maxJobs = 25) {
  const jobs = [];

  // ── Strategy 1: Guest API (no auth required) ────────────────────────────────
  for (const title of titles.slice(0, 5)) {
    for (const location of locations.slice(0, 2)) {
      if (jobs.length >= maxJobs) break;
      try {
        const guestJobs = await _scrapeLinkedInGuest(title, location, 10);
        jobs.push(...guestJobs);
        if (guestJobs.length > 0) {
          // eslint-disable-next-line no-console
          console.log(`[LinkedIn Guest] Found ${guestJobs.length} jobs for "${title}" in ${location}`);
        }
      } catch { /* fallthrough to Strategy 2 */ }
    }
  }

  if (jobs.length > 0) return jobs;

  // ── Strategy 2: Playwright with login (if guest API blocked) ────────────────
  if (!credentials?.linkedinEmail || !credentials?.linkedinPassword) return jobs;

  let context;
  try {
    context = await ensureLinkedInLogin(credentials);
  } catch {
    return jobs;
  }

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
          `&f_LF=f_AL` +
          `&sortBy=DD`;       // date descending

        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await delay(3000, 500);
        await page.evaluate(() => window.scrollBy(0, 600)).catch(() => {});
        await delay(1500, 300);

        // Updated card selectors (2024-2025 LinkedIn HTML)
        const jobCards = await page.locator([
          "li[data-occludable-job-id]",
          "li.scaffold-layout__list-item",
          "div[data-job-id]",
          ".jobs-search-results__list-item",
        ].join(", ")).all();

        for (const card of jobCards.slice(0, 12)) {
          if (jobs.length >= maxJobs) break;
          try {
            await card.click({ timeout: 3000 });
            await delay(1200, 300);

            // Get job ID from the card attribute
            const jobId = await card.getAttribute("data-occludable-job-id")
              || await card.getAttribute("data-job-id").catch(() => null);

            const jobUrl = jobId
              ? `https://www.linkedin.com/jobs/view/${jobId}/`
              : page.url();

            if (seenUrls.has(jobUrl)) continue;
            seenUrls.add(jobUrl);

            // Updated selectors for 2024-2025 LinkedIn
            const jobTitle = await page.locator([
              "h1.t-24.t-bold",
              ".job-details-jobs-unified-top-card__job-title h1",
              "h2[class*='top-card__title']",
              ".topcard__title",
            ].join(", ")).first().innerText().catch(() => "");

            const company = await page.locator([
              ".job-details-jobs-unified-top-card__company-name",
              "a[class*='company-name']",
              ".topcard__org-name-link",
              "[data-tracking-control-name='public_jobs_topcard-org-name']",
            ].join(", ")).first().innerText().catch(() => "");

            const loc = await page.locator([
              ".job-details-jobs-unified-top-card__bullet",
              ".topcard__flavor--bullet",
              "[class*='workplace-type']",
            ].join(", ")).first().innerText().catch(() => location);

            const description = await page.locator([
              ".jobs-description__content",
              ".show-more-less-html__markup",
              "#job-details",
              ".description__text",
            ].join(", ")).first().innerText().catch(() => "");

            // Check if Easy Apply button exists
            const hasEasyApply = await page.locator([
              "button.jobs-apply-button",
              "button[aria-label*='Easy Apply']",
              ".jobs-apply-button--top-card",
            ].join(", ")).first().isVisible({ timeout: 1000 }).catch(() => false);

            if (!jobTitle || !company) continue;

            jobs.push({
              id:          `li-pw-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
              title:       jobTitle.trim(),
              company:     company.trim(),
              location:    loc.trim() || location,
              applyUrl:    jobUrl,
              url:         jobUrl,
              platform:    "linkedin",
              easyApply:   hasEasyApply,
              description: description.trim().slice(0, 2000),
              salary:      "",
              postedAt:    new Date().toISOString(),
              skills:      [],
              via:         "LinkedIn Direct",
            });
          } catch { /* skip card */ }
        }
      } catch { /* skip title/location */ }
      finally { await page.close().catch(() => {}); }
    }
  }

  return jobs;
}

// ─── LinkedIn Guest API (no auth) ────────────────────────────────────────────
// Uses LinkedIn's unauthenticated job search endpoint — returns JSON job listings.
async function _scrapeLinkedInGuest(title, location, limit = 10) {
  const { default: axios } = await import("axios");
  const jobs = [];

  // Guest search endpoint (publicly accessible, no auth)
  const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?` +
    `keywords=${encodeURIComponent(title)}` +
    `&location=${encodeURIComponent(location)}` +
    `&f_LF=f_AL` +    // Easy Apply only
    `&sortBy=DD` +     // Date descending
    `&start=0`;

  const { data: html } = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept":     "text/html,application/xhtml+xml",
    },
    timeout: 20_000,
  });

  // Parse <li> elements from the HTML response
  const jobMatches = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)];

  for (const match of jobMatches.slice(0, limit)) {
    const li = match[1];

    // Extract job ID
    const idMatch = li.match(/data-entity-urn="[^"]*:(\d+)"/);
    const jobId   = idMatch?.[1];
    if (!jobId) continue;

    // Extract title
    const titleMatch = li.match(/class="[^"]*base-search-card__title[^"]*"[^>]*>([^<]+)</);
    const jobTitle   = titleMatch?.[1]?.trim();

    // Extract company
    const companyMatch = li.match(/class="[^"]*base-search-card__subtitle[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)</);
    const company      = companyMatch?.[1]?.trim();

    // Extract location
    const locMatch  = li.match(/class="[^"]*job-search-card__location[^"]*"[^>]*>([^<]+)</);
    const jobLoc    = locMatch?.[1]?.trim() || location;

    if (!jobTitle || !company) continue;

    jobs.push({
      id:        `li-guest-${jobId}`,
      title:     jobTitle,
      company,
      location:  jobLoc,
      url:       `https://www.linkedin.com/jobs/view/${jobId}/`,
      applyUrl:  `https://www.linkedin.com/jobs/view/${jobId}/`,
      platform:  "linkedin",
      easyApply: true,
      postedAt:  new Date().toISOString(),
      skills:    [],
      via:       "LinkedIn Guest",
    });
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
