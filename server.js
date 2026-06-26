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
import multer from "multer";
import { smartApply, detectPlatform, resetSession, scrapeLinkedInEasyApply } from "./autoApply.js";
import { scrapeATSDirect, GREENHOUSE_COMPANIES, LEVER_COMPANIES, ASHBY_COMPANIES, ATS_COMPANY_COUNT } from "./atsScrapers.js";
import { scoreJob, scoreLabel, scoreColor } from "./scorer.js";
import { generateViralImage } from "./imageGen.js";
import { parseResume } from "./resumeParser.js";
import { scrapeTickBig, invalidateTickBigToken } from "./tickbigScraper.js";
import { syncToGoogleSheets, isSheetsConfigured } from "./src/integrations/googleSheets.js";
import { registerChatRoutes } from "./src/chat.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

// â”€â”€â”€ Auth config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const JWT_SECRET    = process.env.JWT_SECRET    || "jobpilot-jwt-secret-change-in-production";
const ADMIN_USER    = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASS    = process.env.ADMIN_PASSWORD || "jobpilot2024";

// POST /api/auth/login  â€” public, no token required
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = jwt.sign({ sub: username, role: "admin" }, JWT_SECRET, { expiresIn: "30d" });
    return res.json({ ok: true, token, username });
  }
  return res.status(401).json({ ok: false, message: "Invalid username or password" });
});

// Auth middleware â€” protects all /api/* except login + stripe webhook
app.use("/api", (req, res, next) => {
  if (req.path === "/auth/login")       return next(); // already handled above
  if (req.path === "/billing/webhook")  return next(); // Stripe signs its own requests
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, message: "Unauthorized â€” please log in" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, message: "Session expired â€” please log in again" });
  }
});

// GET /api/auth/me â€” verify token and return user info
app.get("/api/auth/me", (req, res) => {
  res.json({ ok: true, username: req.user.sub, role: req.user.role });
});

// â”€â”€â”€ Resume upload & parse â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const ok = /\.(pdf|docx?|txt)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only PDF, DOCX, or TXT files accepted"), ok);
  },
});

// POST /api/upload-resume â€” upload resume + parse it into profile fields
app.post("/api/upload-resume", upload.single("resume"), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, message: "No file uploaded" });
  // Rename to keep original extension
  const ext = path.extname(req.file.originalname).toLowerCase();
  const destPath = path.join(uploadsDir, `resume${ext}`);
  try {
    fs.renameSync(req.file.path, destPath);
    const parsed = await parseResume(destPath);
    // Merge parsed data into settings profile (don't overwrite fields user already set)
    const p = settings.profile || {};
    const merged = {
      name:            parsed.name            || p.name            || "",
      email:           parsed.email           || p.email           || "",
      phone:           parsed.phone           || p.phone           || "",
      location:        parsed.location        || p.location        || "",
      summary:         parsed.summary         || p.summary         || "",
      skills:          parsed.skills?.length  ? parsed.skills      : (p.skills || []),
      yearsExperience: parsed.yearsExperience || p.yearsExperience || "",
      targetRoles:     parsed.targetRoles     || p.targetRoles     || "",
      linkedinUrl:     parsed.linkedinUrl     || p.linkedinUrl     || "",
      website:         parsed.website         || p.website         || "",
      school:          parsed.school          || p.school          || "",
      degree:          parsed.degree          || p.degree          || "",
      education:       parsed.education?.length ? parsed.education : (p.education || []),
      experiences:     parsed.experiences?.length ? parsed.experiences : (p.experiences || []),
      resumePath:      destPath,
    };
    settings.profile = merged;
    saveData({ applications, logs, foundJobs });
    log("success", `âœ… Resume parsed: ${req.file.originalname} â€” ${parsed.skills?.length || 0} skills, ${parsed.experiences?.length || 0} jobs, ${parsed.education?.length || 0} education`);
    res.json({ ok: true, profile: merged, parsed });
  } catch (err) {
    try { fs.unlinkSync(req.file.path); } catch {}
    log("error", "Resume parse failed", err.message);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// â”€â”€â”€ Serve React build in production â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const clientBuild = path.join(__dirname, "client", "dist");
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
}

// â”€â”€â”€ Persistent state file â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ In-memory state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  datePostedFilter: process.env.DATE_POSTED_FILTER || "week", // "today" | "week" | "month"
  emailNotifications: process.env.EMAIL_NOTIFICATIONS === "true",
  platforms: { linkedin: true, indeed: true, glassdoor: true, ziprecruiter: true, googlejobs: true, atsDirect: true, tickbig: true },
  tickbigEmail:    process.env.TICKBIG_EMAIL    || "",
  tickbigPassword: process.env.TICKBIG_PASSWORD || "",
  autoApplyEnabled: process.env.AUTO_APPLY_ENABLED === "true",
  apifyToken: process.env.APIFY_TOKEN || "",
  serpApiKey: process.env.SERPAPI_KEY || "",
  emailUser: process.env.EMAIL_USER || "",
  emailPass: process.env.EMAIL_PASS || "",
  notifyEmail: process.env.NOTIFY_EMAIL || "",
  linkedinEmail: process.env.LINKEDIN_EMAIL || "",
  linkedinPassword: process.env.LINKEDIN_PASSWORD || "",
  indeedEmail: process.env.INDEED_EMAIL || process.env.LINKEDIN_EMAIL || "",
  indeedPassword: process.env.INDEED_PASSWORD || process.env.LINKEDIN_PASSWORD || "",
  simplifyMode: process.env.SIMPLIFY_MODE || "shell",
  simplifyAutoSubmit: process.env.SIMPLIFY_AUTO_SUBMIT === "true",
  // Applicant profile â€” loaded from data.json, falls back to env vars
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
      // â”€â”€ Work Authorization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      isOver18:              p.isOver18              ?? true,
      workAuthorized:        p.workAuthorized        ?? true,
      requiresSponsorship:   p.requiresSponsorship   ?? false,
      // â”€â”€ Location & Office Preferences â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      willingToRelocate:     p.willingToRelocate     ?? true,
      preferredOfficeHub:    p.preferredOfficeHub    || "Seattle, Washington",
      inPersonOk:            p.inPersonOk            ?? true,
      // â”€â”€ EEO / Self-Identification (all default to Decline) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      gender:                p.gender                || "Decline to self-identify",
      race:                  p.race                  || "Decline to self-identify",
      veteranStatus:         p.veteranStatus         || "I am not a protected veteran",
      disability:            p.disability            || "I don't wish to answer",
      // â”€â”€ Skills / Experience detail questions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      pythonYears:           p.pythonYears           || "5 - 7 years",
      codingPercentage:      p.codingPercentage      || "75%",
      // â”€â”€ Open-text application answers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      whyJoinAnswer:         p.whyJoinAnswer         || "",  // "Why are you interested in joining X?"
      culturalValuesAnswer:  p.culturalValuesAnswer  || "",  // cultural fit / values example
      additionalInfo:        p.additionalInfo        || "",
    };
  })(),
};

// â”€â”€â”€ Scan history (TSV audit trail like career-ops) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Logging helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  console.log(`[${level.toUpperCase()}] ${message}${detail ? " â€” " + detail : ""}`);
}

// â”€â”€â”€ Date-posted chip helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns the SerpAPI "chips" value and a cutoff Date for local filtering
function getDateFilter() {
  const f = settings.datePostedFilter || "week";
  const chipMap   = { today: "date_posted:today", week: "date_posted:week", month: "date_posted:month" };
  const cutoffMap = { today: 1, week: 7, month: 30 };
  const chip      = chipMap[f]   || chipMap.week;
  const days      = cutoffMap[f] || 7;
  const cutoff    = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { chip, cutoff, days };
}

// â”€â”€â”€ Email helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function sendEmail(subject, html, toOverride = null) {
  if (!settings.emailUser || !settings.emailPass) return;
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: settings.emailUser, pass: settings.emailPass },
  });
  await transporter.sendMail({
    from: settings.emailUser,
    to: toOverride || settings.notifyEmail || settings.emailUser,
    subject,
    html,
  });
}

// â”€â”€â”€ Apify helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function runApifyActor(actorId, input) {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${settings.apifyToken}`;
  const { data } = await axios.post(url, input, { timeout: 120_000 });
  return Array.isArray(data) ? data : [];
}

// â”€â”€â”€ Platform scrapers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€ LinkedIn via SerpAPI Google Jobs (platform filter) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function scrapeLinkedIn(title, location) {
  if (!settings.serpApiKey) {
    log("warning", "No SerpAPI key â€” skipping LinkedIn search");
    return [];
  }
  try {
    const { data } = await axios.get("https://serpapi.com/search", {
      params: {
        engine:   "google_jobs",
        q:        `${title} site:linkedin.com/jobs`,
        location,
        // NOTE: chips/date_posted conflicts with site: queries -- omitted`n        hl:       "en",
        api_key:  settings.serpApiKey,
      },
      timeout: 30_000,
    });
    const jobs = data.jobs_results || [];
    log("info", `LinkedIn (SerpAPI): found ${jobs.length} jobs for "${title}"`);
    return jobs.map((r) => {
      const applyUrl = (r.apply_options || []).find(l => l.link?.includes("linkedin.com"))?.link
        || (r.apply_options || [])[0]?.link || "";
      return {
        id:          `li-serp-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        title:       r.title || title,
        company:     r.company_name || "Unknown",
        location:    r.location || location,
        url:         applyUrl || "",
        applyUrl:    applyUrl || "",
        easyApply:   applyUrl.includes("linkedin.com"),
        postedAt:    r.detected_extensions?.posted_at || new Date().toISOString(),
        platform:    "LinkedIn",
        description: (r.description || "").slice(0, 3000),
        salary:      r.detected_extensions?.salary || "",
        workMode:    r.detected_extensions?.work_from_home ? "Remote" : "",
      };
    });
  } catch (err) {
    log("error", `LinkedIn scrape failed for "${title}": ${err.message}`);
    stats.errors++;
    return [];
  }
}

// â”€â”€ Indeed via SerpAPI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function scrapeIndeed(title, location) {
  if (!settings.serpApiKey) {
    log("warning", "No SerpAPI key â€” skipping Indeed search");
    return [];
  }
  try {
    const { data } = await axios.get("https://serpapi.com/search", {
      params: {
        engine:   "google_jobs",
        q:        `${title} site:indeed.com`,
        location,
        // NOTE: chips/date_posted conflicts with site: queries -- date filter applied via Google Jobs scraper only
        hl:       "en",
        api_key:  settings.serpApiKey,
      },
      timeout: 30_000,
    });
    const jobs = data.jobs_results || [];
    log("info", `Indeed (SerpAPI): found ${jobs.length} jobs for "${title}"`);
    return jobs.map((r) => {
      const applyUrl = (r.apply_options || []).find(l => l.link?.includes("indeed.com"))?.link
        || (r.apply_options || [])[0]?.link || "";
      return {
        id:          `in-serp-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        title:       r.title || title,
        company:     r.company_name || "Unknown",
        location:    r.location || location,
        url:         applyUrl || "",
        applyUrl:    applyUrl || "",
        easyApply:   false,
        postedAt:    r.detected_extensions?.posted_at || new Date().toISOString(),
        platform:    "Indeed",
        description: (r.description || "").slice(0, 3000),
        salary:      r.detected_extensions?.salary || "",
        jobType:     r.detected_extensions?.schedule_type || "",
      };
    });
  } catch (err) {
    log("error", `Indeed scrape failed for "${title}": ${err.message}`);
    stats.errors++;
    return [];
  }
}

// â”€â”€ Glassdoor via SerpAPI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function scrapeGlassdoor(title, location) {
  if (!settings.serpApiKey) return [];
  try {
    const { data } = await axios.get("https://serpapi.com/search", {
      params: {
        engine:  "google_jobs",
        q:       `${title} site:glassdoor.com`,
        location,
        // NOTE: chips/date_posted conflicts with site: queries -- date filter applied via Google Jobs scraper only
        hl:      "en",
        api_key: settings.serpApiKey,
      },
      timeout: 30_000,
    });
    const jobs = data.jobs_results || [];
    log("info", `Glassdoor (SerpAPI): found ${jobs.length} jobs for "${title}"`);
    return jobs.map((r) => {
      const applyUrl = (r.apply_options || [])[0]?.link || "";
      return {
        id:          `gd-serp-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        title:       r.title || title,
        company:     r.company_name || "Unknown",
        location:    r.location || location,
        url:         applyUrl,
        applyUrl,
        easyApply:   false,
        postedAt:    r.detected_extensions?.posted_at || new Date().toISOString(),
        platform:    "Glassdoor",
        description: (r.description || "").slice(0, 3000),
        salary:      r.detected_extensions?.salary || "",
      };
    });
  } catch (err) {
    log("error", `Glassdoor scrape failed for "${title}": ${err.message}`);
    stats.errors++;
    return [];
  }
}

// â”€â”€ ZipRecruiter via SerpAPI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function scrapeZipRecruiter(title, location) {
  if (!settings.serpApiKey) return [];
  try {
    const { data } = await axios.get("https://serpapi.com/search", {
      params: {
        engine:  "google_jobs",
        q:       `${title} site:ziprecruiter.com`,
        location,
        // NOTE: chips/date_posted conflicts with site: queries -- date filter applied via Google Jobs scraper only
        hl:      "en",
        api_key: settings.serpApiKey,
      },
      timeout: 30_000,
    });
    const jobs = data.jobs_results || [];
    log("info", `ZipRecruiter (SerpAPI): found ${jobs.length} jobs for "${title}"`);
    return jobs.map((r) => {
      const applyUrl = (r.apply_options || [])[0]?.link || "";
      return {
        id:          `zr-serp-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        title:       r.title || title,
        company:     r.company_name || "Unknown",
        location:    r.location || location,
        url:         applyUrl,
        applyUrl,
        easyApply:   false,
        postedAt:    r.detected_extensions?.posted_at || new Date().toISOString(),
        platform:    "ZipRecruiter",
        description: (r.description || "").slice(0, 3000),
        salary:      r.detected_extensions?.salary || "",
        jobType:     r.detected_extensions?.schedule_type || "",
      };
    });
  } catch (err) {
    log("error", `ZipRecruiter scrape failed for "${title}": ${err.message}`);
    stats.errors++;
    return [];
  }
}

// â”€â”€â”€ Google Jobs via SerpAPI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function scrapeGoogleJobs(title, location) {
  if (!settings.serpApiKey) {
    log("warning", "No SerpAPI key â€” skipping Google Jobs");
    return [];
  }
  try {
    const { data } = await axios.get("https://serpapi.com/search", {
      params: {
        engine: "google_jobs",
        q: `${title} ${location}`,
        location,
        chips:    getDateFilter().chip,
        hl: "en",
        api_key: settings.serpApiKey,
      },
      timeout: 30_000,
    });

    const jobs = data.jobs_results || [];
    return jobs.map((r) => {
      // apply_options = actual job-board apply links (LinkedIn, Indeed, company portal)
      // related_links = company website / Google links â€” do NOT use for applying
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
    log("error", `Google Jobs scrape failed â€” ${title}`, err.message);
    stats.errors++;
    return [];
  }
}

// â”€â”€â”€ TickBig via REST API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function scrapeTickBigJobs(title, location) {
  if (!settings.tickbigEmail || !settings.tickbigPassword) return [];
  try {
    const jobs = await scrapeTickBig(
      settings.tickbigEmail,
      settings.tickbigPassword,
      title,
      location,
      2  // 2 pages = 40 jobs max per query
    );
    log("info", `TickBig: found ${jobs.length} jobs for "${title}" in ${location || "any"}`);
    return jobs;
  } catch (err) {
    log("error", `TickBig scrape failed for "${title}": ${err.message}`);
    stats.errors++;
    return [];
  }
}

function parsePostedAt(text) {
  // "3 hours ago" â†’ ms
  if (!text) return 0;
  const [n, unit] = text.toLowerCase().split(" ");
  const num = parseInt(n, 10) || 0;
  if (unit?.startsWith("hour"))   return num * 3_600_000;
  if (unit?.startsWith("minute")) return num * 60_000;
  if (unit?.startsWith("day"))    return num * 86_400_000;
  return 0;
}

// â”€â”€â”€ Relevance filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// Map user-configured location names to US state abbreviations
const LOCATION_STATE_MAP = {
  "seattle":          ["wa"],
  "washington":       ["wa"],
  "washington state": ["wa"],
  "spokane":          ["wa"],
  "tacoma":           ["wa"],
  "bellevue":         ["wa"],
  "redmond":          ["wa"],
  "oregon":           ["or"],
  "portland":         ["or"],
  "california":       ["ca"],
  "san francisco":    ["ca"],
  "los angeles":      ["ca"],
  "new york":         ["ny", "nj"],
  "texas":            ["tx"],
  "remote":           [],   // remote jobs allowed from anywhere
};

// Cities that are safe to match by name (won't cause false positives with other states)
const SAFE_CITY_MATCH = new Set([
  "seattle", "bellevue", "redmond", "tacoma", "spokane", "kirkland", "renton",
  "bothell", "everett", "kent", "federal way", "olympia", "vancouver",
  "portland", "san francisco", "los angeles", "san jose", "san diego",
  "boston", "chicago", "austin", "denver", "phoenix", "atlanta", "miami",
  "dallas", "houston", "minneapolis", "detroit", "pittsburgh",
]);

// Locations that are AMBIGUOUS — never match by city name string alone
// (e.g. "Washington" also appears in "Washington, DC"; "New York" is fine)
const AMBIGUOUS_NAMES = new Set(["washington", "virginia", "columbia"]);

function isLocationMatch(jobLocation, configuredLocations) {
  if (!jobLocation) return true;
  const jl = jobLocation.toLowerCase().trim();

  // Always allow remote
  if (/\bremote\b|anywhere|work from home|\bwfh\b/i.test(jl)) return true;

  // Explicitly block DC / mid-Atlantic if user only wants WA
  const isDCArea = /washington,?\s*(dc|d\.c\.)|district of columbia|\b(va|virginia|maryland|md)\b/i.test(jl);
  const userWantsWAOnly = (configuredLocations || []).every(l => {
    const k = l.trim().toLowerCase();
    return ["seattle","washington","washington state","bellevue","redmond","tacoma","spokane"].includes(k);
  });
  if (isDCArea && userWantsWAOnly) return false;

  // Build allowed state codes from configured locations
  const allowedStates = new Set();
  const allowedCities = new Set();

  for (const loc of configuredLocations) {
    const key = loc.trim().toLowerCase();
    const mapped = LOCATION_STATE_MAP[key];
    if (mapped) {
      mapped.forEach(s => allowedStates.add(s));
    }
    // Only add city for safe (unambiguous) names
    if (SAFE_CITY_MATCH.has(key) && !AMBIGUOUS_NAMES.has(key)) {
      allowedCities.add(key);
    }
  }

  if (allowedStates.size === 0 && allowedCities.size === 0) return true;

  // Check state code: ", WA" or "(WA)" or "WA," etc.
  for (const state of allowedStates) {
    if (new RegExp(`(^|[\\s,\\(\\[])${state}([\\s,\\)\\]\\.]|$)`, "i").test(jl)) return true;
  }

  // Check safe city names (exact word boundary match)
  for (const city of allowedCities) {
    if (new RegExp(`\\b${city}\\b`, "i").test(jl)) return true;
  }

  // Explicitly allow "Washington State" as a job location string
  if (allowedStates.has("wa") && /washington\s+state/i.test(jl)) return true;

  return false;
}

function isRelevant(job) {
  const text = `${job.title} ${job.description || ""}`.toLowerCase();
  const hasRelevant = RELEVANT_KEYWORDS.some((kw) => text.includes(kw));
  const hasIrrelevant = IRRELEVANT_KEYWORDS.some((kw) => text.includes(kw));
  if (!hasRelevant || hasIrrelevant) return false;

  // Location filter — drop jobs from states not in the user's configured locations
  if (!isLocationMatch(job.location, settings.locations || [])) return false;

  return true;
}

// â”€â”€â”€ Multi-platform scrape â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Track already-seen URLs globally across all runs (for TSV dedup)
const seenUrls = new Set(foundJobs.map((j) => j.url).filter(Boolean));

async function scrapeAllPlatforms(title, location) {
  // Disambiguate "Washington" -> "Washington State" so SerpAPI doesn't return DC/VA/MD jobs
  const searchLoc = /^washington$/i.test((location || "").trim()) ? "Washington State" : location;
  const promises = [];
  // All platform scrapers now use SerpAPI (no Apify required)
  if (settings.serpApiKey) {
    if (settings.platforms.linkedin     !== false) promises.push(scrapeLinkedIn(title, searchLoc));
    if (settings.platforms.indeed       !== false) promises.push(scrapeIndeed(title, searchLoc));
    if (settings.platforms.glassdoor    !== false) promises.push(scrapeGlassdoor(title, searchLoc));
    if (settings.platforms.ziprecruiter !== false) promises.push(scrapeZipRecruiter(title, searchLoc));
    if (settings.platforms.googlejobs   !== false) promises.push(scrapeGoogleJobs(title, searchLoc));
  } else if (settings.platforms.googlejobs !== false) {
    // No SerpAPI key at all â€” skip
    log("warning", "No SerpAPI key configured â€” job search disabled. Add SERPAPI_KEY to .env");
  }

  // TickBig runs independently of SerpAPI (uses its own REST API)
  if (settings.platforms.tickbig !== false && settings.tickbigEmail) {
    promises.push(scrapeTickBigJobs(title, searchLoc));
  }

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

// ATS Direct scraping runs once per cycle (not per title/location â€” it already filters internally)
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

// â”€â”€â”€ Application logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let browserOpensThisCycle = 0;   // reset each cycle â€” caps how many tabs open at once

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

  // Cap browser opens per cycle (LinkedIn/Indeed Playwright doesn't count â€” it reuses one window)
  if (!isLinkedInOrIndeed && browserOpensThisCycle >= maxBrowserOpens) {
    // Hit the cap â€” queue for manual review instead
    const record = buildRecord(job, "queued-manual", null);
    applications.unshift(record);
    if (applications.length > 1000) applications.splice(1000);
    stats.applied++;
    saveData({ applications, logs, foundJobs });
    return true;
  }

  if (settings.autoApplyEnabled && applyUrl) {
    try {
      // LinkedIn / Indeed â€” need credentials to log in first
      if (isLinkedInOrIndeed && !hasLinkedInCreds) {
        status = "queued-manual";
        log("warning", `Skipped (no LinkedIn creds): ${job.title} @ ${job.company}`);
      } else {
        autoApplyResult = await smartApply({
          job,
          credentials: {
            linkedinEmail:    settings.linkedinEmail,
            linkedinPassword: settings.linkedinPassword,
            indeedEmail:      settings.indeedEmail,
            indeedPassword:   settings.indeedPassword,
          },
          profile:    settings.profile,
          resumePath: settings.profile.resumePath,
        });

        if (autoApplyResult.success) {
          status = "auto-applied";
          log("success", `âœ… Auto-applied: ${job.title} @ ${job.company} [${job.platform}]`, autoApplyResult.reason);
        } else if (autoApplyResult.autoApplied) {
          status = "auto-applied";
          log("success", `âœ… Submitted: ${job.title} @ ${job.company}`, autoApplyResult.reason);
        } else if (autoApplyResult.simplifyUsed && autoApplyResult.browserOpened) {
          status = "simplify-opened";
          browserOpensThisCycle++;
          log("info", `Form pre-filled, awaiting manual submit (${browserOpensThisCycle}/${maxBrowserOpens}): ${job.title} @ ${job.company}`);
        } else if (autoApplyResult.browserOpened) {
          status = "browser-opened";
          browserOpensThisCycle++;
          log("info", `Form filled, needs manual submit: ${job.title} @ ${job.company} â€” ${autoApplyResult.reason}`);
        } else {
          status = "apply-failed";
          log("warning", `Apply failed: ${job.title} @ ${job.company} â€” ${autoApplyResult.reason}`);
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

// â”€â”€â”€ Save all found jobs (for manual review in dashboard) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Main automation cycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let cycleRunning = false;   // prevent concurrent cycles

async function runCycle() {
  if (cycleRunning) {
    log("info", "Cycle already running â€” skipping overlap");
    return;
  }
  cycleRunning = true;
  log("info", "Automation cycle started");
  let newThisCycle = 0;
  browserOpensThisCycle = 0;  // reset browser-open counter each cycle
  const maxBrowserOpens = settings.maxBrowserOpensPerCycle ?? 20;

  // â”€â”€ 1. Apify + SerpAPI scrapers (per title/location) â”€â”€
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
        } else {
          stats.skipped++;
        }
      }
    }
  }

  // â”€â”€ 2. LinkedIn Easy Apply Direct â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (settings.linkedinEmail && settings.linkedinPassword && settings.platforms?.linkedin !== false) {
    log("info", "LinkedIn Direct: scanning for Easy Apply jobsâ€¦");
    try {
      const liJobs = await scrapeLinkedInEasyApply(
        { linkedinEmail: settings.linkedinEmail, linkedinPassword: settings.linkedinPassword },
        settings.jobTitles,
        settings.locations,
        30,
        settings.datePostedFilter || "week"
      );
      const newLi = liJobs.filter(j => !seenUrls.has(j.url));
      log("info", `LinkedIn Direct: found ${newLi.length} Easy Apply jobs`);
      stats.found += newLi.length;
      for (const job of newLi) {
        saveFoundJob(job);
        const applied = await applyToJob(job, { maxBrowserOpens });
        if (applied) newThisCycle++;
        else stats.skipped++;
      }
    } catch (err) {
      log("error", "LinkedIn Direct scrape failed", err.message);
      stats.errors++;
    }
  }

  // â”€â”€ 3. ATS Direct scraping (Greenhouse / Lever / Ashby) â”€â”€
  if (settings.platforms.atsDirect !== false) {
    log("info", `ATS Direct: scanning ${ATS_COMPANY_COUNT} companies (Greenhouse, Lever, Ashby)â€¦`);
    try {
      const atsJobs = await scrapeATSOnce();
      log("info", `ATS Direct: found ${atsJobs.length} relevant jobs`);
      stats.found += atsJobs.length;
      for (const job of atsJobs) {
        saveFoundJob(job);
        const applied = await applyToJob(job, { maxBrowserOpens });
        if (applied) {
          newThisCycle++;
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

  // Sync to Google Sheets if configured (fire-and-forget â€” don't block cycle)
  if (isSheetsConfigured()) {
    syncToGoogleSheets(foundJobs, applications)
      .then(r => {
        if (r.ok) log("success", `Google Sheets synced â€” ${r.jobsWritten} jobs, ${r.appsWritten} applications`);
        else log("warning", `Google Sheets sync failed: ${r.error}`);
      })
      .catch(e => log("warning", `Google Sheets sync error: ${e.message}`));
  }

  log("info", `Cycle complete â€” ${newThisCycle} new applications queued`);

  if (newThisCycle > 0 && settings.emailNotifications) {
    const notifyTo = settings.notifyEmail || settings.emailUser;
    const batch = applications.slice(0, newThisCycle);

    const statusMeta = {
      "auto-applied":    { color: "#16a34a", bg: "#dcfce7", label: "✅ Auto-Applied" },
      "browser-opened":  { color: "#d97706", bg: "#fef9c3", label: "🌐 Opened in Chrome" },
      "simplify-opened": { color: "#7c3aed", bg: "#f3e8ff", label: "🪄 Pre-filled" },
      "apply-failed":    { color: "#dc2626", bg: "#fee2e2", label: "❌ Failed" },
      "queued-manual":   { color: "#78716c", bg: "#f5f5f4", label: "📋 Queued" },
    };

    const autoAppliedCount  = batch.filter(a => a.status === "auto-applied").length;
    const browserCount      = batch.filter(a => a.status === "browser-opened" || a.status === "simplify-opened").length;
    const failedCount       = batch.filter(a => a.status === "apply-failed").length;

    const rows = batch.map((a, i) => {
      const sm = statusMeta[a.status] || { color: "#78716c", bg: "#f5f5f4", label: a.status };
      const reason = a.autoApplyNote
        ? `<div style="font-size:11px;color:#78716c;margin-top:3px;">${a.autoApplyNote}</div>`
        : "";
      return `
        <tr style="border-bottom:1px solid #f0eeec;background:${i % 2 === 0 ? "#fff" : "#fafaf9"};">
          <td style="padding:10px 14px;">
            <div style="font-weight:600;color:#1c1917;font-size:13px;">${a.title}</div>
            <div style="color:#78716c;font-size:12px;margin-top:2px;">${a.company}${a.location ? " · " + a.location : ""}</div>
          </td>
          <td style="padding:10px 14px;vertical-align:top;">
            <span style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:4px;padding:2px 7px;font-size:11px;">${a.platform || "—"}</span>
          </td>
          <td style="padding:10px 14px;vertical-align:top;white-space:nowrap;">
            <span style="background:${sm.bg};color:${sm.color};border-radius:6px;padding:3px 9px;font-size:11px;font-weight:600;">${sm.label}</span>
            ${reason}
          </td>
          <td style="padding:10px 14px;vertical-align:top;">
            <a href="${a.url}" style="background:#1c1917;color:#fff;border-radius:6px;padding:5px 11px;font-size:11px;font-weight:600;text-decoration:none;">Apply →</a>
          </td>
        </tr>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#fafaf9;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:680px;margin:28px auto;background:#fff;border-radius:14px;border:1px solid #e5e3e0;overflow:hidden;">
    <div style="background:#1c1917;padding:22px 24px;">
      <span style="color:#fff;font-size:17px;font-weight:700;">⚡ JobPilot — ${newThisCycle} New Jobs</span>
      <div style="color:#a8a29e;font-size:12px;margin-top:5px;">${new Date().toLocaleString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;background:#fafaf9;border-bottom:1px solid #e5e3e0;">
      <tr>
        ${[
          ["✅ Auto-Applied", autoAppliedCount, "#16a34a"],
          ["🌐 Open in Chrome", browserCount, "#d97706"],
          ["❌ Failed", failedCount, "#dc2626"],
        ].map(([lbl, val, c]) => `
          <td style="padding:12px;text-align:center;border-right:1px solid #e5e3e0;">
            <div style="font-size:22px;font-weight:700;color:${c};">${val}</div>
            <div style="font-size:10px;color:#a8a29e;margin-top:2px;">${lbl}</div>
          </td>`).join("")}
      </tr>
    </table>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f5f4f2;border-bottom:1px solid #e5e3e0;">
          <th style="padding:8px 14px;text-align:left;font-size:10px;color:#a8a29e;font-weight:600;text-transform:uppercase;">Job</th>
          <th style="padding:8px 14px;text-align:left;font-size:10px;color:#a8a29e;font-weight:600;text-transform:uppercase;">Platform</th>
          <th style="padding:8px 14px;text-align:left;font-size:10px;color:#a8a29e;font-weight:600;text-transform:uppercase;">Status / Reason</th>
          <th style="padding:8px 14px;"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="padding:14px 18px;background:#fafaf9;border-top:1px solid #f0eeec;text-align:center;">
      <div style="font-size:11px;color:#a8a29e;">Sent by <strong style="color:#1c1917;">JobPilot</strong> · <a href="http://localhost:3004" style="color:#2563eb;">Open Dashboard</a></div>
    </div>
  </div>
</body>
</html>`;

    await sendEmail(
      `JobPilot: ${newThisCycle} new jobs — ${autoAppliedCount} auto-applied, ${browserCount} need review`,
      html,
      notifyTo
    ).catch((e) => log("error", "Email send failed", e.message));
  }

  cycleRunning = false;
}

// â”€â”€â”€ Daily Digest Email â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function sendDailyDigest() {
  const notifyTo = settings.notifyEmail || settings.emailUser;

  // Send ALL found jobs, sorted by score descending
  const allJobs = [...foundJobs].sort((a, b) => (b.score || 0) - (a.score || 0));

  if (allJobs.length === 0) {
    log("info", "Daily digest: no jobs found yet â€” start the scanner first");
    return;
  }

  const autoApplied  = applications.filter(a => a.status === "auto-applied").length;
  const interviewing = applications.filter(a => a.status === "interviewing").length;
  const hotMatches   = allJobs.filter(j => j.score >= 3.5).length;

  const sc = (s) => s >= 3.5 ? "#16a34a" : s >= 2.5 ? "#d97706" : "#dc2626";

  const jobRows = allJobs.map((j, i) => `
    <tr style="border-bottom:1px solid #f0eeec;background:${i % 2 === 0 ? "#fff" : "#fafaf9"};">
      <td style="padding:11px 14px;font-size:12px;color:#a8a29e;font-weight:600;width:32px;">${i + 1}</td>
      <td style="padding:11px 14px;">
        <div style="font-weight:600;color:#1c1917;font-size:13px;line-height:1.3;">${j.title}</div>
        <div style="color:#78716c;font-size:12px;margin-top:2px;">${j.company}${j.location ? " Â· " + j.location : ""}</div>
        ${j.salary ? `<div style="color:#16a34a;font-size:11px;margin-top:2px;">${j.salary}</div>` : ""}
      </td>
      <td style="padding:11px 14px;white-space:nowrap;vertical-align:top;">
        <span style="background:${sc(j.score)}18;color:${sc(j.score)};border:1px solid ${sc(j.score)}30;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:700;">${j.score ?? "â€”"}</span>
      </td>
      <td style="padding:11px 14px;vertical-align:top;">
        <span style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:4px;padding:2px 7px;font-size:11px;">${j.platform || "â€”"}</span>
        ${j.easyApply ? '<br><span style="background:#dcfce7;color:#16a34a;border:1px solid #bbf7d0;border-radius:4px;padding:2px 7px;font-size:10px;font-weight:600;margin-top:3px;display:inline-block;">Easy Apply</span>' : ""}
      </td>
      <td style="padding:11px 14px;vertical-align:top;white-space:nowrap;">
        <a href="${j.url}" style="background:#1c1917;color:#fff;border-radius:6px;padding:6px 13px;font-size:12px;font-weight:600;text-decoration:none;">Apply â†’</a>
      </td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#fafaf9;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:700px;margin:32px auto;background:#fff;border-radius:16px;border:1px solid #e5e3e0;overflow:hidden;">

    <!-- Header -->
    <div style="background:#1c1917;padding:26px 28px;">
      <div style="display:inline-flex;align-items:center;gap:10px;">
        <span style="background:#fff;border-radius:8px;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;font-size:16px;">âš¡</span>
        <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.5px;">JobPilot â€” All Job Results</span>
      </div>
      <div style="color:#a8a29e;font-size:12px;margin-top:6px;">${new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</div>
    </div>

    <!-- Stats bar -->
    <table style="width:100%;border-collapse:collapse;background:#fafaf9;border-bottom:1px solid #e5e3e0;">
      <tr>
        ${[
          ["Total Jobs", allJobs.length, "#2563eb"],
          ["Hot Matches", hotMatches, "#d97706"],
          ["Auto-Applied", autoApplied, "#16a34a"],
          ["Interviewing", interviewing, "#0891b2"],
        ].map(([lbl, val, c]) => `
          <td style="padding:14px;text-align:center;border-right:1px solid #e5e3e0;">
            <div style="font-size:24px;font-weight:700;color:${c};">${val}</div>
            <div style="font-size:10px;color:#a8a29e;text-transform:uppercase;letter-spacing:0.07em;margin-top:2px;">${lbl}</div>
          </td>`).join("")}
      </tr>
    </table>

    <!-- Sub header -->
    <div style="padding:16px 20px;border-bottom:1px solid #f0eeec;background:#fff;">
      <span style="font-size:13px;font-weight:700;color:#1c1917;">${allJobs.length} Jobs Found</span>
      <span style="font-size:12px;color:#a8a29e;margin-left:8px;">Sorted by fit score Â· Click Apply â†’ to open each job</span>
    </div>

    <!-- Jobs table -->
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f5f4f2;border-bottom:1px solid #e5e3e0;">
          <th style="padding:8px 14px;text-align:left;font-size:10px;color:#a8a29e;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;">#</th>
          <th style="padding:8px 14px;text-align:left;font-size:10px;color:#a8a29e;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;">Job</th>
          <th style="padding:8px 14px;text-align:left;font-size:10px;color:#a8a29e;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;">Score</th>
          <th style="padding:8px 14px;text-align:left;font-size:10px;color:#a8a29e;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;">Platform</th>
          <th style="padding:8px 14px;text-align:left;font-size:10px;color:#a8a29e;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;"></th>
        </tr>
      </thead>
      <tbody>${jobRows}</tbody>
    </table>

    <!-- Footer -->
    <div style="padding:16px 20px;background:#fafaf9;border-top:1px solid #f0eeec;text-align:center;">
      <div style="font-size:12px;color:#a8a29e;">Sent by <strong style="color:#1c1917;">JobPilot</strong> to ${notifyTo}</div>
      <div style="font-size:11px;color:#d6d3d1;margin-top:3px;">Manage your search at <a href="http://localhost:3004" style="color:#2563eb;">localhost:3004</a></div>
    </div>
  </div>
</body>
</html>`;

  await sendEmail(
    `JobPilot: ${allJobs.length} jobs found â€” ${new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"})}`,
    html,
    notifyTo
  )
    .then(() => log("success", `âœ… Digest sent to ${notifyTo} â€” ${allJobs.length} jobs`))
    .catch(err => log("error", "Digest send failed", err.message));
}

// â”€â”€â”€ Scheduler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let digestJob = null;

function startScheduler() {
  runCycle();
  const rule = new schedule.RecurrenceRule();
  rule.minute = new schedule.Range(0, 59, settings.intervalMinutes);
  schedulerJob = schedule.scheduleJob(rule, runCycle);

  // Daily digest at 8:00 AM
  if (!digestJob) {
    digestJob = schedule.scheduleJob("0 8 * * *", sendDailyDigest);
    log("info", "Daily digest scheduled for 8:00 AM");
  }
}

function stopScheduler() {
  if (schedulerJob) { schedulerJob.cancel(); schedulerJob = null; }
  // Keep digestJob running even when scanner is stopped
}

// â”€â”€â”€ API routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// GET /api/jobs â€” all scraped jobs for manual review
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
  const allowed = ["jobTitles", "locations", "intervalMinutes", "maxApplicationsPerRun", "maxBrowserOpensPerCycle", "emailNotifications", "notifyEmail", "platforms", "autoApplyEnabled", "datePostedFilter"];
  for (const key of allowed) {
    if (req.body[key] !== undefined) settings[key] = req.body[key];
  }
  // Credential fields â€” only update if provided
  const credFields = ["serpApiKey", "apifyToken", "emailPass", "linkedinEmail", "linkedinPassword", "tickbigEmail", "tickbigPassword"];
  let tickbigChanged = false;
  for (const key of credFields) {
    if (req.body[key] !== undefined) {
      if ((key === "tickbigEmail" || key === "tickbigPassword") && req.body[key] !== settings[key]) {
        tickbigChanged = true;
      }
      settings[key] = req.body[key];
    }
  }
  if (tickbigChanged) invalidateTickBigToken();
  if (isRunning) { stopScheduler(); startScheduler(); }
  log("info", "Settings updated");
  res.json({ ok: true, settings: sanitizeSettings(settings) });
});

// GET /api/profile â€” return the current user profile
app.get("/api/profile", (req, res) => {
  res.json({ ok: true, profile: settings.profile });
});

// POST /api/profile â€” save profile from extension popup (any user)
app.post("/api/profile", (req, res) => {
  const p = req.body || {};
  // Merge all profile fields
  const fields = ["name","firstName","lastName","email","phone","location",
    "linkedinUrl","github","website","school","degree","major",
    "yearsExperience","expectedSalary","skills","targetRoles",
    "remotePreference","summary","coverLetter","resumePath","resumeFileName","zipCode",
    "education","experiences",
    // Work auth
    "isOver18","workAuthorized","requiresSponsorship",
    // Location / office
    "willingToRelocate","preferredOfficeHub","inPersonOk",
    // EEO
    "gender","race","veteranStatus","disability",
    // Skills detail
    "pythonYears","codingPercentage",
    // Open-text
    "whyJoinAnswer","culturalValuesAnswer","additionalInfo"];
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
  log("info", `Profile saved â€” ${settings.profile.name || "unnamed user"}`);
  res.json({ ok: true, profile: settings.profile });
});

// POST /api/generate-resume â€” tailored resume sections for a job
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

  // Skills that appear in the job description â€” put first
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
    `Delivered ${yrsExp > 0 ? yrsExp : "multiple"} major projects end-to-end â€” from requirements through production deployment`,
  ].filter(Boolean);

  return {
    name, email, phone, location, linkedinUrl, github,
    education: { school, degree },
    tailoredSummary,
    matchedSkills,
    otherSkills,
    missingSkills,           // skills in JD not in profile â€” "skill gap"
    orderedSkills,
    experienceBullets: bulletTemplates,
    seniority: seniorityLabel,
    yearsExperience: yrsExp,
    targetTitle: title,
    targetCompany: company,
  };
}

// POST /api/skill-gap â€” quick skill gap analysis for a job
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

// POST /api/digest â€” send daily digest immediately (manual trigger)
app.post("/api/digest", async (req, res) => {
  try {
    await sendDailyDigest();
    res.json({ ok: true, message: "Digest sent" });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /api/sync-sheets â€” push jobs + applications to Google Sheets now
app.post("/api/sync-sheets", async (req, res) => {
  if (!isSheetsConfigured()) {
    return res.status(400).json({
      ok: false,
      message: "Google Sheets not configured. Add GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_PRIVATE_KEY to your .env file.",
    });
  }
  try {
    const result = await syncToGoogleSheets(foundJobs, applications);
    if (result.ok) {
      log("success", `Google Sheets manual sync â€” ${result.jobsWritten} jobs, ${result.appsWritten} apps`);
      res.json({ ok: true, ...result });
    } else {
      res.status(500).json({ ok: false, message: result.error });
    }
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// GET /api/sheets-status â€” check if Google Sheets is configured
app.get("/api/sheets-status", (req, res) => {
  res.json({
    configured: isSheetsConfigured(),
    sheetId: process.env.GOOGLE_SHEET_ID ? `...${process.env.GOOGLE_SHEET_ID.slice(-6)}` : null,
  });
});

app.post("/api/test-email", async (req, res) => {
  try {
    await sendEmail("Job Bot â€” test email", "<h2>Email notifications are working!</h2>");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /api/apply/:id  â€” manually trigger auto-apply for a queued job
app.post("/api/apply/:id", async (req, res) => {
  const id = parseFloat(req.params.id);
  const record = applications.find((a) => a.id === id);
  if (!record) return res.status(404).json({ ok: false, message: "Not found" });
  if (!settings.linkedinEmail || !settings.linkedinPassword) {
    return res.status(400).json({ ok: false, message: "LinkedIn credentials not configured in .env" });
  }

  res.json({ ok: true, message: "Auto-apply started â€” watch the browser window" });

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

// POST /api/reset-session  â€” reset LinkedIn browser session
app.post("/api/reset-session", async (req, res) => {
  await resetSession();
  log("info", "LinkedIn browser session reset");
  res.json({ ok: true });
});

// GET /api/ats-companies â€” list all companies being scraped directly
app.get("/api/ats-companies", (req, res) => {
  res.json({
    total: ATS_COMPANY_COUNT,
    greenhouse: GREENHOUSE_COMPANIES.map((c) => c.name),
    lever: LEVER_COMPANIES.map((c) => c.name),
    ashby: ASHBY_COMPANIES.map((c) => c.name),
  });
});

// GET /api/scan-history â€” last N rows from TSV
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// OneTouch Extension Endpoints
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// POST /api/onetouch-apply â€” Chrome extension calls this when user clicks âš¡
// Saves the job as "onetouch-filled" and tracks it in the dashboard
app.post("/api/onetouch-apply", (req, res) => {
  try {
    const job = req.body;
    if (!job?.url) return res.json({ ok: false, reason: "No URL provided" });

    // Dedup â€” if URL already tracked, return the existing record id so the
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

// POST /api/score-job â€” extension calls this to show match score on job page
app.post("/api/score-job", (req, res) => {
  try {
    const job = req.body;
    const result = scoreJob(job);
    res.json({ score: result.score, label: scoreLabel(result.score), breakdown: result.breakdown });
  } catch {
    res.status(500).json({ score: null });
  }
});

// GET /api/viral-image â€” generate & stream a 1200Ã—630 PNG from live job data
// No external API calls â€” pure SVG+Sharp pipeline
app.get("/api/viral-image", async (req, res) => {
  try {
    const { png, stats } = await generateViralImage(null, settings.profile);
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

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CareerOps-inspired: Tailored answer generation
// POST /api/generate-answers
// { job: { title, company, description }, profile: { name, skills, summary, ... } }
// Returns: { coverLetter, whyRole, talkingPoints, matchedSkills }
// No external API needed â€” pure template engine
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      ? `âœ… Highlight your experience with: ${matchedSkills.join(", ")}`
      : `ðŸ“Œ Emphasise your ${yearsExperience} years of relevant experience`,
    reqSentences.length > 0
      ? `ðŸ“‹ Address this requirement: "${reqSentences[0].slice(0, 80)}â€¦"`
      : `ðŸ“‹ Research ${company}'s recent products and engineering blog`,
    `ðŸŽ¯ Prepare 2â€“3 STAR stories (Situation, Task, Action, Result)`,
    `ðŸ” Review ${company}'s mission, values, and recent news before the interview`,
    remotePreference ? `ðŸ  You prefer: ${remotePreference} â€” confirm arrangement early` : null,
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

// â”€â”€â”€ Pipeline stage management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  log("success", `Pipeline: ${record.title} @ ${record.company} â†’ ${stage}`);
  res.json({ ok: true, record });
});

// GET /api/pipeline â€” returns applications grouped by stage
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// AGENTS SYSTEM â€” 5 autonomous agents, no LLM API required
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const agentRuns = {};

const AGENT_DEFINITIONS = [
  { id:"outreach-writer",   name:"Outreach Writer",    icon:"âœ‰ï¸",  color:"#6366f1",
    description:"Generates personalised LinkedIn connection requests for your top hot-match jobs.",
    configFields:[{ key:"topN", label:"Top N jobs", type:"number", default:5 },
                  { key:"tone", label:"Tone", type:"select", options:["Professional","Friendly","Concise"], default:"Professional" }] },
  { id:"followup-drafter",  name:"Follow-up Drafter",  icon:"ðŸ“¬", color:"#14b8a6",
    description:"Finds applications with no update in N days and drafts a polite follow-up email.",
    configFields:[{ key:"staleDays", label:"Days without update", type:"number", default:7 }] },
  { id:"profile-optimizer", name:"Profile Optimizer",  icon:"ðŸ§ ", color:"#a855f7",
    description:"Scans hot-match job descriptions and recommends skills to add to your profile.",
    configFields:[{ key:"minFreq", label:"Min appearances", type:"number", default:3 }] },
  { id:"salary-analyst",    name:"Salary Analyst",     icon:"ðŸ’°", color:"#f59e0b",
    description:"Extracts salary ranges from job descriptions and gives you a market-rate breakdown.",
    configFields:[] },
  { id:"cold-scout",        name:"Cold Apply Scout",   icon:"ðŸ”­", color:"#22c55e",
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
      message = `Hi [Recruiter],\n\nI noticed ${job.company} is hiring for ${job.title}. My background in ${topSkills} aligns well â€” would love to connect.\n\n${firstName}`;
    } else if (tone === "Friendly") {
      message = `Hey [Recruiter] ðŸ‘‹\n\nSaw the ${job.title} role at ${job.company} and got excited â€” ${summary ? summary + ". " : ""}Strong experience in ${topSkills}.\n\nWould love to chat!\n\n${firstName}`;
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
    const followUp = `Subject: Following Up â€” ${app.title} Application\n\nDear Hiring Team,\n\nI submitted my application for the ${app.title} position at ${app.company} approximately ${daysSince} days ago and wanted to follow up to reiterate my strong interest.\n\nPlease let me know if you need any additional information.\n\nBest regards,\n${name}\n${email}${phone ? "\n" + phone : ""}`;
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// BILLING â€” Stripe Integration
// Set env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
// Prices: STRIPE_PRICE_PRO (monthly), STRIPE_PRICE_ENTERPRISE (monthly)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

// POST /api/billing/webhook  â€” Stripe webhook (raw body)
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
    log("success", `Subscription activated â€” plan: ${sub.planId}`);
  }
  if (event.type === "customer.subscription.deleted") {
    saveData({ applications, logs, foundJobs, profile: settings.profile, subscription: { planId: "free", status: "cancelled" } });
    log("info", "Subscription cancelled â€” reverted to free plan");
  }
  res.json({ received: true });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get("*", (req, res) => {
  const index = path.join(clientBuild, "index.html");
  if (fs.existsSync(index)) return res.sendFile(index);
  res.status(404).send("Frontend not built. Run `npm run build` inside /client.");
});

function sanitizeSettings(s) {
  const { emailPass, apifyToken, serpApiKey, linkedinPassword, tickbigPassword, ...safe } = s;
  return {
    ...safe,
    emailConfigured:    !!emailPass,
    apifyConfigured:    !!apifyToken,
    serpApiConfigured:  !!serpApiKey,
    linkedinConfigured: !!linkedinPassword && !!s.linkedinEmail,
    tickbigConfigured:  !!tickbigPassword  && !!s.tickbigEmail,
    sheetsConfigured:   isSheetsConfigured(),
  };
}

// â”€â”€â”€ New Architecture Routes (Phase 1-4) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// These endpoints use the new DB layer and are served alongside legacy routes.

import { getLogs, getApplications, getJobs, getPipelineStages } from "./src/storage/db.js";
import { bootstrap } from "./src/bootstrap.js";
import { generateOutreach, generateInterviewPrep, analyzeSkillGap } from "./src/ai/prompts/outreach.js";
import { runOutreachCycle, findRecruiters, closeOutreachBrowser } from "./recruiterOutreach.js";

// â”€â”€â”€ Recruiter Outreach State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let outreachLog   = [];   // { recruiter, company, sent, note, sentAt }
let outreachRunning = false;
const OUTREACH_FILE = path.join(__dirname, "outreach-log.json");

// Load persisted outreach log on startup
try {
  if (fs.existsSync(OUTREACH_FILE)) {
    outreachLog = JSON.parse(fs.readFileSync(OUTREACH_FILE, "utf8"));
  }
} catch { outreachLog = []; }

function saveOutreachLog() {
  fs.writeFileSync(OUTREACH_FILE, JSON.stringify(outreachLog.slice(0, 500), null, 2));
}

// Count how many were sent today
function sentToday() {
  const today = new Date().toDateString();
  return outreachLog.filter(r => r.sent && new Date(r.sentAt).toDateString() === today).length;
}


// GET /api/db/jobs â€” jobs from SQLite (scored, paginated)
app.get("/api/db/jobs", async (req, res) => {
  try {
    const { search = "", minScore = 0, limit = 200, offset = 0 } = req.query;
    const result = await getJobs({ search, minScore: parseFloat(minScore) || 0, limit: parseInt(limit), offset: parseInt(offset) });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/db/applications â€” applications from SQLite
app.get("/api/db/applications", async (req, res) => {
  try {
    const result = await getApplications({ limit: 500 });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/db/pipeline â€” kanban stages from SQLite
app.get("/api/db/pipeline", async (req, res) => {
  try {
    const stages = await getPipelineStages();
    res.json(stages);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/db/logs â€” workflow logs from SQLite
app.get("/api/db/logs", async (req, res) => {
  try {
    const logs = await getLogs(parseInt(req.query.limit) || 200);
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/ai/outreach â€” generate recruiter outreach message
app.post("/api/ai/outreach", async (req, res) => {
  try {
    const { job, profile, type = "linkedin_connect" } = req.body;
    const message = await generateOutreach(job, profile, type);
    res.json({ ok: true, message });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// POST /api/ai/interview-prep â€” generate interview talking points
app.post("/api/ai/interview-prep", async (req, res) => {
  try {
    const { job, profile } = req.body;
    const points = await generateInterviewPrep(job, profile);
    res.json({ ok: true, points });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// POST /api/ai/skill-gap â€” analyze skill gap
app.post("/api/ai/skill-gap", async (req, res) => {
  try {
    const { job, profile } = req.body;
    const analysis = await analyzeSkillGap(job, profile);
    res.json({ ok: true, analysis });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// POST /api/ai/cover-letter â€” generate tailored cover letter
app.post("/api/ai/cover-letter", async (req, res) => {
  try {
    const { job, profile } = req.body;
    const { aiRouter } = await import("./src/ai/router/index.js");
    const letter = await aiRouter.generateCoverLetter(job || {}, profile || settings.profile);
    res.json({ ok: true, letter });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// â”€â”€â”€ Recruiter Outreach Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// GET /api/outreach â€” get log + stats
app.get("/api/outreach", (req, res) => {
  const today = sentToday();
  const total = outreachLog.filter(r => r.sent).length;
  const connected = outreachLog.filter(r => r.connected).length;
  res.json({ ok: true, log: outreachLog.slice(0, 100), stats: { today, total, connected, running: outreachRunning } });
});

// POST /api/outreach/run â€” trigger an outreach cycle
app.post("/api/outreach/run", async (req, res) => {
  if (outreachRunning) return res.json({ ok: false, message: "Outreach already running" });

  const { companies } = req.body || {};
  const targetCompanies = companies && companies.length
    ? companies
    : ["Amazon", "Microsoft", "Google", "Meta", "Apple", "Expedia", "Salesforce", "Stripe", "Databricks", "Snowflake", "OpenAI", "Adobe", "Nvidia", "Netflix", "Uber", "Lyft", "Airbnb", "Zillow", "T-Mobile", "Boeing"];

  const profile     = settings.profile || {};
  const credentials = { linkedinEmail: settings.linkedinEmail, linkedinPassword: settings.linkedinPassword };

  if (!credentials.linkedinEmail || !credentials.linkedinPassword) {
    return res.status(400).json({ ok: false, message: "LinkedIn credentials not configured in Settings" });
  }

  const todaySent = sentToday();
  if (todaySent >= 10) {
    return res.json({ ok: false, message: `Daily limit reached (${todaySent}/10 sent today). Try again tomorrow.` });
  }

  res.json({ ok: true, message: `Starting outreach to ${targetCompanies.length} companies (${10 - todaySent} slots remaining today)` });

  // Run async in background
  outreachRunning = true;
  runOutreachCycle(credentials, profile, targetCompanies, todaySent)
    .then(({ results, totalSent }) => {
      outreachLog.unshift(...results);
      if (outreachLog.length > 500) outreachLog.splice(500);
      saveOutreachLog();
      log("success", `Recruiter outreach complete: ${totalSent} connection requests sent`);
    })
    .catch(err => log("error", `Outreach cycle error: ${err.message}`))
    .finally(() => { outreachRunning = false; });
});

// POST /api/outreach/find â€” just search for recruiters (no send)
app.post("/api/outreach/find", async (req, res) => {
  const { company, title = "Technical Recruiter" } = req.body || {};
  if (!company) return res.status(400).json({ ok: false, message: "company required" });
  const credentials = { linkedinEmail: settings.linkedinEmail, linkedinPassword: settings.linkedinPassword };
  if (!credentials.linkedinEmail) return res.status(400).json({ ok: false, message: "LinkedIn credentials not configured" });
  try {
    const recruiters = await findRecruiters(credentials, company, title, 10);
    res.json({ ok: true, recruiters });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/outreach/:index/connected â€” mark someone as connected
app.patch("/api/outreach/:index/connected", (req, res) => {
  const i = parseInt(req.params.index);
  if (outreachLog[i]) {
    outreachLog[i].connected = true;
    saveOutreachLog();
  }
  res.json({ ok: true });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

registerChatRoutes(app, () => ({ settings, foundJobs, applications }));

const PORT = process.env.PORT || 3004;
const server = app.listen(PORT, async () => {
  console.log(`JobPilot running on http://localhost:${PORT}`);
  // Wire up new architecture after server is ready
  await bootstrap().catch(err => console.error("Bootstrap error:", err.message));
});

