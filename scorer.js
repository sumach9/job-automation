/**
 * scorer.js — NLP-powered job relevance scoring (0–5 scale)
 *
 * Techniques used:
 *  1. TF-cosine similarity  — profile text vs job description vector similarity
 *  2. Jaccard coefficient   — |profile_skills ∩ job_skills| / |profile_skills ∪ job_skills|
 *  3. Skill synonym mapping — "ML" ≡ "machine learning", "k8s" ≡ "kubernetes", etc.
 *  4. Title BM25-style      — weighted title term hits
 *  5. Experience alignment  — years delta penalty/bonus
 *  6. Seniority guard       — penalise director/intern mismatches
 *
 * Score breakdown (max ~5.3 → clamped to 5):
 *   title         0 – 2.0
 *   nlpSkills     0 – 2.0  (jaccard 0-1.2 + cosine 0-0.8)
 *   location      0 – 1.0
 *   experience    0 – 0.3
 *   seniority    -0.5 – 0
 */

// ── Stopwords ─────────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "is","are","was","were","be","been","being","have","has","had","do","does",
  "did","will","would","could","should","may","might","shall","can","need",
  "this","that","these","those","it","its","we","our","you","your","they",
  "their","us","as","by","from","into","through","during","before","after",
  "above","below","up","down","out","off","over","under","again","then",
  "once","here","there","when","where","why","how","all","both","each",
  "few","more","most","other","some","such","no","not","only","same","so",
  "than","too","very","just","also","any","about","around","across","per",
  "work","job","position","role","experience","required","preferred",
  "including","responsibilities","qualifications","candidate","team",
  "strong","excellent","ability","skills","knowledge","understanding",
  "using","use","help","support","ensure","provide","develop","design",
  "build","create","manage","lead","drive","implement","deliver","within",
  "across","multiple","various","well","high","new","key","including",
  "related","relevant","equivalent","demonstrated","proven","hands",
]);

// ── Skill synonym normalization ───────────────────────────────────────────────
const SKILL_SYNONYMS = {
  "ml":                       "machine learning",
  "nlp":                      "natural language processing",
  "natural language":         "natural language processing",
  "cv":                       "computer vision",
  "dl":                       "deep learning",
  "ai":                       "artificial intelligence",
  "bi":                       "business intelligence",
  "etl":                      "data pipeline",
  "sklearn":                  "scikit-learn",
  "scikit learn":             "scikit-learn",
  "hf":                       "hugging face",
  "huggingface":              "hugging face",
  "tf":                       "tensorflow",
  "k8s":                      "kubernetes",
  "aws sagemaker":            "sagemaker",
  "amazon sagemaker":         "sagemaker",
  "power bi":                 "powerbi",
  "tableau desktop":          "tableau",
  "google cloud":             "gcp",
  "google cloud platform":    "gcp",
  "amazon web services":      "aws",
  "microsoft azure":          "azure",
  "azure ml":                 "azure machine learning",
  "a/b test":                 "a/b testing",
  "ab testing":               "a/b testing",
  "llm":                      "large language model",
  "large language models":    "large language model",
  "rag":                      "retrieval augmented generation",
  "gen ai":                   "generative ai",
  "genai":                    "generative ai",
  "r programming":            "r language",
  "node js":                  "nodejs",
  "node.js":                  "nodejs",
  "vue js":                   "vuejs",
  "react js":                 "react",
  "pyspark":                  "spark",
  "apache spark":             "spark",
  "apache kafka":             "kafka",
  "apache airflow":           "airflow",
  "statistical analysis":     "statistics",
  "statistical modeling":     "statistics",
  "statistical modelling":    "statistics",
  "experiment design":        "a/b testing",
  "experimentation":          "a/b testing",
  "xgboost":                  "gradient boosting",
  "lightgbm":                 "gradient boosting",
  "catboost":                 "gradient boosting",
  "random forest":            "ensemble methods",
  "neural network":           "deep learning",
  "neural networks":          "deep learning",
  "bert":                     "transformer",
  "gpt":                      "large language model",
  "attention mechanism":      "transformer",
};

function normalizeSkill(s) {
  const lower = (s || "").toLowerCase().trim();
  return SKILL_SYNONYMS[lower] || lower;
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────
function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/c\+\+/g, "cplusplus")
    .replace(/\.net/g, "dotnet")
    .replace(/[^a-z0-9\s#]/g, " ")
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

// ── TF vector (relative frequency) ───────────────────────────────────────────
function termFrequency(tokens) {
  const tf = {};
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  const total = tokens.length || 1;
  for (const t in tf) tf[t] /= total;
  return tf;
}

// ── Cosine similarity between two TF maps ─────────────────────────────────────
function cosineSimilarity(tfA, tfB) {
  let dot = 0, magA = 0, magB = 0;
  // Only iterate keys of A (profile) — we want coverage of profile in job
  for (const k in tfA) {
    const a = tfA[k];
    const b = tfB[k] || 0;
    dot  += a * b;
    magA += a * a;
  }
  for (const k in tfB) magB += tfB[k] * tfB[k];
  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ── Jaccard similarity between two Sets ──────────────────────────────────────
function jaccardSimilarity(setA, setB) {
  if (!setA.size && !setB.size) return 0;
  let intersect = 0;
  for (const item of setA) if (setB.has(item)) intersect++;
  const unionSize = new Set([...setA, ...setB]).size;
  return intersect / (unionSize || 1);
}

// ── Extract which skills from the profile appear in a job text ────────────────
function extractJobSkillSet(text, profileSkills) {
  const lower = (text || "").toLowerCase();
  const found = new Set();
  for (const skill of profileSkills) {
    const norm = normalizeSkill(skill);
    if (lower.includes(skill) || (norm !== skill && lower.includes(norm))) {
      found.add(norm);
    }
  }
  return found;
}

// ── Default skill set (used when profile has no skills) ──────────────────────
const DEFAULT_SKILLS = [
  "python", "sql", "r language", "scala",
  "machine learning", "deep learning", "neural network",
  "pytorch", "tensorflow", "keras", "scikit-learn",
  "pandas", "numpy", "scipy", "matplotlib", "seaborn",
  "spark", "kafka", "airflow",
  "aws", "azure", "gcp", "sagemaker", "databricks", "snowflake",
  "tableau", "powerbi", "looker",
  "statistics", "regression", "classification",
  "natural language processing", "transformer", "large language model",
  "bert", "generative ai", "langchain", "hugging face",
  "retrieval augmented generation", "a/b testing",
  "data pipeline", "dbt",
  "git", "docker", "kubernetes",
];

// ── Major US tech hubs ────────────────────────────────────────────────────────
const TECH_HUB_CITIES = [
  "san francisco", "bay area", "silicon valley", "new york", "nyc",
  "los angeles", "boston", "cambridge", "austin", "denver", "chicago",
  "atlanta", "miami", "raleigh", "portland", "san diego", "dallas",
];

// ── Title scoring map ─────────────────────────────────────────────────────────
const TITLE_SCORE_MAP = [
  { keywords: ["data scientist", "data science"],                           score: 2.0 },
  { keywords: ["machine learning engineer", "ml engineer", "ml scientist"], score: 2.0 },
  { keywords: ["ai engineer", "applied ai", "ai/ml"],                       score: 2.0 },
  { keywords: ["nlp engineer", "nlp scientist"],                            score: 2.0 },
  { keywords: ["generative ai", "gen ai", "llm engineer"],                  score: 2.0 },
  { keywords: ["applied scientist", "research scientist"],                   score: 1.8 },
  { keywords: ["data engineer", "data engineering"],                         score: 1.6 },
  { keywords: ["analytics engineer"],                                        score: 1.5 },
  { keywords: ["business intelligence", "bi analyst", "bi engineer"],       score: 1.3 },
  { keywords: ["data analyst"],                                              score: 1.2 },
  { keywords: ["data entry"],                                                score: 0.8 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main scoring function
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {object} job         — { title, description, location, ... }
 * @param {object} userProfile — { skills, summary, targetRoles, preferredLocations,
 *                                  yearsExperience }
 * @returns {{ score: number, breakdown: object }}
 */
export function scoreJob(job, userProfile = {}) {
  const titleLower = (job.title       || "").toLowerCase();
  const descLower  = (job.description || "").toLowerCase();
  const locLower   = (job.location    || "").toLowerCase();

  // ── Resolve profile data ──────────────────────────────────────────────────
  const profileSkills = (Array.isArray(userProfile.skills) && userProfile.skills.length > 0
    ? userProfile.skills.map(s => s.toLowerCase().trim())
    : DEFAULT_SKILLS
  ).map(normalizeSkill);

  const prefLocs = Array.isArray(userProfile.preferredLocations)
    ? userProfile.preferredLocations.map(l => l.toLowerCase().trim()).filter(Boolean)
    : ["seattle", "washington", "remote"];

  const yearsExp = parseInt(userProfile.yearsExperience, 10) || 0;

  // Profile text = summary + target roles + skills joined
  const profileText = [
    userProfile.summary    || "",
    userProfile.targetRoles|| "",
    profileSkills.join(" "),
  ].join(" ");

  let score = 0;
  const breakdown = {};

  // ── 1. Title match (0 – 2.0) ─────────────────────────────────────────────
  const targetRoleKws = (userProfile.targetRoles || "")
    .toLowerCase().split(/[,\n]+/).map(s => s.trim()).filter(Boolean);

  let titleScore = 0;
  for (const { keywords, score: s } of TITLE_SCORE_MAP) {
    if (keywords.some(k => titleLower.includes(k))) { titleScore = s; break; }
  }
  if (targetRoleKws.length > 0 && targetRoleKws.some(k => titleLower.includes(k))) {
    titleScore = Math.max(titleScore, 1.5);
  }
  score += titleScore;
  breakdown.title = titleScore;

  // ── 2. NLP Skills Score (0 – 2.0) ────────────────────────────────────────
  //
  //  2a. Jaccard similarity (max 1.2 pts)
  //      Measures what fraction of profile skills appear in the job text,
  //      penalised by skills in the job that aren't in your profile.
  //
  //  2b. TF-cosine similarity (max 0.8 pts)
  //      Compares the full profile text vector against the job description
  //      vector — captures term co-occurrence beyond exact skill strings.

  const jobText = `${titleLower} ${descLower}`;

  // 2a — Jaccard
  const profileSkillSet = new Set(profileSkills);
  const jobSkillSet     = extractJobSkillSet(jobText, profileSkills);
  const jaccard         = jaccardSimilarity(profileSkillSet, jobSkillSet);
  // Scale: jaccard of 0.4 → full 1.2 pts (generous, profile rarely hits 40% of job JD)
  const jaccardPts = Math.min(1.2, jaccard * 3.0);

  // 2b — TF cosine
  const profileTF = termFrequency(tokenize(profileText));
  const jobTF     = termFrequency(tokenize(jobText));
  const cosine    = cosineSimilarity(profileTF, jobTF);
  // Scale: cosine of 0.2 → full 0.8 pts
  const cosinePts = Math.min(0.8, cosine * 4.0);

  const nlpScore = Math.round((jaccardPts + cosinePts) * 10) / 10;
  score += nlpScore;
  breakdown.nlpSkills    = nlpScore;
  breakdown.jaccardPct   = Math.round(jaccard * 100) + "%";
  breakdown.cosinePct    = Math.round(cosine  * 100) + "%";
  breakdown.matchedSkills = [...jobSkillSet].slice(0, 15);
  breakdown.missingSkills = profileSkills
    .filter(s => !jobSkillSet.has(s))
    .slice(0, 8);

  // ── 3. Location (0 – 1.0) ────────────────────────────────────────────────
  const isRemote = /remote|anywhere|united states|us only|work from home|fully remote/i
    .test(locLower + " " + descLower);

  let locScore = 0;
  if (prefLocs.some(pl => locLower.includes(pl)))                      locScore = 1.0;
  else if (isRemote)                                                    locScore = 0.9;
  else if (TECH_HUB_CITIES.some(c => locLower.includes(c)))            locScore = 0.6;
  else if (/united states|, us\b|[a-z]{2},/.test(locLower))            locScore = 0.3;
  score += locScore;
  breakdown.location = locScore;

  // ── 4. Experience alignment bonus (0 – 0.3) ──────────────────────────────
  let expBonus = 0;
  if (yearsExp > 0) {
    const m = descLower.match(/(\d+)\s*\+?\s*years?\s+(?:of\s+)?experience/);
    if (m) {
      const diff = yearsExp - parseInt(m[1], 10);
      if (diff >= 0 && diff <= 3)       expBonus = 0.3;
      else if (diff > 3 && diff <= 6)   expBonus = 0.1;
      else if (diff < 0 && diff >= -1)  expBonus = 0.1;
    }
  }
  score += expBonus;
  breakdown.experienceBonus = expBonus;

  // ── 5. Seniority penalties ────────────────────────────────────────────────
  const seniorKws = ["director", "vp ", "vice president", "head of", "principal data",
                     "distinguished", "c-level", "chief", "staff data"];
  const entryKws  = ["intern", "internship", "entry level", "entry-level",
                     "0-1 year", "0-2 year", "fresh graduate", "new grad"];

  let seniorityPenalty = 0;
  if (seniorKws.some(k => titleLower.includes(k))) seniorityPenalty = -0.5;
  if (entryKws.some(k  => titleLower.includes(k) || descLower.includes(k))) seniorityPenalty = -0.5;
  score += seniorityPenalty;
  breakdown.seniorityPenalty = seniorityPenalty;

  // ── Final score (clamped 0–5) ─────────────────────────────────────────────
  const finalScore = Math.max(0, Math.min(5, Math.round(score * 10) / 10));
  return { score: finalScore, breakdown };
}

// ── Label / colour helpers ────────────────────────────────────────────────────
export function scoreLabel(score) {
  if (score >= 4.5) return "Excellent";
  if (score >= 3.5) return "Great";
  if (score >= 2.5) return "Good";
  if (score >= 1.5) return "Fair";
  return "Low";
}

export function scoreColor(score) {
  if (score >= 3.5) return "#4ade80";
  if (score >= 2.5) return "#86efac";
  if (score >= 1.5) return "#fbbf24";
  if (score >= 1.0) return "#fb923c";
  return "#f87171";
}
