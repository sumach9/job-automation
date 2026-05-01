/**
 * scorer.js — Job relevance scoring (0–5 scale)
 *
 * Profile-aware: pass { skills, preferredLocations, yearsExperience, targetRoles }
 * as the second argument to score against the user's own profile instead of
 * the hardcoded defaults.
 */

// ── Fallback skill set (used when user profile has no skills configured) ──────
const DEFAULT_SKILLS = [
  "python", "sql", "r ", "scala",
  "machine learning", "deep learning", "neural network",
  "pytorch", "tensorflow", "keras", "scikit-learn", "sklearn",
  "pandas", "numpy", "scipy", "matplotlib", "seaborn",
  "spark", "pyspark", "hadoop", "kafka", "airflow",
  "aws", "azure", "gcp", "sagemaker", "databricks", "snowflake",
  "tableau", "power bi", "looker",
  "statistics", "statistical modeling", "regression", "classification",
  "nlp", "natural language", "transformer", "llm", "bert", "gpt",
  "generative ai", "langchain", "hugging face", "rag",
  "a/b testing", "experiment design",
  "data pipeline", "etl", "dbt",
  "git", "docker", "kubernetes",
];

// ── Major US tech hubs — partial location credit ──────────────────────────────
const TECH_HUB_CITIES = [
  "san francisco", "sf", "bay area", "silicon valley", "south bay",
  "new york", "nyc", "brooklyn",
  "los angeles", "la ", "santa monica",
  "boston", "cambridge",
  "austin",
  "denver", "boulder",
  "chicago",
  "atlanta",
  "miami",
  "raleigh", "research triangle",
  "portland",
  "san diego",
  "phoenix",
  "dallas", "houston",
  "pittsburgh",
];

// ── Title scoring map ─────────────────────────────────────────────────────────
const TITLE_SCORE_MAP = [
  { keywords: ["data scientist", "data science"],                              score: 2.0 },
  { keywords: ["machine learning engineer", "ml engineer", "ml scientist"],    score: 2.0 },
  { keywords: ["ai engineer", "applied ai", "ai/ml"],                          score: 2.0 },
  { keywords: ["nlp engineer", "natural language", "nlp scientist"],            score: 2.0 },
  { keywords: ["generative ai", "gen ai", "llm engineer"],                     score: 2.0 },
  { keywords: ["applied scientist", "research scientist"],                      score: 1.8 },
  { keywords: ["data engineer", "data engineering"],                            score: 1.6 },
  { keywords: ["analytics engineer"],                                           score: 1.5 },
  { keywords: ["business intelligence", "bi analyst", "bi engineer"],          score: 1.3 },
  { keywords: ["data analyst"],                                                 score: 1.2 },
  { keywords: ["data entry"],                                                   score: 0.8 },
];

// ── Scoring function ──────────────────────────────────────────────────────────
/**
 * @param {object} job  — { title, description, location, ... }
 * @param {object} [userProfile] — { skills: string[], preferredLocations: string[],
 *                                   yearsExperience: number, targetRoles: string }
 */
export function scoreJob(job, userProfile = {}) {
  const titleLower = (job.title || "").toLowerCase();
  const descLower  = (job.description || "").toLowerCase();
  const locLower   = (job.location || "").toLowerCase();
  const full       = `${titleLower} ${descLower}`;

  // Resolve which skills and locations to use
  const profileSkills = Array.isArray(userProfile.skills) && userProfile.skills.length > 0
    ? userProfile.skills.map(s => s.toLowerCase().trim())
    : DEFAULT_SKILLS;

  const prefLocs = Array.isArray(userProfile.preferredLocations)
    ? userProfile.preferredLocations.map(l => l.toLowerCase().trim()).filter(Boolean)
    : ["seattle", "washington", "remote"];

  const yearsExp = parseInt(userProfile.yearsExperience, 10) || 0;

  let score = 0;
  const breakdown = {};

  // ── 1. Title match (max 2 points) ─────────────────────────────────────────
  // Also check user's targetRoles string for custom keywords
  const targetRoleKeywords = (userProfile.targetRoles || "")
    .toLowerCase()
    .split(/[,\n]+/)
    .map(s => s.trim())
    .filter(Boolean);

  let titleScore = 0;
  // Check standard map first
  for (const { keywords, score: s } of TITLE_SCORE_MAP) {
    if (keywords.some((k) => titleLower.includes(k))) {
      titleScore = s;
      break;
    }
  }
  // If user has custom target roles and they match, boost to at least 1.5
  if (targetRoleKeywords.length > 0 && targetRoleKeywords.some(k => titleLower.includes(k))) {
    titleScore = Math.max(titleScore, 1.5);
  }
  score += titleScore;
  breakdown.title = titleScore;

  // ── 2. Skills match (max 2 points — proportional to profile skill count) ──
  const matchedSkills = profileSkills.filter(skill => full.includes(skill));
  // Scale: need ≥40% of your skills mentioned to get full 2 pts
  const threshold = Math.max(5, Math.ceil(profileSkills.length * 0.4));
  const skillScore = Math.min(2.0, (matchedSkills.length / threshold) * 2.0);
  const skillScoreRounded = Math.round(skillScore * 10) / 10;
  score += skillScoreRounded;
  breakdown.skills = skillScoreRounded;
  breakdown.matchedSkills = matchedSkills.slice(0, 12);

  // ── 3. Location (max 1 point) ─────────────────────────────────────────────
  let locScore = 0;
  const isRemote = locLower.includes("remote") || locLower.includes("anywhere") ||
                   locLower.includes("united states") || locLower.includes("us only") ||
                   locLower.includes("work from home") || descLower.includes("fully remote");

  // 1.0 — user's preferred location
  if (prefLocs.some(pl => locLower.includes(pl))) {
    locScore = 1.0;
  // 0.9 — remote (universally accessible)
  } else if (isRemote) {
    locScore = 0.9;
  // 0.6 — any major US tech hub (worth applying even if not preferred)
  } else if (TECH_HUB_CITIES.some(city => locLower.includes(city))) {
    locScore = 0.6;
  // 0.3 — any US location
  } else if (locLower.includes("united states") || locLower.includes(", us") ||
             /\b[a-z]{2}\b/.test(locLower)) {
    locScore = 0.3;
  }
  score += locScore;
  breakdown.location = locScore;

  // ── 4. Experience alignment bonus (max 0.3) ───────────────────────────────
  // Reward jobs that ask for experience close to what the user has
  let expBonus = 0;
  if (yearsExp > 0) {
    const expMatch = descLower.match(/(\d+)\s*\+?\s*years?\s+of\s+experience/);
    const expMin   = expMatch ? parseInt(expMatch[1], 10) : null;
    if (expMin !== null) {
      const diff = yearsExp - expMin;
      if (diff >= 0 && diff <= 3) expBonus = 0.3;       // within 3 yrs above req
      else if (diff > 3 && diff <= 6) expBonus = 0.1;   // over-qualified but ok
      else if (diff < 0 && diff >= -1) expBonus = 0.1;  // slightly under (stretch)
    }
  }
  score += expBonus;
  breakdown.experienceBonus = expBonus;

  // ── 5. Seniority penalties ────────────────────────────────────────────────
  const seniorKeywords = ["director", "vp ", "vice president", "head of", "principal data",
                          "distinguished", "c-level", "chief", "staff data"];
  const entryKeywords  = ["intern", "internship", "entry level", "entry-level", "junior",
                          "0-1 year", "0-2 year", "fresh graduate", "new grad"];

  let seniorityPenalty = 0;
  if (seniorKeywords.some((k) => titleLower.includes(k))) seniorityPenalty = -0.5;
  if (entryKeywords.some((k)  => titleLower.includes(k) || descLower.includes(k))) seniorityPenalty = -0.5;
  score += seniorityPenalty;
  breakdown.seniorityPenalty = seniorityPenalty;

  // Clamp to 0–5
  const finalScore = Math.max(0, Math.min(5, Math.round(score * 10) / 10));
  return { score: finalScore, breakdown };
}

// ── Score label helpers ───────────────────────────────────────────────────────
export function scoreLabel(score) {
  if (score >= 4.5) return "Excellent";
  if (score >= 3.5) return "Great";
  if (score >= 2.5) return "Good";
  if (score >= 1.5) return "Fair";
  return "Low";
}

export function scoreColor(score) {
  if (score >= 3.5) return "#4ade80"; // green  (was 4.0)
  if (score >= 2.5) return "#86efac"; // light green
  if (score >= 1.5) return "#fbbf24"; // amber
  if (score >= 1.0) return "#fb923c"; // orange
  return "#f87171";                   // red
}
