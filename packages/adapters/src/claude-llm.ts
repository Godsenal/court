import type { LlmCall } from "@court/engine";
import { stripProvider } from "./claude.ts";

/**
 * Plain completion via the local claude CLI (`claude -p`), used when no
 * AI_GATEWAY_API_KEY is configured. Tools are disabled so it behaves like a
 * pure LLM call on the user's Claude subscription.
 */
export function createClaudeLlm(bin = "claude"): LlmCall {
  return async (model, system, prompt) => {
    const proc = Bun.spawn(
      [
        bin,
        "-p",
        prompt,
        "--output-format",
        "json",
        "--model",
        stripProvider(model),
        "--append-system-prompt",
        system,
        "--disallowedTools",
        "Bash,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch,Agent,Task,NotebookEdit",
      ],
      { stdout: "pipe", stderr: "pipe", env: { ...process.env } },
    );
    const timer = setTimeout(() => proc.kill(), 5 * 60 * 1000);
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timer);
    if (code !== 0) throw new Error(`claude llm exited ${code}: ${stderr.slice(0, 1000)}`);
    try {
      const parsed = JSON.parse(stdout);
      if (typeof parsed.result === "string") return parsed.result;
    } catch {
      // fall through
    }
    return stdout.trim();
  };
}
