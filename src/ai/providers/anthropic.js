// ─── Anthropic Provider ───────────────────────────────────────────────────────

export class AnthropicProvider {
  get name() { return "anthropic"; }

  async complete(prompt, opts = {}) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model:      opts.model || "claude-3-haiku-20240307",
      max_tokens: opts.maxTokens || 1024,
      system:     opts.system || "You are a helpful assistant for job application automation.",
      messages:   [{ role: "user", content: prompt }],
    });

    return response.content[0]?.text || "";
  }
}
