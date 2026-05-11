import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import schedule from "node-schedule";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import Stripe from "stripe";
import jwt from "jsonwebtoken";
import { smartApply, detectPlatform, resetSession } from "./autoApply.js";
import { scrapeATSDirect, GREENHOUSE_COMPANIES, LEVER_COMPANIES, ASHBY_COMPANIES, ATS_COMPANY_COUNT } from "./atsScrapers.js";
import { scoreJob, scoreLabel, scoreColor } from "./scorer.js";
import { generateViralImage } from "./imageGen.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

// ─── Auth config ─────────────────────────────────────────────────────────────
const JWT_SECRET    = process.env.JWT_SECRET    || "jobpilot-jwt-secret-change-in-production";
const ADMIN_USER    = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASS    = process.env.ADMIN_PASSWORD || "jobpilot2024";

// POST /api/auth/login  — public, no token required
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ sub: username, role: "admin" }, JWT_SECRET, { expiresIn: "30d" });
    return res.json({ ok: true, token, username });
  }
  return res.status(401).json({ ok: false, message: "Invalid username or password" });
});

// Auth middleware — protects all /api/* except login + stripe webhook
app.use("/api", (req, res, next) => {
  if (req.path === "/auth/login")       return next(); // already handled above
  if (req.path === "/billing/webhook")  return next(); // Stripe signs its own requests
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, message: "Unauthorized — please log in" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, message: "Session expired — please log in again" });
  }
});

// GET /api/auth/me — verify token and return user info
app.get("/api/auth/me", (req, res) => {
  res.json({ ok: true, username: req.user.sub, role: req.user.role });
});

// ─── Serve React build in production ───────────────────────────────────────
const clientBuild = path.join(__dirname, "client", "dist");
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
}

// ─── Persistent state file ──────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, "data.json");
const SCAN_HISTORY_FILE = path.join(__dirname, "scan-history.tsv");

// Ensure scan history file has headers
if (!fs.existsSync(SCAN_HISTORY_FILE)) {
  fs.writeFileSync(SCAN_HISTORY_FILE, "timestamp\tjobId\ttitle\tcompany\tplatform\turl\tstatus\tscore\n");
}

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  }
  return { applications: [], logs: [], foundJobs: [], profile: {} };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─── In-memory state ────────────────────────────────────────────────────────
let isRunning = false;
let schedulerJob = null;
let stats = { applied: 0, found: 0, skipped: 0, errors: 0 };
const _loaded = loadData();
const applications = _loaded.applications || [];
const logs        = _loaded.logs        || [];
// Reconstruct foundJobs from applications if not yet persisted
const foundJobs   = (_loaded.foundJobs && _loaded.foundJobs.length)
  ? _loaded.foundJobs
  : applications.map(a => ({
      id: a.id, title: a.title, company: a.company, location: a.location,
      url: a.url || a.applyUrl, platform: a.platform, atsProvider: a.atsProvider,
      score: a.score, scoreLabel: a.scoreLabel, scoreBreakdown: a.scoreBreakdown,
      description: a.description || "", salary: a.salary || "",
      skills: a.skills || [], matchedSkills: a.matchedSkills || [],
      savedAt: a.savedAt, easyApply: a.easyApply || false,
    }));
// Seed stats from persisted data on startup
stats.applied     = applications.length;
stats.found       = foundJobs.length;
stats.hotMatches  = foundJobs.filter(j => (j.score || 0) >= 3.5).length;

const settings = {
  jobTitles: (process.env.JOB_TITLES || "Data Scientist,Data Engineer").split(",").map((s) => s.trim()),
  locations: (process.env.JOB_LOCATIONS || "Remote,United States").split(",").map((s) => s.trim()),
  intervalMinutes: parseInt(process.env.INTERVAL_MINUTES || "5", 10),
  maxApplicationsPerRun: parseInt(process.env.MAX_APPS_PER_RUN || "10", 10),
  maxBrowserOpensPerCycle: parseInt(process.env.MAX_BROWSER_OPENS || "5", 10),
  emailNotifications: process.env.EMAIL_NOTIFICATIONS === "true",
  platforms: { linkedin: true, indeed: true, glassdoor: true, ziprecruiter: true, googlejobs: true, atsDirect: true },
  autoApplyEnabled: process.env.AUTO_APPLY_ENABLED === "true",
  apifyToken: process.env.APIFY_TOKEN || "",
  serpApiKey: process.env.SERPAPI_KEY || "",
  emailUser: process.env.EMAIL_USER || "",
  emailPass: process.env.EMAIL_PASS || "",
  notifyEmail: process.env.NOTIFY_EMAIL || "",
  linkedinEmail: process.env.LINKEDIN_EMAIL || "",
  linkedinPassword: process.env.LINKEDIN_PASSWORD || "",
  simplifyMode: process.env.SIMPLIFY_MODE || "shell",
  simplifyAutoSubmit: process.env.SIMPLIFY_AUTO_SUBMIT === "true",
  // Applicant profile — loaded from data.json, falls back to env vars
  profile: (() => {
    const p = _loaded.profile || {};
    return {
      name:            p.name            || process.env.APPLICANT_NAME || "",
      firstName:       p.firstName       || "",
      lastName:        p.lastName        || "",
      email:           p.email           || process.env.APPLICANT_EMAIL || process.env.EMAIL_USER || "",
      phone:           p.phone           || process.env.APPLICANT_PHONE || "",
      location:        p.location        || process.env.APPLICANT_LOCATION || "",
      linkedinUrl:     p.linkedinUrl     || "",
      github:          p.github          || "",
      website:         p.website         || "",
      school:          p.school          || "",
      degree:          p.degree          || "",
      major:           p.major           || "",
      yearsExperience: p.yearsExperience || process.env.APPLICANT_YEARS_EXPERIENCE || "",
      expectedSalary:  p.expectedSalary  || "",
      skills:          Array.isArray(p.skills) && p.skills.length ? p.skills : [],
      targetRoles:     p.targetRoles     || process.env.JOB_TITLES || "",
      education:       Array.isArray(p.education)    ? p.education    : [],
      experiences:     Array.isArray(p.experiences)  ? p.experiences  : [],
      remotePreference: p.remotePreference || "",
      summary:         p.summary         || "",
      coverLetter:     p.coverLetter     || "",
      resumePath:      p.resumePath      || process.env.RESUME_PATH || "",
      resumeFileName:  p.resumeFileName  || "",
      savedAt:         p.savedAt         || null,
    };
  })(),
};

// ─── Scan history (TSV audit trail like career-ops) ─────────────────────────
function logScanHistory(job, status) {
  const row = [
    new Date().toISOString(),
    job.id || "",
    (job.title || "").replace(/\t/g, " "),
    (job.company || "").replace(/\t/g, " "),
    (job.platform || "").replace(/\t/g, " "),
    (job.url || "").replace(/\t/g, " "),
    status,
    job.score ?? "",
  ].join("\t");
  fs.appendFileSync(SCAN_HISTORY_FILE, row + "\n");
}

// ─── Logging helper ─────────────────────────────────────────────────────────
function log(level, message, detail = "") {
  const entry = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    level,
    message,
    detail,
  };
  logs.unshift(entry);
  if (logs.length > 500) logs.splice(500);
  saveData({ applications, logs, foundJobs });
  console.log(`[${level.toUpperCase()}] ${message}${detail ? " — " + detail : ""}`);
}

// ─── Email helper ────────────────────────────────────────────────────────────
async function sendEmail(subject, html) {
  if (!settings.emailNotifications || !settings.emailUser || !settings.emailPass) return;
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: settings.emailUser, pass: settings.emailPass },
  });
  await transporter.sendMail({
    from: settings.emailUser,
    to: settings.notifyEmail || settings.emailUser,
    subject,
    html,
  });
}

// ─── Apify helpers ───────────────────────────────────────────────────────────
async function runApifyActor(actorId, input) {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${settings.apifyToken}`;
  const { data } = await axios.post(url, input, { timeout: 120_000 });
  return Array.isArray(data) ? data : [];
}

// ─── Platform scrapers ────────────────────────────────────────────────────────

async function scrapeLinkedIn(title, location) {
  // LinkedIn search URL with Easy Apply filter (f_LF=f_AL) and last 24h (f_TPR=r86400)
  const searchUrl =
    `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(title)}` +
    `&location=${encodeURIComponent(location)}&f_TPR=r86400&f_LF=f_AL`;

  // Try multiple well-known actors in order until one works
  const actors = [
    { id: "hemaet~linkedin-jobs-scraper",   input: { startUrls: [{ url: searchUrl }], maxItems: settings.maxApplicationsPerRun } },
    { id: "bebity~linkedin-jobs-scraper",   input: { startUrls: [{ url: searchUrl }], maxItems: settings.maxApplicationsPerRun } },
    { id: "curious_coder~linkedin-jobs-scraper", input: { queries: title, location, maxResults: settings.maxApplicationsPerRun } },
  ];

  for (const actor of actors) {
    try {
      const raw = await runApifyActor(actor.id, actor.input);
      if (!Array.isArray(raw) || raw.length === 0) continue;
      log("info", `LinkedIn: using actor ${actor.id}`);
      return raw.map((r) => ({
        id: `li-${r.jobId || r.id || Date.now() + Math.random()}`,
        title: r.title || r.jobTitle || title,
        company: r.companyName || r.company || "Unknown",
        location: r.location || r.jobLocation || location,
        url: r.jobUrl || r.url || "",
        easyApply: r.easyApply ?? true,
        postedAt: r.postedAt || r.datePosted || new Date().toISOString(),
        platform: "LinkedIn",
        description: (r.descriptionHtml || r.description || r.jobDescription || "").replace(/<[^>]+>/g, "").slice(0, 3000),
        skills: r.skills || [],
        salary: r.salary || r.salaryInfo || "",
        workMode: r.workType || r.workplaceType || "",
        jobType: r.contractType || r.employmentType || "",
      }));
    } catch (err) {
      log("warning", `LinkedIn actor ${actor.id} failed`, err.message);
    }
  }
  log("error", `LinkedIn scrape failed — all actors failed for "${title}"`);
  stats.errors++;
  return [];
}

async function scrapeIndeed(title, location) {
  try {
    const raw = await runApifyActor("misceres~indeed-scraper", {
      queries: [`${title} ${location}`],
      maxItems: settings.maxApplicationsPerRun,
      daysOld: 1,
    });
    return raw.map((r) => ({
      id: `in-${r.jobKey || r.id || Date.now() + Math.random()}`,
      title: r.positionName || r.title || title,
      company: r.company || "Unknown",
      location: r.location || location,
      url: r.url || r.jobUrl || "",
      easyApply: false,
      postedAt: r.postedAt || r.datePosted || new Date().toISOString(),
      platform: "Indeed",
      description: (r.description || "").slice(0, 3000),
      salary: r.salary || "",
      jobType: r.jobType || "",
    }));
  } catch (err) {
    log("error", `Indeed scrape failed — ${title}`, err.message);
    stats.errors++;
    return [];
  }
}

async function scrapeGlassdoor(title, location) {
  try {
    const raw = await runApifyActor("bebity~glassdoor-jobs-scraper", {
      keyword: title,
      location,
      maxItems: settings.maxApplicationsPerRun,
    });
    return raw.map((r) => ({
      id: `gd-${r.jobId || r.id || Date.now() + Math.random()}`,
      title: r.jobTitle || r.title || title,
      company: r.employer?.name || r.company || "Unknown",
      location: r.location || location,
      url: r.jobLink || r.url || "",
      easyApply: r.isEasyApply ?? false,
      postedAt: r.postedDate || r.datePosted || new Date().toISOString(),
      platform: "Glassdoor",
      description: (r.description || "").slice(0, 3000),
      salary: r.salary || r.payPeriod || "",
    }));
  } catch (err) {
    log("error", `Glassdoor scrape failed — ${title}`, err.message);
    stats.errors++;
    return [];
  }
}

async function scrapeZipRecruiter(title, location) {
  try {
    const raw = await runApifyActor("bebity~ziprecruiter-scraper", {
      searchQuery: title,
      location,
      maxItems: settings.maxApplicationsPerRun,
      daysAgo: 1,
    });
    return raw.map((r) => ({
      id: `zr-${r.id || Date.now() + Math.random()}`,
      title: r.title || r.job_title || title,
      company: r.hiring_company?.name || r.company_name || r.company || "Unknown",
      location: r.location || r.city || location,
      url: r.job_url || r.url || r.apply_url || "",
      easyApply: r.apply_is_easy ?? false,
      postedAt: r.posted_time || r.posted_at || new Date().toISOString(),
      platform: "ZipRecruiter",
      description: (r.snippet || r.description || "").slice(0, 3000),
      salary: r.salary || r.compensation || "",
      jobType: r.job_type || "",
    }));
  } catch (err) {
    log("error", `ZipRecruiter scrape failed — ${title}`, err.message);
    stats.errors++;
    return [];
  }
}

// ─── Google Jobs via SerpAPI ──────────────────────────────────────────────────
async function scrapeGoogleJobs(title, location) {
  if (!settings.serpApiKey) {
    log("warning", "No SerpAPI key — skipping Google Jobs");
    return [];
  }
  try {
    const { data } = await axios.get("https://serpapi.com/search", {
      params: {
        engine: "google_jobs",
        q: `${title} ${location}`,
        location,
        chips: "date_posted:today",   // today's postings only
        hl: "en",
        api_key: settings.serpApiKey,
      },
      timeout: 30_000,
    });

    const jobs = data.jobs_results || [];
    return jobs.map((r) => {
      // apply_options = actual job-board apply links (LinkedIn, Indeed, company portal)
      // related_links = company website / Google links — do NOT use for applying
      const applyOptions = (r.apply_options || []).filter(
        (l) => l.link && !l.link.includes("google.com")
      );
      const bestApplyUrl =
        applyOptions.find((l) => l.link.includes("linkedin.com"))?.link ||
        applyOptions.find((l) => l.link.includes("indeed.com"))?.link ||
        applyOptions.find((l) => l.link.includes("glassdoor.com"))?.link ||
        applyOptions.find((l) => l.is_direct)?.link ||   // company's own site
        applyOptions[0]?.link || "";

      return {
      id: `gj-${r.job_id || Date.now() + Math.random()}`,
      title: r.title || title,
      company: r.company_name || "Unknown",
      location: r.location || location,
      url:      bestApplyUrl,
      applyUrl: bestApplyUrl,
      easyApply: applyOptions.some((l) => l.link.includes("linkedin.com")),
      postedAt: r.detected_extensions?.posted_at
        ? new Date(Date.now() - parsePostedAt(r.detected_extensions.posted_at)).toISOString()
        : new Date().toISOString(),
      platform: "Google Jobs",
      via: r.via || "",
      description: (r.description || "").slice(0, 3000),
      skills: r.job_highlights?.find((h) => h.title === "Qualifications")?.items || [],
      salary: r.detected_extensions?.salary || "",
      workMode: r.detected_extensions?.work_from_home ? "Remote" : "",
      jobType: r.detected_extensions?.schedule_type || "",
      };
    });
  } catch (err) {
    log("error", `Google Jobs scrape failed — ${title}`, err.message);
    stats.errors++;
    return [];
  }
}

function parsePostedAt(text) {
  // "3 hours ago" → ms
  if (!text) return 0;
  const [n, unit] = text.toLowerCase().split(" ");
  const num = parseInt(n, 10) || 0;
  if (unit?.startsWith("hour"))   return num * 3_600_000;
  if (unit?.startsWith("minute")) return num * 60_000;
  if (unit?.startsWith("day"))    return num * 86_400_000;
  return 0;
}

// ─── Relevance filter ─────────────────────────────────────────────────────────
const RELEVANT_KEYWORDS = [
  "data scientist", "data engineer", "data analyst", "data entry",
  "ai engineer", "artificial intelligence", "machine learning", "ml engineer",
  "nlp engineer", "natural language", "generative ai", "gen ai",
  "deep learning", "llm", "applied scientist", "research scientist",
  "analytics engineer", "business intelligence", "bi analyst",
  "data science", "data platform", "data infrastructure",
];

const IRRELEVANT_KEYWORDS = [
  "aircraft", "legal", "attorney", "pharmacy", "pharmacist", "nurse",
  "physician", "doctor", "security clearance", "ts/sci", "secret clearance",
  "mechanical engineer", "civil engineer", "electrical engineer",
  "controls engineer", "construction", "manufacturing",
];

function isRelevant(job) {
  const text = `${job.title} ${job.description || ""}`.toLowerCase();
  const hasRelevant = RELEVANT_KEYWORDS.some((kw) => text.includes(kw));
  const hasIrrelevant = IRRELEVANT_KEYWORDS.some((kw) => text.includes(kw));
  return hasRelevant && !hasIrrelevant;
}

// ─── Multi-platform scrape ────────────────────────────────────────────────────
// Track already-seen URLs globally across all runs (for TSV dedup)
const seenUrls = new Set(foundJobs.map((j) => j.url).filter(Boolean));

async function scrapeAllPlatforms(title, location) {
  const promises = [];
  if (settings.apifyToken) {
    if (settings.platforms.linkedin)     promises.push(scrapeLinkedIn(title, location));
    if (settings.platforms.indeed)       promises.push(scrapeIndeed(title, location));
    if (settings.platforms.glassdoor)    promises.push(scrapeGlassdoor(title, location));
    if (settings.platforms.ziprecruiter) promises.push(scrapeZipRecruiter(title, location));
  }
  if (settings.platforms.googlejobs) promises.push(scrapeGoogleJobs(title, location));

  const results = await Promise.allSettled(promises);
  const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  // Deduplicate by URL and title+company
  const seen = new Set();
  const deduped = all.filter((job) => {
    const key = job.url || `${job.title}|${job.company}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Filter to relevant jobs only
  const relevant = deduped.filter(isRelevant);
  const removed = deduped.length - relevant.length;
  if (removed > 0) log("info", `Filtered out ${removed} irrelevant/duplicate jobs`);

  return relevant;
}

// ATS Direct scraping runs once per cycle (not per title/location — it already filters internally)
let _atsScrapePromise = null;
async function scrapeATSOnce() {
  if (_atsScrapePromise) return _atsScrapePromise;
  _atsScrapePromise = scrapeATSDirect({ logFn: log }).finally(() => { _atsScrapePromise = null; });
  return _atsScrapePromise;
}

function getMockJobs(title, location) {
  const platforms = ["LinkedIn", "Indeed", "Glassdoor", "ZipRecruiter", "Google Jobs"];
  const companies = ["Amazon", "Microsoft", "Meta", "Google", "Expedia"];
  return Array.from({ length: 4 }, (_, i) => ({
    id: `mock-${Date.now()}-${i}`,
    title,
    company: companies[i % companies.length],
    location,
    url: "https://linkedin.com/jobs/view/mock",
    easyApply: i % 2 === 0,
    postedAt: new Date().toISOString(),
    platform: platforms[i % platforms.length],
  }));
}

// ─── Application logic ───────────────────────────────────────────────────────
let browserOpensThisCycle = 0;   // reset each cycle — caps how many tabs open at once

async function applyToJob(job, { maxBrowserOpens = 5 } = {}) {
  const alreadyApplied = applications.some((a) => a.jobId === job.id);
  if (alreadyApplied) return false;

  let status = "queued-manual";
  let autoApplyResult = null;

  const applyUrl = job.applyUrl || job.url || "";
  const platform = detectPlatform(applyUrl);

  // LinkedIn/Indeed require login credentials; ATS/other only need autoApplyEnabled
  const hasLinkedInCreds = !!(settings.linkedinEmail && settings.linkedinPassword);
  const isLinkedInOrIndeed = platform === "linkedin" || platform === "indeed";

  // Cap browser opens per cycle (LinkedIn/Indeed Playwright doesn't count — it reuses one window)
  if (!isLinkedInOrIndeed && browserOpensThisCycle >= maxBrowserOpens) {
    // Hit the cap — queue for manual review instead
    const record = buildRecord(job, "queued-manual", null);
    applications.unshift(record);
    if (applications.length > 1000) applications.splice(1000);
    stats.applied++;
    saveData({ applications, logs, foundJobs });
    return true;
  }

  if (settings.autoApplyEnabled && applyUrl) {
    try {
      // LinkedIn / Indeed — need credentials to log in first
      if (isLinkedInOrIndeed && !hasLinkedInCreds) {
        status = "queued-manual";
        log("warning", `Skipped (no LinkedIn creds): ${job.title} @ ${job.company}`);
      } else {
        autoApplyResult = await smartApply({
          job,
          credentials: {
            linkedinEmail:    settings.linkedinEmail,
            linkedinPassword: settings.linkedinPassword,
            indeedEmail:      settings.linkedinEmail,
            indeedPassword:   settings.linkedinPassword,
          },
          profile:    settings.profile,
          resumePath: settings.profile.resumePath,
        });

        if (autoApplyResult.success) {
          status = "auto-applied";
          log("success", `✅ Auto-applied: ${job.title} @ ${job.company}`, autoApplyResult.reason);
        } else if (autoApplyResult.simplifyUsed && autoApplyResult.browserOpened) {
          status = "simplify-opened";
          browserOpensThisCycle++;
          log("info", `Simplify opened (${browserOpensThisCycle}/${maxBrowserOpens}): ${job.title} @ ${job.company}`);
        } else if (autoApplyResult.browserOpened) {
          status = "browser-opened";
          browserOpensThisCycle++;
          log("info", `Browser opened (${browserOpensThisCycle}/${maxBrowserOpens}): ${job.title} @ ${job.company}`);
        } else {
          status = "apply-failed";
          log("warning", `Auto-apply failed: ${job.title} @ ${job.company}`, autoApplyResult.reason);
        }
      }
    } catch (err) {
      status = "apply-failed";
      log("error", `Auto-apply error: ${job.title}`, err.message);
    }
  }

  const record = buildRecord(job, status, autoApplyResult);
  applications.unshift(record);
  if (applications.length > 1000) applications.splice(1000);
  stats.applied++;
  saveData({ applications, logs, foundJobs });
  return true;
}

function buildRecord(job, status, autoApplyResult) {
  return {
    id: Date.now() + Math.random(),
    jobId: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url,
    platform: job.platform,
    atsProvider: job.atsProvider || "",
    easyApply: job.easyApply,
    postedAt: job.postedAt,
    description: job.description || "",
    skills: job.skills || [],
    salary: job.salary || "",
    workMode: job.workMode || "",
    jobType: job.jobType || "",
    via: job.via || "",
    score: job.score,
    scoreLabel: job.scoreLabel,
    status,
    appliedAt: new Date().toISOString(),
    autoApplyNote: autoApplyResult?.reason || "",
  };
}

// ─── Save all found jobs (for manual review in dashboard) ────────────────────
function saveFoundJob(job) {
  const exists = foundJobs.some((j) => j.id === job.id);
  if (exists) {
    logScanHistory(job, "skipped_dup");
    return false;
  }

  // Score the job against the user's profile
  const { score, breakdown } = scoreJob(job, {
    skills: settings.profile.skills,
    preferredLocations: settings.locations,
    yearsExperience: settings.profile.yearsExperience,
    targetRoles: settings.profile.targetRoles,
  });
  job.score = score;
  job.scoreBreakdown = breakdown;
  job.scoreLabel = scoreLabel(score);

  // Track URL globally
  if (job.url) seenUrls.add(job.url);

  foundJobs.unshift({
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.applyUrl || job.url || "",
    platform: job.platform,
    atsProvider: job.atsProvider || "",
    easyApply: job.easyApply,
    postedAt: job.postedAt,
    description: job.description || "",
    skills: job.skills || [],
    salary: job.salary || "",
    workMode: job.workMode || "",
    jobType: job.jobType || "",
    via: job.via || "",
    score,
    scoreBreakdown: breakdown,
    scoreLabel: scoreLabel(score),
    savedAt: new Date().toISOString(),
  });
  if (foundJobs.length > 2000) foundJobs.splice(2000);
  logScanHistory(job, "added");
  return true;
}

// ─── Main automation cycle ───────────────────────────────────────────────────
async function runCycle() {
  log("info", "Automation cycle started");
  let newThisCycle = 0;
  browserOpensThisCycle = 0;  // reset browser-open counter each cycle
  const maxBrowserOpens = settings.maxBrowserOpensPerCycle ?? 5;

  // ── 1. Apify + SerpAPI scrapers (per title/location) ──
  for (const title of settings.jobTitles) {
    for (const location of settings.locations) {
      log("info", `Searching: "${title}" in ${location}`);
      const jobs = await scrapeAllPlatforms(title, location);
      stats.found += jobs.length;
      log("info", `Found ${jobs.length} jobs for "${title}" in ${location}`);

      for (const job of jobs) {
        saveFoundJob(job);
        const applied = await applyToJob(job, { maxBrowserOpens });
        if (applied) {
          newThisCycle++;
          log("success", `Queued: ${job.title} @ ${job.company} [${job.platform}]`, job.location);
        } else {
          stats.skipped++;
        }
      }
    }
  }

  // ── 2. ATS Direct scraping (Greenhouse / Lever / Ashby) ──
  if (settings.platforms.atsDirect !== false) {
    log("info", `ATS Direct: scanning ${ATS_COMPANY_COUNT} companies (Greenhouse, Lever, Ashby)…`);
    try {
      const atsJobs = await scrapeATSOnce();
      log("info", `ATS Direct: found ${atsJobs.length} relevant jobs`);
      stats.found += atsJobs.length;
      for (const job of atsJobs) {
        saveFoundJob(job);
        const applied = await applyToJob(job, { maxBrowserOpens });
        if (applied) {
          newThisCycle++;
          log("success", `Queued (ATS): ${job.title} @ ${job.company}`, job.atsProvider);
        } else {
          stats.skipped++;
        }
      }
    } catch (err) {
      log("error", "ATS Direct scrape failed", err.message);
      stats.errors++;
    }
  }

  // Persist found jobs after each cycle
  saveData({ applications, logs, foundJobs });

  log("info", `Cycle complete — ${newThisCycle} new applications queued`);

  if (newThisCycle > 0 && settings.emailNotifications) {
    const rows = applications
      .slice(0, newThisCycle)
      .map((a) => `<tr><td>${a.title}</td><td>${a.company}</td><td>${a.location}</td><td>${a.platform}</td><td>${a.status}</td></tr>`)
      .join("");
    await sendEmail(
      `Job Bot: ${newThisCycle} new jobs found`,
      `<h2>New Applications Queued</h2>
      <table border="1" cellpadding="6" style="border-collapse:collapse">
        <tr><th>Title</th><th>Company</th><th>Location</th><th>Platform</th><th>Status</th></tr>
        ${rows}
      </table>`
    ).catch((e) => log("error", "Email send failed", e.message));
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────
function startScheduler() {
  runCycle();
  const rule = new schedule.RecurrenceRule();
  rule.minute = new schedule.Range(0, 59, settings.intervalMinutes);
  schedulerJob = schedule.scheduleJob(rule, runCycle);
}

function stopScheduler() {
  if (schedulerJob) { schedulerJob.cancel(); schedulerJob = null; }
}

// ─── API routes ───────────────────────────────────────────────────────────────

app.get("/api/status", (req, res) => {
  const hotMatches = foundJobs.filter(j => j.score >= 3.5).length;
  res.json({ isRunning, stats: { ...stats, hotMatches }, settings: sanitizeSettings(settings) });
});

app.post("/api/start", (req, res) => {
  if (isRunning) return res.json({ ok: false, message: "Already running" });
  isRunning = true;
  startScheduler();
  log("info", "Automation started");
  res.json({ ok: true });
});

app.post("/api/stop", (req, res) => {
  if (!isRunning) return res.json({ ok: false, message: "Not running" });
  isRunning = false;
  stopScheduler();
  log("info", "Automation stopped");
  res.json({ ok: true });
});

app.get("/api/applications", (req, res) => {
  const page = parseInt(req.query.page || "1", 10);
  const limit = parseInt(req.query.limit || "20", 10);
  const start = (page - 1) * limit;
  res.json({ total: applications.length, page, limit, items: applications.slice(start, start + limit) });
});

// GET /api/jobs — all scraped jobs for manual review
app.get("/api/jobs", (req, res) => {
  const limit  = parseInt(req.query.limit  || "200", 10);
  const offset = parseInt(req.query.offset || "0",   10);
  const search = (req.query.q || "").toLowerCase();
  const filtered = search
    ? foundJobs.filter((j) =>
        `${j.title} ${j.company} ${j.location} ${j.platform}`.toLowerCase().includes(search)
      )
    : foundJobs;
  res.json({ total: filtered.length, items: filtered.slice(offset, offset + limit) });
});

app.get("/api/logs", (req, res) => {
  const limit = parseInt(req.query.limit || "100", 10);
  res.json(logs.slice(0, limit));
});

app.get("/api/stats", (req, res) => res.json(stats));

app.post("/api/settings", (req, res) => {
  const allowed = ["jobTitles", "locations", "intervalMinutes", "maxApplicationsPerRun", "maxBrowserOpensPerCycle", "emailNotifications", "notifyEmail", "platforms", "autoApplyEnabled"];
  for (const key of allowed) {
    if (req.body[key] !== undefined) settings[key] = req.body[key];
  }
  if (isRunning) { stopScheduler(); startScheduler(); }
  log("info", "Settings updated");
  res.json({ ok: true, settings: sanitizeSettings(settings) });
});

// GET /api/profile — return the current user profile
app.get("/api/profile", (req, res) => {
  res.json({ ok: true, profile: settings.profile });
});

// POST /api/profile — save profile from extension popup (any user)
app.post("/api/profile", (req, res) => {
  const p = req.body || {};
  // Merge all profile fields
  const fields = ["name","firstName","lastName","email","phone","location",
    "linkedinUrl","github","website","school","degree","major",
    "yearsExperience","expectedSalary","skills","targetRoles",
    "remotePreference","summary","coverLetter","resumePath","resumeFileName","zipCode",
    "education","experiences"];
  for (const f of fields) {
    if (p[f] !== undefined) settings.profile[f] = p[f];
  }
  settings.profile.savedAt = new Date().toISOString();
  // Sync job titles from targetRoles if user set them
  if (p.targetRoles) {
    const roles = p.targetRoles.split(",").map(s => s.trim()).filter(Boolean);
    if (roles.length > 0) settings.jobTitles = roles;
  }
  saveData({ applications, logs, foundJobs, profile: settings.profile });
  log("info", `Profile saved — ${settings.profile.name || "unnamed user"}`);
  res.json({ ok: true, profile: settings.profile });
});

// POST /api/generate-resume — tailored resume sections for a job
app.post("/api/generate-resume", (req, res) => {
  try {
    const { job = {}, profile = {} } = req.body;
    // Merge with stored profile as fallback
    const p = { ...settings.profile, ...profile };
    const resume = generateTailoredResume(job, p);
    res.json({ ok: true, ...resume });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

function generateTailoredResume(job, profile) {
  const title       = job.title || "this role";
  const company     = job.company || "the company";
  const description = (job.description || "").toLowerCase();

  const name           = profile.name || "Your Name";
  const email          = profile.email || "";
  const phone          = profile.phone || "";
  const location       = profile.location || "";
  const linkedinUrl    = profile.linkedinUrl || "";
  const github         = profile.github || "";
  const school         = profile.school || "";
  const degree         = [profile.degree, profile.major].filter(Boolean).join(" in ") || "Bachelor's Degree";
  const yrsExp         = parseInt(profile.yearsExperience, 10) || 0;
  const summary        = profile.summary || "";
  const remotePreference = profile.remotePreference || "Remote or Hybrid";

  const skillArr = Array.isArray(profile.skills)
    ? profile.skills
    : (profile.skills || "").split(",").map(s => s.trim()).filter(Boolean);

  // Skills that appear in the job description — put first
  const matchedSkills = skillArr.filter(s => description.includes(s.toLowerCase()));
  const otherSkills   = skillArr.filter(s => !description.includes(s.toLowerCase()));
  const orderedSkills = [...matchedSkills, ...otherSkills];

  // Extract key tech keywords from JD for skills section
  const jdKeywords = (job.description || "")
    .match(/\b(Python|SQL|Java|Scala|R\b|Go|TypeScript|JavaScript|C\+\+|Rust|Ruby|Kotlin|Swift|AWS|Azure|GCP|Docker|Kubernetes|Spark|Kafka|Airflow|dbt|Terraform|PyTorch|TensorFlow|scikit-learn|pandas|NumPy|React|Node\.js|FastAPI|Flask|Django|PostgreSQL|MySQL|MongoDB|Redis|Snowflake|Databricks|Tableau|Power BI|Looker|LLM|RAG|langchain|MLflow|SageMaker|Vertex AI|git|GitHub|REST|GraphQL|Agile|Scrum)\b/g)
    || [];
  const jdUniqueKeywords = [...new Set(jdKeywords.map(k => k))];
  const missingSkills = jdUniqueKeywords.filter(k => !skillArr.some(s => s.toLowerCase() === k.toLowerCase()));

  // Experience-matched seniority label
  const seniorityLabel = yrsExp >= 7 ? "Senior" : yrsExp >= 4 ? "Mid-level" : yrsExp >= 1 ? "Junior" : "";

  // Generate tailored summary
  const tailoredSummary = summary ||
    `${seniorityLabel ? seniorityLabel + " " : ""}professional with ${yrsExp > 0 ? yrsExp + "+ years" : "proven"} of experience. ` +
    (matchedSkills.length > 0 ? `Strong background in ${matchedSkills.slice(0, 4).join(", ")}. ` : "") +
    `Seeking a ${remotePreference.toLowerCase()} ${title} role.`;

  // Generate experience bullet points tailored to JD
  const bulletTemplates = [
    matchedSkills[0] ? `Built and deployed production ${matchedSkills[0]} solutions that improved performance by 30%` : null,
    matchedSkills[1] ? `Developed end-to-end pipelines using ${matchedSkills[1]} and ${matchedSkills[2] || "cloud infrastructure"}` : null,
    `Led cross-functional collaboration to deliver data-driven insights that reduced decision time by 25%`,
    matchedSkills[0] ? `Optimised ${matchedSkills[0]} workflows, cutting processing time by 40% at scale` : null,
    `Mentored team members and contributed to technical documentation and best practices`,
    `Delivered ${yrsExp > 0 ? yrsExp : "multiple"} major projects end-to-end — from requirements through production deployment`,
  ].filter(Boolean);

  return {
    name, email, phone, location, linkedinUrl, github,
    education: { school, degree },
    tailoredSummary,
    matchedSkills,
    otherSkills,
    missingSkills,           // skills in JD not in profile — "skill gap"
    orderedSkills,
    experienceBullets: bulletTemplates,
    seniority: seniorityLabel,
    yearsExperience: yrsExp,
    targetTitle: title,
    targetCompany: company,
  };
}

// POST /api/skill-gap — quick skill gap analysis for a job
app.post("/api/skill-gap", (req, res) => {
  try {
    const { job = {}, profile = {} } = req.body;
    const p = { ...settings.profile, ...profile };
    const description = (job.description || "").toLowerCase();

    const skillArr = Array.isArray(p.skills)
      ? p.skills
      : (p.skills || "").split(",").map(s => s.trim()).filter(Boolean);

    const matched = skillArr.filter(s => s && description.includes(s.toLowerCase()));
    const missing = [];

    // Extract tech keywords from JD the user doesn't have
    const jdKeywords = (job.description || "")
      .match(/\b(Python|SQL|Java|Scala|Go|TypeScript|JavaScript|AWS|Azure|GCP|Docker|Kubernetes|Spark|Kafka|Airflow|dbt|PyTorch|TensorFlow|scikit-learn|pandas|React|FastAPI|PostgreSQL|MongoDB|Snowflake|Databricks|Tableau|LLM|RAG|MLflow|SageMaker|Terraform|Kubernetes|Rust|GraphQL)\b/g)
      || [];
    const unique = [...new Set(jdKeywords)];
    for (const kw of unique) {
      if (!skillArr.some(s => s.toLowerCase() === kw.toLowerCase())) {
        missing.push(kw);
      }
    }

    const total = Math.max(skillArr.length, 1);
    const matchPct = Math.round((matched.length / total) * 100);

    // Experience check
    const expMatch = (job.description || "").match(/(\d+)\s*\+?\s*years?\s+of\s+experience/i);
    const reqYears = expMatch ? parseInt(expMatch[1], 10) : null;
    const userYears = parseInt(p.yearsExperience, 10) || 0;
    const expGap = reqYears !== null ? { required: reqYears, you: userYears, ok: userYears >= reqYears - 1 } : null;

    res.json({ ok: true, matched, missing, matchPct, expGap, total: skillArr.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/test-email", async (req, res) => {
  try {
    await sendEmail("Job Bot — test email", "<h2>Email notifications are working!</h2>");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /api/apply/:id  — manually trigger auto-apply for a queued job
app.post("/api/apply/:id", async (req, res) => {
  const id = parseFloat(req.params.id);
  const record = applications.find((a) => a.id === id);
  if (!record) return res.status(404).json({ ok: false, message: "Not found" });
  if (!settings.linkedinEmail || !settings.linkedinPassword) {
    return res.status(400).json({ ok: false, message: "LinkedIn credentials not configured in .env" });
  }

  res.json({ ok: true, message: "Auto-apply started — watch the browser window" });

  // Run in background so we don't block the response
  smartApply({
    job: record,
    credentials: { linkedinEmail: settings.linkedinEmail, linkedinPassword: settings.linkedinPassword, indeedEmail: settings.linkedinEmail, indeedPassword: settings.linkedinPassword },
    profile: settings.profile,
    resumePath: settings.profile.resumePath,
  }).then((result) => {
    record.status = result.success ? "auto-applied"
      : (result.simplifyUsed && result.browserOpened) ? "simplify-opened"
      : result.browserOpened ? "browser-opened"
      : "apply-failed";
    record.autoApplyNote = result.reason;
    if (result.jobDetails?.description) record.description = result.jobDetails.description;
    if (result.jobDetails?.skills?.length) record.skills = result.jobDetails.skills;
    if (result.jobDetails?.salary) record.salary = result.jobDetails.salary;
    saveData({ applications, logs, foundJobs });
    log(result.success ? "success" : "warning", `Manual apply: ${record.title} @ ${record.company}`, result.reason);
  }).catch((err) => {
    record.status = "apply-failed";
    record.autoApplyNote = err.message;
    saveData({ applications, logs, foundJobs });
    log("error", `Manual apply error: ${record.title}`, err.message);
  });
});

// POST /api/reset-session  — reset LinkedIn browser session
app.post("/api/reset-session", async (req, res) => {
  await resetSession();
  log("info", "LinkedIn browser session reset");
  res.json({ ok: true });
});

// GET /api/ats-companies — list all companies being scraped directly
app.get("/api/ats-companies", (req, res) => {
  res.json({
    total: ATS_COMPANY_COUNT,
    greenhouse: GREENHOUSE_COMPANIES.map((c) => c.name),
    lever: LEVER_COMPANIES.map((c) => c.name),
    ashby: ASHBY_COMPANIES.map((c) => c.name),
  });
});

// GET /api/scan-history — last N rows from TSV
app.get("/api/scan-history", (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "200", 10);
    const raw = fs.readFileSync(SCAN_HISTORY_FILE, "utf8").trim().split("\n");
    const headers = raw[0].split("\t");
    const rows = raw
      .slice(1)
      .slice(-limit)
      .reverse()
      .map((line) => {
        const cols = line.split("\t");
        return Object.fromEntries(headers.map((h, i) => [h, cols[i] || ""]));
      });
    res.json({ total: raw.length - 1, items: rows });
  } catch {
    res.json({ total: 0, items: [] });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OneTouch Extension Endpoints
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/onetouch-apply — Chrome extension calls this when user clicks ⚡
// Saves the job as "onetouch-filled" and tracks it in the dashboard
app.post("/api/onetouch-apply", (req, res) => {
  try {
    const job = req.body;
    if (!job?.url) return res.json({ ok: false, reason: "No URL provided" });

    // Dedup — if URL already tracked, return the existing record id so the
    // extension can still hook its submit button to mark it "applied"
    const existing = applications.find(a => a.url === job.url);
    if (existing) return res.json({ ok: true, deduped: true, id: existing.id });

    // Score it against the user's profile
    const scored = scoreJob(job, {
      skills: settings.profile.skills,
      preferredLocations: settings.locations,
      yearsExperience: settings.profile.yearsExperience,
      targetRoles: settings.profile.targetRoles,
    });
    const record = {
      id:             Date.now() + Math.random(),
      title:          job.title || "Unknown",
      company:        job.company || "",
      location:       job.location || "",
      url:            job.url,
      applyUrl:       job.url,
      platform:       job.platform || job.site || "OneTouch",
      atsProvider:    job.atsProvider || "",
      status:         "onetouch-filled",
      score:          scored.score,
      scoreLabel:     scoreLabel(scored.score),
      scoreBreakdown: scored.breakdown,
      filledFields:   job.filledFields || 0,
      savedAt:        new Date().toISOString(),
      postedAt:       job.postedAt || new Date().toISOString(),
      easyApply:      false,
      skills:         job.skills || [],
      description:    job.description || "",
      salary:         job.salary || "",
      matchedSkills:  job.matchedSkills || [],
      tailoredAnswers: job.tailoredAnswers || false,
    };

    applications.push(record);
    seenUrls.add(job.url);
    logScanHistory(record, "onetouch-filled");
    saveData({ applications, logs, foundJobs });
    log("success", `OneTouch filled: ${record.title} @ ${record.company}`, `Score ${record.score}`);

    res.json({ ok: true, id: record.id, score: record.score });
  } catch (err) {
    res.status(500).json({ ok: false, reason: err.message });
  }
});

// POST /api/score-job — extension calls this to show match score on job page
app.post("/api/score-job", (req, res) => {
  try {
    const job = req.body;
    const result = scoreJob(job);
    res.json({ score: result.score, label: scoreLabel(result.score), breakdown: result.breakdown });
  } catch {
    res.status(500).json({ score: null });
  }
});

// GET /api/viral-image — generate & stream a 1200×630 PNG from live job data
// No external API calls — pure SVG+Sharp pipeline
app.get("/api/viral-image", async (req, res) => {
  try {
    const { png, stats } = await generateViralImage();
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", "inline; filename=\"job-bot-viral.png\"");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Stats", JSON.stringify(stats));
    res.send(png);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/applications/:id", (req, res) => {
  const id = parseFloat(req.params.id);
  const idx = applications.findIndex((a) => a.id === id);
  if (idx === -1) return res.status(404).json({ ok: false });
  applications.splice(idx, 1);
  saveData({ applications, logs, foundJobs });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// CareerOps-inspired: Tailored answer generation
// POST /api/generate-answers
// { job: { title, company, description }, profile: { name, skills, summary, ... } }
// Returns: { coverLetter, whyRole, talkingPoints, matchedSkills }
// No external API needed — pure template engine
// ─────────────────────────────────────────────────────────────────────────────
app.post("/api/generate-answers", (req, res) => {
  try {
    const { job = {}, profile = {} } = req.body;
    const answers = generateTailoredAnswers(job, profile);
    res.json({ ok: true, ...answers });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

function generateTailoredAnswers(job, profile) {
  const {
    title = "this role",
    company = "your company",
    description = "",
  } = job;

  const {
    name = "",
    firstName = name.split(" ")[0] || "Candidate",
    yearsExperience = "several",
    skills = [],
    summary = "",
    coverLetter: savedCoverLetter = "",
    targetRoles = "",
    remotePreference = "Remote or Hybrid",
  } = profile;

  const jdLower = description.toLowerCase();

  // Parse skills from profile (can be array or comma-separated string)
  const skillArr = Array.isArray(skills)
    ? skills
    : (skills || "").split(",").map((s) => s.trim()).filter(Boolean);

  // Find which profile skills are mentioned in the job description
  const matchedSkills = skillArr.filter(
    (s) => s && jdLower.includes(s.toLowerCase())
  );

  // Extract key requirements from JD (sentences containing "experience", "required", "must", "knowledge")
  const reqSentences = description
    .split(/[.\n]/)
    .filter((s) => /experience|required|must|profici|knowledge|familiar/i.test(s))
    .slice(0, 5)
    .map((s) => s.trim())
    .filter(Boolean);

  // Build cover letter
  let coverLetter = savedCoverLetter;
  if (!coverLetter) {
    const skillLine = matchedSkills.length > 0
      ? `My hands-on experience with ${matchedSkills.slice(0, 3).join(", ")} aligns directly with your requirements.`
      : `My ${yearsExperience} years of experience makes me a strong candidate.`;

    const summaryLine = summary
      ? summary.trim().replace(/\.$/, "") + "."
      : `I have ${yearsExperience} years of experience in this field and a track record of delivering measurable results.`;

    coverLetter =
`Dear Hiring Team at ${company},

I'm excited to apply for the ${title} position. ${skillLine}

${summaryLine} I'm drawn to ${company} because of the opportunity to work on meaningful challenges in a high-impact role.

I would love the chance to discuss how my background aligns with ${company}'s goals.

Best regards,
${name || firstName}`;
  }

  // One-liner "why this role" answer
  const whyRole = matchedSkills.length > 0
    ? `I'm excited about the ${title} role because my experience with ${matchedSkills.slice(0, 2).join(" and ")} is a strong match. ${summary ? summary.split(".")[0] + "." : ""}`
    : `The ${title} role at ${company} aligns perfectly with my career direction. ${summary ? summary.split(".")[0] + "." : ""}`;

  // Recruiter LinkedIn search URL (CareerOps-style "contacto" feature)
  const recruiterUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company + " recruiter talent " + title)}&origin=GLOBAL_SEARCH_HEADER`;

  // Talking points for interview prep
  const talkingPoints = [
    matchedSkills.length > 0
      ? `✅ Highlight your experience with: ${matchedSkills.join(", ")}`
      : `📌 Emphasise your ${yearsExperience} years of relevant experience`,
    reqSentences.length > 0
      ? `📋 Address this requirement: "${reqSentences[0].slice(0, 80)}…"`
      : `📋 Research ${company}'s recent products and engineering blog`,
    `🎯 Prepare 2–3 STAR stories (Situation, Task, Action, Result)`,
    `🔍 Review ${company}'s mission, values, and recent news before the interview`,
    remotePreference ? `🏠 You prefer: ${remotePreference} — confirm arrangement early` : null,
  ].filter(Boolean);

  return {
    coverLetter,
    whyRole,
    talkingPoints,
    matchedSkills,
    recruiterUrl,
    reqSentences,
  };
}

// ─── Pipeline stage management ───────────────────────────────────────────────
// PATCH /api/applications/:id/stage  { stage: "interviewing" | "offered" | "rejected" | "applied" }
const VALID_STAGES = ["applied", "interviewing", "offered", "rejected", "onetouch-filled", "queued-manual"];

app.patch("/api/applications/:id/stage", (req, res) => {
  const id  = parseFloat(req.params.id);
  const { stage } = req.body;
  if (!VALID_STAGES.includes(stage)) return res.status(400).json({ ok: false, message: "Invalid stage" });
  const record = applications.find((a) => a.id === id);
  if (!record) return res.status(404).json({ ok: false });
  record.status       = stage;
  record.stageUpdated = new Date().toISOString();
  if (stage === "applied") record.appliedAt = record.appliedAt || new Date().toISOString();
  saveData({ applications, logs, foundJobs });
  log("success", `Pipeline: ${record.title} @ ${record.company} → ${stage}`);
  res.json({ ok: true, record });
});

// GET /api/pipeline — returns applications grouped by stage
app.get("/api/pipeline", (req, res) => {
  const stages = {
    "queued-manual":   [],
    "onetouch-filled": [],
    "applied":         [],
    "interviewing":    [],
    "offered":         [],
    "rejected":        [],
    "other":           [],
  };
  for (const a of applications) {
    const key = stages[a.status] ? a.status : "other";
    stages[key].push(a);
  }
  res.json({ stages });
});

// ═══════════════════════════════════════════════════════════════════════════
// AGENTS SYSTEM — 5 autonomous agents, no LLM API required
// ═══════════════════════════════════════════════════════════════════════════
const agentRuns = {};

const AGENT_DEFINITIONS = [
  { id:"outreach-writer",   name:"Outreach Writer",    icon:"✉️",  color:"#6366f1",
    description:"Generates personalised LinkedIn connection requests for your top hot-match jobs.",
    configFields:[{ key:"topN", label:"Top N jobs", type:"number", default:5 },
                  { key:"tone", label:"Tone", type:"select", options:["Professional","Friendly","Concise"], default:"Professional" }] },
  { id:"followup-drafter",  name:"Follow-up Drafter",  icon:"📬", color:"#14b8a6",
    description:"Finds applications with no update in N days and drafts a polite follow-up email.",
    configFields:[{ key:"staleDays", label:"Days without update", type:"number", default:7 }] },
  { id:"profile-optimizer", name:"Profile Optimizer",  icon:"🧠", color:"#a855f7",
    description:"Scans hot-match job descriptions and recommends skills to add to your profile.",
    configFields:[{ key:"minFreq", label:"Min appearances", type:"number", default:3 }] },
  { id:"salary-analyst",    name:"Salary Analyst",     icon:"💰", color:"#f59e0b",
    description:"Extracts salary ranges from job descriptions and gives you a market-rate breakdown.",
    configFields:[] },
  { id:"cold-scout",        name:"Cold Apply Scout",   icon:"🔭", color:"#22c55e",
    description:"Finds ATS-direct job links at top companies matching your target roles.",
    configFields:[{ key:"minScore", label:"Min score", type:"number", default:3.0 }] },
];

function runOutreachWriter(config = {}) {
  const topN = parseInt(config.topN) || 5;
  const tone = config.tone || "Professional";
  const profile = settings.profile || {};
  const name = profile.name || "Candidate";
  const firstName = name.split(" ")[0] || "there";
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  const targetRole = (profile.targetRoles || "").split(",")[0].trim() || "the role";
  const summary = (profile.summary || "").split(".")[0] || "";
  const hot = [...foundJobs].filter(j => (j.score || 0) >= 3.5).sort((a,b) => (b.score||0)-(a.score||0)).slice(0, topN);
  if (!hot.length) return { summary:"No hot-match jobs found (score >= 3.5). Run the scanner first.", items:[] };
  const items = hot.map(job => {
    const matched = skills.filter(s => (job.description || "").toLowerCase().includes(s.toLowerCase()));
    const topSkills = matched.slice(0,3).join(", ") || skills.slice(0,2).join(", ") || "relevant skills";
    let message;
    if (tone === "Concise") {
      message = `Hi [Recruiter],\n\nI noticed ${job.company} is hiring for ${job.title}. My background in ${topSkills} aligns well — would love to connect.\n\n${firstName}`;
    } else if (tone === "Friendly") {
      message = `Hey [Recruiter] 👋\n\nSaw the ${job.title} role at ${job.company} and got excited — ${summary ? summary + ". " : ""}Strong experience in ${topSkills}.\n\nWould love to chat!\n\n${firstName}`;
    } else {
      message = `Dear [Recruiter],\n\nI came across the ${job.title} position at ${job.company} and believe my experience is a strong match. I have worked extensively with ${topSkills}.\n\nI would welcome the opportunity to discuss further.\n\nBest regards,\n${name}`;
    }
    return { job:{ id:job.id, title:job.title, company:job.company, score:job.score, url:job.url }, message,
      recruiterSearchUrl:`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(job.company+" recruiter talent acquisition")}` };
  });
  return { summary:`Generated ${items.length} outreach message(s) for top hot-match jobs.`, items };
}

function runFollowupDrafter(config = {}) {
  const staleDays = parseInt(config.staleDays) || 7;
  const profile = settings.profile || {};
  const name = profile.name || "Candidate";
  const email = profile.email || "[your email]";
  const phone = profile.phone || "";
  const now = Date.now();
  const stale = applications.filter(a => {
    if (a.status !== "applied" && a.status !== "onetouch-filled") return false;
    return (now - new Date(a.appliedAt || a.savedAt || 0).getTime()) / 86400000 >= staleDays;
  });
  if (!stale.length) return { summary:`No applications older than ${staleDays} days without an update.`, items:[] };
  const items = stale.map(app => {
    const daysSince = Math.round((now - new Date(app.appliedAt || app.savedAt).getTime()) / 86400000);
    const followUp = `Subject: Following Up — ${app.title} Application\n\nDear Hiring Team,\n\nI submitted my application for the ${app.title} position at ${app.company} approximately ${daysSince} days ago and wanted to follow up to reiterate my strong interest.\n\nPlease let me know if you need any additional information.\n\nBest regards,\n${name}\n${email}${phone ? "\n" + phone : ""}`;
    return { app:{ id:app.id, title:app.title, company:app.company, daysSince, appliedAt:app.appliedAt||app.savedAt }, followUp };
  });
  return { summary:`Found ${items.length} stale application(s). Follow-up drafts ready.`, items };
}

function runProfileOptimizer(config = {}) {
  const minFreq = parseInt(config.minFreq) || 3;
  const profileSkills = Array.isArray(settings.profile?.skills) ? settings.profile.skills.map(s => s.toLowerCase().trim()) : [];
  const topJobs = foundJobs.filter(j => (j.score || 0) >= 2.5);
  if (!topJobs.length) return { summary:"No jobs with score >= 2.5 to analyse.", recommendations:[], alreadyHave:[] };
  const techRx = /\b(Python|SQL|Java|Scala|Go|TypeScript|JavaScript|AWS|Azure|GCP|Docker|Kubernetes|Spark|Kafka|Airflow|dbt|PyTorch|TensorFlow|scikit-learn|pandas|React|FastAPI|PostgreSQL|MongoDB|Snowflake|Databricks|Tableau|LLM|RAG|MLflow|SageMaker|Terraform|Rust|GraphQL|Looker|Redshift|BigQuery|Hive|Flink|OpenAI|LangChain|HuggingFace|XGBoost|Power BI|Fivetran|Segment|Mixpanel|Amplitude|Vertex AI|Pinecone|Weaviate|Polars|Elasticsearch|Redis)\b/g;
  const freq = {};
  topJobs.forEach(job => {
    const kws = [...new Set(((job.description || "") + " " + (job.title || "")).match(techRx) || [])];
    kws.forEach(k => { freq[k] = (freq[k] || 0) + 1; });
  });
  const recommendations = Object.entries(freq).filter(([s,c]) => c >= minFreq && !profileSkills.includes(s.toLowerCase())).sort((a,b)=>b[1]-a[1]).slice(0,15)
    .map(([skill,count]) => ({ skill, frequency:count, pctOfJobs:Math.round((count/topJobs.length)*100) }));
  const alreadyHave = Object.entries(freq).filter(([s]) => profileSkills.includes(s.toLowerCase())).sort((a,b)=>b[1]-a[1]).slice(0,10)
    .map(([skill,count]) => ({ skill, frequency:count }));
  return { summary:`Analysed ${topJobs.length} jobs. Found ${recommendations.length} skills to add (>= ${minFreq} appearances).`, recommendations, alreadyHave, totalJobsAnalysed:topJobs.length };
}

function runSalaryAnalyst() {
  const salaryRx = /\$[\d,]+(?:k)?(?:\s*[-]\s*\$[\d,]+(?:k)?)?(?:\s*(?:\/yr|\/year|per year|annually|a year))?/gi;
  const roleGroups = {};
  foundJobs.forEach(job => {
    const text = (job.salary || "") + " " + (job.description || "");
    const matches = text.match(salaryRx) || [];
    const nums = matches.flatMap(m => {
      const ns = m.replace(/[^\d-]/g," ").trim().split(/-+/).map(n => {
        const v = parseInt(n.replace(/,/g,""));
        return (m.includes("k") || v < 500) ? v * 1000 : v;
      });
      return ns.filter(n => n >= 40000 && n <= 800000);
    });
    if (!nums.length) return;
    const role = (job.title || "Other").replace(/senior|junior|lead|principal|staff/gi,"").trim();
    if (!roleGroups[role]) roleGroups[role] = [];
    roleGroups[role].push(...nums);
  });
  const fmt = n => n >= 1000 ? `$${(n/1000).toFixed(0)}k` : `$${n}`;
  const breakdown = Object.entries(roleGroups).map(([role,nums]) => {
    const sorted = [...nums].sort((a,b)=>a-b);
    const avg = Math.round(nums.reduce((s,n)=>s+n,0)/nums.length);
    return { role, min:sorted[0], max:sorted[sorted.length-1], avg, median:sorted[Math.floor(sorted.length/2)], count:nums.length,
      minFmt:fmt(sorted[0]), maxFmt:fmt(sorted[sorted.length-1]), avgFmt:fmt(avg), medianFmt:fmt(sorted[Math.floor(sorted.length/2)]) };
  }).sort((a,b)=>b.avg-a.avg);
  return { summary: breakdown.length ? `Found salary data in ${breakdown.reduce((s,r)=>s+r.count,0)} job(s) across ${breakdown.length} role type(s).` : "No salary data found in current job listings.", breakdown };
}

function runColdScout(config = {}) {
  const minScore = parseFloat(config.minScore) || 3.0;
  const targetRoles = (settings.profile?.targetRoles || settings.jobTitles?.join(",") || "").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  const atsDirect = foundJobs.filter(j => j.platform === "atsDirect" && (j.score||0) >= minScore && (targetRoles.length === 0 || targetRoles.some(r => (j.title||"").toLowerCase().includes(r)))).sort((a,b)=>(b.score||0)-(a.score||0));
  const grouped = {};
  atsDirect.forEach(j => { const p = j.atsProvider || "Other"; if (!grouped[p]) grouped[p]=[]; grouped[p].push(j); });
  return {
    summary: atsDirect.length ? `Found ${atsDirect.length} ATS-direct job(s) matching your profile (score >= ${minScore}).` : "No qualifying ATS-direct jobs found. Try lowering the score filter.",
    total: atsDirect.length,
    grouped: Object.entries(grouped).map(([provider,jobs]) => ({ provider, count:jobs.length, jobs:jobs.slice(0,10).map(j=>({ id:j.id, title:j.title, company:j.company, score:j.score, url:j.url })) })),
  };
}

app.get("/api/agents", (req, res) => {
  res.json({ agents: AGENT_DEFINITIONS.map(a => ({ ...a, status:agentRuns[a.id]?.status||"idle", startedAt:agentRuns[a.id]?.startedAt||null, finishedAt:agentRuns[a.id]?.finishedAt||null, result:agentRuns[a.id]?.result||null })) });
});

app.post("/api/agents/:id/run", (req, res) => {
  const { id } = req.params;
  const def = AGENT_DEFINITIONS.find(a => a.id === id);
  if (!def) return res.status(404).json({ ok:false, message:"Unknown agent" });
  if (agentRuns[id]?.status === "running") return res.status(409).json({ ok:false, message:"Agent already running" });
  const config = req.body?.config || {};
  agentRuns[id] = { status:"running", startedAt:new Date().toISOString(), finishedAt:null, result:null };
  try {
    let result;
    if (id === "outreach-writer")    result = runOutreachWriter(config);
    else if (id === "followup-drafter")   result = runFollowupDrafter(config);
    else if (id === "profile-optimizer")  result = runProfileOptimizer(config);
    else if (id === "salary-analyst")     result = runSalaryAnalyst();
    else if (id === "cold-scout")         result = runColdScout(config);
    else result = { summary:"Agent not implemented.", items:[] };
    agentRuns[id] = { status:"done", startedAt:agentRuns[id].startedAt, finishedAt:new Date().toISOString(), result };
    log("success", `Agent "${def.name}" completed`, result.summary);
    res.json({ ok:true, result });
  } catch (err) {
    agentRuns[id] = { status:"error", startedAt:agentRuns[id].startedAt, finishedAt:new Date().toISOString(), result:{ summary:err.message } };
    res.status(500).json({ ok:false, message:err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// BILLING — Stripe Integration
// Set env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
// Prices: STRIPE_PRICE_PRO (monthly), STRIPE_PRICE_ENTERPRISE (monthly)
// ═══════════════════════════════════════════════════════════════════════════
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" })
  : null;

const PLANS = [
  {
    id: "free",
    name: "Starter",
    price: 0,
    priceLabel: "Free",
    priceId: null,
    features: [
      "100 applications / month",
      "AI match scoring",
      "Pipeline tracker",
      "Chrome extension",
      "Basic interview prep",
    ],
    limits: { applications: 100, agents: false, resumeGen: false },
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    priceLabel: "$29 / month",
    priceId: process.env.STRIPE_PRICE_PRO || null,
    popular: true,
    features: [
      "Unlimited applications",
      "All 5 AI Agents",
      "Tailored resume generator",
      "Salary market intel",
      "Outreach message writer",
      "Follow-up drafter",
      "Priority support",
    ],
    limits: { applications: Infinity, agents: true, resumeGen: true },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 99,
    priceLabel: "$99 / month",
    priceId: process.env.STRIPE_PRICE_ENTERPRISE || null,
    features: [
      "Everything in Pro",
      "5 team seats",
      "REST API access",
      "White-label dashboard",
      "Custom job board scrapers",
      "Dedicated Slack support",
      "SLA guarantee",
    ],
    limits: { applications: Infinity, agents: true, resumeGen: true, team: true },
  },
];

// GET /api/billing/plans
app.get("/api/billing/plans", (req, res) => {
  res.json({ plans: PLANS, stripeConfigured: !!stripe });
});

// GET /api/billing/subscription
app.get("/api/billing/subscription", (req, res) => {
  const sub = _loaded.subscription || null;
  res.json({ subscription: sub, plan: sub?.planId || "free" });
});

// POST /api/billing/checkout  { planId, successUrl, cancelUrl }
app.post("/api/billing/checkout", async (req, res) => {
  if (!stripe) return res.status(503).json({ ok: false, message: "Stripe not configured. Add STRIPE_SECRET_KEY to .env" });
  const { planId, successUrl, cancelUrl } = req.body;
  const plan = PLANS.find(p => p.id === planId);
  if (!plan || !plan.priceId) return res.status(400).json({ ok: false, message: "Invalid plan or price not configured" });
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: successUrl || `${req.headers.origin || "http://localhost:3004"}/?billing=success`,
      cancel_url:  cancelUrl  || `${req.headers.origin || "http://localhost:3004"}/?billing=cancelled`,
      metadata: { planId: plan.id },
    });
    res.json({ ok: true, url: session.url, sessionId: session.id });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /api/billing/portal  { customerId }
app.post("/api/billing/portal", async (req, res) => {
  if (!stripe) return res.status(503).json({ ok: false, message: "Stripe not configured" });
  const customerId = req.body.customerId || _loaded.subscription?.customerId;
  if (!customerId) return res.status(400).json({ ok: false, message: "No Stripe customer found" });
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: req.headers.origin || "http://localhost:3004",
    });
    res.json({ ok: true, url: session.url });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /api/billing/webhook  — Stripe webhook (raw body)
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return res.status(200).json({ received: true });
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const sub = { planId: session.metadata?.planId || "pro", customerId: session.customer, subscriptionId: session.subscription, status: "active", startedAt: new Date().toISOString() };
    saveData({ applications, logs, foundJobs, profile: settings.profile, subscription: sub });
    log("success", `Subscription activated — plan: ${sub.planId}`);
  }
  if (event.type === "customer.subscription.deleted") {
    saveData({ applications, logs, foundJobs, profile: settings.profile, subscription: { planId: "free", status: "cancelled" } });
    log("info", "Subscription cancelled — reverted to free plan");
  }
  res.json({ received: true });
});

// ─────────────────────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  const index = path.join(clientBuild, "index.html");
  if (fs.existsSync(index)) return res.sendFile(index);
  res.status(404).send("Frontend not built. Run `npm run build` inside /client.");
});

function sanitizeSettings(s) {
  const { emailPass, apifyToken, serpApiKey, linkedinPassword, ...safe } = s;
  return {
    ...safe,
    emailConfigured: !!emailPass,
    apifyConfigured: !!apifyToken,
    serpApiConfigured: !!serpApiKey,
    linkedinConfigured: !!linkedinPassword && !!s.linkedinEmail,
  };
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Job automation server running on http://localhost:${PORT}`));
