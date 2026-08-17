import type { AgentExecutor, AgentRunRequest } from "@court/engine";
import { stripProvider } from "./claude.ts";

export interface CodexAdapterOptions {
  bin?: string;
  extraArgs?: string[];
  timeoutMs?: number;
}

/** Runs a role step as a headless Codex CLI session (`codex exec`). */
export class CodexAgentExecutor implements AgentExecutor {
  constructor(private opts: CodexAdapterOptions = {}) {}

  async run(req: AgentRunRequest): Promise<string> {
    const bin = this.opts.bin ?? "codex";
    const prompt = `${req.role.systemPrompt}\n\n---\n\n${req.prompt}`;
    const args = ["exec", "--model", stripProvider(req.model), ...(this.opts.extraArgs ?? []), prompt];
    const proc = Bun.spawn([bin, ...args], {
      cwd: req.cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });
    req.onSession?.({ runner: "codex", pid: proc.pid });

    const timeoutMs = this.opts.timeoutMs ?? 30 * 60 * 1000;
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timer);

    if (exitCode !== 0) {
      throw new Error(`codex exited ${exitCode}: ${stderr.slice(0, 2000) || stdout.slice(0, 2000)}`);
    }
    return stdout.trim();
  }
}
