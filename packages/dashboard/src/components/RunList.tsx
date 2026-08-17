import { useMemo, useState } from "react";
import type { RunSummary } from "../types.ts";
import { timeAgo } from "../api.ts";
import { StatusDot } from "./status.tsx";

const GROUPS: Array<{ id: string; label: string; match: (r: RunSummary) => boolean }> = [
  { id: "waiting", label: "✋ 승인 대기", match: (r) => r.status === "waiting_human" },
  { id: "running", label: "진행 중", match: (r) => r.status === "running" },
  { id: "done", label: "지난 어명", match: (r) => !["waiting_human", "running"].includes(r.status) },
];

export function RunColumn({
  runs,
  selected,
  onSelect,
  onCompose,
}: {
  runs: RunSummary[];
  selected: string | null;
  onSelect: (id: string) => void;
  onCompose: () => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return runs;
    return runs.filter((r) => r.title.toLowerCase().includes(q) || r.goal.toLowerCase().includes(q) || r.runId.includes(q));
  }, [runs, query]);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-panel">
      <header className="border-b border-line p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight">어전회의</h1>
            <p className="text-[11px] text-faint">AI 궁정 관제</p>
          </div>
          <button
            onClick={onCompose}
            className="rounded-lg bg-gold px-3 py-1.5 text-[13px] font-semibold text-ink transition hover:brightness-110"
          >
            ＋ 어명
          </button>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="어명 검색…"
          className="mt-2.5 w-full rounded-lg border border-line bg-ink/60 px-3 py-1.5 text-[13px] outline-none placeholder:text-faint focus:border-gold/50"
        />
      </header>
      <div className="flex-1 overflow-y-auto pb-4">
        {GROUPS.map((group) => {
          const items = filtered.filter(group.match);
          if (!items.length) return null;
          return (
            <section key={group.id}>
              <h2 className={`px-4 pb-1 pt-3.5 text-[11px] font-medium tracking-wide ${group.id === "waiting" ? "text-amber" : "text-faint"}`}>
                {group.label} · {items.length}
              </h2>
              {items.map((run) => (
                <RunRow key={run.runId} run={run} active={selected === run.runId} onSelect={onSelect} />
              ))}
            </section>
          );
        })}
        {!filtered.length && (
          <p className="px-4 py-8 text-center text-[13px] text-faint">
            {query ? `"${query}"에 맞는 어명이 없습니다` : "아직 어명이 없습니다 — ＋ 어명으로 시작"}
          </p>
        )}
      </div>
    </aside>
  );
}

function RunRow({ run, active, onSelect }: { run: RunSummary; active: boolean; onSelect: (id: string) => void }) {
  const pct = run.nodeCount === 0 ? 0 : Math.round((run.done / run.nodeCount) * 100);
  return (
    <button
      onClick={() => onSelect(run.runId)}
      className={`block w-full px-4 py-2.5 text-left transition ${
        active ? "bg-panel-3 shadow-[inset_2px_0_0_var(--color-gold)]" : "hover:bg-panel-2"
      }`}
    >
      <div className="flex items-center gap-2">
        <StatusDot status={run.status} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{run.title}</span>
        <span className="shrink-0 font-mono text-[10.5px] text-faint">{timeAgo(run.updatedAt)}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 pl-4">
        <span className={`h-[3px] flex-1 overflow-hidden rounded-full ${run.status === "running" ? "shimmer-line" : "bg-line"}`}>
          <span
            className={`block h-full rounded-full transition-all ${run.status === "failed" ? "bg-ruby/70" : "bg-gold/80"}`}
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className="font-mono text-[10.5px] tabular-nums text-faint">
          {run.done}/{run.nodeCount}
        </span>
        {run.waiting.length > 0 && <span className="text-[11px] text-amber">✋</span>}
      </div>
    </button>
  );
}
