import { useState } from "react";
import type { NodeState, RunDetailData } from "../types.ts";
import { api } from "../api.ts";
import { KIND_ICON, ROLE_LABEL, StatusChip } from "./status.tsx";

/** Topologically ordered node list (falls back to insertion order). */
function orderedNodes(run: RunDetailData): NodeState[] {
  return Object.values(run.nodes);
}

export function RunDetail({ run }: { run: RunDetailData }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{run.mission.title}</h2>
          <StatusChip status={run.status} />
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm text-dim">{run.mission.goal}</p>
      </header>
      <ol className="space-y-3">
        {orderedNodes(run).map((node) => (
          <NodeCard key={node.spec.id} runId={run.runId} node={node} />
        ))}
      </ol>
    </div>
  );
}

function NodeCard({ runId, node }: { runId: string; node: NodeState }) {
  const [open, setOpen] = useState(false);
  const icon = KIND_ICON[node.spec.kind] ?? "•";
  const role = node.spec.role ? (ROLE_LABEL[node.spec.role] ?? node.spec.role) : null;
  const isGateWaiting = node.spec.kind === "gate" && node.status === "waiting_human";

  return (
    <li className="rounded-xl border border-line bg-panel">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="text-lg">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{node.spec.title ?? node.spec.id}</span>
            {role && <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[11px] text-dim">{role}</span>}
            {node.session?.runner && (
              <span className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-dim">{node.session.runner}</span>
            )}
            {node.session?.model && (
              <span className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-sky/80">{node.session.model}</span>
            )}
          </div>
          <span className="font-mono text-[11px] text-dim">{node.spec.id}</span>
        </div>
        <StatusChip status={node.status} />
      </button>

      {isGateWaiting && <ApprovalCard runId={runId} node={node} />}

      {open && (node.output || node.error) && (
        <div className="border-t border-line px-4 py-3">
          {node.error && <pre className="mb-2 whitespace-pre-wrap font-mono text-xs text-ruby">{node.error}</pre>}
          {node.output && (
            <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-fg/90">
              {node.output}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}

function ApprovalCard({ runId, node }: { runId: string; node: NodeState }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const decide = async (approved: boolean) => {
    setBusy(true);
    try {
      await api(`/runs/${runId}/gates/${node.spec.id}`, {
        method: "POST",
        body: JSON.stringify({ approved, note: note || undefined }),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-amber/30 bg-amber/5 px-4 py-3">
      <p className="text-sm font-medium text-amber">✋ {node.spec.question ?? "승인이 필요합니다"}</p>
      {node.spec.risk && <p className="mt-0.5 text-xs text-dim">위험도: {node.spec.risk}</p>}
      <div className="mt-2 flex gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="메모 (선택)"
          className="min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm outline-none placeholder:text-dim/60 focus:border-gold/50"
        />
        <button
          disabled={busy}
          onClick={() => decide(true)}
          className="rounded-lg bg-jade/90 px-4 py-1.5 text-sm font-medium text-ink transition hover:bg-jade disabled:opacity-50"
        >
          윤허
        </button>
        <button
          disabled={busy}
          onClick={() => decide(false)}
          className="rounded-lg bg-ruby/80 px-4 py-1.5 text-sm font-medium text-ink transition hover:bg-ruby disabled:opacity-50"
        >
          불허
        </button>
      </div>
    </div>
  );
}
