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
      headless: false,
      slowMo: 70,
      args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
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
  // Open in Chrome with Simplify extension — it auto-fills every form field
  return openWithSimplify(applyUrl, job);
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
  process.env.DYNO ||                // Heroku
  (process.env.PORT && !process.env.LOCALAPPDATA)  // generic server heuristic
);

// ─── Simplify integration ─────────────────────────────────────────────────────
// Opens job in Chrome with Simplify extension active.
// Simplify auto-fills every form field (Workday, Greenhouse, Lever, Ashby, etc.)
// Two modes controlled by SIMPLIFY_MODE env var:
//   "playwright" — Playwright controls Chrome, can optionally auto-submit
//   "shell"      — Opens in existing Chrome window (default, most reliable)
//   "off"        — Disabled (queued for manual review)
async function openWithSimplify(url, job) {
  if (!url) return { success: false, reason: "No URL available" };

  // On cloud servers, shell mode makes no sense — auto-upgrade to playwright
  let mode = process.env.SIMPLIFY_MODE || "shell";
  if (IS_SERVER && mode === "shell") mode = "playwright";
  const autoSubmit = process.env.SIMPLIFY_AUTO_SUBMIT === "true";

  // ── Off mode: just queue for manual review ────────────────────────────────
  if (mode === "off") {
    return { success: false, reason: "Simplify disabled — queued for manual apply", autoApplied: false };
  }

  // ── Shell mode: open in running Chrome where Simplify is already active ──────
  if (mode === "shell") {
    try {
      if (process.platform === "win32") {
        await execAsync(`start "" "${url}"`);
      } else if (process.platform === "darwin") {
        await execAsync(`open -a "Google Chrome" "${url}"`);
      } else {
        await execAsync(`google-chrome "${url}" 2>/dev/null || xdg-open "${url}"`);
      }
      return {
        success: false,
        reason: "Opened in Chrome — Simplify will auto-fill all fields",
        browserOpened: true,
        simplifyUsed: true,
        autoApplied: false,
      };
    } catch (err) {
      return { success: false, reason: `Could not open Chrome: ${err.message}` };
    }
  }

  // ── Playwright mode: launch Chrome with Simplify extension loaded ─────────────
  try {
    if (!_simplifyContext) {
      // Find Simplify extension in user's Chrome profile
      const chromeExtDir = path.join(
        os.homedir(),
        "AppData", "Local", "Google", "Chrome", "User Data",
        "Default", "Extensions",
        "pbanhockgagggenencehbnadejlgchfc"
      );

      const extensionArgs = [];
      if (fs.existsSync(chromeExtDir)) {
        // Load from installed Chrome extension directory
        const versions = fs.readdirSync(chromeExtDir).sort().reverse();
        const extPath = path.join(chromeExtDir, versions[0]);
        extensionArgs.push(
          `--disable-extensions-except=${extPath}`,
          `--load-extension=${extPath}`
        );
      }

      // Use a dedicated automation profile to avoid conflicting with user's Chrome
      const automationProfile = path.join(
        os.homedir(),
        "AppData", "Local", "Google", "Chrome", "User Data", "Automation"
      );

      _simplifyContext = await chromium.launchPersistentContext(automationProfile, {
        channel: "chrome",
        headless: false,
        slowMo: 400,
        args: [
          "--no-first-run",
          "--no-default-browser-check",
          "--start-maximized",
          ...extensionArgs,
        ],
      });
    }

    const page = await _simplifyContext.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Give Simplify time to detect the form and fill all fields
    await delay(5000, 1000);

    if (autoSubmit) {
      // Try to find and click the final Submit button
      const submitBtn = page.locator([
        "button[aria-label*='Submit']:visible",
        "button:has-text('Submit application'):visible",
        "button:has-text('Submit my application'):visible",
        "button:has-text('Submit'):visible",
        "input[type='submit']:visible",
      ].join(", ")).first();

      if (await isVisible(submitBtn)) {
        await submitBtn.click();
        await delay(2000);
        return {
          success: true,
          reason: "Submitted via Simplify auto-fill + auto-submit",
          autoApplied: true,
          simplifyUsed: true,
        };
      }
    }

    // Leave open for user to review and click Submit
    return {
      success: false,
      reason: "Opened in Chrome with Simplify — form pre-filled, click Submit to finish",
      browserOpened: true,
      simplifyUsed: true,
      autoApplied: false,
    };

  } catch (err) {
    // Playwright mode failed — fall back to shell open
    _simplifyContext = null;
    try {
      if (process.platform === "win32") await execAsync(`start "" "${url}"`);
      else await execAsync(`open "${url}"`);
      return {
        success: false,
        reason: "Chrome opened via fallback — Simplify will auto-fill",
        browserOpened: true,
        simplifyUsed: true,
      };
    } catch {
      return { success: false, reason: `Simplify open failed: ${err.message}` };
    }
  }
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
