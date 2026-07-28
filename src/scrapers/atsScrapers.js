/**
 * atsScrapers.js — Direct ATS API scraping (no Apify needed)
 *
 * Inspired by career-ops: hits Greenhouse, Lever, and Ashby public APIs
 * directly to get fresh job listings from target tech companies.
 * No API keys required — these are all public endpoints.
 */

import axios from "axios";

// ── Title relevance filter ────────────────────────────────────────────────────
const TARGET_TITLE_KEYWORDS = [
  "data scientist", "data science", "data engineer", "data engineering",
  "data analyst", "data analysis", "data entry",
  "machine learning", "ml engineer", "ml scientist",
  "ai engineer", "artificial intelligence", "applied ai",
  "nlp engineer", "natural language", "generative ai", "gen ai",
  "applied scientist", "research scientist",
  "analytics engineer", "business intelligence", "bi analyst",
  "deep learning", "llm", "large language model",
];

const SKIP_TITLE_KEYWORDS = [
  "aircraft", "legal", "attorney", "pharmacy", "nurse", "physician", "doctor",
  "security clearance", "mechanical engineer", "civil engineer",
  "electrical engineer", "construction", "manufacturing", "intern",
];

function isTitleRelevant(title) {
  const t = (title || "").toLowerCase();
  if (SKIP_TITLE_KEYWORDS.some((k) => t.includes(k))) return false;
  return TARGET_TITLE_KEYWORDS.some((k) => t.includes(k));
}

function normalizeLocation(loc = "") {
  const l = loc.toLowerCase();
  if (l.includes("seattle")) return "Seattle, WA";
  if (l.includes("remote")) return "Remote";
  if (l.includes("bellevue")) return "Bellevue, WA";
  if (l.includes("redmond")) return "Redmond, WA";
  if (l.includes("kirkland")) return "Kirkland, WA";
  return loc;
}

// ── Company lists by ATS provider ─────────────────────────────────────────────

// All slugs below are verified working (404s removed, moved to correct ATS provider)
export const GREENHOUSE_COMPANIES = [
  // Core AI/ML
  { slug: "anthropic",      name: "Anthropic" },
  { slug: "databricks",     name: "Databricks" },
  // Data/Cloud platforms
  { slug: "datadog",        name: "Datadog" },
  { slug: "elastic",        name: "Elastic" },
  { slug: "mongodb",        name: "MongoDB" },
  { slug: "cloudflare",     name: "Cloudflare" },
  { slug: "twilio",         name: "Twilio" },
  { slug: "okta",           name: "Okta" },
  { slug: "dropbox",        name: "Dropbox" },
  { slug: "block",          name: "Block (Square)" },
  { slug: "stripe",         name: "Stripe" },
  // Social/Consumer
  { slug: "airbnb",         name: "Airbnb" },
  { slug: "reddit",         name: "Reddit" },
  { slug: "pinterest",      name: "Pinterest" },
  { slug: "duolingo",       name: "Duolingo" },
  { slug: "twitch",         name: "Twitch" },
  // Seattle/PNW
  { slug: "smartsheet",     name: "Smartsheet" },
  { slug: "lyft",           name: "Lyft" },
  { slug: "qualtrics",      name: "Qualtrics" },
  { slug: "figma",          name: "Figma" },
  // Enterprise
  { slug: "asana",          name: "Asana" },
  { slug: "coinbase",       name: "Coinbase" },
  { slug: "instacart",      name: "Instacart" },
  { slug: "tripadvisor",    name: "TripAdvisor" },
];

export const LEVER_COMPANIES = [
  { slug: "palantir",       name: "Palantir" },
  { slug: "rover",          name: "Rover" },
  { slug: "plaid",          name: "Plaid" },
];

export const ASHBY_COMPANIES = [
  // OpenAI ecosystem
  { slug: "openai",         name: "OpenAI" },
  { slug: "perplexity",     name: "Perplexity AI" },
  { slug: "cohere",         name: "Cohere" },
  { slug: "mistral",        name: "Mistral AI" },
  // Infra/Cloud AI
  { slug: "confluent",      name: "Confluent" },
  { slug: "anyscale",       name: "Anyscale" },
  { slug: "modal",          name: "Modal" },
];

// ── Greenhouse scraper ────────────────────────────────────────────────────────
async function scrapeGreenhouseCompany(company) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${company.slug}/jobs`;
  const { data } = await axios.get(url, { timeout: 12_000 });
  const jobs = data.jobs || [];
  return jobs
    .filter((j) => isTitleRelevant(j.title))
    .map((j) => ({
      id: `gh-${j.id}`,
      title: j.title,
      company: company.name,
      location: normalizeLocation(j.location?.name || ""),
      url: j.absolute_url || `https://boards.greenhouse.io/${company.slug}/jobs/${j.id}`,
      applyUrl: j.absolute_url || "",
      easyApply: false,
      postedAt: j.updated_at || new Date().toISOString(),
      platform: "ATS Direct",
      atsProvider: "Greenhouse",
      description: (j.content || "").replace(/<[^>]+>/g, "").slice(0, 3000),
      skills: [],
      salary: "",
      workMode: (j.location?.name || "").toLowerCase().includes("remote") ? "Remote" : "",
      jobType: "",
    }));
}

// ── Lever scraper ─────────────────────────────────────────────────────────────
async function scrapeLeverCompany(company) {
  const url = `https://api.lever.co/v0/postings/${company.slug}?mode=json`;
  const { data } = await axios.get(url, { timeout: 12_000 });
  const jobs = Array.isArray(data) ? data : [];
  return jobs
    .filter((j) => isTitleRelevant(j.text))
    .map((j) => ({
      id: `lv-${j.id}`,
      title: j.text,
      company: company.name,
      location: normalizeLocation(j.categories?.location || j.workplaceType || ""),
      url: j.hostedUrl || `https://jobs.lever.co/${company.slug}/${j.id}`,
      applyUrl: j.applyUrl || j.hostedUrl || "",
      easyApply: false,
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : new Date().toISOString(),
      platform: "ATS Direct",
      atsProvider: "Lever",
      description: ((j.description || "") + " " + (j.descriptionPlain || "")).slice(0, 3000),
      skills: [],
      salary: j.salaryRange ? `${j.salaryRange.min}–${j.salaryRange.max} ${j.salaryRange.currency}` : "",
      workMode: j.workplaceType === "remote" ? "Remote" : j.workplaceType === "hybrid" ? "Hybrid" : "",
      jobType: j.categories?.commitment || "",
    }));
}

// ── Ashby scraper ─────────────────────────────────────────────────────────────
async function scrapeAshbyCompany(company) {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${company.slug}`;
  const { data } = await axios.get(url, { timeout: 12_000 });
  const jobs = data.jobPostings || [];
  return jobs
    .filter((j) => isTitleRelevant(j.title))
    .map((j) => ({
      id: `ash-${j.id}`,
      title: j.title,
      company: company.name,
      location: normalizeLocation(j.locationName || j.isRemote ? "Remote" : ""),
      url: j.jobUrl || `https://jobs.ashbyhq.com/${company.slug}/${j.id}`,
      applyUrl: j.applyUrl || j.jobUrl || "",
      easyApply: false,
      postedAt: j.publishedDate || new Date().toISOString(),
      platform: "ATS Direct",
      atsProvider: "Ashby",
      description: (j.descriptionSocial || j.description || "").replace(/<[^>]+>/g, "").slice(0, 3000),
      skills: [],
      salary: j.compensationTierSummary || "",
      workMode: j.isRemote ? "Remote" : "",
      jobType: j.employmentType || "",
    }));
}

// ── Main export: scrape all ATS companies in parallel ─────────────────────────
export async function scrapeATSDirect({ maxConcurrent = 10, logFn = () => {} } = {}) {
  const allJobs = [];
  const errors = [];

  // Helper to run in batches
  async function runBatch(items, scraper, providerName) {
    const batches = [];
    for (let i = 0; i < items.length; i += maxConcurrent) {
      batches.push(items.slice(i, i + maxConcurrent));
    }
    for (const batch of batches) {
      const results = await Promise.allSettled(batch.map((c) => scraper(c)));
      results.forEach((r, idx) => {
        if (r.status === "fulfilled") {
          allJobs.push(...r.value);
          if (r.value.length > 0) {
            logFn("info", `ATS ${providerName}: ${batch[idx].name} — ${r.value.length} relevant jobs`);
          }
        } else {
          errors.push(`${providerName}/${batch[idx].slug}: ${r.reason?.message}`);
        }
      });
    }
  }

  await runBatch(GREENHOUSE_COMPANIES, scrapeGreenhouseCompany, "Greenhouse");
  await runBatch(LEVER_COMPANIES,      scrapeLeverCompany,      "Lever");
  await runBatch(ASHBY_COMPANIES,      scrapeAshbyCompany,      "Ashby");

  if (errors.length > 0) {
    logFn("warning", `ATS: ${errors.length} companies failed`, errors.slice(0, 5).join("; "));
  }

  logFn("info", `ATS Direct: ${allJobs.length} relevant jobs found across ${GREENHOUSE_COMPANIES.length + LEVER_COMPANIES.length + ASHBY_COMPANIES.length} companies`);
  return allJobs;
}

export const ATS_COMPANY_COUNT =
  GREENHOUSE_COMPANIES.length + LEVER_COMPANIES.length + ASHBY_COMPANIES.length;
