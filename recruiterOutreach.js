// ─── Recruiter Outreach Engine ────────────────────────────────────────────────
// Finds recruiters at target companies on LinkedIn and sends personalized
// connection requests. Respects daily limits to avoid account restrictions.

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const COOKIES_PATH = path.resolve("cookies/linkedin-outreach.json");
const DAILY_LIMIT  = 10;   // LinkedIn safe limit per day

// ── Recruiter title keywords ──────────────────────────────────────────────────
const RECRUITER_TITLES = [
  "Technical Recruiter",
  "Tech Recruiter",
  "Engineering Recruiter",
  "Talent Acquisition",
  "Senior Recruiter",
  "Staff Recruiter",
  "Recruiting Manager",
  "HR Recruiter",
  "Talent Partner",
];

let _browser = null;
let _context = null;

async function getBrowser() {
  if (!_browser) {
    _browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return _browser;
}

async function getContext(credentials) {
  if (_context) return _context;
  const browser = await getBrowser();

  // Load saved cookies if they exist
  const contextOpts = {
    viewport:  { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  };
  if (fs.existsSync(COOKIES_PATH)) {
    contextOpts.storageState = COOKIES_PATH;
  }

  _context = await browser.newContext(contextOpts);

  // Login if needed
  const page = await _context.newPage();
  await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded", timeout: 20_000 });
  const isLoggedIn = await page.locator(".global-nav__me-photo, [data-test-id='nav-settings__open-menu']").isVisible({ timeout: 3000 }).catch(() => false);

  if (!isLoggedIn) {
    await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
    await delay(1000);
    await page.fill("#username", credentials.linkedinEmail);
    await page.fill("#password", credentials.linkedinPassword);
    await page.click('[data-litms-control-urn="login-submit"]');
    try { await page.waitForURL("**/feed/**", { timeout: 30_000 }); }
    catch { await page.waitForURL("**/feed/**", { timeout: 90_000 }); } // 2FA
    // Save cookies
    const dir = path.dirname(COOKIES_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await _context.storageState({ path: COOKIES_PATH });
  }

  await page.close();
  return _context;
}

// ── Search for recruiters at a company ───────────────────────────────────────
export async function findRecruiters(credentials, companyName, titleKeyword = "Technical Recruiter", maxResults = 5) {
  const context = await getContext(credentials);
  const page    = await context.newPage();
  const recruiters = [];

  try {
    const query    = encodeURIComponent(`${titleKeyword} ${companyName}`);
    const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${query}&origin=GLOBAL_SEARCH_HEADER`;

    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await delay(2500);

    // Grab person cards from search results
    const cards = await page.locator(".reusable-search__result-container, li.reusable-search__result-container").all();

    for (const card of cards.slice(0, maxResults)) {
      try {
        const name    = await card.locator(".entity-result__title-text, span[aria-hidden='true']").first().innerText().catch(() => "");
        const title   = await card.locator(".entity-result__primary-subtitle").first().innerText().catch(() => "");
        const company = await card.locator(".entity-result__secondary-subtitle").first().innerText().catch(() => "");
        const profileUrl = await card.locator("a.app-aware-link").first().getAttribute("href").catch(() => "");

        if (!name.trim()) continue;

        recruiters.push({
          name:    name.trim().replace(/\n.*/s, ""),   // strip extra lines
          title:   title.trim(),
          company: company.trim(),
          profileUrl: profileUrl?.split("?")[0] || "",  // clean tracking params
        });
      } catch { /* skip card */ }
    }
  } finally {
    await page.close();
  }

  return recruiters;
}

// ── Send a connection request with a personalized note ───────────────────────
export async function sendConnectionRequest(credentials, recruiter, message) {
  const context = await getContext(credentials);
  const page    = await context.newPage();
  const result  = { sent: false, reason: "" };

  try {
    if (!recruiter.profileUrl) throw new Error("No profile URL");

    await page.goto(recruiter.profileUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await delay(2000);

    // Click Connect button
    const connectBtn = await findFirst(page, [
      "button:has-text('Connect')",
      "button[aria-label*='Connect']",
    ]);
    if (!connectBtn) {
      result.reason = "No Connect button (already connected or Message only)";
      return result;
    }
    await connectBtn.click();
    await delay(1500);

    // Click "Add a note" if available
    const addNoteBtn = await findFirst(page, [
      "button:has-text('Add a note')",
      "button[aria-label*='Add a note']",
    ]);
    if (addNoteBtn) {
      await addNoteBtn.click();
      await delay(800);

      // Fill the message (LinkedIn limits to 300 chars)
      const textarea = page.locator("textarea[name='message'], textarea#custom-message").first();
      if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
        await textarea.fill(message.slice(0, 300));
        await delay(500);
      }
    }

    // Send
    const sendBtn = await findFirst(page, [
      "button:has-text('Send invitation')",
      "button:has-text('Send')",
      "button[aria-label='Send invitation']",
    ]);
    if (!sendBtn) throw new Error("Send button not found");
    await sendBtn.click();
    await delay(1500);

    result.sent   = true;
    result.reason = "Connection request sent with note";
  } catch (err) {
    result.reason = err.message;
  } finally {
    await page.close();
  }

  return result;
}

// ── Run a full outreach campaign for one cycle ────────────────────────────────
// Finds recruiters at multiple companies and sends connection requests.
// Respects daily limit. Returns summary of what was sent.
export async function runOutreachCycle(credentials, profile, targetCompanies = [], sentToday = 0) {
  const results = [];
  let sent = sentToday;

  for (const company of targetCompanies) {
    if (sent >= DAILY_LIMIT) break;

    for (const titleKw of RECRUITER_TITLES.slice(0, 3)) {
      if (sent >= DAILY_LIMIT) break;

      try {
        const recruiters = await findRecruiters(credentials, company, titleKw, 3);

        for (const recruiter of recruiters) {
          if (sent >= DAILY_LIMIT) break;

          // Generate personalized note
          const note = buildConnectionNote(profile, recruiter, company);

          const res = await sendConnectionRequest(credentials, recruiter, note);
          results.push({
            recruiter: recruiter.name,
            company,
            title: recruiter.title,
            profileUrl: recruiter.profileUrl,
            sent:   res.sent,
            reason: res.reason,
            note,
            sentAt: new Date().toISOString(),
          });

          if (res.sent) sent++;
          await delay(3000, 1000);  // wait between requests
        }
      } catch (err) {
        results.push({ company, error: err.message, sent: false });
      }
    }
  }

  return { results, totalSent: sent - sentToday };
}

// ── Build a personalized connection note ─────────────────────────────────────
function buildConnectionNote(profile, recruiter, company) {
  const firstName = recruiter.name?.split(" ")[0] || "there";
  const myName    = profile.name?.split(" ")[0] || "I";
  const skills    = (profile.skills || []).slice(0, 3).join(", ") || "data science";
  const exp       = profile.yearsExperience ? `${profile.yearsExperience}+ years` : "several years";
  const role      = (profile.targetRoles || "Data Scientist").split(",")[0].trim();

  // Keep under 300 chars (LinkedIn limit)
  const templates = [
    `Hi ${firstName}, I'm a ${role} with ${exp} of experience in ${skills}. I noticed ${company} is growing and would love to connect about any opportunities. Happy to share my resume!`,
    `Hi ${firstName}! ${myName} has ${exp} in ${skills} and is actively looking for ${role} roles. ${company}'s work really interests me — would love to be on your radar!`,
    `Hey ${firstName}, I'm an experienced ${role} (${skills}) exploring new opportunities. ${company} looks like a great fit — would love to connect and learn more!`,
  ];

  const note = templates[Math.floor(Math.random() * templates.length)];
  return note.slice(0, 300);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function delay(ms, jitter = 0) {
  return new Promise(r => setTimeout(r, ms + Math.random() * jitter));
}

async function findFirst(page, selectors) {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 1500 }).catch(() => false)) return el;
  }
  return null;
}

export async function closeOutreachBrowser() {
  if (_browser) await _browser.close().catch(() => {});
  _browser = null;
  _context = null;
}
