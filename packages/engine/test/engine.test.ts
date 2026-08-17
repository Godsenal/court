import { describe, expect, test } from "bun:test";
import { Engine, type EngineDeps } from "../src/engine.ts";
import type { Mission, Role, RunEvent, RunState } from "../src/types.ts";

const roles = new Map<string, Role>([
  [
    "dev",
    {
      id: "dev",
      name: "Developer",
      systemPrompt: "You are a developer.",
      policy: {
        models: { planner: "anthropic/claude-opus-4.5", executor: "anthropic/claude-sonnet-4.5", cheap: "anthropic/claude-haiku-4.5" },
        runner: "llm",
        autoApproveBelow: "medium",
      },
    },
  ],
]);

function makeEngine(overrides: Partial<EngineDeps> = {}) {
  const events: RunEvent[] = [];
  const deps: EngineDeps = {
    agent: { run: async ({ prompt }) => `did: ${prompt}` },
    tool: { run: async (_node, input) => `tool: ${input}` },
    llm: async () => "PASS ok",
    gatekeeper: { request: async () => null },
    roles,
    sink: (e) => events.push(e),
    ...overrides,
  };
  return { engine: new Engine(deps), events };
}

function mission(nodes: Mission["graph"]["nodes"]): Mission {
  return { id: `m-${Math.random().toString(36).slice(2, 8)}`, title: "t", goal: "g", graph: { nodes }, createdAt: "now" };
}

async function settled(engine: Engine, runId: string, timeoutMs = 2000): Promise<RunState> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const run = engine.getRun(runId)!;
    if (run.status !== "running") return run;
    await new Promise((r) => setTimeout(r, 5));
  }
  return engine.getRun(runId)!;
}

describe("engine", () => {
  test("linear pipeline interpolates upstream outputs", async () => {
    const { engine } = makeEngine();
    const m = mission([
      { kind: "agent", id: "plan", dependsOn: [], role: "dev", tier: "planner", prompt: "make a plan" },
      { kind: "agent", id: "build", dependsOn: ["plan"], role: "dev", tier: "executor", prompt: "build from: {{plan}}" },
    ]);
    engine.start(m);
    const run = await settled(engine, m.id);
    expect(run.status).toBe("completed");
    expect(run.nodes["build"]!.output).toBe("did: build from: did: make a plan");
  });

  test("low-risk gate auto-approves by policy", async () => {
    const { engine } = makeEngine();
    const m = mission([
      { kind: "agent", id: "a", dependsOn: [], role: "dev", tier: "executor", prompt: "x" },
      { kind: "gate", id: "g", dependsOn: ["a"], risk: "low", question: "ok?" },
      { kind: "agent", id: "b", dependsOn: ["g"], role: "dev", tier: "executor", prompt: "y" },
    ]);
    engine.start(m);
    const run = await settled(engine, m.id);
    expect(run.status).toBe("completed");
    expect(JSON.parse(run.nodes["g"]!.output!)).toMatchObject({ approved: true, by: "policy" });
  });

  test("high-risk gate waits for a human, then resumes", async () => {
    const { engine } = makeEngine();
    const m = mission([
      { kind: "gate", id: "g", dependsOn: [], risk: "high", question: "deploy?" },
      { kind: "agent", id: "after", dependsOn: ["g"], role: "dev", tier: "executor", prompt: "deploy" },
    ]);
    engine.start(m);
    const waiting = await settled(engine, m.id);
    expect(waiting.status).toBe("waiting_human");
    expect(waiting.nodes["g"]!.status).toBe("waiting_human");

    engine.resolveGate(m.id, "g", true, "go");
    const run = await settled(engine, m.id);
    expect(run.status).toBe("completed");
    expect(run.nodes["after"]!.status).toBe("completed");
  });

  test("denied gate skips downstream and fails the run", async () => {
    const { engine } = makeEngine();
    const m = mission([
      { kind: "gate", id: "g", dependsOn: [], risk: "critical", question: "rm -rf?" },
      { kind: "agent", id: "after", dependsOn: ["g"], role: "dev", tier: "executor", prompt: "nuke" },
    ]);
    engine.start(m);
    await settled(engine, m.id);
    engine.resolveGate(m.id, "g", false, "no way");
    const run = await settled(engine, m.id);
    expect(run.status).toBe("failed");
    expect(run.nodes["after"]!.status).toBe("skipped");
  });

  test("judge panel majority fails the node", async () => {
    let call = 0;
    const { engine } = makeEngine({
      llm: async () => (call++ === 0 ? "PASS fine" : "FAIL nope"),
    });
    const m = mission([
      { kind: "agent", id: "work", dependsOn: [], role: "dev", tier: "executor", prompt: "w" },
      { kind: "judge", id: "j", dependsOn: ["work"], subject: "work", criteria: "must be perfect", votes: 3, tier: "cheap", role: "dev" },
    ]);
    engine.start(m);
    const run = await settled(engine, m.id);
    expect(run.nodes["j"]!.status).toBe("failed");
    expect(run.status).toBe("failed");
  });

  test("fanout expands items and collects outputs", async () => {
    const { engine } = makeEngine({
      agent: { run: async ({ prompt }) => prompt },
    });
    const m = mission([
      { kind: "agent", id: "list", dependsOn: [], role: "dev", tier: "executor", prompt: '["a","b","c"]' },
      {
        kind: "fanout",
        id: "each",
        dependsOn: ["list"],
        itemsFrom: "list",
        template: { kind: "agent", role: "dev", tier: "executor", prompt: "handle {{item}}" },
      },
    ]);
    engine.start(m);
    const run = await settled(engine, m.id);
    expect(run.status).toBe("completed");
    expect(JSON.parse(run.nodes["each"]!.output!)).toEqual(["handle a", "handle b", "handle c"]);
    expect(run.nodes["each[1]"]!.status).toBe("completed");
  });

  test("loop repeats until condition satisfied", async () => {
    let iterations = 0;
    const { engine } = makeEngine({
      agent: { run: async () => `iter-${++iterations}` },
      llm: async (_m, _s, prompt) => (prompt.includes("iter-3") ? "YES" : "NO"),
    });
    const m = mission([
      {
        kind: "loop",
        id: "polish",
        dependsOn: [],
        body: { kind: "agent", role: "dev", tier: "executor", prompt: "improve (prev: {{prev}})" },
        until: "three iterations happened",
        maxIterations: 10,
      },
    ]);
    engine.start(m);
    const run = await settled(engine, m.id);
    expect(run.status).toBe("completed");
    expect(iterations).toBe(3);
    expect(run.nodes["polish"]!.output).toBe("iter-3");
  });

  test("hydrate rebuilds state from events", async () => {
    const { engine, events } = makeEngine();
    const m = mission([{ kind: "agent", id: "a", dependsOn: [], role: "dev", tier: "executor", prompt: "x" }]);
    engine.start(m);
    await settled(engine, m.id);

    const { engine: engine2 } = makeEngine();
    engine2.hydrate(events);
    const run = engine2.getRun(m.id)!;
    expect(run.status).toBe("completed");
    expect(run.nodes["a"]!.output).toBe("did: x");
  });

  test("graph validation rejects cycles", () => {
    const { engine } = makeEngine();
    const m = mission([
      { kind: "agent", id: "a", dependsOn: ["b"], role: "dev", tier: "executor", prompt: "x" },
      { kind: "agent", id: "b", dependsOn: ["a"], role: "dev", tier: "executor", prompt: "y" },
    ]);
    expect(() => engine.start(m)).toThrow(/cycle/);
  });
});
