import type {
  AgentNodeSpec,
  AgentSessionRef,
  ModelId,
  RiskLevel,
  Role,
  ToolNodeSpec,
} from "./types.ts";

/** Runs a role agent step (claude CLI, codex CLI, or plain LLM call). */
export interface AgentExecutor {
  run(req: AgentRunRequest): Promise<string>;
}

export interface AgentRunRequest {
  runId: string;
  node: AgentNodeSpec;
  role: Role;
  model: ModelId;
  prompt: string;
  cwd?: string;
  /** Called as soon as the underlying session is known (cmux workspace, pid...). */
  onSession?: (session: AgentSessionRef) => void;
  /** Live activity stream (assistant text, tool calls) while the step runs. */
  onProgress?: (chunk: string) => void;
}

/** Plain one-shot LLM completion (via Vercel AI Gateway). Used by judge/loop-until. */
export type LlmCall = (model: ModelId, system: string, prompt: string) => Promise<string>;

/** Runs non-LLM tool steps: ego-browser, shell, computer-use. */
export interface ToolExecutor {
  run(node: ToolNodeSpec, input: string): Promise<string>;
}

/**
 * Notifies the human that a gate needs a decision (cmux notify / Feed / push).
 * Return a decision to resolve immediately (extra policy layer), or null to
 * wait for a human `Engine.resolveGate` call. Policy auto-approval below the
 * role's threshold is handled by the engine before this is called.
 */
export interface Gatekeeper {
  request(req: GateRequest): Promise<GateDecision | null>;
}

export interface GateRequest {
  runId: string;
  nodeId: string;
  question: string;
  risk: RiskLevel;
  context: string;
  /** Highest risk the requesting role may auto-approve (exclusive). */
  autoApproveBelow: RiskLevel;
}

export interface GateDecision {
  approved: boolean;
  by: "human" | "policy";
  note?: string;
}

export const RISK_ORDER: RiskLevel[] = ["low", "medium", "high", "critical"];

export function riskLt(a: RiskLevel, b: RiskLevel): boolean {
  return RISK_ORDER.indexOf(a) < RISK_ORDER.indexOf(b);
}
