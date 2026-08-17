import { describe, expect, test } from "bun:test";
import type { NodeState, RunState, RunStatus } from "@court/engine";
import { computeStats, RUN_STATUSES } from "../src/stats.ts";

function node(status: NodeState["status"] = "completed"): NodeState {
  return { spec: { id: "n", kind: "tool", tool: "shell", input: "x", dependsOn: [] }, status };
}

function run(status: RunStatus, nodeCount: number): RunState {
  const nodes: Record<string, NodeState> = {};
  for (let i = 0; i < nodeCount; i++) nodes[`n${i}`] = node();
  return {
    runId: `r-${Math.random().toString(36).slice(2, 8)}`,
    mission: { id: "m", title: "t", goal: "g", graph: { nodes: [] }, createdAt: "now" },
    status,
    nodes,
    createdAt: "now",
    updatedAt: "now",
  };
}

describe("computeStats", () => {
  test("AC1: empty list", () => {
    expect(computeStats([])).toEqual({
      totalRuns: 0,
      byStatus: { running: 0, waiting_human: 0, completed: 0, failed: 0, cancelled: 0 },
      totalNodes: 0,
    });
  });

  test("AC2: mixed statuses counted, unseen statuses zero-filled", () => {
    const runs = [run("completed", 0), run("completed", 0), run("failed", 0), run("running", 0)];
    const stats = computeStats(runs);
    expect(stats.byStatus).toEqual({
      running: 1,
      waiting_human: 0,
      completed: 2,
      failed: 1,
      cancelled: 0,
    });
    expect(Object.keys(stats.byStatus).sort()).toEqual([...RUN_STATUSES].sort());
  });

  test("AC3: totalNodes sums node counts, empty runs contribute zero", () => {
    const runs = [run("completed", 3), run("failed", 0), run("running", 5)];
    expect(computeStats(runs).totalNodes).toBe(8);
  });

  test("AC4: sum of byStatus values equals totalRuns", () => {
    const runs = [run("completed", 1), run("failed", 1), run("waiting_human", 1), run("cancelled", 1), run("running", 1)];
    const stats = computeStats(runs);
    const sum = Object.values(stats.byStatus).reduce((a, b) => a + b, 0);
    expect(sum).toBe(stats.totalRuns);
  });

  test("AC5: pure — does not mutate input, repeat calls are deep-equal", () => {
    const runs = [run("completed", 2), run("failed", 1)];
    const snapshot = JSON.parse(JSON.stringify(runs));
    const first = computeStats(runs);
    const second = computeStats(runs);
    expect(runs).toEqual(snapshot);
    expect(first).toEqual(second);
  });

  test("unknown status counts toward totalRuns but not byStatus", () => {
    const runs = [run("completed", 1), { ...run("completed", 1), status: "bogus" as RunStatus }];
    const stats = computeStats(runs);
    expect(stats.totalRuns).toBe(2);
    expect(stats.byStatus.completed).toBe(1);
    expect(Object.values(stats.byStatus).reduce((a, b) => a + b, 0)).toBe(1);
  });
});
