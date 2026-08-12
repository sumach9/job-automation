/**
 * staffingScrapers.js — IT staffing agency job board scrapers
 *
 * Covers 17 agencies: Robert Half, Experis, Volt, Spectra Force,
 * The Judge Group, Alexander Technology Group, PTR Global, Agility Partners,
 * AGM Technologies, BPS Technologies, Abbott Unlimited, Market Street Talent,
 * Transcend IT, CNA Consulting, Banzeal, Synergy Technologies, Curate Partners
 *
 * Strategies used:
 *  - Bullhorn GetJobs API  (most IT staffing firms)
 *  - Robert Half public REST API
 *  - Experis / Volt cheerio scrape
 *  - Graceful error handling — one failed agency never blocks the others
 */

import axios from "axios";
import * as cheerio from "cheerio";

const KEYWORDS = ["data scientist", "data engineer", "data analyst", "ai engineer", "machine learning", "nlp", "llm"];
const TIMEOUT  = 15_000;
const HEADERS  = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" };

function isTitleRelevant(title = "") {
  const t = title.toLowerCase();
  const skip = ["attorney", "nurse", "physician", "mechanic", "construction", "intern", "driver"];
  if (skip.some(s => t.includes(s))) return false;
  return KEYWORDS.some(k => t.includes(k));
}

function normalizeJob({ id, title, company, location, url, applyUrl, description, postedAt, platform }) {
  return {
    id, title, company,
    location: location || "",
    url: url || "",
    applyUrl: applyUrl || url || "",
    easyApply: false,
    postedAt: postedAt || new Date().toISOString(),
    platform: platform || "Staffing Agency",
    atsProvider: "Staffing",
    description: (description || "").replace(/<[^>]+>/g, "").slice(0, 3000),
    skills: [], salary: "", workMode: "", jobType: "",
  };
}

// ── Bullhorn API scraper (shared by most IT staffing firms) ───────────────────
// Standard endpoint: https://[slug].bullhornstaffing.com/BullhornStaffing/GetJobs
async function scrapeBullhorn(slug, agencyName) {
  const keyword = "data+scientist+OR+data+engineer+OR+machine+learning+OR+AI+engineer";
  const url = `https://${slug}.bullhornstaffing.com/BullhornStaffing/GetJobs?count=50&start=0&type=1&keyword=${keyword}`;
  const { data } = await axios.get(url, { timeout: TIMEOUT, headers: HEADERS });
  const jobs = data?.data || [];
  return jobs
    .filter(j => isTitleRelevant(j.title))
    .map(j => normalizeJob({
      id:          `bh-${slug}-${j.id}`,
      title:       j.title,
      company:     agencyName,
      location:    [j.city, j.state].filter(Boolean).join(", "),
      url:         `https://${slug}.bullhornstaffing.com/jobs/${j.id}/${encodeURIComponent((j.title || "").toLowerCase().replace(/\s+/g, "-"))}`,
      description: j.publicDescription || "",
      postedAt:    j.dateAdded ? new Date(j.dateAdded).toISOString() : new Date().toISOString(),
      platform:    `${agencyName} (Bullhorn)`,
    }));
}

// ── Bullhorn agencies ─────────────────────────────────────────────────────────
// Slug = subdomain at [slug].bullhornstaffing.com
const BULLHORN_AGENCIES = [
  { slug: "spectraforce",          name: "Spectra Force" },
  { slug: "ptrglobal",             name: "PTR Global" },
  { slug: "agilityptnrs",          name: "Agility Partners" },
  { slug: "agmtechnologies",       name: "AGM Technologies" },
  { slug: "bpstechnologies",       name: "BPS Technologies" },
  { slug: "synergytech",           name: "Synergy Technologies" },
  { slug: "banzeal",               name: "Banzeal Incorporated" },
  { slug: "transcendit",           name: "Transcend IT" },
  { slug: "cnaconsulting",         name: "CNA Consulting" },
  { slug: "curatepartners",        name: "Curate Partners" },
  { slug: "abbottunlimited",       name: "Abbott Unlimited" },
  { slug: "marketstreettalent",    name: "Market Street Talent" },
];

// ── Robert Half ───────────────────────────────────────────────────────────────
async function scrapeRobertHalf(query = "data scientist") {
  const url = `https://www.roberthalf.com/api/us/en/jobs?rows=25&start=0&keywords=${encodeURIComponent(query)}&country=us&sort=relevance&mode=And`;
  const { data } = await axios.get(url, { timeout: TIMEOUT, headers: HEADERS });
  const jobs = data?.data?.jobs || data?.jobs || [];
  return jobs
    .filter(j => isTitleRelevant(j.title || j.jobTitle))
    .map(j => normalizeJob({
      id:          `rh-${j.jobId || j.id}`,
      title:       j.title || j.jobTitle,
      company:     "Robert Half",
      location:    j.location || [j.city, j.stateCode].filter(Boolean).join(", "),
      url:         j.applyUrl || `https://www.roberthalf.com/us/en/job/${j.jobId || j.id}`,
      description: j.jobDescription || j.description || "",
      postedAt:    j.postedDate ? new Date(j.postedDate).toISOString() : new Date().toISOString(),
      platform:    "Robert Half",
    }));
}

// ── Experis (ManpowerGroup) ───────────────────────────────────────────────────
async function scrapeExperis(query = "data scientist") {
  const url = `https://www.experis.com/us/find-jobs?keywords=${encodeURIComponent(query)}&location=&radius=50`;
  const { data } = await axios.get(url, { timeout: TIMEOUT, headers: HEADERS });
  const $ = cheerio.load(data);
  const jobs = [];
  $(".job-result, .job-card, [data-job-id], article.job").each((_, el) => {
    const title    = $(el).find("h2, h3, .job-title, [class*='title']").first().text().trim();
    const location = $(el).find(".location, [class*='location']").first().text().trim();
    const href     = $(el).find("a").first().attr("href") || "";
    const jobUrl   = href.startsWith("http") ? href : `https://www.experis.com${href}`;
    if (title && isTitleRelevant(title)) {
      jobs.push(normalizeJob({
        id:       `exp-${Buffer.from(jobUrl).toString("base64").slice(0, 12)}`,
        title, company: "Experis", location, url: jobUrl,
        platform: "Experis",
      }));
    }
  });
  return jobs;
}

// ── Volt ──────────────────────────────────────────────────────────────────────
async function scrapeVolt(query = "data scientist") {
  const url = `https://volt.com/find-work/jobs/?q=${encodeURIComponent(query)}`;
  const { data } = await axios.get(url, { timeout: TIMEOUT, headers: HEADERS });
  const $ = cheerio.load(data);
  const jobs = [];
  $(".job-listing, .job-card, article, [class*='job']").each((_, el) => {
    const title    = $(el).find("h2, h3, .title, [class*='title']").first().text().trim();
    const location = $(el).find(".location, [class*='location']").first().text().trim();
    const href     = $(el).find("a").first().attr("href") || "";
    const jobUrl   = href.startsWith("http") ? href : `https://volt.com${href}`;
    if (title && isTitleRelevant(title)) {
      jobs.push(normalizeJob({
        id:       `volt-${Buffer.from(jobUrl).toString("base64").slice(0, 12)}`,
        title, company: "Volt", location, url: jobUrl,
        platform: "Volt",
      }));
    }
  });
  return jobs;
}

// ── The Judge Group ───────────────────────────────────────────────────────────
async function scrapeJudgeGroup(query = "data scientist") {
  const url = `https://jobs.judge.com/jobs?q=${encodeURIComponent(query)}&l=`;
  const { data } = await axios.get(url, { timeout: TIMEOUT, headers: HEADERS });
  const $ = cheerio.load(data);
  const jobs = [];
  $(".job, .job-card, article, [class*='result']").each((_, el) => {
    const title    = $(el).find("h2, h3, a, .title").first().text().trim();
    const location = $(el).find(".location, .city, [class*='location']").first().text().trim();
    const href     = $(el).find("a").first().attr("href") || "";
    const jobUrl   = href.startsWith("http") ? href : `https://jobs.judge.com${href}`;
    if (title && isTitleRelevant(title)) {
      jobs.push(normalizeJob({
        id:       `judge-${Buffer.from(jobUrl).toString("base64").slice(0, 12)}`,
        title, company: "The Judge Group", location, url: jobUrl,
        platform: "The Judge Group",
      }));
    }
  });
  return jobs;
}

// ── Alexander Technology Group ────────────────────────────────────────────────
async function scrapeAlexanderTech(query = "data") {
  const url = `https://www.alexandertechnology.com/find-work/?s=${encodeURIComponent(query)}`;
  const { data } = await axios.get(url, { timeout: TIMEOUT, headers: HEADERS });
  const $ = cheerio.load(data);
  const jobs = [];
  $(".job, article, .position, [class*='job']").each((_, el) => {
    const title    = $(el).find("h2, h3, a.title, .job-title").first().text().trim();
    const location = $(el).find(".location, [class*='location']").first().text().trim();
    const href     = $(el).find("a").first().attr("href") || "";
    const jobUrl   = href.startsWith("http") ? href : `https://www.alexandertechnology.com${href}`;
    if (title && isTitleRelevant(title)) {
      jobs.push(normalizeJob({
        id:       `atg-${Buffer.from(jobUrl).toString("base64").slice(0, 12)}`,
        title, company: "Alexander Technology Group", location, url: jobUrl,
        platform: "Alexander Technology Group",
      }));
    }
  });
  return jobs;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function scrapeStaffingAgencies({ query = "data scientist", logFn = () => {} } = {}) {
  const allJobs = [];

  // Run all Bullhorn agencies in parallel
  const bullhornResults = await Promise.allSettled(
    BULLHORN_AGENCIES.map(a => scrapeBullhorn(a.slug, a.name))
  );
  bullhornResults.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.length > 0) {
      logFn("info", `Staffing: ${BULLHORN_AGENCIES[i].name} — ${r.value.length} jobs`);
      allJobs.push(...r.value);
    } else if (r.status === "rejected") {
      logFn("debug", `Staffing: ${BULLHORN_AGENCIES[i].name} — ${r.reason?.message || "failed"}`);
    }
  });

  // Run custom scrapers in parallel
  const customResults = await Promise.allSettled([
    scrapeRobertHalf(query),
    scrapeExperis(query),
    scrapeVolt(query),
    scrapeJudgeGroup(query),
    scrapeAlexanderTech(query),
  ]);
  const customNames = ["Robert Half", "Experis", "Volt", "The Judge Group", "Alexander Technology Group"];
  customResults.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.length > 0) {
      logFn("info", `Staffing: ${customNames[i]} — ${r.value.length} jobs`);
      allJobs.push(...r.value);
    } else if (r.status === "rejected") {
      logFn("debug", `Staffing: ${customNames[i]} — ${r.reason?.message || "failed"}`);
    }
  });

  logFn("info", `Staffing agencies total: ${allJobs.length} jobs across ${BULLHORN_AGENCIES.length + customNames.length} agencies`);
  return allJobs;
}

export const STAFFING_AGENCY_COUNT = BULLHORN_AGENCIES.length + 5; // +5 custom scrapers
export const STAFFING_AGENCY_NAMES = [
  ...BULLHORN_AGENCIES.map(a => a.name),
  "Robert Half", "Experis", "Volt", "The Judge Group", "Alexander Technology Group",
];
