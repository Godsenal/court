/** Core domain types for the court graph engine. */

/** Model id in `provider/model` form, routed through Vercel AI Gateway. */
export type ModelId = string;

/** Which brain a step uses. Roles map tiers to concrete models. */
export type ModelTier = "planner" | "executor" | "cheap";

export interface RolePolicy {
  /** e.g. { planner: "anthropic/claude-opus-5", executor: "anthropic/claude-sonnet-5" } */
  models: Partial<Record<ModelTier, ModelId>>;
  /**
   * Which agent adapter runs this role's work: "claude", "codex", "llm", or a
   * named runner from the server's runner registry (e.g. "claude-work").
   */
  runner: string;
  /** Auto-approve policy: gates below this risk level resolve themselves. */
  autoApproveBelow: RiskLevel;
  /**
   * Structural capability control (loops lesson: prompts can't beat loaded
   * tools — deny at the CLI layer). Passed to CLI runners as
   * --allowedTools / --disallowedTools.
   */
  allowedTools?: string[];
  disallowedTools?: string[];
}

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface Role {
  id: string; // "pm" | "designer" | "developer" | "reviewer" | custom
  name: string;
  systemPrompt: string;
  policy: RolePolicy;
}

/** ---------- Graph ---------- */

export type NodeSpec =
  | AgentNodeSpec
  | GateNodeSpec
  | JudgeNodeSpec
  | FanoutNodeSpec
  | LoopNodeSpec
  | ToolNodeSpec;

export interface BaseNodeSpec {
  id: string;
  /** Node ids that must complete before this node runs. */
  dependsOn: string[];
  title?: string;
}

/** Run a role agent on a prompt. Outputs text (and artifacts via workdir). */
export interface AgentNodeSpec extends BaseNodeSpec {
  kind: "agent";
  role: string;
  tier: ModelTier;
  /** Prompt template; `{{nodeId}}` interpolates upstream node outputs. */
  prompt: string;
  /** Working directory for CLI runners (claude/codex). */
  cwd?: string;
  /** Override the role's runner/model if needed. */
  runner?: RolePolicy["runner"];
  model?: ModelId;
}

/** Human approval gate. Auto-resolves when risk < approver policy. */
export interface GateNodeSpec extends BaseNodeSpec {
  kind: "gate";
  risk: RiskLevel;
  question: string;
  /** Free-form context shown to the human (usually upstream output). */
  contextFrom?: string[];
}

/** N verifiers judge an upstream output; majority verdict wins. */
export interface JudgeNodeSpec extends BaseNodeSpec {
  kind: "judge";
  subject: string; // node id whose output is judged
  criteria: string;
  votes: number; // odd number
  tier: ModelTier;
  role: string;
  /**
   * Deterministic floor (loops lesson): shell commands run BEFORE the LLM
   * panel. Any failing check pins the verdict to fail — the panel can only
   * worsen a passing floor, never rescue a failing one.
   */
  checks?: Array<{ run: string; cwd?: string }>;
}

/** Expand into one child per item at runtime. */
export interface FanoutNodeSpec extends BaseNodeSpec {
  kind: "fanout";
  /** Node id whose output is a JSON array of items. */
  itemsFrom: string;
  /** Template node applied per item; `{{item}}` available. */
  template: Omit<AgentNodeSpec, "id" | "dependsOn">;
  maxConcurrent?: number;
}

/** Repeat body until judge passes or maxIterations reached. */
export interface LoopNodeSpec extends BaseNodeSpec {
  kind: "loop";
  body: Omit<AgentNodeSpec, "id" | "dependsOn">;
  /** Condition prompt evaluated by a cheap model after each iteration. */
  until: string;
  maxIterations: number;
}

/** Non-LLM step: browser (ego-browser), shell, computer-use. */
export interface ToolNodeSpec extends BaseNodeSpec {
  kind: "tool";
  tool: "browser" | "shell" | "computer";
  input: string;
  cwd?: string;
}

export interface GraphSpec {
  nodes: NodeSpec[];
}

export interface Mission {
  id: string;
  title: string;
  goal: string;
  graph: GraphSpec;
  createdAt: string;
  /**
   * Mission-wide gate auto-approval ceiling (exclusive). Defaults to "medium":
   * low-risk gates self-approve, medium+ wait for a human. Roles in play can
   * only lower this, never raise it.
   */
  autoApproveBelow?: RiskLevel;
}

/** ---------- Runtime state ---------- */

export type NodeStatus =
  | "pending"
  | "ready"
  | "running"
  | "waiting_human"
  | "completed"
  | "failed"
  | "skipped";

export interface NodeState {
  spec: NodeSpec;
  status: NodeStatus;
  output?: string;
  error?: string;
  startedAt?: string;
  endedAt?: string;
  /** For agent nodes: live session info (cmux workspace, agent session id). */
  session?: AgentSessionRef;
  iteration?: number;
}

export interface AgentSessionRef {
  runner: string;
  /** Resolved model for this step (records planner/executor routing). */
  model?: ModelId;
  sessionId?: string;
  cmuxWorkspaceId?: string;
  pid?: number;
}

export type RunStatus = "running" | "waiting_human" | "completed" | "failed" | "cancelled";

export interface RunState {
  runId: string;
  mission: Mission;
  status: RunStatus;
  nodes: Record<string, NodeState>;
  createdAt: string;
  updatedAt: string;
}

/** ---------- Events (event-sourced; JSONL persisted) ---------- */

export type RunEvent =
  | { type: "run.created"; runId: string; mission: Mission; at: string }
  | { type: "node.added"; runId: string; spec: NodeSpec; at: string }
  | { type: "node.status"; runId: string; nodeId: string; status: NodeStatus; at: string }
  | { type: "node.session"; runId: string; nodeId: string; session: AgentSessionRef; at: string }
  | { type: "node.output"; runId: string; nodeId: string; output: string; at: string }
  | { type: "node.failed"; runId: string; nodeId: string; error: string; at: string }
  | { type: "gate.requested"; runId: string; nodeId: string; question: string; risk: RiskLevel; context: string; at: string }
  | { type: "gate.resolved"; runId: string; nodeId: string; approved: boolean; by: "human" | "policy"; note?: string; at: string }
  | { type: "run.status"; runId: string; status: RunStatus; at: string };
