import { useEffect, useState } from "react";
import { useLiveRuns } from "./api.ts";
import { RunColumn } from "./components/RunList.tsx";
import { RunView } from "./components/RunView.tsx";
import { NewMission } from "./components/NewMission.tsx";
import { RolesView } from "./components/RolesView.tsx";
import { SchedulesView } from "./components/SchedulesView.tsx";
import { Palette } from "./components/Palette.tsx";
import { ToastProvider } from "./components/Toast.tsx";

type View = "runs" | "roles" | "schedules";

const RAIL: Array<{ id: View; icon: string; label: string }> = [
  { id: "runs", icon: "📜", label: "어명" },
  { id: "roles", icon: "🎭", label: "신하" },
  { id: "schedules", icon: "⏰", label: "반복" },
];

export default function App() {
  const { runs, drop } = useLiveRuns();
  const [view, setView] = useState<View>("runs");
  const [selected, setSelected] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Keep a selection once runs arrive.
  useEffect(() => {
    if (view === "runs" && !selected && runs.length) setSelected(runs[0]!.runId);
  }, [runs, selected, view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (mod && e.key === "n") {
        e.preventDefault();
        setComposing(true);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
        setComposing(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openRun = (id: string) => {
    setView("runs");
    setSelected(id);
    setComposing(false);
  };

  return (
    <ToastProvider>
      <div className="flex h-full">
        {/* rail */}
        <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-3">
          <span className="mb-2 text-xl" title="court">👑</span>
          {RAIL.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              title={item.label}
              className={`flex size-10 items-center justify-center rounded-xl text-lg transition ${
                view === item.id ? "bg-panel-3 shadow-[inset_0_0_0_1px_var(--color-line-strong)]" : "opacity-60 hover:bg-panel-2 hover:opacity-100"
              }`}
            >
              {item.icon}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => setPaletteOpen(true)}
            title="명령 팔레트 (⌘K)"
            className="flex size-10 items-center justify-center rounded-xl font-mono text-[11px] text-dim transition hover:bg-panel-2 hover:text-fg"
          >
            ⌘K
          </button>
        </nav>

        {view === "runs" && (
          <RunColumn runs={runs} selected={selected} onSelect={openRun} onCompose={() => setComposing(true)} />
        )}

        <main className="min-w-0 flex-1 overflow-hidden">
          {view === "roles" ? (
            <RolesView />
          ) : view === "schedules" ? (
            <SchedulesView onOpenRun={openRun} />
          ) : selected ? (
            <RunView runId={selected} onArchived={(id) => { drop(id); setSelected(null); }} />
          ) : (
            <EmptyState onCompose={() => setComposing(true)} />
          )}
        </main>
      </div>

      {composing && (
        <NewMission
          onClose={() => setComposing(false)}
          onStarted={(runId) => {
            setComposing(false);
            openRun(runId);
          }}
        />
      )}
      {paletteOpen && (
        <Palette
          runs={runs}
          onClose={() => setPaletteOpen(false)}
          onOpenRun={openRun}
          onCompose={() => { setPaletteOpen(false); setComposing(true); }}
          onView={(v) => { setView(v as View); setPaletteOpen(false); }}
        />
      )}
    </ToastProvider>
  );
}

function EmptyState({ onCompose }: { onCompose: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <span className="text-5xl">🏯</span>
      <p className="text-dim">아직 선택된 어명이 없습니다</p>
      <button
        onClick={onCompose}
        className="rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110"
      >
        새 어명 내리기 <span className="ml-1 font-mono text-[11px] opacity-70">⌘N</span>
      </button>
    </div>
  );
}
