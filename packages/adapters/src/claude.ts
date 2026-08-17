import type { AgentExecutor, AgentRunRequest } from "@court/engine";

export interface ClaudeAdapterOptions {
  /** Path to the claude binary; defaults to `claude` on PATH. */
  bin?: string;
  /** Extra CLI args appended to every invocation (e.g. --dangerously-skip-permissions). */
  extraArgs?: string[];
  /** Per-call timeout in ms. */
  timeoutMs?: number;
}

/**
 * Runs a role step as a headless Claude Code session (`claude -p`).
 * The role's system prompt is appended; the model comes from the engine's
 * routing decision. Model ids in `provider/model` gateway form are mapped to
 * plain Anthropic model names when running through the claude CLI.
 */
export class ClaudeAgentExecutor implements AgentExecutor {
  constructor(private opts: ClaudeAdapterOptions = {}) {}

  async run(req: AgentRunRequest): Promise<string> {
    const bin = this.opts.bin ?? "claude";
    const model = stripProvider(req.model);
    const args = [
      "-p",
      req.prompt,
      "--output-format",
      "json",
      "--model",
      model,
      "--append-system-prompt",
      req.role.systemPrompt,
      ...(this.opts.extraArgs ?? []),
    ];
    const proc = Bun.spawn([bin, ...args], {
      cwd: req.cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });
    req.onSession?.({ runner: "claude", pid: proc.pid });

    const timeoutMs = this.opts.timeoutMs ?? 30 * 60 * 1000;
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timer);

    if (exitCode !== 0) {
      throw new Error(`claude exited ${exitCode}: ${stderr.slice(0, 2000) || stdout.slice(0, 2000)}`);
    }
    return parseClaudeJson(stdout, req.onSession);
  }
}

/** `anthropic/claude-sonnet-4.5` → `claude-sonnet-4.5`; pass through otherwise. */
export function stripProvider(model: string): string {
  const slash = model.indexOf("/");
  return slash === -1 ? model : model.slice(slash + 1);
}

function parseClaudeJson(stdout: string, onSession?: AgentRunRequest["onSession"]): string {
  try {
    const parsed = JSON.parse(stdout);
    if (parsed.session_id && onSession) onSession({ runner: "claude", sessionId: parsed.session_id });
    if (typeof parsed.result === "string") return parsed.result;
    return stdout;
  } catch {
    return stdout.trim();
  }
}
