// ─── AI Router ────────────────────────────────────────────────────────────────
// Unified interface to multiple AI providers with automatic fallback.
// Strategy: Anthropic → OpenAI → Gemini → queue manual review.

import { log } from "../../logging/logger.js";

// Lazy-load providers so missing API keys don't crash the app
async function getProviders() {
  const providers = [];

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
