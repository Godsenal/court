import type { LlmCall } from "@court/engine";
import { parseClaudeJson, resolveClaudeBin, toClaudeCliModel } from "./claude.ts";

/**
 * Plain completion via the local claude CLI (`claude -p`), used when no
 * AI_GATEWAY_API_KEY is configured. Tools are disabled so it behaves like a
 * pure LLM call on the user's Claude subscription.
 */
export function createClaudeLlm(bin?: string): LlmCall {
  return async (model, system, prompt) => {
    const proc = Bun.spawn(
      [
        bin ?? resolveClaudeBin(),
        "-p",
        prompt,
        "--output-format",
        "json",
        "--model",
        toClaudeCliModel(model),
        "--append-system-prompt",
        system,
        "--disallowedTools",
        "Bash,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch,Agent,Task,NotebookEdit",
        // Pure completion: never loop trying to reach for tools it doesn't have.
        "--max-turns",
        "1",
      ],
      { stdout: "pipe", stderr: "pipe", env: { ...process.env } },
    );
    const timer = setTimeout(() => proc.kill(), 10 * 60 * 1000);
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timer);
    if (code !== 0) {
      throw new Error(`claude llm exited ${code}: ${stderr.slice(0, 1000) || stdout.slice(0, 1000)}`);
    }
    return parseClaudeJson(stdout);
  };
}
