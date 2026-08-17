import type { AgentExecutor, AgentRunRequest, LlmCall } from "@court/engine";

/**
 * Routes an agent step to the right runner:
 *  - "claude" → headless Claude Code CLI (full tool use in a repo)
 *  - "codex"  → headless Codex CLI
 *  - "llm"    → plain completion via the gateway (no tools; PM/writing steps)
 * Node-level `runner` overrides the role default.
 */
export class RoutingAgentExecutor implements AgentExecutor {
  constructor(
    private runners: Partial<Record<"claude" | "codex", AgentExecutor>>,
    private llm: LlmCall,
  ) {}

  async run(req: AgentRunRequest): Promise<string> {
    const runner = req.node.runner ?? req.role.policy.runner;
    if (runner === "llm") {
      req.onSession?.({ runner: "llm" });
      return this.llm(req.model, req.role.systemPrompt, req.prompt);
    }
    const exec = this.runners[runner];
    if (!exec) throw new Error(`runner not configured: ${runner}`);
    return exec.run(req);
  }
}
