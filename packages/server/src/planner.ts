import { validateGraph, type GraphSpec, type LlmCall } from "@court/engine";

const GRAPH_DSL = `You design work graphs for an AI orchestration engine. Output ONLY a JSON object: {"nodes":[...]}.

Node kinds:
- {"kind":"agent","id":string,"dependsOn":[ids],"role":"pm|designer|developer|reviewer|researcher","tier":"planner|executor|cheap","prompt":string,"cwd"?:string,"runner"?:"claude|codex|llm","title"?:string}
  · role "developer" runs a real coding agent (claude) with file/shell access in cwd; other roles are text-only LLM steps.
  · Prompts may reference upstream outputs with {{nodeId}}.
- {"kind":"gate","id","dependsOn","risk":"low|medium|high|critical","question":string,"contextFrom"?:[ids],"title"?} — human approval. Use risk "high" before irreversible/external actions (deploys, publishing, deleting), "low" for routine checkpoints.
- {"kind":"judge","id","dependsOn","subject":nodeId,"criteria":string,"votes":3,"tier":"cheap","role":"reviewer","title"?} — verification panel; put one after significant build steps.
- {"kind":"fanout","id","dependsOn","itemsFrom":nodeId,"template":{agent node sans id/dependsOn},"title"?} — parallel map over a JSON-array output.
- {"kind":"loop","id","dependsOn","body":{agent node sans id/dependsOn},"until":string,"maxIterations":number,"title"?} — iterate until condition.
- {"kind":"tool","id","dependsOn","tool":"shell|browser|computer","input":string,"cwd"?,"title"?} — browser = natural-language web task via ego-browser.

Rules:
- 2-8 nodes. Use the fewest that genuinely fit the goal. dependsOn must reference existing ids; no cycles.
- Delegate thinking to tier "planner", doing to "executor", cheap checks to "cheap".
- Korean titles, English prompts. Include acceptance criteria in build prompts.
- If a working directory is given, set cwd on developer/tool nodes and mention it in prompts.`;

/** Ask a planner model to design the graph for a goal ("graph engineering"). */
export async function planGraph(llm: LlmCall, goal: string, cwd: string | undefined, plannerModel: string): Promise<GraphSpec> {
  const prompt = `Goal:\n${goal}\n${cwd ? `\nWorking directory: ${cwd}` : ""}\n\nDesign the graph. Output ONLY the JSON object.`;
  const raw = await llm(plannerModel, GRAPH_DSL, prompt);
  const graph = extractJson(raw);
  validateGraph(graph);
  return graph;
}

function extractJson(raw: string): GraphSpec {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error(`planner returned no JSON: ${raw.slice(0, 200)}`);
  const parsed = JSON.parse(raw.slice(start, end + 1)) as GraphSpec;
  if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) throw new Error("planner graph has no nodes");
  return parsed;
}
