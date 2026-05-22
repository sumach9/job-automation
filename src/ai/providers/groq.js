// ─── Groq AI Provider ─────────────────────────────────────────────────────────
// Uses Groq's ultra-fast inference (Llama 3.3 70B) as the primary AI brain.
// Groq is OpenAI-API-compatible so the interface is identical to OpenAI.

import Groq from "groq-sdk";

// Model strategy (free tier limits):
//   llama-3.1-8b-instant     — 500k TPD, blazing fast  ← default for form filling
//   llama-3.3-70b-versatile  — 100k TPD, most capable  ← for cover letters / skill gap
const DEFAULT_MODEL   = "llama-3.1-8b-instant";
const FALLBACK_MODEL  = "llama-3.1-8b-instant";  // used when 70B hits rate limit

export class GroqProvider {
  constructor() {
    this.name   = "groq";
    this._client = null;
  }

  _getClient() {
    if (!this._client) {
      this._client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
    return this._client;
  }

  /**
   * @param {string} prompt
   * @param {{ system?: string, maxTokens?: number, model?: string }} opts
   * @returns {Promise<string>}
   */
  async complete(prompt, opts = {}) {
    const client   = this._getClient();
    const messages = [];

    if (opts.system) {
      messages.push({ role: "system", content: opts.system });
    }
    messages.push({ role: "user", content: prompt });

    const modelsToTry = [
      opts.model || DEFAULT_MODEL,
      ...(opts.model !== FALLBACK_MODEL ? [FALLBACK_MODEL] : []),
    ].filter((m, i, a) => a.indexOf(m) === i);  // dedupe

    let lastErr;
    for (const model of modelsToTry) {
      try {
        const res = await client.chat.completions.create({
          model,
          messages,
          max_tokens:  opts.maxTokens || 1024,
          temperature: 0.2,
        });
        return res.choices[0]?.message?.content?.trim() || "";
      } catch (err) {
        lastErr = err;
        // Only retry on rate-limit (429); other errors bubble immediately
        if (!err.status || err.status !== 429) throw err;
        // Try next model
      }
    }
    throw lastErr;
  }
}
