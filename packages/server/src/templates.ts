import type { GraphSpec, Mission } from "@court/engine";

export interface MissionInput {
  title?: string;
  goal: string;
  /** Repo the developer works in (claude runner cwd). */
  cwd?: string;
  template?: "pipeline" | "breakdown" | "polish" | "custom" | "auto";
  /** For template=custom: a full graph. */
  graph?: GraphSpec;
  /** Gate risk for the plan-approval step; "low" auto-approves with default roles. */
  planGateRisk?: "low" | "medium" | "high" | "critical";
}

export function buildMission(input: MissionInput): Mission {
  const id = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const graph = input.template === "custom" && input.graph ? input.graph : buildTemplate(input);
  return {
    id,
    title: input.title ?? input.goal.slice(0, 60),
    goal: input.goal,
    graph,
    createdAt: new Date().toISOString(),
  };
}

function cwdNote(input: MissionInput): string {
  return input.cwd
    ? `\n\nWorking directory: ${input.cwd} — every file operation happens INSIDE this directory (use relative paths; never invent other absolute paths).`
    : "";
}

function buildTemplate(input: MissionInput): GraphSpec {
  const risk = input.planGateRisk ?? "high";
  switch (input.template ?? "pipeline") {
    case "pipeline":
      return {
        nodes: [
          {
            kind: "agent", id: "plan", dependsOn: [], role: "pm", tier: "planner", title: "계획 수립",
            prompt: `Goal:\n${input.goal}${cwdNote(input)}\n\nProduce a concise implementation plan with acceptance criteria.`,
          },
          { kind: "gate", id: "plan-gate", dependsOn: ["plan"], risk, question: "이 계획대로 진행할까요?", contextFrom: ["plan"], title: "계획 승인" },
          {
            kind: "agent", id: "build", dependsOn: ["plan-gate"], role: "developer", tier: "executor", cwd: input.cwd, title: "구현",
            prompt: `Implement this plan. Verify with tests/typecheck where possible.${cwdNote(input)}\n\nGoal:\n${input.goal}\n\nPlan:\n{{plan}}`,
          },
          {
            kind: "judge", id: "review", dependsOn: ["build"], subject: "build", votes: 3, tier: "cheap", role: "reviewer", title: "검수",
            criteria: `The work must plausibly satisfy the goal and the plan's acceptance criteria.\nGoal: ${input.goal}`,
          },
        ],
      };
    case "breakdown":
      return {
        nodes: [
          {
            kind: "agent", id: "breakdown", dependsOn: [], role: "pm", tier: "planner", title: "작업 분해",
            prompt: `Goal:\n${input.goal}${cwdNote(input)}\n\nBreak this into 2-6 independent tasks. Output ONLY a JSON array of task strings.`,
          },
          { kind: "gate", id: "plan-gate", dependsOn: ["breakdown"], risk, question: "이 작업 분해로 진행할까요?", contextFrom: ["breakdown"], title: "분해 승인" },
          {
            kind: "fanout", id: "work", dependsOn: ["plan-gate"], itemsFrom: "breakdown", title: "병렬 작업",
            template: { kind: "agent", role: "developer", tier: "executor", cwd: input.cwd, prompt: `Overall goal:\n${input.goal}${cwdNote(input)}\n\nYour task: {{item}}\n\nDo it and report the result.` },
          },
          {
            kind: "judge", id: "review", dependsOn: ["work"], subject: "work", votes: 3, tier: "cheap", role: "reviewer", title: "검수",
            criteria: `All subtask results together must satisfy the goal.\nGoal: ${input.goal}`,
          },
        ],
      };
    case "polish":
      return {
        nodes: [
          {
            kind: "loop", id: "polish", dependsOn: [], maxIterations: 5, title: "반복 개선",
            body: {
              kind: "agent", role: "developer", tier: "executor", cwd: input.cwd,
              prompt: `Goal:\n${input.goal}${cwdNote(input)}\n\nPrevious iteration result:\n{{prev}}\n\nImprove further. Report what changed.`,
            },
            until: `The goal is fully achieved with no obvious remaining improvements.\nGoal: ${input.goal}`,
          },
        ],
      };
    case "custom":
      throw new Error("template=custom requires a graph");
    case "auto":
      throw new Error("template=auto is resolved by the planner before buildMission");
  }
}
