import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import schedule from "node-schedule";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { smartApply, detectPlatform, resetSession } from "./autoApply.js";
import { scrapeATSDirect, GREENHOUSE_COMPANIES, LEVER_COMPANIES, ASHBY_COMPANIES, ATS_COMPANY_COUNT } from "./atsScrapers.js";
import { scoreJob, scoreLabel, scoreColor } from "./scorer.js";
import { generateViralImage } from "./imageGen.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

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
  return { applications: [], logs: [], foundJobs: [] };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─── In-memory state ────────────────────────────────────────────────────────
let isRunning = false;
let schedulerJob = null;
let stats = { applied: 0, found: 0, skipped: 0, errors: 0 };
const { applications, logs, foundJobs = [] } = loadData();

const settings = {
  jobTitles: (process.env.JOB_TITLES || "Data Scientist,Data Engineer").split(",").map((s) => s.trim()),
  locations: (process.env.JOB_LOCATIONS || "Seattle,Washington").split(",").map((s) => s.trim()),
  intervalMinutes: parseInt(process.env.INTERVAL_MINUTES || "5", 10),
  maxApplicationsPerRun: parseInt(process.env.MAX_APPS_PER_RUN || "10", 10),
  maxBrowserOpensPerCycle: parseInt(process.env.MAX_BROWSER_OPENS || "5", 10),
  emailNotifications: process.env.EMAIL_NOTIFICATIONS === "true",
  // Which platforms to scrape (all enabled by default)
  platforms: { linkedin: true, indeed: true, glassdoor: true, ziprecruiter: true, googlejobs: true, atsDirect: true },
  autoApplyEnabled: process.env.AUTO_APPLY_ENABLED === "true",
  apifyToken: process.env.APIFY_TOKEN || "",
  serpApiKey: process.env.SERPAPI_KEY || "",
  emailUser: process.env.EMAIL_USER || "",
  emailPass: process.env.EMAIL_PASS || "",
  notifyEmail: process.env.NOTIFY_EMAIL || "",
  // LinkedIn credentials for Easy Apply
  linkedinEmail: process.env.LINKEDIN_EMAIL || "",
  linkedinPassword: process.env.LINKEDIN_PASSWORD || "",
  // Simplify integration
  simplifyMode: process.env.SIMPLIFY_MODE || "shell",
  simplifyAutoSubmit: process.env.SIMPLIFY_AUTO_SUBMIT === "true",
  // Applicant profile
  profile: {
    phone: process.env.APPLICANT_PHONE || "",
    location: process.env.APPLICANT_LOCATION || "Seattle, WA",
    linkedinUrl: process.env.APPLICANT_LINKEDIN_URL || "",
    website: process.env.APPLICANT_WEBSITE || "",
    yearsExperience: process.env.APPLICANT_YEARS_EXPERIENCE || "3",
    expectedSalary: process.env.APPLICANT_EXPECTED_SALARY || "",
    resumePath: process.env.RESUME_PATH || "",
  },
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
  saveData({ applications, logs });
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
    return jobs.map((r) => ({
      id: `gj-${r.job_id || Date.now() + Math.random()}`,
      title: r.title || title,
      company: r.company_name || "Unknown",
      location: r.location || location,
      url: (() => {
        // Prefer LinkedIn or Indeed links for auto-apply, else first available
        const links = r.related_links || [];
        return (
          links.find((l) => l.link?.includes("linkedin.com"))?.link ||
          links.find((l) => l.link?.includes("indeed.com"))?.link ||
          links[0]?.link || r.share_link || ""
        );
      })(),
      applyUrl: (() => {
        const links = r.related_links || [];
        return (
          links.find((l) => l.link?.includes("linkedin.com"))?.link ||
          links.find((l) => l.link?.includes("indeed.com"))?.link ||
          links[0]?.link || r.share_link || ""
        );
      })(),
      easyApply: (r.related_links || []).some((l) => l.link?.includes("linkedin.com")),
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
    }));
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
  const hasCredentials = settings.linkedinEmail && settings.linkedinPassword;
  const platform = detectPlatform(applyUrl);

  // Cap browser opens per cycle — LinkedIn/Indeed auto-apply don't count toward limit
  const wouldOpenBrowser = platform !== "linkedin" && platform !== "indeed";
  if (wouldOpenBrowser && browserOpensThisCycle >= maxBrowserOpens) {
    // Save as queued-manual — user can trigger manually from dashboard
    const record = buildRecord(job, "queued-manual", null);
    applications.unshift(record);
    if (applications.length > 1000) applications.splice(1000);
    stats.applied++;
    saveData({ applications, logs });
    return true;
  }

  if (settings.autoApplyEnabled && hasCredentials && applyUrl) {
    try {
      autoApplyResult = await smartApply({
        job,
        credentials: {
          linkedinEmail: settings.linkedinEmail,
          linkedinPassword: settings.linkedinPassword,
          indeedEmail: settings.linkedinEmail,      // reuse same email
          indeedPassword: settings.linkedinPassword,
        },
        profile: settings.profile,
        resumePath: settings.profile.resumePath,
      });

      if (autoApplyResult.success) {
        status = "auto-applied";
        log("success", `Auto-applied: ${job.title} @ ${job.company}`, autoApplyResult.reason);
      } else if (autoApplyResult.simplifyUsed && autoApplyResult.browserOpened) {
        status = "simplify-opened";
        browserOpensThisCycle++;
        log("info", `Simplify opened (${browserOpensThisCycle}): ${job.title} @ ${job.company}`);
      } else if (autoApplyResult.browserOpened) {
        status = "browser-opened";
        browserOpensThisCycle++;
        log("info", `Browser opened (${browserOpensThisCycle}): ${job.title} @ ${job.company}`);
      } else {
        status = "apply-failed";
        log("warning", `Auto-apply failed: ${job.title} @ ${job.company}`, autoApplyResult.reason);
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
  saveData({ applications, logs });
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

  // Score the job against Suma's profile
  const { score, breakdown } = scoreJob(job);
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
  res.json({ isRunning, stats, settings: sanitizeSettings(settings) });
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
    saveData({ applications, logs });
    log(result.success ? "success" : "warning", `Manual apply: ${record.title} @ ${record.company}`, result.reason);
  }).catch((err) => {
    record.status = "apply-failed";
    record.autoApplyNote = err.message;
    saveData({ applications, logs });
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
  saveData({ applications, logs });
  res.json({ ok: true });
});

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
