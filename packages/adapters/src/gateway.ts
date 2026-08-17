import type { LlmCall } from "@court/engine";

export interface GatewayOptions {
  /** Vercel AI Gateway OpenAI-compatible base URL. */
  baseUrl?: string;
  /** AI_GATEWAY_API_KEY (falls back to env). */
  apiKey?: string;
  maxTokens?: number;
}

/**
 * One-shot completion through Vercel AI Gateway's OpenAI-compatible endpoint.
 * Model ids are `provider/model` strings (e.g. "anthropic/claude-sonnet-4.5",
 * "openai/gpt-5") — switching models is just switching the string.
 */
export function createGatewayLlm(opts: GatewayOptions = {}): LlmCall {
  const baseUrl = (opts.baseUrl ?? process.env.AI_GATEWAY_BASE_URL ?? "https://ai-gateway.vercel.sh/v1").replace(/\/$/, "");
  return async (model, system, prompt) => {
    const apiKey = opts.apiKey ?? process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) throw new Error("AI_GATEWAY_API_KEY not set");
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 8192,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`gateway ${res.status}: ${body.slice(0, 500)}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("gateway returned no content");
    return content;
  };
}
