// ─── Resume Parser ────────────────────────────────────────────────────────────
// Extracts structured profile data from PDF or DOCX resume files.
// No AI API needed — uses regex + section heuristics.

import fs from "fs";
import path from "path";

// ─── Text extraction ──────────────────────────────────────────────────────────
export async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") {
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const buf = fs.readFileSync(filePath);
    const data = await pdfParse(buf);
    return data.text || "";
  }
  if (ext === ".docx" || ext === ".doc") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || "";
  }
  throw new Error(`Unsupported file type: ${ext}`);
}

// ─── Main parser ─────────────────────────────────────────────────────────────
export async function parseResume(filePath) {
  const raw = await extractText(filePath);
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const text  = lines.join("\n");

  const profile = {
    name:            extractName(lines),
    email:           extractEmail(text),
    phone:           extractPhone(text),
    location:        extractLocation(text, lines),
    summary:         extractSection(text, ["summary", "objective", "profile", "about"]),
    skills:          extractSkills(text),
    yearsExperience: extractYearsExperience(text),
    targetRoles:     "",
    linkedinUrl:     extractLinkedIn(text),
    website:         extractWebsite(text),
    education:       extractEducation(text),
    experiences:     extractExperiences(text),
    school:          "",
    degree:          "",
  };

  // Derive top-level school/degree from first education entry
  if (profile.education.length > 0) {
    profile.school = profile.education[0].school || "";
    profile.degree = profile.education[0].degree || "";
  }

  // Derive targetRoles from most recent job title
  if (profile.experiences.length > 0) {
    profile.targetRoles = profile.experiences[0].title || "";
  }

  return profile;
}

// ─── Extractors ───────────────────────────────────────────────────────────────

function extractEmail(text) {
  const m = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : "";
}

function extractPhone(text) {
  const m = text.match(/(\+?1[\s.\-]?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/);
  return m ? m[0].replace(/\s+/g, " ").trim() : "";
}

function extractLinkedIn(text) {
  const m = text.match(/linkedin\.com\/in\/[\w\-]+/i);
  return m ? "https://" + m[0] : "";
}

function extractWebsite(text) {
  const m = text.match(/https?:\/\/(?!linkedin)[^\s,|]+/i);
  return m ? m[0] : "";
}

function extractName(lines) {
  // Name is almost always in the first 1–3 non-empty lines and has no digits
  for (const line of lines.slice(0, 5)) {
    if (line.length < 3 || line.length > 60) continue;
    if (/\d/.test(line)) continue;                        // skip lines with numbers
    if (/@|http|linkedin|resume|cv\b/i.test(line)) continue; // skip contact/header lines
    if (/^(summary|objective|profile|skills|experience|education)/i.test(line)) continue;
    // Must look like a name — 2-4 words, each capitalised
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 5 && words.every(w => /^[A-Z]/.test(w))) {
      return line;
    }
  }
  return "";
}

function extractLocation(text, lines) {
  // Common patterns: "Seattle, WA" / "New York, NY 10001" / "Remote"
  const m = text.match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?,\s*[A-Z]{2}(?:\s+\d{5})?)\b/);
  if (m) return m[1];
  if (/\bremote\b/i.test(text)) return "Remote";
  return "";
}

function extractYearsExperience(text) {
  // "8 years of experience", "10+ years", etc.
  const m = text.match(/(\d{1,2})\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:professional\s+)?experience/i);
  if (m) return m[1];
  // Infer from earliest job year vs current year
  const years = [...text.matchAll(/\b(20\d{2}|19\d{2})\b/g)].map(m => parseInt(m[1]));
  if (years.length > 0) {
    const earliest = Math.min(...years);
    const diff = new Date().getFullYear() - earliest;
    if (diff > 0 && diff < 50) return String(diff);
  }
  return "";
}

function extractSection(text, headers) {
  const pattern = new RegExp(
    `(?:^|\\n)(?:${headers.join("|")})\\s*:?\\s*\\n([\\s\\S]{20,800}?)(?=\\n(?:[A-Z][A-Z ]{2,}|\\n\\n)|$)`,
    "i"
  );
  const m = text.match(pattern);
  return m ? m[1].replace(/\n{2,}/g, "\n").trim() : "";
}

function extractSkills(text) {
  // Find the skills section
  const sectionMatch = text.match(
    /(?:skills?|technical skills?|core competenc(?:y|ies)|technologies|tech stack)[:\s]*\n([\s\S]{10,600}?)(?=\n(?:[A-Z][A-Z ]{2,})|\n\n\n|$)/i
  );
  const skillText = sectionMatch ? sectionMatch[1] : text;

  // Common tech/skill keywords to look for anywhere in the doc
  const techKeywords = [
    "Python","SQL","R","Java","Scala","Go","Rust","C\\+\\+","C#","JavaScript","TypeScript",
    "AWS","GCP","Azure","Docker","Kubernetes","Terraform","Git","Linux",
    "TensorFlow","PyTorch","Keras","scikit-learn","XGBoost","LightGBM",
    "Pandas","NumPy","Spark","Hadoop","Kafka","Airflow","dbt","Databricks",
    "Snowflake","Redshift","BigQuery","PostgreSQL","MySQL","MongoDB","Redis",
    "Tableau","Power BI","Looker","Excel","Jupyter","MLflow","Hugging Face",
    "OpenAI","LangChain","FastAPI","Flask","Django","React","Node.js","REST","GraphQL",
    "Machine Learning","Deep Learning","NLP","Computer Vision","LLM","RAG",
    "Data Engineering","Data Analysis","Statistical Analysis","A/B Testing",
    "ETL","Data Pipeline","Feature Engineering","Model Deployment","MLOps",
  ];

  const found = new Set();
  for (const kw of techKeywords) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(skillText)) {
      found.add(kw.replace(/\\\+/g, "+"));
    }
  }

  // Also parse comma/bullet-separated items from skill section
  if (sectionMatch) {
    const items = sectionMatch[1]
      .split(/[,|•·\n]+/)
      .map(s => s.replace(/[^\w\s.#+]/g, "").trim())
      .filter(s => s.length > 1 && s.length < 40 && !/^\d+$/.test(s));
    for (const item of items) found.add(item);
  }

  return [...found].filter(Boolean).slice(0, 40);
}

function extractEducation(text) {
  const edu = [];
  // Find education section
  const sectionMatch = text.match(
    /(?:education|academic background|academics)[:\s]*\n([\s\S]{10,1000}?)(?=\n(?:experience|work|employment|skills?|projects?|certif|publications?|[A-Z]{3,})|$)/i
  );
  if (!sectionMatch) return edu;

  const section = sectionMatch[1];
  const blocks = section.split(/\n{2,}|\n(?=[A-Z])/);

  for (const block of blocks) {
    if (block.trim().length < 10) continue;
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    const entry = { school: "", degree: "", major: "", startYear: "", endYear: "", gpa: "" };

    // School — first long line or line with University/College/Institute
    const schoolLine = lines.find(l =>
      /university|college|institute|school|polytechnic/i.test(l) || (l.length > 10 && !/bachelor|master|ph\.?d|b\.s\.|m\.s\.|gpa/i.test(l))
    );
    if (schoolLine) entry.school = schoolLine.replace(/,.*$/, "").trim();

    // Degree
    const degreeLine = lines.find(l => /bachelor|master|ph\.?d|b\.s\.|m\.s\.|b\.a\.|m\.a\.|associate|mba/i.test(l));
    if (degreeLine) {
      const dm = degreeLine.match(/(bachelor[s']?(?:\s+of\s+\w+)?|master[s']?(?:\s+of\s+\w+)?|ph\.?d\.?|b\.s\.|m\.s\.|b\.a\.|m\.a\.|associate[s']?|mba)/i);
      if (dm) entry.degree = dm[1];
      // Major
      const majM = degreeLine.match(/(?:in|of)\s+([A-Z][a-zA-Z\s&,]+?)(?:\s*[-,|]|$)/);
      if (majM) entry.major = majM[1].trim();
    }

    // Years
    const yearM = block.match(/\b((?:19|20)\d{2})\b.*?(?:–|-|to)\s*(?:((?:19|20)\d{2})|present|current)/i);
    if (yearM) { entry.startYear = yearM[1]; entry.endYear = yearM[2] || "Present"; }
    else {
      const singleYear = block.match(/\b(20\d{2}|19\d{2})\b/);
      if (singleYear) entry.endYear = singleYear[1];
    }

    // GPA
    const gpaM = block.match(/gpa[:\s]+([0-9.]+(?:\s*\/\s*[0-9.]+)?)/i);
    if (gpaM) entry.gpa = gpaM[1];

    if (entry.school || entry.degree) edu.push(entry);
  }

  return edu.slice(0, 4);
}

function extractExperiences(text) {
  const exps = [];
  const sectionMatch = text.match(
    /(?:(?:work\s+)?experience|employment(?:\s+history)?|professional\s+(?:experience|background))[:\s]*\n([\s\S]{20,3000}?)(?=\n(?:education|skills?|projects?|certif|awards?|publications?|[A-Z]{3,}\s*\n)|$)/i
  );
  if (!sectionMatch) return exps;

  const section = sectionMatch[1];
  // Split on date patterns that signal a new job entry
  const blocks = section.split(/(?=\n.{3,60}\n.*(?:(?:19|20)\d{2})|(?:19|20)\d{2}\s*[-–]\s*(?:(?:19|20)\d{2}|present))/i)
    .filter(b => b.trim().length > 20);

  for (const block of blocks.slice(0, 8)) {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    const entry = { company: "", title: "", startDate: "", endDate: "", description: "" };

    // Date range
    const dateM = block.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(?:19|20)\d{2}|(?:19|20)\d{2})\s*[-–to]+\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(?:19|20)\d{2}|(?:19|20)\d{2}|present|current|now)/i);
    if (dateM) { entry.startDate = dateM[1]; entry.endDate = dateM[2]; }

    // Title — line with common job title words or all-caps abbreviation
    const titleLine = lines.find(l =>
      /engineer|scientist|analyst|manager|developer|lead|director|architect|specialist|consultant|intern|associate|coordinator|designer|researcher/i.test(l) && l.length < 80
    );
    if (titleLine) entry.title = titleLine.replace(/\s*[|,·]\s*.*/,"").trim();

    // Company — line that's not the title, not bullets, not a date
    const companyLine = lines.find(l =>
      l !== titleLine &&
      l.length > 2 && l.length < 80 &&
      !/^\d|^[-•·]|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(l) &&
      !/^(present|current|remote)/i.test(l)
    );
    if (companyLine) entry.company = companyLine.replace(/\s*[|,·]\s*.*/,"").trim();

    // Description — bullet points
    const bullets = lines.filter(l => /^[-•·▪]/.test(l) || (l.startsWith("◦")) ).slice(0, 5);
    entry.description = bullets.map(b => b.replace(/^[-•·▪◦]\s*/,"")).join("\n");
    if (!entry.description) {
      // grab last lines as description
      entry.description = lines.slice(-3).join("\n");
    }

    if (entry.company || entry.title) exps.push(entry);
  }

  return exps.slice(0, 6);
}
