import { useState } from "react";
import type { NodeState, RunDetailData } from "../types.ts";
import { api } from "../api.ts";
import { KIND_ICON, ROLE_LABEL, StatusChip } from "./status.tsx";
import { CheckIcon, Chevron, Disclosure, HandIcon, Pill, SkipIcon, SpinnerRing, StatusBadge, XIcon } from "./bui.tsx";

export function RunDetail({ run }: { run: RunDetailData }) {
  const nodes = Object.values(run.nodes);
  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{run.mission.title}</h2>
          <StatusChip status={run.status} />
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm text-dim">{run.mission.goal}</p>
      </header>
      <ol className="flex flex-col gap-2">
        {nodes.map((node, i) => (
          <NodeRow key={node.spec.id} runId={run.runId} node={node} index={i} />
        ))}
      </ol>
    </div>
  );
}

function badgeFor(node: NodeState, index: number) {
  switch (node.status) {
    case "running":
      return <SpinnerRing active>{index + 1}</SpinnerRing>;
    case "completed":
      return <StatusBadge tone="jade">{CheckIcon}</StatusBadge>;
    case "failed":
      return <StatusBadge tone="ruby">{XIcon}</StatusBadge>;
    case "waiting_human":
      return <StatusBadge tone="amber">{HandIcon}</StatusBadge>;
    case "skipped":
      return <StatusBadge tone="dim">{SkipIcon}</StatusBadge>;
    default:
      return <SpinnerRing>{index + 1}</SpinnerRing>;
  }
}

function pillFor(node: NodeState) {
  switch (node.status) {
    case "completed":
      return <Pill tone="jade">완료</Pill>;
    case "failed":
      return <Pill tone="ruby">실패</Pill>;
    case "waiting_human":
      return <Pill tone="amber">승인 대기</Pill>;
    case "skipped":
      return <Pill tone="dim">건너뜀</Pill>;
    default:
      return null;
  }
}

function durationOf(node: NodeState): string | null {
  if (!node.startedAt) return null;
  const end = node.endedAt ? Date.parse(node.endedAt) : Date.now();
  const sec = Math.max(0, Math.round((end - Date.parse(node.startedAt)) / 1000));
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m${sec % 60}s`;
}

function NodeRow({ runId, node, index }: { runId: string; node: NodeState; index: number }) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const isGateWaiting = node.spec.kind === "gate" && node.status === "waiting_human";
  const hasBody = Boolean(node.output || node.error || isGateWaiting);
  const open = manualOpen ?? isGateWaiting;
  const role = node.spec.role ? (ROLE_LABEL[node.spec.role] ?? node.spec.role) : null;
  const duration = durationOf(node);

  return (
    <li
      className="self-stretch overflow-hidden bg-panel transition-[border-radius] duration-300"
      style={{
        borderRadius: open ? 14 : 22,
        animation: `fade-up 450ms cubic-bezier(0.23,1,0.32,1) ${index * 80}ms both`,
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => hasBody && setManualOpen(!open)}
        className="flex h-11 w-full items-center gap-2.5 px-2.5 text-left transition-colors duration-100 hover:bg-panel-2"
      >
        <span className="flex size-6 shrink-0 items-center justify-center">{badgeFor(node, index)}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
          <span className="mr-1.5">{KIND_ICON[node.spec.kind] ?? "•"}</span>
          {node.spec.title ?? node.spec.id}
        </span>
        {role && <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[11px] text-dim">{role}</span>}
        {node.session?.model && (
          <span className="hidden rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[10.5px] text-sky/80 sm:inline">
            {node.session.model.split("/").pop()}
          </span>
        )}
        {duration && <span className="font-mono text-[11.5px] tabular-nums text-dim">{duration}</span>}
        {pillFor(node)}
        {hasBody && <Chevron open={open} />}
      </button>

      <Disclosure open={open}>
        {isGateWaiting && <ApprovalCard runId={runId} node={node} />}
        {(node.output || node.error) && (
          <div className="mb-2.5 grid grid-cols-[24px_1fr] gap-2.5 px-2.5">
            <span aria-hidden className="mx-auto h-full w-px bg-line" />
            <div className="min-w-0">
              {node.error && <pre className="mb-2 whitespace-pre-wrap font-mono text-xs text-ruby">{node.error}</pre>}
              {node.output && (
                <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-fg/90">
                  {node.output}
                </pre>
              )}
            </div>
          </div>
        )}
      </Disclosure>
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
    <div className="mx-2.5 mb-2.5 rounded-xl border border-amber/30 bg-amber/5 px-3.5 py-3">
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
