import { useEffect, useState } from "react";
import { api } from "../api.ts";
import type { RunSummary } from "../types.ts";
import { useToast } from "./Toast.tsx";

const TEMPLATES = [
  { id: "auto", label: "자동 설계", desc: "재상이 목표에 맞는 그래프를 직접 설계" },
  { id: "pipeline", label: "파이프라인", desc: "계획 → 결재 → 구현 → 검수" },
  { id: "breakdown", label: "분할 정복", desc: "작업 분해 → 병렬 구현 → 검수" },
  { id: "polish", label: "반복 개선", desc: "만족할 때까지 개선 루프" },
];

const RECENT_KEY = "court.recentCwds";

function recentCwds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function NewMission({ onClose, onStarted }: { onClose: () => void; onStarted: (runId: string) => void }) {
  const toast = useToast();
  const [goal, setGoal] = useState("");
  const [cwd, setCwd] = useState("");
  const [template, setTemplate] = useState("auto");
  const [risk, setRisk] = useState("high");
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<{ models: string[]; source: string } | null>(null);

  useEffect(() => {
    api<{ models: string[]; source: string }>("/models").then(setModels).catch(() => {});
  }, []);

  const submit = async () => {
    if (!goal.trim() || busy) return;
    setBusy(true);
    try {
      const run = await api<RunSummary>("/missions", {
        method: "POST",
        body: JSON.stringify({
          goal: goal.trim(),
          cwd: cwd.trim() || undefined,
          template,
          planGateRisk: risk,
        }),
      });
      if (cwd.trim()) {
        const next = [cwd.trim(), ...recentCwds().filter((c) => c !== cwd.trim())].slice(0, 8);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      }
      toast(template === "auto" ? "재상이 그래프를 설계했습니다" : "어명을 내렸습니다");
      onStarted(run.runId);
    } catch (e) {
      toast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-ink/70 p-8 pt-[10vh]" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-2xl"
        style={{ animation: "fade-up 250ms cubic-bezier(0.23,1,0.32,1) both" }}
      >
        <header className="border-b border-line px-5 py-3.5">
          <h3 className="text-[15px] font-semibold">📜 새 어명</h3>
          <p className="mt-0.5 text-[12px] text-faint">목표를 내리면 신하들이 알아서 일합니다</p>
        </header>
        <div className="p-5">
          <textarea
            autoFocus
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
            placeholder="예: kr-it-jobs 저장소에 다크모드 토글을 추가해줘"
            rows={3}
            className="w-full rounded-xl border border-line bg-ink/60 px-3.5 py-2.5 text-[13.5px] leading-relaxed outline-none placeholder:text-faint focus:border-gold/50"
          />

          <div className="mt-3 grid grid-cols-2 gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  template === t.id ? "border-gold/60 bg-gold/10" : "border-line bg-panel-2 hover:bg-panel-3"
                }`}
              >
                <span className="block text-[13px] font-medium">{t.label}</span>
                <span className="mt-0.5 block text-[11px] leading-tight text-faint">{t.desc}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex gap-3">
            <label className="flex-1 text-[11.5px] text-dim">
              작업 디렉토리 (선택)
              <input
                list="recent-cwds"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder="/Users/lth/LTH/…"
                className="mt-1 w-full rounded-lg border border-line bg-ink/60 px-3 py-2 font-mono text-[12px] text-fg outline-none placeholder:text-faint focus:border-gold/50"
              />
              <datalist id="recent-cwds">
                {recentCwds().map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="text-[11.5px] text-dim">
              계획 결재
              <select
                value={risk}
                onChange={(e) => setRisk(e.target.value)}
                className="mt-1 block rounded-lg border border-line bg-ink/60 px-3 py-2 text-[12.5px] text-fg outline-none focus:border-gold/50"
              >
                <option value="low">자동 진행</option>
                <option value="high">내가 결재</option>
              </select>
            </label>
          </div>

          {models && (
            <p className="mt-3 text-[11px] text-faint">
              모델 {models.models.length}종 사용 가능 ·{" "}
              {models.source === "gateway" ? "Vercel AI Gateway" : "Claude (게이트웨이 키를 설정하면 전 모델 개방)"}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between">
            <span className="font-mono text-[11px] text-faint">⌘↵ 전송 · Esc 닫기</span>
            <button
              disabled={busy || !goal.trim()}
              onClick={submit}
              className="rounded-xl bg-gold px-5 py-2 text-[13.5px] font-semibold text-ink transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? (template === "auto" ? "재상이 설계 중…" : "하명 중…") : "어명 내리기"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
