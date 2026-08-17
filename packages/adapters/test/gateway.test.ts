import { afterAll, describe, expect, test } from "bun:test";
import { createGatewayLlm } from "../src/gateway.ts";

/** Mock OpenAI-compatible gateway: echoes back the requested model. */
const received: Array<{ model: string; auth: string | null; system: string }> = [];
const server = Bun.serve({
  port: 0,
  fetch: async (req) => {
    const body = (await req.json()) as { model: string; messages: Array<{ role: string; content: string }> };
    received.push({
      model: body.model,
      auth: req.headers.get("authorization"),
      system: body.messages[0]?.content ?? "",
    });
    return Response.json({ choices: [{ message: { content: `echo from ${body.model}` } }] });
  },
});

afterAll(() => server.stop());

describe("gateway adapter", () => {
  test("switching models is just switching the string", async () => {
    const llm = createGatewayLlm({ baseUrl: `http://localhost:${server.port}`, apiKey: "test-key" });
    expect(await llm("anthropic/claude-sonnet-4.5", "sys", "hi")).toBe("echo from anthropic/claude-sonnet-4.5");
    expect(await llm("openai/gpt-5.2", "sys", "hi")).toBe("echo from openai/gpt-5.2");
    expect(await llm("google/gemini-3-pro", "sys", "hi")).toBe("echo from google/gemini-3-pro");
    expect(received.map((r) => r.model)).toEqual(["anthropic/claude-sonnet-4.5", "openai/gpt-5.2", "google/gemini-3-pro"]);
    expect(received[0]!.auth).toBe("Bearer test-key");
    expect(received[0]!.system).toBe("sys");
  });

  test("missing key throws a clear error", async () => {
    const prev = process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
    try {
      const llm = createGatewayLlm({ baseUrl: `http://localhost:${server.port}` });
      await expect(llm("anthropic/claude-haiku-4.5", "s", "p")).rejects.toThrow(/AI_GATEWAY_API_KEY/);
    } finally {
      if (prev) process.env.AI_GATEWAY_API_KEY = prev;
    }
  });

  test("gateway http errors surface status and body", async () => {
    const bad = Bun.serve({
      port: 0,
      fetch: () => new Response(JSON.stringify({ error: "model not found" }), { status: 404 }),
    });
    try {
      const llm = createGatewayLlm({ baseUrl: `http://localhost:${bad.port}`, apiKey: "k" });
      await expect(llm("nope/nope", "s", "p")).rejects.toThrow(/gateway 404/);
    } finally {
      bad.stop();
    }
  });
});
