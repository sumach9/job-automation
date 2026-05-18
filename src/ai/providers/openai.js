// ─── OpenAI Provider ──────────────────────────────────────────────────────────

export class OpenAIProvider {
  get name() { return "openai"; }

  async complete(prompt, opts = {}) {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.chat.completions.create({
      model:      opts.model || "gpt-3.5-turbo",
      max_tokens: opts.maxTokens || 1024,
      messages: [
        { role: "system", content: opts.system || "You are a helpful assistant for job application automation." },
        { role: "user",   content: prompt },
      ],
    });

    return response.choices[0]?.message?.content || "";
  }
}
