import { useState } from "react";
import { useLiveRuns, useRunDetail } from "./api.ts";
import { RunList } from "./components/RunList.tsx";
import { RunDetail } from "./components/RunDetail.tsx";
import { NewMission } from "./components/NewMission.tsx";

export default function App() {
  const { runs, tick } = useLiveRuns();
  const [selected, setSelected] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const detail = useRunDetail(selected, tick);

  return (
    <div className="flex h-full">
      <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-panel">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              <span className="mr-1.5">👑</span>court
            </h1>
            <p className="text-xs text-dim">어전회의 — AI 궁정 관제</p>
          </div>
          <button
            onClick={() => setComposing(true)}
            className="rounded-lg bg-gold/90 px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-gold"
          >
            ＋ 어명
          </button>
        </header>
        <RunList runs={runs} selected={selected} onSelect={(id) => { setSelected(id); setComposing(false); }} />
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        {composing ? (
          <NewMission
            onStarted={(runId) => {
              setComposing(false);
              setSelected(runId);
            }}
          />
        ) : detail ? (
          <RunDetail run={detail} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-dim">
            <span className="text-4xl">🏯</span>
            <p>런을 선택하거나 새 어명을 내리세요</p>
          </div>
        )}
      </main>
    </div>
  );
}
