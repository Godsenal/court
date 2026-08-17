import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AgentExecutor, AgentRunRequest } from "@court/engine";
import { stripProvider } from "./claude.ts";

export interface CodexAdapterOptions {
  bin?: string;
  extraArgs?: string[];
  timeoutMs?: number;
  /** Extra env — set CODEX_HOME to run under a different Codex account. */
  env?: Record<string, string>;
}

/** Prefer a durable codex binary over cmux's session-scoped PATH shim. */
export function resolveCodexBin(): string {
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  const found = Bun.which("codex");
  if (found && !found.includes("cmux-cli-shims")) return found;
  try {
    const out = Bun.spawnSync(["zsh", "-lc", "which -a codex"]).stdout.toString();
    const durable = out.split("\n").find((l) => l.trim() && !l.includes("cmux-cli-shims"));
    if (durable) return durable.trim();
  } catch {
    // fall through
  }
  return found ?? "codex";
}

/** Runs a role step as a headless Codex CLI session (`codex exec`). */
export class CodexAgentExecutor implements AgentExecutor {
  constructor(private opts: CodexAdapterOptions = {}) {}

  async run(req: AgentRunRequest): Promise<string> {
    const bin = this.opts.bin ?? resolveCodexBin();
    const prompt = `${req.role.systemPrompt}\n\n---\n\n${req.prompt}`;
    const outDir = join(homedir(), ".court", "steps");
    mkdirSync(outDir, { recursive: true });
    const lastMessageFile = join(outDir, `codex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.txt`);

    const args = ["exec", "--output-last-message", lastMessageFile, ...(this.opts.extraArgs ?? [])];
    // ChatGPT-account Codex rejects arbitrary model ids; only pass codex-family models through.
    const model = stripProvider(req.model);
    if (/codex/i.test(model)) args.push("--model", model);
    args.push(prompt);

    const proc = Bun.spawn([bin, ...args], {
      cwd: req.cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, ...this.opts.env },
    });
    req.onSession?.({ runner: "codex", pid: proc.pid });

    const timeoutMs = this.opts.timeoutMs ?? 30 * 60 * 1000;
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    // Stream codex's progress lines live.
    const decoder = new TextDecoder();
    let stdout = "";
    let buffer = "";
    const stderrPromise = new Response(proc.stderr).text();
    for await (const chunk of proc.stdout) {
      const text = decoder.decode(chunk, { stream: true });
      stdout += text;
      buffer += text;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.trim() && !line.startsWith("hook:")) req.onProgress?.(line + "\n");
      }
    }
    const [stderr, exitCode] = await Promise.all([stderrPromise, proc.exited]);
    clearTimeout(timer);

    if (exitCode !== 0) {
      throw new Error(`codex exited ${exitCode}: ${stderr.slice(0, 2000) || stdout.slice(0, 2000)}`);
    }
    if (existsSync(lastMessageFile)) {
      const message = readFileSync(lastMessageFile, "utf8").trim();
      if (message) return message;
    }
    return stdout.trim();
  }
}
