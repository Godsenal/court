import { useEffect, useMemo, useRef, useState } from "react";
import type { RunSummary } from "../types.ts";
import { StatusDot } from "./status.tsx";

interface Action {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function Palette({
  runs,
  onClose,
  onOpenRun,
  onCompose,
  onView,
}: {
  runs: RunSummary[];
  onClose: () => void;
  onOpenRun: (id: string) => void;
  onCompose: () => void;
  onView: (view: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const actions: Action[] = useMemo(
    () => [
      { id: "new", label: "📜 새 어명 내리기", hint: "⌘N", run: onCompose },
      { id: "view-runs", label: "📜 어명 보기", run: () => onView("runs") },
      { id: "view-roles", label: "🎭 신하(역할) 관리", run: () => onView("roles") },
      { id: "view-schedules", label: "⏰ 반복 어명 관리", run: () => onView("schedules") },
    ],
    [onCompose, onView],
  );

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const acts = actions.filter((a) => !q || a.label.toLowerCase().includes(q));
    const runItems = runs
      .filter((r) => !q || r.title.toLowerCase().includes(q) || r.runId.includes(q))
      .slice(0, 8)
      .map((r) => ({
        id: r.runId,
        label: r.title,
        status: r.status,
        run: () => {
          onOpenRun(r.runId);
          onClose();
        },
      }));
    return [...acts.map((a) => ({ ...a, status: null as string | null })), ...runItems];
  }, [query, actions, runs, onOpenRun, onClose]);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setCursor(0), [query]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[cursor]?.run();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/60 pt-[16vh]" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-2xl"
        style={{ animation: "fade-up 200ms cubic-bezier(0.23,1,0.32,1) both" }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder="명령 또는 어명 검색…"
          className="w-full border-b border-line bg-transparent px-4 py-3 text-[14px] outline-none placeholder:text-faint"
        />
        <ul className="max-h-80 overflow-y-auto py-1.5">
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                onMouseEnter={() => setCursor(i)}
                onClick={() => {
                  item.run();
                  onClose();
                }}
                className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] ${i === cursor ? "bg-panel-3" : ""}`}
              >
                {item.status !== null && item.status !== undefined ? <StatusDot status={item.status} /> : null}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {"hint" in item && item.hint && <span className="font-mono text-[11px] text-faint">{item.hint}</span>}
              </button>
            </li>
          ))}
          {!items.length && <li className="px-4 py-6 text-center text-[13px] text-faint">결과 없음</li>}
        </ul>
      </div>
    </div>
  );
}
