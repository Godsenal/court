import { reduce } from "./reducer.ts";
import { interpolate, outputsOf } from "./template.ts";
import { riskLt, type AgentExecutor, type Gatekeeper, type LlmCall, type ToolExecutor } from "./executors.ts";
import type {
  AgentNodeSpec,
  FanoutNodeSpec,
  GateNodeSpec,
  GraphSpec,
  JudgeNodeSpec,
  LoopNodeSpec,
  Mission,
  ModelId,
  NodeSpec,
  NodeState,
  Role,
  RunEvent,
  RunState,
  ToolNodeSpec,
} from "./types.ts";

export interface EngineDeps {
  agent: AgentExecutor;
  tool: ToolExecutor;
  /** One-shot completion used by judge votes and loop-until checks. */
  llm: LlmCall;
  gatekeeper: Gatekeeper;
  roles: Map<string, Role>;
  /** Persist + broadcast every event (state is already reduced when called). */
  sink: (event: RunEvent, state: RunState) => void;
  maxConcurrentAgents?: number;
  now?: () => string;
}

const DEFAULT_MODEL: ModelId = "anthropic/claude-sonnet-4.5";

export class Engine {
  private runs = new Map<string, RunState>();
  private inflight = new Map<string, Set<string>>();
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private deps: EngineDeps) {}

  private now(): string {
    return this.deps.now?.() ?? new Date().toISOString();
  }

  getRun(runId: string): RunState | undefined {
    return this.runs.get(runId);
  }

  listRuns(): RunState[] {
    return [...this.runs.values()];
  }

  /** Rebuild state from persisted events (no side effects), e.g. on restart. */
  hydrate(events: RunEvent[]): void {
    let state: RunState | undefined;
    for (const event of events) state = reduce(state, event);
    if (state) this.runs.set(state.runId, state);
  }

  start(mission: Mission): RunState {
    const runId = mission.id;
    validateGraph(mission.graph);
    this.emit({ type: "run.created", runId, mission, at: this.now() });
    this.tick(runId);
    return this.runs.get(runId)!;
  }

  /** Human decision arriving from dashboard / cmux Feed / CLI. */
  resolveGate(runId: string, nodeId: string, approved: boolean, note?: string): void {
    const run = this.runs.get(runId);
    const node = run?.nodes[nodeId];
    if (!run || !node || node.status !== "waiting_human") {
      throw new Error(`gate ${runId}/${nodeId} is not waiting for a decision`);
    }
    this.emit({ type: "gate.resolved", runId, nodeId, approved, by: "human", note, at: this.now() });
    this.tick(runId);
  }

  cancel(runId: string): void {
    const run = this.runs.get(runId);
    if (!run || run.status !== "running") return;
    this.emit({ type: "run.status", runId, status: "cancelled", at: this.now() });
  }

  private emit(event: RunEvent): void {
    const runId = event.runId;
    const state = reduce(this.runs.get(runId), event);
    this.runs.set(runId, state);
    this.deps.sink(event, state);
  }

  /** Schedule every node whose dependencies are satisfied. */
  private tick(runId: string): void {
    const run = this.runs.get(runId);
    if (!run || (run.status !== "running" && run.status !== "waiting_human")) return;

    const inflight = this.inflight.get(runId) ?? new Set();
    this.inflight.set(runId, inflight);

    for (const node of Object.values(run.nodes)) {
      if (node.status !== "pending" || inflight.has(node.spec.id)) continue;
      const deps = node.spec.dependsOn.map((id) => run.nodes[id]);
      if (deps.some((d) => !d)) continue; // dep not materialized yet (fanout/loop children)
      if (deps.some((d) => d!.status === "failed" || d!.status === "skipped")) {
        this.emit({ type: "node.status", runId, nodeId: node.spec.id, status: "skipped", at: this.now() });
        continue;
      }
      if (!deps.every((d) => d!.status === "completed")) continue;
      inflight.add(node.spec.id);
      void this.dispatch(runId, node.spec).finally(() => {
        inflight.delete(node.spec.id);
        this.tick(runId);
      });
    }

    this.finishIfDone(runId);
  }

  private finishIfDone(runId: string): void {
    const run = this.runs.get(runId);
    if (!run || run.status === "completed" || run.status === "failed" || run.status === "cancelled") return;
    const states = Object.values(run.nodes);
    const active = states.some((n) => n.status === "running" || n.status === "ready" || n.status === "pending");
    const waiting = states.some((n) => n.status === "waiting_human");
    if (waiting) {
      if (run.status !== "waiting_human") {
        this.emit({ type: "run.status", runId, status: "waiting_human", at: this.now() });
      }
      return;
    }
    if (active) {
      if (run.status === "waiting_human") {
        this.emit({ type: "run.status", runId, status: "running", at: this.now() });
      }
      return;
    }
    const failed = states.some((n) => n.status === "failed");
    this.emit({ type: "run.status", runId, status: failed ? "failed" : "completed", at: this.now() });
  }

  private async dispatch(runId: string, spec: NodeSpec): Promise<void> {
    try {
      switch (spec.kind) {
        case "agent":
          return await this.runAgent(runId, spec);
        case "gate":
          return await this.runGate(runId, spec);
        case "judge":
          return await this.runJudge(runId, spec);
        case "fanout":
          return await this.runFanout(runId, spec);
        case "loop":
          return await this.runLoop(runId, spec);
        case "tool":
          return await this.runTool(runId, spec);
      }
    } catch (error) {
      this.emit({
        type: "node.failed",
        runId,
        nodeId: spec.id,
        error: error instanceof Error ? error.message : String(error),
        at: this.now(),
      });
    }
  }

  private role(id: string): Role {
    const role = this.deps.roles.get(id);
    if (!role) throw new Error(`unknown role: ${id}`);
    return role;
  }

  private vars(runId: string): Record<string, string | undefined> {
    return outputsOf(this.runs.get(runId)!.nodes);
  }

  private async withSlot<T>(fn: () => Promise<T>): Promise<T> {
    const max = this.deps.maxConcurrentAgents ?? 8;
    if (this.running >= max) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.running += 1;
    try {
      return await fn();
    } finally {
      this.running -= 1;
      this.queue.shift()?.();
    }
  }

  private async runAgent(runId: string, spec: AgentNodeSpec, extraVars: Record<string, string> = {}): Promise<void> {
    const role = this.role(spec.role);
    const model = spec.model ?? role.policy.models[spec.tier] ?? DEFAULT_MODEL;
    const prompt = interpolate(spec.prompt, { ...this.vars(runId), ...extraVars });
    this.emit({ type: "node.status", runId, nodeId: spec.id, status: "running", at: this.now() });
    const output = await this.withSlot(() =>
      this.deps.agent.run({
        runId,
        node: spec,
        role,
        model,
        prompt,
        cwd: spec.cwd,
        onSession: (session) => this.emit({ type: "node.session", runId, nodeId: spec.id, session, at: this.now() }),
      }),
    );
    this.emit({ type: "node.output", runId, nodeId: spec.id, output, at: this.now() });
    this.emit({ type: "node.status", runId, nodeId: spec.id, status: "completed", at: this.now() });
  }

  private async runGate(runId: string, spec: GateNodeSpec): Promise<void> {
    const vars = this.vars(runId);
    const context = (spec.contextFrom ?? spec.dependsOn)
      .map((id) => `## ${id}\n${vars[id] ?? "(no output)"}`)
      .join("\n\n");
    // Policy layer: the run-wide approver policy comes from the strictest role in play.
    const autoBelow = this.strictestAutoApprove(runId);
    if (riskLt(spec.risk, autoBelow)) {
      this.emit({ type: "gate.requested", runId, nodeId: spec.id, question: spec.question, risk: spec.risk, context, at: this.now() });
      this.emit({ type: "gate.resolved", runId, nodeId: spec.id, approved: true, by: "policy", note: `auto: risk ${spec.risk} < ${autoBelow}`, at: this.now() });
      return;
    }
    this.emit({ type: "gate.requested", runId, nodeId: spec.id, question: spec.question, risk: spec.risk, context, at: this.now() });
    const decision = await this.deps.gatekeeper.request({
      runId,
      nodeId: spec.id,
      question: spec.question,
      risk: spec.risk,
      context,
      autoApproveBelow: autoBelow,
    });
    if (decision) {
      this.emit({ type: "gate.resolved", runId, nodeId: spec.id, approved: decision.approved, by: decision.by, note: decision.note, at: this.now() });
    }
    // decision === null → stays waiting_human until Engine.resolveGate.
  }

  private strictestAutoApprove(runId: string): GateNodeSpec["risk"] {
    const run = this.runs.get(runId)!;
    let lowest: GateNodeSpec["risk"] = "critical";
    for (const node of Object.values(run.nodes)) {
      if (node.spec.kind !== "agent") continue;
      const role = this.deps.roles.get(node.spec.role);
      if (role && riskLt(role.policy.autoApproveBelow, lowest)) lowest = role.policy.autoApproveBelow;
    }
    return lowest;
  }

  private async runJudge(runId: string, spec: JudgeNodeSpec): Promise<void> {
    const role = this.role(spec.role);
    const model = role.policy.models[spec.tier] ?? DEFAULT_MODEL;
    const subject = this.vars(runId)[spec.subject] ?? "";
    this.emit({ type: "node.status", runId, nodeId: spec.id, status: "running", at: this.now() });
    const system =
      "You are a strict verifier on a judge panel. Judge the WORK against the CRITERIA. " +
      "First line must be exactly PASS or FAIL, then a short reason.";
    const votes = await Promise.all(
      Array.from({ length: spec.votes }, (_, i) =>
        this.deps.llm(model, system, `# CRITERIA\n${spec.criteria}\n\n# WORK\n${subject}\n\n(vote ${i + 1}/${spec.votes})`).catch((e) => `FAIL judge error: ${e}`),
      ),
    );
    const passVotes = votes.filter((v) => v.trim().toUpperCase().startsWith("PASS")).length;
    const pass = passVotes * 2 > spec.votes;
    this.emit({
      type: "node.output",
      runId,
      nodeId: spec.id,
      output: JSON.stringify({ pass, passVotes, total: spec.votes, votes }, null, 2),
      at: this.now(),
    });
    this.emit({ type: "node.status", runId, nodeId: spec.id, status: pass ? "completed" : "failed", at: this.now() });
  }

  private async runFanout(runId: string, spec: FanoutNodeSpec): Promise<void> {
    const raw = this.vars(runId)[spec.itemsFrom] ?? "[]";
    const items = parseItems(raw);
    this.emit({ type: "node.status", runId, nodeId: spec.id, status: "running", at: this.now() });
    const childIds = items.map((_, i) => `${spec.id}[${i}]`);
    await Promise.all(
      items.map((item, i) => {
        const child: AgentNodeSpec = { ...spec.template, kind: "agent", id: childIds[i]!, dependsOn: [] };
        this.emit({ type: "node.added", runId, spec: child, at: this.now() });
        return this.runAgent(runId, child, { item }).catch((e) => {
          this.emit({ type: "node.failed", runId, nodeId: child.id, error: String(e), at: this.now() });
        });
      }),
    );
    const run = this.runs.get(runId)!;
    const results = childIds.map((id) => run.nodes[id]?.output ?? null);
    const failed = childIds.some((id) => run.nodes[id]?.status === "failed");
    this.emit({ type: "node.output", runId, nodeId: spec.id, output: JSON.stringify(results, null, 2), at: this.now() });
    this.emit({ type: "node.status", runId, nodeId: spec.id, status: failed ? "failed" : "completed", at: this.now() });
  }

  private async runLoop(runId: string, spec: LoopNodeSpec): Promise<void> {
    const role = this.role(spec.body.role);
    const checkModel = role.policy.models.cheap ?? role.policy.models.executor ?? DEFAULT_MODEL;
    this.emit({ type: "node.status", runId, nodeId: spec.id, status: "running", at: this.now() });
    let lastOutput = "";
    for (let i = 1; i <= spec.maxIterations; i++) {
      const child: AgentNodeSpec = { ...spec.body, kind: "agent", id: `${spec.id}#${i}`, dependsOn: [] };
      this.emit({ type: "node.added", runId, spec: child, at: this.now() });
      await this.runAgent(runId, child, { prev: lastOutput, iteration: String(i) });
      lastOutput = this.runs.get(runId)!.nodes[child.id]?.output ?? "";
      const verdict = await this.deps.llm(
        checkModel,
        "Answer with exactly YES or NO on the first line.",
        `# DONE-CONDITION\n${spec.until}\n\n# LATEST WORK\n${lastOutput}\n\nIs the condition satisfied?`,
      );
      if (verdict.trim().toUpperCase().startsWith("YES")) break;
    }
    this.emit({ type: "node.output", runId, nodeId: spec.id, output: lastOutput, at: this.now() });
    this.emit({ type: "node.status", runId, nodeId: spec.id, status: "completed", at: this.now() });
  }

  private async runTool(runId: string, spec: ToolNodeSpec): Promise<void> {
    const input = interpolate(spec.input, this.vars(runId));
    this.emit({ type: "node.status", runId, nodeId: spec.id, status: "running", at: this.now() });
    const output = await this.deps.tool.run(spec, input);
    this.emit({ type: "node.output", runId, nodeId: spec.id, output, at: this.now() });
    this.emit({ type: "node.status", runId, nodeId: spec.id, status: "completed", at: this.now() });
  }
}

function parseItems(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((x) => (typeof x === "string" ? x : JSON.stringify(x)));
  } catch {
    // fall through to line-splitting
  }
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function validateGraph(graph: GraphSpec): void {
  const ids = new Set(graph.nodes.map((n) => n.id));
  if (ids.size !== graph.nodes.length) throw new Error("duplicate node ids");
  for (const node of graph.nodes) {
    for (const dep of node.dependsOn) {
      if (!ids.has(dep)) throw new Error(`node ${node.id} depends on unknown node ${dep}`);
    }
  }
  // cycle check via DFS
  const visiting = new Set<string>();
  const done = new Set<string>();
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const visit = (id: string): void => {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error(`dependency cycle involving ${id}`);
    visiting.add(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) visit(dep);
    visiting.delete(id);
    done.add(id);
  };
  for (const node of graph.nodes) visit(node.id);
}

export type { NodeState };
