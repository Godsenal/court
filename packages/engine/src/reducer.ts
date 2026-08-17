import type { RunEvent, RunState } from "./types.ts";

/** Pure event → state reducer. Replaying a run's JSONL rebuilds its state. */
export function reduce(state: RunState | undefined, event: RunEvent): RunState {
  switch (event.type) {
    case "run.created": {
      const nodes: RunState["nodes"] = {};
      for (const spec of event.mission.graph.nodes) {
        nodes[spec.id] = { spec, status: "pending" };
      }
      return {
        runId: event.runId,
        mission: event.mission,
        status: "running",
        nodes,
        createdAt: event.at,
        updatedAt: event.at,
      };
    }
    case "node.added": {
      const s = must(state);
      return {
        ...s,
        nodes: { ...s.nodes, [event.spec.id]: { spec: event.spec, status: "pending" } },
        updatedAt: event.at,
      };
    }
    case "node.status": {
      const s = must(state);
      const node = s.nodes[event.nodeId];
      if (!node) return s;
      const patch: Partial<typeof node> = { status: event.status };
      if (event.status === "running") patch.startedAt = event.at;
      if (event.status === "completed" || event.status === "failed" || event.status === "skipped") {
        patch.endedAt = event.at;
      }
      if (event.status === "pending") {
        // Retry: wipe the previous attempt's traces.
        patch.output = undefined;
        patch.error = undefined;
        patch.progress = undefined;
        patch.startedAt = undefined;
        patch.endedAt = undefined;
      }
      return withNode(s, event.nodeId, patch, event.at);
    }
    case "node.progress": {
      const s = must(state);
      const prev = s.nodes[event.nodeId]?.progress ?? "";
      // Keep a bounded live tail in memory; the full stream stays in the JSONL.
      const progress = (prev + event.chunk).slice(-65536);
      return withNode(s, event.nodeId, { progress }, event.at);
    }
    case "node.session": {
      const s = must(state);
      const prev = s.nodes[event.nodeId]?.session;
      return withNode(s, event.nodeId, { session: { ...prev, ...event.session } }, event.at);
    }
    case "node.output": {
      const s = must(state);
      return withNode(s, event.nodeId, { output: event.output }, event.at);
    }
    case "node.failed": {
      const s = must(state);
      return withNode(s, event.nodeId, { error: event.error, status: "failed", endedAt: event.at }, event.at);
    }
    case "gate.requested": {
      const s = must(state);
      return withNode(s, event.nodeId, { status: "waiting_human" }, event.at);
    }
    case "gate.resolved": {
      const s = must(state);
      return withNode(
        s,
        event.nodeId,
        {
          status: event.approved ? "completed" : "failed",
          output: JSON.stringify({ approved: event.approved, by: event.by, note: event.note ?? null }),
          endedAt: event.at,
        },
        event.at,
      );
    }
    case "run.status": {
      const s = must(state);
      return { ...s, status: event.status, updatedAt: event.at };
    }
  }
}

function withNode(
  s: RunState,
  nodeId: string,
  patch: Partial<RunState["nodes"][string]>,
  at: string,
): RunState {
  const node = s.nodes[nodeId];
  if (!node) return s;
  return { ...s, nodes: { ...s.nodes, [nodeId]: { ...node, ...patch } }, updatedAt: at };
}

function must(state: RunState | undefined): RunState {
  if (!state) throw new Error("event applied before run.created");
  return state;
}
