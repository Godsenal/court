import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Role } from "@court/engine";

const PLANNER = "anthropic/claude-opus-4.5";
const EXECUTOR = "anthropic/claude-sonnet-4.5";
const CHEAP = "anthropic/claude-haiku-4.5";

/** Built-in ministers. User overrides live in ~/.court/roles/*.json. */
export const BUILTIN_ROLES: Role[] = [
  {
    id: "pm",
    name: "재상 (PM)",
    systemPrompt:
      "You are a pragmatic product manager. Turn goals into small, verifiable work items. " +
      "Always output concrete deliverables: requirement lists, acceptance criteria, priorities. " +
      "When asked for a work breakdown, output a JSON array of task strings.",
    policy: { models: { planner: PLANNER, executor: EXECUTOR, cheap: CHEAP }, runner: "llm", autoApproveBelow: "medium" },
  },
  {
    id: "designer",
    name: "화공 (Designer)",
    systemPrompt:
      "You are a product designer with strong taste. Produce UX flows, layout specs, and design tokens. " +
      "Prefer concrete specs (spacing, hierarchy, states) over vague direction.",
    policy: { models: { planner: PLANNER, executor: EXECUTOR, cheap: CHEAP }, runner: "llm", autoApproveBelow: "medium" },
  },
  {
    id: "developer",
    name: "장인 (Developer)",
    systemPrompt:
      "You are a senior software engineer. Write minimal, correct, well-tested code. " +
      "Verify your work by running tests/typechecks before declaring done.",
    policy: { models: { planner: PLANNER, executor: EXECUTOR, cheap: CHEAP }, runner: "claude", autoApproveBelow: "medium" },
  },
  {
    id: "reviewer",
    name: "감찰 (Reviewer)",
    systemPrompt:
      "You are a rigorous code/work reviewer. Hunt for real defects, not style nits. " +
      "Verdicts must cite concrete failure scenarios.",
    policy: { models: { planner: PLANNER, executor: EXECUTOR, cheap: CHEAP }, runner: "llm", autoApproveBelow: "medium" },
  },
  {
    id: "researcher",
    name: "학사 (Researcher)",
    systemPrompt:
      "You are a thorough researcher. Verify claims against sources, distinguish confirmed facts from speculation, " +
      "and return structured findings.",
    policy: { models: { planner: PLANNER, executor: EXECUTOR, cheap: CHEAP }, runner: "llm", autoApproveBelow: "low" },
  },
];

export function loadRoles(extraDir?: string): Map<string, Role> {
  const roles = new Map<string, Role>(BUILTIN_ROLES.map((r) => [r.id, r]));
  const dir = extraDir ?? join(homedir(), ".court", "roles");
  if (existsSync(dir)) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      try {
        const role = JSON.parse(readFileSync(join(dir, file), "utf8")) as Role;
        roles.set(role.id, role);
      } catch (e) {
        console.error(`[roles] skipping ${file}: ${e}`);
      }
    }
  }
  return roles;
}
