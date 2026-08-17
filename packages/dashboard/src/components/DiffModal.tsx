import { useEffect, useState } from "react";
import { api } from "../api.ts";

interface DiffEntry {
  cwd: string;
  status: string;
  diff: string;
}

export function DiffModal({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [diffs, setDiffs] = useState<DiffEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ diffs: DiffEntry[] }>(`/runs/${runId}/diff`)
      .then((d) => setDiffs(d.diffs))
      .catch((e) => setError(String(e instanceof Error ? e.message : e)));
  }, [runId]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/70 p-8" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-2xl"
        style={{ animation: "fade-up 250ms cubic-bezier(0.23,1,0.32,1) both" }}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h3 className="text-[15px] font-semibold">작업 디렉토리 변경사항</h3>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-dim transition hover:bg-panel-2 hover:text-fg">✕</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error && <p className="text-[13px] text-ruby">{error}</p>}
          {!diffs && !error && <p className="text-[13px] text-faint">불러오는 중…</p>}
          {diffs?.length === 0 && <p className="text-[13px] text-faint">이 어명에 연결된 git 작업 디렉토리가 없습니다.</p>}
          {diffs?.map((entry) => (
            <section key={entry.cwd} className="mb-5">
              <h4 className="mb-1.5 font-mono text-[12px] text-sky">{entry.cwd}</h4>
              {entry.status ? (
                <>
                  <pre className="mb-2 rounded-lg bg-ink/50 p-3 font-mono text-[11.5px] text-dim">{entry.status}</pre>
                  <pre className="overflow-x-auto rounded-lg bg-ink/50 p-3 font-mono text-[11.5px] leading-relaxed">
                    {entry.diff.split("\n").map((line, i) => (
                      <span
                        key={i}
                        className={
                          line.startsWith("+") && !line.startsWith("+++")
                            ? "diff-line-add"
                            : line.startsWith("-") && !line.startsWith("---")
                              ? "diff-line-del"
                              : line.startsWith("@@") || line.startsWith("diff ")
                                ? "diff-line-meta"
                                : ""
                        }
                      >
                        {line}
                        {"\n"}
                      </span>
                    ))}
                  </pre>
                </>
              ) : (
                <p className="text-[12.5px] text-faint">커밋되지 않은 변경 없음</p>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
