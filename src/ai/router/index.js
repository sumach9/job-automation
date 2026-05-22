// ─── AI Router ────────────────────────────────────────────────────────────────
// Unified interface to multiple AI providers with automatic fallback.
// Strategy: Anthropic → OpenAI → Gemini → queue manual review.

import { log } from "../../logging/logger.js";

// Lazy-load providers so missing API keys don't crash the app
// Priority: Groq (fastest) → Anthropic → OpenAI
async function getProviders() {
  const providers = [];

  if (process.env.GROQ_API_KEY) {
    const { GroqProvider } = await import("../providers/groq.js");
    providers.push(new GroqProvider());
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const { AnthropicProvider } = await import("../providers/anthropic.js");
    providers.push(new AnthropicProvider());
  }

  if (process.env.OPENAI_API_KEY) {
    const { OpenAIProvider } = await import("../providers/openai.js");
    providers.push(new OpenAIProvider());
  }

  return providers;
}

export class AIRouter {
  constructor() {
    this._providers = null;
  }

  async _init() {
    if (!this._providers) {
      this._providers = await getProviders();
    }
    return this._providers;
  }

  /**
   * Send a prompt to the first available provider.
   * Falls back to the next provider if one fails.
   *
   * @param {string} prompt
   * @param {object} opts
   * @param {string} [opts.system]      — system prompt
   * @param {number} [opts.maxTokens]   — default 1024
   * @param {string} [opts.model]       — provider-specific override
   * @returns {Promise<string>} the text response
   */
  async complete(prompt, opts = {}) {
    const providers = await this._init();

    if (providers.length === 0) {
      log.warn("AI Router: no providers configured — returning empty response");
      return "";
    }

    let lastErr;
    for (const provider of providers) {
      try {
        const result = await provider.complete(prompt, opts);
        log.debug(`AI response via ${provider.name}`, { step: "ai_complete" });
        return result;
      } catch (err) {
        lastErr = err;
        log.warn(`AI provider ${provider.name} failed: ${err.message}, trying next...`);
      }
    }

    throw lastErr || new Error("All AI providers failed");
  }

  /**
   * Convenience: classify a job-application form field.
   * Returns the semantic field type (e.g. "email", "phone", "cover_letter").
   */
  async classifyField(fieldContext) {
    const prompt = `You are an expert at reading job application forms.
Given the following form field context, classify what type of applicant data it's asking for.
Return ONLY one of these types: first_name, last_name, full_name, email, phone, location, linkedin_url, website, years_experience, current_company, expected_salary, cover_letter, resume_upload, unknown

Field context: ${fieldContext}

Return only the type, nothing else.`;

    try {
      const result = await this.complete(prompt, { maxTokens: 20 });
      return result.trim().toLowerCase();
    } catch {
      return "unknown";
    }
  }

  /**
   * Analyse the skill gap between a job and the applicant profile.
   * Returns structured JSON: { matched, missing, score, summary }
   */
  async analyzeSkillGap(job, profile) {
    const prompt = `Analyse the skill gap between this job and the applicant.

Job Title: ${job.title}
Job Description: ${(job.description || "").slice(0, 1000)}
Required Skills: ${(job.skills || []).join(", ")}

Applicant Skills: ${(profile.skills || []).join(", ")}
Applicant Experience: ${profile.yearsExperience || 0} years
Applicant Summary: ${(profile.summary || "").slice(0, 300)}

Return a JSON object with this exact shape:
{
  "matched": ["skill1", "skill2"],
  "missing": ["skill3", "skill4"],
  "score": 0.0,
  "summary": "one sentence evaluation"
}

score is 0.0–1.0 representing match quality. Return only the raw JSON.`;

    try {
      const raw = await this.complete(prompt, { maxTokens: 400 });
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return { matched: [], missing: [], score: 0, summary: "Analysis unavailable" };
    }
  }

  /**
   * Generate personalised outreach message (LinkedIn invite or cold email).
   */
  async generateOutreach(job, profile, type = "linkedin") {
    const isEmail = type === "email";
    const prompt = isEmail
      ? `Write a brief cold outreach email (subject + 3-sentence body) from ${profile.name || "the applicant"} to a recruiter at ${job.company || "the company"} about the ${job.title || "open role"}. Skills: ${(profile.skills || []).slice(0, 5).join(", ")}. Under 80 words total.`
      : `Write a LinkedIn connection request note (max 280 chars) from ${profile.name?.split(" ")[0] || "me"} to a recruiter at ${job.company || "the company"} re: ${job.title || "open role"}. Mention: ${(profile.skills || []).slice(0, 3).join(", ")}. Be brief and human.`;

    return this.complete(prompt, { maxTokens: 200 });
  }

  /**
   * Generate interview prep talking points for a job.
   */
  async generateInterviewPrep(job, profile) {
    const prompt = `Create 5 concise interview talking points for:
Job: ${job.title} at ${job.company}
Candidate skills: ${(profile.skills || []).slice(0, 10).join(", ")}
Candidate experience: ${profile.yearsExperience || 0} years

Format: numbered list, one line each. Focus on STAR-method highlights.`;
    return this.complete(prompt, { maxTokens: 400, model: "llama-3.3-70b-versatile" });
  }

  /**
   * Generate a short tailored cover letter for a job.
   */
  async generateCoverLetter(job, profile) {
    const prompt = `Write a concise 3-paragraph cover letter for this job application.

Job Title: ${job.title}
Company: ${job.company}
Description: ${(job.description || "").slice(0, 800)}

Applicant:
- Name: ${profile.name}
- Skills: ${(profile.skills || []).join(", ")}
- Experience: ${profile.yearsExperience || 0} years
- Background: ${(profile.experiences || []).slice(0, 2).map(e => e.title + " at " + e.company).join(", ")}

Write in a professional, enthusiastic tone. Keep it under 200 words.`;

    return this.complete(prompt, { maxTokens: 400 });
  }
}

// Singleton
export const aiRouter = new AIRouter();
