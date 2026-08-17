import { describe, expect, test } from "bun:test";
import { Engine, type EngineDeps } from "../src/engine.ts";
import type { Mission, Role, RunEvent, RunState } from "../src/types.ts";

const roles = new Map<string, Role>([
  [
    "reviewer",
    {
      id: "reviewer",
      name: "Reviewer",
      systemPrompt: "review",
      policy: { models: { cheap: "anthropic/claude-haiku-4.5" }, runner: "llm", autoApproveBelow: "medium" },
    },
  ],
  [
    "dev",
    {
      id: "dev",
      name: "Dev",
      systemPrompt: "dev",
      policy: { models: { executor: "anthropic/claude-sonnet-4.5" }, runner: "llm", autoApproveBelow: "medium" },
    },
  ],
]);

function makeEngine(overrides: Partial<EngineDeps> = {}) {
  const events: RunEvent[] = [];
  const deps: EngineDeps = {
    agent: { run: async () => "work done" },
    tool: {
      run: async (_node, input) => {
        if (input.includes("fail")) throw new Error("check failed: exit 1");
        return "check ok";
      },
    },
    llm: async () => "PASS looks great",
    gatekeeper: { request: async () => null },
    roles,
    sink: (e) => events.push(e),
    ...overrides,
  };
  return { engine: new Engine(deps), events };
}

async function settled(engine: Engine, runId: string): Promise<RunState> {
  const start = Date.now();
  while (Date.now() - start < 2000) {
    const run = engine.getRun(runId)!;
    if (run.status !== "running") return run;
    await new Promise((r) => setTimeout(r, 5));
  }
  return engine.getRun(runId)!;
}

function mission(nodes: Mission["graph"]["nodes"]): Mission {
  return { id: `m-${Math.random().toString(36).slice(2, 8)}`, title: "t", goal: "g", graph: { nodes }, createdAt: "now" };
}

describe("judge deterministic checks", () => {
  test("failing check pins verdict to fail even when panel would pass", async () => {
    const { engine } = makeEngine();
    const m = mission([
      { kind: "agent", id: "work", dependsOn: [], role: "dev", tier: "executor", prompt: "w" },
      {
        kind: "judge", id: "j", dependsOn: ["work"], subject: "work", criteria: "c", votes: 3, tier: "cheap", role: "reviewer",
        checks: [{ run: "test-that-will-fail" }],
      },
    ]);
    engine.start(m);
    const run = await settled(engine, m.id);
    expect(run.nodes["j"]!.status).toBe("failed");
    const output = JSON.parse(run.nodes["j"]!.output!);
    expect(output.pinnedBy).toBe("checks");
    expect(output.pass).toBe(false);
  });

  test("passing checks proceed to the panel and are recorded", async () => {
    const { engine } = makeEngine();
    const m = mission([
      { kind: "agent", id: "work", dependsOn: [], role: "dev", tier: "executor", prompt: "w" },
      {
        kind: "judge", id: "j", dependsOn: ["work"], subject: "work", criteria: "c", votes: 3, tier: "cheap", role: "reviewer",
        checks: [{ run: "bun test ok" }],
      },
    ]);
    engine.start(m);
    const run = await settled(engine, m.id);
    expect(run.nodes["j"]!.status).toBe("completed");
    const output = JSON.parse(run.nodes["j"]!.output!);
    expect(output.pass).toBe(true);
    expect(output.checks[0].ok).toBe(true);
  });
});
