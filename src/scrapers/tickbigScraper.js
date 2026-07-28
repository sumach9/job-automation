// ─── TickBig Job Scraper ───────────────────────────────────────────────────────
// Logs in via Playwright, reads BOTH JWT tokens from localStorage,
// then fetches jobs via the TickBig REST API using the correct dual-token auth.
//
// Auth discovery: TickBig requires BOTH headers:
//   Authorization: Bearer <accessToken>
//   refresh:       <refreshToken>
//
// NOTE: Applying requires Razorpay payment (₹1,500 per application).
//       This module ONLY handles job discovery / scraping, not applying.

import { chromium } from "playwright";
import axios from "axios";
import fs from "fs";
import path from "path";

const COOKIES_PATH = path.resolve("cookies/tickbig-session.json");
const BASE_URL     = "https://api.tickbig.com/api";
const JOBS_URL     = `${BASE_URL}/jobs`;

// ── Playwright singleton ──────────────────────────────────────────────────────
let _browser = null;

async function getBrowser() {
  if (!_browser) {
    _browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return _browser;
}

// ── Session cache (tokens valid for ~12h) ────────────────────────────────────
let _sessionCache = { accessToken: null, refreshToken: null, expiresAt: 0 };

async function getTokens(email, password) {
  // Return cached tokens if still valid
  if (_sessionCache.accessToken && Date.now() < _sessionCache.expiresAt) {
    return { accessToken: _sessionCache.accessToken, refreshToken: _sessionCache.refreshToken };
  }

  const browser  = await getBrowser();
  const contextOpts = {
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  };

  // Load saved session if available
  if (fs.existsSync(COOKIES_PATH)) {
    contextOpts.storageState = COOKIES_PATH;
  }

  const context = await browser.newContext(contextOpts);
  const page    = await context.newPage();

  try {
    await page.goto("https://www.tickbig.com/signin", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1000);

    // Check if already logged in (token in localStorage from saved session)
    let tokens = await readTokensFromStorage(page);

    if (!tokens.accessToken) {
      // Do a fresh login
      await page.locator('input[name="emailOrPhone"], input[type="email"]').first().fill(email);
      await page.locator('input[name="password"], input[type="password"]').first().fill(password);
      await page.locator("button.animeBtn, button[type='submit']").first().click();
      try { await page.waitForURL("**/home**", { timeout: 20_000 }); } catch {}
      await page.waitForTimeout(2000);

      tokens = await readTokensFromStorage(page);
    }

    if (!tokens.accessToken) {
      throw new Error("Could not retrieve TickBig access token after login");
    }

    // Persist session for next run
    const dir = path.dirname(COOKIES_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await context.storageState({ path: COOKIES_PATH });

    // Cache tokens (expire 11h from now)
    _sessionCache = { ...tokens, expiresAt: Date.now() + 11 * 3_600_000 };
    return tokens;

  } finally {
    await page.close();
    await context.close();
  }
}

async function readTokensFromStorage(page) {
  return page.evaluate(() => {
    try {
      // Primary storage: Redux persist or direct "token" key
      const raw = localStorage.getItem("token");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.accessToken) return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken || "" };
      }
      // Fallback: Redux persist:counter → auth slice
      const persist = localStorage.getItem("persist:counter");
      if (persist) {
        const outer = JSON.parse(persist);
        const auth  = JSON.parse(outer.auth || "{}");
        if (auth.token) return { accessToken: auth.token, refreshToken: auth.refreshToken || "" };
      }
    } catch {}
    return { accessToken: null, refreshToken: null };
  });
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * Fetch jobs from TickBig matching the given title / location keywords.
 *
 * @param {string} email       - TickBig account email
 * @param {string} password    - TickBig account password
 * @param {string} titleQuery  - e.g. "Data Scientist"
 * @param {string} location    - e.g. "Remote" or "Bangalore" (optional)
 * @param {number} pages       - how many pages of results to fetch (default 2)
 * @returns {Array}  Normalised job objects compatible with JobPilot schema
 */
export async function scrapeTickBig(email, password, titleQuery = "", location = "", pages = 2) {
  if (!email || !password) return [];

  const { accessToken, refreshToken } = await getTokens(email, password);

  const filterBody = {
    noticePeriod:  [],
    experience:    [],
    salary:        [],
    designation:   titleQuery ? [titleQuery] : [],
    location:      location   ? [location]   : [],
    rating:        [],
    skills:        [],
    ppostedBy:     [],
    subType:       "Professional",
    adminFor:      [],
  };

  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "refresh":       refreshToken,      // ← TickBig's required custom header
    "Content-Type":  "application/json",
    "Referer":       "https://www.tickbig.com/",
    "User-Agent":    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  };

  const allJobs = [];

  for (let p = 1; p <= pages; p++) {
    try {
      const { data } = await axios.post(
        `${JOBS_URL}?pageNo=${p}&limit=20&sort=false`,
        filterBody,
        { headers, timeout: 20_000 }
      );

      const jobs = data?.data?.jobs || [];
      if (jobs.length === 0) break;

      for (const j of jobs) allJobs.push(normalise(j));
      if (jobs.length < 20) break;
    } catch (err) {
      if (err.response?.status === 401) {
        // Token expired — invalidate and stop
        _sessionCache = { accessToken: null, refreshToken: null, expiresAt: 0 };
        break;
      }
      throw err;
    }
  }

  // Client-side keyword filter
  const query = titleQuery.toLowerCase();
  return allJobs.filter(j => {
    if (!query) return true;
    const text = `${j.title} ${j.description}`.toLowerCase();
    return query.split(/\s+/).some(word => text.includes(word));
  });
}

// ── Normalise a raw TickBig job into the JobPilot schema ──────────────────────
function normalise(j) {
  const salaryMin = j.salary?.min ?? null;
  const salaryMax = j.salary?.max ?? null;
  const currency  = j.salary?.currency || "INR";

  const salaryStr = salaryMin && salaryMax
    ? `${currency} ${(salaryMin / 100000).toFixed(1)}L – ${(salaryMax / 100000).toFixed(1)}L`
    : salaryMin
    ? `${currency} ${(salaryMin / 100000).toFixed(1)}L+`
    : "";

  const expStr = j.experience
    ? `${j.experience.min ?? 0}–${j.experience.max ?? "+"} years`
    : "";

  return {
    id:              `tickbig-${j._id}`,
    title:           j.designation?.trim() || "Unknown Position",
    company:         j.postedBy?.name || j.postedBy?.firstName || "Unknown Company",
    location:        j.location?.trim() || "Not specified",
    url:             "https://www.tickbig.com/jobs",
    applyUrl:        "https://www.tickbig.com/jobs",
    platform:        "TickBig",
    easyApply:       false,
    requiresPayment: true,   // Razorpay ₹1,500 per application
    postedAt:        j.createdAt || new Date().toISOString(),
    description:     stripHtml(j.responsibilities || j.requirements || ""),
    skills:          j.skills || [],
    salary:          salaryStr,
    experience:      expStr,
    jobType:         j.employmentType || "",
    noticePeriod:    j.noticePeriod || "",
    workMode:        j.location?.toLowerCase().includes("remote") ? "Remote" : "",
    rawId:           j._id,
  };
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
export async function closeTickBigBrowser() {
  if (_browser) await _browser.close().catch(() => {});
  _browser = null;
}

export function invalidateTickBigToken() {
  _sessionCache = { accessToken: null, refreshToken: null, expiresAt: 0 };
  if (fs.existsSync(COOKIES_PATH)) {
    try { fs.unlinkSync(COOKIES_PATH); } catch {}
  }
}
