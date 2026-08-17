import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import type { AgentExecutor, AgentRunRequest } from "@court/engine";
import type { CmuxClient } from "./cmux.ts";

export interface ClaudeAdapterOptions {
  /** Path to the claude binary; defaults to `claude` on PATH. */
  bin?: string;
  /** Extra CLI args appended to every invocation (e.g. --dangerously-skip-permissions). */
  extraArgs?: string[];
  /** Per-call timeout in ms. */
  timeoutMs?: number;
  /**
   * Extra environment for the spawned CLI. Point CLAUDE_CONFIG_DIR at another
   * config dir to run this executor under a different Claude account.
   */
  env?: Record<string, string>;
  /**
   * When set, runs the step inside a visible cmux workspace terminal instead of
   * a hidden child process, so the human can watch the agent work live.
   */
  cmux?: CmuxClient;
  visible?: boolean;
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
    if (this.opts.visible && this.opts.cmux) {
      // Fall back to headless when the cmux app isn't reachable.
      if (await this.opts.cmux.available()) return this.runVisible(req, this.opts.cmux);
    }
    return this.runHeadless(req);
  }

  private async runHeadless(req: AgentRunRequest): Promise<string> {
    const bin = this.opts.bin ?? resolveClaudeBin();
    const model = toClaudeCliModel(req.model);
    const args = [
      "-p",
      req.prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--model",
      model,
      "--append-system-prompt",
      req.role.systemPrompt,
      ...(req.node.resumeSessionId ? ["--resume", req.node.resumeSessionId] : []),
      ...roleToolArgs(req),
      ...(this.opts.extraArgs ?? []),
    ];
    const proc = Bun.spawn([bin, ...args], {
      cwd: req.cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, ...this.opts.env },
    });
    req.onSession?.({ runner: "claude", pid: proc.pid });

    const timeoutMs = this.opts.timeoutMs ?? 30 * 60 * 1000;
    const timer = setTimeout(() => proc.kill(), timeoutMs);

    // Batch live deltas so each step doesn't flood the event log.
    let pending = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (pending) {
        req.onProgress?.(pending);
        pending = "";
      }
      flushTimer = null;
    };
    const push = (chunk: string) => {
      if (!req.onProgress) return;
      pending += chunk;
      flushTimer ??= setTimeout(flush, 250);
    };

    let result: string | null = null;
    let isError = false;
    const handleLine = (line: string) => {
      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      switch (event.type) {
        case "system":
          if (event.subtype === "init" && event.session_id) {
            req.onSession?.({ runner: "claude", sessionId: event.session_id, pid: proc.pid });
          }
          break;
        case "stream_event": {
          const inner = event.event;
          if (inner?.type === "content_block_delta" && inner.delta?.type === "text_delta") {
            push(inner.delta.text ?? "");
          } else if (inner?.type === "content_block_start" && inner.content_block?.type === "tool_use") {
            push(`\n\n⏺ ${inner.content_block.name}\n`);
          }
          break;
        }
        case "result":
          isError = Boolean(event.is_error);
          result = typeof event.result === "string" ? event.result : JSON.stringify(event.result ?? "");
          if (event.session_id) req.onSession?.({ runner: "claude", sessionId: event.session_id });
          break;
      }
    };

    const stderrPromise = new Response(proc.stderr).text();
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of proc.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) handleLine(line);
      }
    }
    if (buffer.trim()) handleLine(buffer.trim());
    const [stderr, exitCode] = await Promise.all([stderrPromise, proc.exited]);
    clearTimeout(timer);
    if (flushTimer) clearTimeout(flushTimer);
    flush();

    if (exitCode !== 0) {
      throw new Error(`claude exited ${exitCode}: ${stderr.slice(0, 2000)}`);
    }
    if (isError) throw new Error(`claude reported error: ${String(result).slice(0, 500)}`);
    if (result === null) throw new Error(`claude produced no result event: ${stderr.slice(0, 500)}`);
    return result;
  }

  /**
   * Run `claude -p` inside a new cmux workspace so the human can watch live.
   * Output is captured to a file; completion is signaled by a done-marker.
   */
  private async runVisible(req: AgentRunRequest, cmux: CmuxClient): Promise<string> {
    const workDir = join(homedir(), ".court", "steps");
    mkdirSync(workDir, { recursive: true });
    const stamp = `${req.runId}-${req.node.id.replace(/[^\w-]/g, "_")}-${Date.now().toString(36)}`;
    const promptFile = join(workDir, `${stamp}.prompt`);
    const systemFile = join(workDir, `${stamp}.system`);
    const outFile = join(workDir, `${stamp}.out`);
    const doneFile = join(workDir, `${stamp}.done`);
    const runnerFile = join(workDir, `${stamp}.sh`);
    writeFileSync(promptFile, req.prompt);
    writeFileSync(systemFile, req.role.systemPrompt);
    const bin = this.opts.bin ?? resolveClaudeBin();
    const extra = [...roleToolArgs(req), ...(this.opts.extraArgs ?? [])]
      .map((a) => `'${a.replace(/'/g, "'\\''")}'`)
      .join(" ");
    writeFileSync(
      runnerFile,
      `#!/bin/zsh
echo "👑 court step: ${req.node.id} (${req.role.id} / ${req.model})"
${bin} -p "$(cat '${promptFile}')" --output-format json --model '${toClaudeCliModel(req.model)}' --append-system-prompt "$(cat '${systemFile}')" ${extra} | tee '${outFile}'
echo $? > '${doneFile}'
echo "\\n✓ court step finished — this terminal can be closed."
`,
    );
    const ws = await cmux.newWorkspace({
      cwd: req.cwd ?? tmpdir(),
      command: `zsh '${runnerFile}'`,
      name: `court:${req.node.id}`,
    });
    req.onSession?.({ runner: "claude", cmuxWorkspaceId: ws.slice(0, 120) });

    const timeoutMs = this.opts.timeoutMs ?? 30 * 60 * 1000;
    const start = Date.now();
    while (!existsSync(doneFile)) {
      if (Date.now() - start > timeoutMs) throw new Error(`visible step timed out: ${req.node.id}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
    const exitCode = Number(readFileSync(doneFile, "utf8").trim() || "1");
    const stdout = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
    if (exitCode !== 0) throw new Error(`claude (visible) exited ${exitCode}: ${stdout.slice(0, 2000)}`);
    return parseClaudeJson(stdout, req.onSession);
  }
}

/**
 * Structural capability control: a role's tool policy becomes CLI flags, so a
 * reviewer physically cannot edit files no matter what the prompt says.
 */
function roleToolArgs(req: AgentRunRequest): string[] {
  const args: string[] = [];
  const { allowedTools, disallowedTools } = req.role.policy;
  if (allowedTools?.length) args.push("--allowedTools", allowedTools.join(","));
  if (disallowedTools?.length) args.push("--disallowedTools", disallowedTools.join(","));
  return args;
}

/**
 * Resolve a stable claude binary. cmux terminal sessions put a session-scoped
 * shim first on PATH which dies with the session — prefer durable locations.
 */
export function resolveClaudeBin(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const local = join(homedir(), ".local", "bin", "claude");
  if (existsSync(local)) return local;
  return Bun.which("claude") ?? "claude";
}

/** `anthropic/claude-sonnet-4.5` → `claude-sonnet-4.5`; pass through otherwise. */
export function stripProvider(model: string): string {
  const slash = model.indexOf("/");
  return slash === -1 ? model : model.slice(slash + 1);
}

/**
 * Gateway-style ids don't always match claude CLI model ids. Map Claude model
 * families to CLI aliases (always valid, resolve to the latest of the family);
 * non-Claude ids pass through stripped.
 */
export function toClaudeCliModel(model: string): string {
  const m = stripProvider(model);
  if (/claude.*opus|^opus/i.test(m)) return "opus";
  if (/claude.*sonnet|^sonnet/i.test(m)) return "sonnet";
  if (/claude.*haiku|^haiku/i.test(m)) return "haiku";
  return m;
}

export function parseClaudeJson(stdout: string, onSession?: AgentRunRequest["onSession"]): string {
  try {
    const parsed = JSON.parse(stdout);
    if (parsed.session_id && onSession) onSession({ runner: "claude", sessionId: parsed.session_id });
    if (parsed.is_error) {
      throw new Error(`claude reported error: ${JSON.stringify(parsed.result ?? parsed).slice(0, 500)}`);
    }
    if (typeof parsed.result === "string") return parsed.result;
    return stdout;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("claude reported error")) throw e;
    return stdout.trim();
  }
}
