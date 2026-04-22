/**
 * scorer.js — Job relevance scoring (0–5 scale)
 *
 * Inspired by career-ops' A–F evaluation framework.
 * Scores each job against Suma's profile (Data Scientist, 5 yrs exp, Seattle).
 * Higher score = better match = prioritize applying.
 */

// ── Suma's skill set ──────────────────────────────────────────────────────────
const SUMA_SKILLS = [
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
export function scoreJob(job) {
  const titleLower = (job.title || "").toLowerCase();
  const descLower  = (job.description || "").toLowerCase();
  const locLower   = (job.location || "").toLowerCase();
  const full       = `${titleLower} ${descLower}`;

  let score = 0;
  const breakdown = {};

  // 1. Title match (max 2 points)
  let titleScore = 0;
  for (const { keywords, score: s } of TITLE_SCORE_MAP) {
    if (keywords.some((k) => titleLower.includes(k))) {
      titleScore = s;
      break;
    }
  }
  score += titleScore;
  breakdown.title = titleScore;

  // 2. Skills match (max 2 points — 0.2 per matched skill, cap at 10 skills)
  const matchedSkills = SUMA_SKILLS.filter((skill) => full.includes(skill));
  const skillScore = Math.min(2.0, matchedSkills.length * 0.2);
  score += skillScore;
  breakdown.skills = skillScore;
  breakdown.matchedSkills = matchedSkills.slice(0, 10);

  // 3. Location bonus (max 1 point)
  let locScore = 0;
  if (locLower.includes("seattle") || locLower.includes("bellevue") ||
      locLower.includes("kirkland") || locLower.includes("redmond") ||
      locLower.includes(", wa")) {
    locScore = 1.0;
  } else if (locLower.includes("remote") || locLower.includes("anywhere") ||
             locLower.includes("united states") || locLower.includes("us only")) {
    locScore = 0.8;
  } else if (locLower.includes("washington")) {
    locScore = 0.9;
  }
  score += locScore;
  breakdown.location = locScore;

  // 4. Seniority penalties
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
  if (score >= 4.0) return "#4ade80"; // green
  if (score >= 3.0) return "#86efac"; // light green
  if (score >= 2.0) return "#fbbf24"; // amber
  if (score >= 1.0) return "#fb923c"; // orange
  return "#f87171";                   // red
}
