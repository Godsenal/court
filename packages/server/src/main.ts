import { readFileSync } from "node:fs";
import { Engine, type RunEvent, type RunState } from "@court/engine";
import {
  ClaudeAgentExecutor,
  CmuxClient,
  CodexAgentExecutor,
  DefaultToolExecutor,
  RoutingAgentExecutor,
  createGatewayLlm,
} from "@court/adapters";
import { createClaudeLlm } from "@court/adapters";
import { RunStore } from "./store.ts";
import { loadRoles } from "./roles.ts";
import { buildMission, type MissionInput } from "./templates.ts";
import { planGraph } from "./planner.ts";
import { startScheduler } from "./scheduler.ts";
import { FeedGateBridge } from "./feed-bridge.ts";
import { computeStats } from "./stats.ts";

// Assigned after the engine exists; the gatekeeper closure reads it lazily.
let feedBridge: FeedGateBridge | undefined;

const PORT = Number(process.env.COURT_PORT ?? 8433);

const store = new RunStore();
const roles = loadRoles();
const cmux = new CmuxClient();
// Gateway when configured (any provider/model), otherwise the local claude CLI.
const llm = process.env.AI_GATEWAY_API_KEY ? createGatewayLlm() : createClaudeLlm();
console.log(`[llm] ${process.env.AI_GATEWAY_API_KEY ? "vercel-ai-gateway" : "claude-cli fallback"}`);

const sockets = new Set<Bun.ServerWebSocket<unknown>>();
function broadcast(event: RunEvent, state: RunState): void {
  const message = JSON.stringify({ type: "run.event", event, run: summarize(state) });
  for (const ws of sockets) ws.send(message);
}

// Named runners for multi-account support: ~/.court/runners.json maps a name
// to {type: "claude"|"codex", env?: {...}} — e.g. a second Claude account via
// CLAUDE_CONFIG_DIR or a second Codex account via CODEX_HOME.
function loadRunners(): Record<string, ClaudeAgentExecutor | CodexAgentExecutor> {
  const base: Record<string, ClaudeAgentExecutor | CodexAgentExecutor> = {
    // COURT_VISIBLE=1 runs claude steps in visible cmux workspaces.
    claude: new ClaudeAgentExecutor({ cmux, visible: process.env.COURT_VISIBLE === "1" }),
    codex: new CodexAgentExecutor(),
  };
  const file = `${process.env.HOME}/.court/runners.json`;
  try {
    const defs = JSON.parse(readFileSync(file, "utf8")) as Record<
      string,
      { type: "claude" | "codex"; env?: Record<string, string>; bin?: string; extraArgs?: string[] }
    >;
    for (const [name, def] of Object.entries(defs)) {
      base[name] =
        def.type === "codex"
          ? new CodexAgentExecutor({ env: def.env, bin: def.bin, extraArgs: def.extraArgs })
          : new ClaudeAgentExecutor({ env: def.env, bin: def.bin, extraArgs: def.extraArgs, cmux, visible: process.env.COURT_VISIBLE === "1" });
    }
    console.log(`[runners] ${Object.keys(base).join(", ")}`);
  } catch {
    // no custom runners file — defaults only
  }
  return base;
}

const engine = new Engine({
  agent: new RoutingAgentExecutor(loadRunners(), llm),
  tool: new DefaultToolExecutor({
    // Browser tasks run as a headless Claude agent driving ego-browser
    // (isolated task spaces that reuse the user's login state).
    browser: async (task) =>
      new ClaudeAgentExecutor({ extraArgs: ["--allowedTools", "Bash", "Skill"] }).run({
        runId: "browser",
        node: { kind: "agent", id: "browser", dependsOn: [], role: "browser", tier: "executor", prompt: task },
        role: {
          id: "browser",
          name: "browser",
          systemPrompt:
            "You are a browser automation agent. Use the ego-browser skill (`ego-browser nodejs <<'EOF' ... EOF` heredocs via Bash) " +
            "to complete the web task. Create a task space, do the work, verify, then completeTaskSpace with keep:false. " +
            "Return a concise result summary as your final answer.",
          policy: { models: {}, runner: "claude", autoApproveBelow: "medium" },
        },
        model: "anthropic/claude-sonnet-5",
        prompt: task,
      }),
    // Computer-use tasks: a headless Claude agent using available screen-control
    // tools (mirroir MCP / cliclick / screencapture) — best-effort v1.
    computer: async (task) =>
      new ClaudeAgentExecutor({ extraArgs: ["--allowedTools", "Bash"] }).run({
        runId: "computer",
        node: { kind: "agent", id: "computer", dependsOn: [], role: "computer", tier: "executor", prompt: task },
        role: {
          id: "computer",
          name: "computer",
          systemPrompt:
            "You are a computer-use agent on macOS. Use Bash (screencapture for screenshots, cliclick or osascript for input, " +
            "`open` for apps) to complete the GUI task. Verify each step with a screenshot before proceeding. " +
            "Return a concise result summary.",
          policy: { models: {}, runner: "claude", autoApproveBelow: "medium" },
        },
        model: "anthropic/claude-sonnet-5",
        prompt: task,
      }),
  }),
  llm,
  gatekeeper: {
    // Engine already auto-approved by policy; here we surface the gate to the
    // human (desktop notification + cmux Feed question card) and wait.
    request: async (req) => {
      void cmux
        .notify({
          title: `👑 승인 필요: ${req.question}`,
          subtitle: `risk=${req.risk} · ${req.runId}`,
          body: req.context.slice(0, 300),
        })
        .catch(() => {});
      void feedBridge?.push(req);
      return null; // resolved via dashboard, CLI, or the Feed bridge
    },
  },
  roles,
  sink: (event, state) => {
    store.append(event);
    broadcast(event, state);
  },
});

// Rehydrate persisted runs so the dashboard shows history after restart.
for (const runId of store.listRunIds()) {
  try {
    engine.hydrate(store.load(runId));
  } catch (e) {
    console.error(`[hydrate] ${runId}: ${e}`);
  }
}
engine.recover();

// 반복 어명 — recurring missions from ~/.court/schedules.json.
startScheduler((mission) => {
  engine.start(buildMission(mission));
});

// cmux Feed ↔ gate bridge (one-click 윤허/불허 from the Feed sidebar).
feedBridge = new FeedGateBridge(cmux, engine);
feedBridge.start();

function summarize(run: RunState) {
  const nodes = Object.values(run.nodes);
  return {
    runId: run.runId,
    title: run.mission.title,
    goal: run.mission.goal,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    nodeCount: nodes.length,
    done: nodes.filter((n) => n.status === "completed").length,
    waiting: nodes.filter((n) => n.status === "waiting_human").map((n) => n.spec.id),
  };
}

// Model catalog: gateway list when a key is present, claude aliases otherwise.
let modelsCache: { at: number; models: string[] } | null = null;
async function listModels(): Promise<{ models: string[]; source: string }> {
  const fallback = ["anthropic/claude-opus-5", "anthropic/claude-sonnet-5", "anthropic/claude-haiku-4.5"];
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) return { models: fallback, source: "claude-cli" };
  if (modelsCache && Date.now() - modelsCache.at < 5 * 60_000) {
    return { models: modelsCache.models, source: "gateway" };
  }
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      headers: { authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = (await res.json()) as { data?: Array<{ id: string }> };
    const models = (data.data ?? []).map((m) => m.id).sort();
    if (models.length) {
      modelsCache = { at: Date.now(), models };
      return { models, source: "gateway" };
    }
  } catch (e) {
    console.error(`[models] gateway list failed: ${e}`);
  }
  return { models: fallback, source: "claude-cli" };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

const DASHBOARD_DIST = new URL("../../dashboard/dist/", import.meta.url).pathname;

async function serveDashboard(path: string): Promise<Response> {
  const rel = path === "/" ? "index.html" : path.slice(1);
  let file = Bun.file(DASHBOARD_DIST + rel);
  if (!(await file.exists())) file = Bun.file(DASHBOARD_DIST + "index.html");
  if (!(await file.exists())) {
    return new Response("dashboard not built — run: bun run --filter '@court/dashboard' build", { status: 404 });
  }
  return new Response(file);
}

const server = Bun.serve({
  port: PORT,
  fetch: async (req, srv) => {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/ws" && srv.upgrade(req)) return undefined as unknown as Response;

    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
    }

    if (path === "/api/health") return json({ ok: true, cmux: await cmux.available() });

    if (path === "/api/roles") return json([...roles.values()]);

    if (path === "/api/runs" && req.method === "GET") {
      return json(engine.listRuns().map(summarize));
    }

    if (path === "/api/stats" && req.method === "GET") {
      return json(computeStats(engine.listRuns()));
    }

    const runMatch = path.match(/^\/api\/runs\/([^/]+)$/);
    if (runMatch && req.method === "GET") {
      const run = engine.getRun(runMatch[1]!);
      return run ? json(run) : json({ error: "not found" }, 404);
    }

    if (path === "/api/missions" && req.method === "POST") {
      const input = (await req.json()) as MissionInput;
      if (!input.goal) return json({ error: "goal required" }, 400);
      if (input.template === "auto") {
        // Graph engineering: a planner model designs the graph for this goal.
        const plannerModel = roles.get("pm")?.policy.models.planner ?? "anthropic/claude-opus-5";
        try {
          input.graph = await planGraph(llm, input.goal, input.cwd, plannerModel);
          input.template = "custom";
        } catch (e) {
          return json({ error: `planner failed: ${e instanceof Error ? e.message : e}` }, 502);
        }
      }
      const mission = buildMission(input);
      const run = engine.start(mission);
      return json(summarize(run), 201);
    }

    // Follow-up: continue the conversation with a run's agent (resumes the CLI session).
    const followMatch = path.match(/^\/api\/runs\/([^/]+)\/follow-up$/);
    if (followMatch && req.method === "POST") {
      const runId = followMatch[1]!;
      const run = engine.getRun(runId);
      if (!run) return json({ error: "not found" }, 404);
      const body = (await req.json()) as { prompt: string; nodeId?: string };
      if (!body.prompt?.trim()) return json({ error: "prompt required" }, 400);
      const nodes = Object.values(run.nodes);
      const target = body.nodeId
        ? run.nodes[body.nodeId]
        : [...nodes].reverse().find((n) => n.spec.kind === "agent" && n.session?.sessionId);
      const seq = nodes.filter((n) => n.spec.id.startsWith("follow-")).length + 1;
      const resume = target?.session?.sessionId;
      try {
        engine.addNode(runId, {
          kind: "agent",
          id: `follow-${seq}`,
          dependsOn: [],
          title: `💬 팔로우업 ${seq}`,
          role: target?.spec.kind === "agent" ? target.spec.role : "developer",
          tier: "executor",
          cwd: target?.spec.kind === "agent" ? target.spec.cwd : undefined,
          runner: target?.spec.kind === "agent" ? target.spec.runner : undefined,
          resumeSessionId: resume,
          prompt: resume ? body.prompt : `Mission context:\n${run.mission.goal}\n\n${body.prompt}`,
        });
        return json({ ok: true, nodeId: `follow-${seq}`, resumed: Boolean(resume) });
      } catch (e) {
        return json({ error: String(e) }, 409);
      }
    }

    // Retry a failed/skipped node.
    const retryMatch = path.match(/^\/api\/runs\/([^/]+)\/nodes\/([^/]+)\/retry$/);
    if (retryMatch && req.method === "POST") {
      try {
        engine.retryNode(retryMatch[1]!, decodeURIComponent(retryMatch[2]!));
        return json({ ok: true });
      } catch (e) {
        return json({ error: String(e) }, 409);
      }
    }

    // Archive (remove from the live list; JSONL moves to runs/archive/).
    const archiveMatch = path.match(/^\/api\/runs\/([^/]+)$/);
    if (archiveMatch && req.method === "DELETE") {
      const runId = archiveMatch[1]!;
      engine.remove(runId);
      try {
        const { renameSync, mkdirSync: mkdir } = await import("node:fs");
        mkdir(`${store.dir}/archive`, { recursive: true });
        renameSync(`${store.dir}/${runId}.jsonl`, `${store.dir}/archive/${runId}.jsonl`);
      } catch {
        // already archived or never persisted
      }
      return json({ ok: true });
    }

    // Working-tree diff for the run's workdirs.
    const diffMatch = path.match(/^\/api\/runs\/([^/]+)\/diff$/);
    if (diffMatch && req.method === "GET") {
      const run = engine.getRun(diffMatch[1]!);
      if (!run) return json({ error: "not found" }, 404);
      const cwds = [...new Set(Object.values(run.nodes).map((n) => ("cwd" in n.spec ? n.spec.cwd : undefined)).filter(Boolean))] as string[];
      const diffs = [];
      for (const cwd of cwds) {
        const proc = Bun.spawn(["git", "-C", cwd, "diff", "HEAD"], { stdout: "pipe", stderr: "pipe" });
        const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
        const statusProc = Bun.spawn(["git", "-C", cwd, "status", "--short"], { stdout: "pipe", stderr: "pipe" });
        const [status] = await Promise.all([new Response(statusProc.stdout).text(), statusProc.exited]);
        if (code === 0) diffs.push({ cwd, status: status.trim(), diff: out.slice(0, 200_000) });
      }
      return json({ diffs });
    }

    if (path === "/api/models" && req.method === "GET") {
      return json(await listModels());
    }

    const rolePutMatch = path.match(/^\/api\/roles\/([^/]+)$/);
    if (rolePutMatch && req.method === "PUT") {
      const role = (await req.json()) as import("@court/engine").Role;
      if (!role?.id || role.id !== rolePutMatch[1]) return json({ error: "role id mismatch" }, 400);
      if (!role.systemPrompt || !role.policy?.runner) return json({ error: "systemPrompt and policy.runner required" }, 400);
      const dir = `${process.env.HOME}/.court/roles`;
      const { mkdirSync: mkdir, writeFileSync } = await import("node:fs");
      mkdir(dir, { recursive: true });
      writeFileSync(`${dir}/${role.id}.json`, JSON.stringify(role, null, 2));
      roles.set(role.id, role);
      return json({ ok: true });
    }

    if (path === "/api/schedules") {
      const file = `${process.env.HOME}/.court/schedules.json`;
      const stateFile = `${process.env.HOME}/.court/schedules-state.json`;
      const { readFileSync: read, writeFileSync, existsSync } = await import("node:fs");
      if (req.method === "GET") {
        const schedules = existsSync(file) ? JSON.parse(read(file, "utf8")) : [];
        const state = existsSync(stateFile) ? JSON.parse(read(stateFile, "utf8")) : { lastRun: {} };
        return json({ schedules, lastRun: state.lastRun ?? {} });
      }
      if (req.method === "PUT") {
        const body = await req.json();
        if (!Array.isArray(body)) return json({ error: "expected an array of schedules" }, 400);
        writeFileSync(file, JSON.stringify(body, null, 2));
        return json({ ok: true });
      }
    }

    const gateMatch = path.match(/^\/api\/runs\/([^/]+)\/gates\/([^/]+)$/);
    if (gateMatch && req.method === "POST") {
      const body = (await req.json()) as { approved: boolean; note?: string };
      try {
        engine.resolveGate(gateMatch[1]!, gateMatch[2]!, body.approved, body.note);
        return json({ ok: true });
      } catch (e) {
        return json({ error: String(e) }, 409);
      }
    }

    const cancelMatch = path.match(/^\/api\/runs\/([^/]+)\/cancel$/);
    if (cancelMatch && req.method === "POST") {
      engine.cancel(cancelMatch[1]!);
      return json({ ok: true });
    }

    if (!path.startsWith("/api/")) return serveDashboard(path);

    return json({ error: "not found" }, 404);
  },
  websocket: {
    open: (ws) => {
      sockets.add(ws);
      ws.send(JSON.stringify({ type: "snapshot", runs: engine.listRuns().map(summarize) }));
    },
    close: (ws) => {
      sockets.delete(ws);
    },
    message: () => {},
  },
});

console.log(`⚖️  court server on http://localhost:${server.port}`);
