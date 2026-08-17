#!/usr/bin/env bun
/**
 * court CLI — submit missions and manage runs against the court server.
 *
 *   court go "<goal>" [--template pipeline|breakdown|polish] [--cwd DIR] [--risk low|medium|high]
 *   court runs
 *   court show <runId>
 *   court approve <runId> <gateId> [note]
 *   court deny <runId> <gateId> [note]
 *   court cancel <runId>
 *   court roles
 */

export {};

const BASE = process.env.COURT_URL ?? "http://localhost:8433";

async function api(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  return body;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

const STATUS_ICON: Record<string, string> = {
  pending: "·",
  running: "⚙",
  waiting_human: "✋",
  completed: "✓",
  failed: "✗",
  skipped: "⤼",
};

const [cmd, ...args] = process.argv.slice(2);

try {
  switch (cmd) {
    case "go": {
      const goal = args.find((a) => !a.startsWith("--"));
      if (!goal) throw new Error('usage: court go "<goal>" [--template t] [--cwd dir] [--risk r]');
      const run = await api("/api/missions", {
        method: "POST",
        body: JSON.stringify({
          goal,
          template: flag(args, "template"),
          cwd: flag(args, "cwd"),
          planGateRisk: flag(args, "risk"),
        }),
      });
      console.log(`task started: ${run.runId}`);
      console.log(`   court show ${run.runId}`);
      break;
    }
    case "runs": {
      const runs = await api("/api/runs");
      for (const r of runs) {
        const waiting = r.waiting.length ? `  ✋ ${r.waiting.join(",")}` : "";
        console.log(`${r.runId}  [${r.status}] ${r.done}/${r.nodeCount}  ${r.title}${waiting}`);
      }
      if (!runs.length) console.log("(no runs)");
      break;
    }
    case "show": {
      const run = await api(`/api/runs/${args[0]}`);
      console.log(`${run.mission.title}  [${run.status}]`);
      console.log(`goal: ${run.mission.goal}\n`);
      for (const node of Object.values(run.nodes) as any[]) {
        const icon = STATUS_ICON[node.status] ?? "?";
        console.log(`${icon} ${node.spec.id} (${node.spec.kind}${node.spec.role ? `:${node.spec.role}` : ""}) — ${node.status}`);
        if (node.output) console.log(`  ${String(node.output).slice(0, 200).replaceAll("\n", "\n  ")}`);
        if (node.error) console.log(`  ERROR: ${node.error}`);
      }
      break;
    }
    case "approve":
    case "deny": {
      const [runId, gateId, ...noteParts] = args;
      if (!runId || !gateId) throw new Error(`usage: court ${cmd} <runId> <gateId> [note]`);
      await api(`/api/runs/${runId}/gates/${gateId}`, {
        method: "POST",
        body: JSON.stringify({ approved: cmd === "approve", note: noteParts.join(" ") || undefined }),
      });
      console.log(cmd === "approve" ? "approved" : "denied");
      break;
    }
    case "cancel": {
      await api(`/api/runs/${args[0]}/cancel`, { method: "POST" });
      console.log("cancelled");
      break;
    }
    case "roles": {
      const roles = await api("/api/roles");
      for (const r of roles) console.log(`${r.id}  ${r.name}  runner=${r.policy.runner}`);
      break;
    }
    default:
      console.log("usage: court go|runs|show|approve|deny|cancel|roles");
      process.exit(cmd ? 1 : 0);
  }
} catch (e) {
  console.error(`error: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
