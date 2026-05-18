// ─── Outreach Templates ───────────────────────────────────────────────────────
// Phase 4: AI-generated recruiter outreach messages.

import { aiRouter } from "../router/index.js";

/**
 * Generate a personalized LinkedIn connection message or cold email.
 * @param {object} job     — job record
 * @param {object} profile — applicant profile
 * @param {string} type    — "linkedin_connect" | "cold_email"
 * @returns {Promise<string>}
 */
export async function generateOutreach(job, profile, type = "linkedin_connect") {
  const isEmail = type === "cold_email";

  const prompt = isEmail
    ? `Write a short, personalized cold email to a recruiter at ${job.company} about the ${job.title} role.
Keep it under 150 words. Be genuine and specific. Include:
- Brief intro (1 sentence)
- Why ${job.company} specifically (1-2 sentences)
- Relevant experience match (1-2 sentences)
- Clear CTA

Applicant: ${profile.name}, ${profile.yearsExperience || 0} years experience
Skills: ${(profile.skills || []).slice(0, 6).join(", ")}
Do not use generic filler phrases. Output only the email body.`

    : `Write a short LinkedIn connection request message (max 300 characters) from a job applicant to a recruiter at ${job.company}.
Reference the ${job.title} role. Be specific and human. Do not start with "Hi" or "Hello".
Applicant skills: ${(profile.skills || []).slice(0, 4).join(", ")}`;

  return aiRouter.complete(prompt, { maxTokens: isEmail ? 300 : 80 });
}

/**
 * Generate interview preparation talking points.
 */
export async function generateInterviewPrep(job, profile) {
  const prompt = `Generate 5 concise talking points for an interview for this job.

Job: ${job.title} at ${job.company}
Description: ${(job.description || "").slice(0, 600)}
Applicant skills: ${(profile.skills || []).slice(0, 8).join(", ")}
Experience: ${profile.yearsExperience || 0} years

Format as a numbered list. Each point should be 1-2 sentences. Focus on specific, quantifiable achievements.`;

  return aiRouter.complete(prompt, { maxTokens: 500 });
}

/**
 * Analyze skill gap between job requirements and applicant profile.
 */
export async function analyzeSkillGap(job, profile) {
  const prompt = `Analyze the skill gap between this job and applicant.

Job: ${job.title}
Required skills (from description): ${(job.description || "").slice(0, 500)}
Applicant skills: ${(profile.skills || []).join(", ")}

Return a JSON object with:
{
  "matched": ["skill1", "skill2"],
  "missing": ["skill1", "skill2"],
  "score": 0-100,
  "summary": "one sentence"
}

Return only valid JSON.`;

  try {
    const raw = await aiRouter.complete(prompt, { maxTokens: 300 });
    return JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || "{}");
  } catch {
    return { matched: [], missing: [], score: 0, summary: "Analysis unavailable" };
  }
}
