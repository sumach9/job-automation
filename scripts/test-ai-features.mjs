import dotenv from "dotenv";
dotenv.config();
import { aiRouter } from "../src/ai/router/index.js";

const job = {
  title: "Senior Data Scientist",
  company: "Stripe",
  description: "We need Python, ML, SQL, A/B testing, experimentation platform, causal inference.",
  skills: ["Python", "SQL", "ML", "A/B Testing", "Causal Inference", "Spark"],
};
const profile = {
  name:            process.env.APPLICANT_NAME            || "Jane Doe",
  skills:          (process.env.APPLICANT_SKILLS || "Python,SQL,Machine Learning").split(",").map(s => s.trim()),
  yearsExperience: parseInt(process.env.APPLICANT_YEARS_EXPERIENCE || "5", 10),
  summary:         process.env.APPLICANT_SUMMARY         || "Experienced professional seeking new opportunities.",
};

console.log("=".repeat(55));
console.log("  GROQ AI FEATURES TEST");
console.log("=".repeat(55));

// 1. Skill Gap
console.log("\n[1] Skill Gap Analysis…");
const gap = await aiRouter.analyzeSkillGap(job, profile);
console.log("  Matched:", gap.matched?.join(", ") || "(none)");
console.log("  Missing:", gap.missing?.join(", ") || "(none)");
console.log("  Score:  ", gap.score);
console.log("  Summary:", gap.summary);

// 2. LinkedIn Outreach
console.log("\n[2] LinkedIn Connect Note…");
const linkedin = await aiRouter.generateOutreach(job, profile, "linkedin");
console.log(" ", linkedin.slice(0, 280));

// 3. Cold Email
console.log("\n[3] Cold Email…");
const email = await aiRouter.generateOutreach(job, profile, "email");
console.log(" ", email.slice(0, 300));

// 4. Interview Prep
console.log("\n[4] Interview Prep…");
const prep = await aiRouter.generateInterviewPrep(job, profile);
console.log(prep.slice(0, 400));

// 5. Cover Letter
console.log("\n[5] Cover Letter…");
const letter = await aiRouter.generateCoverLetter(job, profile);
console.log(letter.slice(0, 350));

console.log("\n" + "=".repeat(55));
console.log("  All Groq AI features working ✓");
console.log("=".repeat(55));
