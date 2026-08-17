import { useState } from "react";
import { api } from "../api.ts";
import type { RunSummary } from "../types.ts";

const TEMPLATES = [
  { id: "auto", label: "자동 설계", desc: "재상이 목표에 맞는 그래프를 직접 설계" },
  { id: "pipeline", label: "파이프라인", desc: "계획 → 승인 → 구현 → 검수" },
  { id: "breakdown", label: "분할 정복", desc: "작업 분해 → 병렬 구현 → 검수" },
  { id: "polish", label: "반복 개선", desc: "만족할 때까지 개선 루프" },
];

export function NewMission({ onStarted }: { onStarted: (runId: string) => void }) {
  const [goal, setGoal] = useState("");
  const [cwd, setCwd] = useState("");
  const [template, setTemplate] = useState("pipeline");
  const [risk, setRisk] = useState("high");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!goal.trim()) return;
    setBusy(true);
    setError(null);
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
      onStarted(run.runId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h2 className="text-xl font-semibold tracking-tight">📜 새 어명</h2>
      <p className="mt-1 text-sm text-dim">목표를 내리면 신하들이 알아서 일합니다.</p>

      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="예: kr-it-jobs 저장소에 다크모드 토글을 추가해줘"
        rows={4}
        className="mt-5 w-full rounded-xl border border-line bg-panel px-4 py-3 text-sm outline-none placeholder:text-dim/60 focus:border-gold/50"
      />

      <div className="mt-4 grid grid-cols-2 gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => setTemplate(t.id)}
            className={`rounded-xl border px-3 py-2.5 text-left transition ${
              template === t.id ? "border-gold/60 bg-gold/10" : "border-line bg-panel hover:bg-panel-2"
            }`}
          >
            <span className="block text-sm font-medium">{t.label}</span>
            <span className="mt-0.5 block text-[11px] leading-tight text-dim">{t.desc}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-3">
        <label className="flex-1 text-xs text-dim">
          작업 디렉토리 (선택)
          <input
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="/Users/lth/LTH/…"
            className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 font-mono text-xs text-fg outline-none placeholder:text-dim/50 focus:border-gold/50"
          />
        </label>
        <label className="text-xs text-dim">
          계획 승인
          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
            className="mt-1 block rounded-lg border border-line bg-panel px-3 py-2 text-xs text-fg outline-none focus:border-gold/50"
          >
            <option value="low">자동 진행</option>
            <option value="high">내가 승인</option>
          </select>
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-ruby">{error}</p>}

      <button
        disabled={busy || !goal.trim()}
        onClick={submit}
        className="mt-5 w-full rounded-xl bg-gold py-2.5 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-40"
      >
        {busy ? "하명 중…" : "어명 내리기 👑"}
      </button>
    </div>
  );
}
