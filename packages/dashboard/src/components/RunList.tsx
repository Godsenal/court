import type { RunSummary } from "../types.ts";
import { StatusDot } from "./status.tsx";

export function RunList({
  runs,
  selected,
  onSelect,
}: {
  runs: RunSummary[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      {runs.length === 0 && <p className="px-4 py-6 text-sm text-dim">아직 런이 없습니다</p>}
      {runs.map((run) => (
        <button
          key={run.runId}
          onClick={() => onSelect(run.runId)}
          className={`block w-full border-b border-line/60 px-4 py-3 text-left transition hover:bg-panel-2 ${
            selected === run.runId ? "bg-panel-2" : ""
          }`}
        >
          <div className="flex items-center gap-2">
            <StatusDot status={run.status} />
            <span className="truncate text-sm font-medium">{run.title}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-dim">
            <span>
              {run.done}/{run.nodeCount}
            </span>
            <Progress done={run.done} total={run.nodeCount} />
            {run.waiting.length > 0 && <span className="text-amber">✋ {run.waiting.length}</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
      <span className="block h-full rounded-full bg-gold/80 transition-all" style={{ width: `${pct}%` }} />
    </span>
  );
}
