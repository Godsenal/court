import { useEffect, useRef, useState } from "react";
import type { NodeState, RunDetailData } from "../types.ts";
import { api, useRunDetail } from "../api.ts";
import { KIND_ICON, ROLE_LABEL, StatusChip } from "./status.tsx";
import { CheckIcon, Chevron, Disclosure, HandIcon, Pill, SkipIcon, SpinnerRing, StatusBadge, XIcon } from "./bui.tsx";
import { useToast } from "./Toast.tsx";
import { DiffModal } from "./DiffModal.tsx";

export function RunView({ runId, onArchived }: { runId: string; onArchived: (id: string) => void }) {
  const run = useRunDetail(runId);
  const toast = useToast();
  const [diffOpen, setDiffOpen] = useState(false);

  if (!run) {
    return <div className="flex h-full items-center justify-center text-faint">불러오는 중…</div>;
  }
  const nodes = Object.values(run.nodes);
  const waitingGates = nodes.filter((n) => n.status === "waiting_human");
  const active = run.status === "running" || run.status === "waiting_human";

  const cancel = async () => {
    await api(`/runs/${runId}/cancel`, { method: "POST" });
    toast("어명을 취소했습니다");
  };
  const archive = async () => {
    await api(`/runs/${runId}`, { method: "DELETE" });
    toast("기록 보관함으로 옮겼습니다");
    onArchived(runId);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-6 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16px] font-semibold tracking-tight">{run.mission.title}</h2>
          <p className="truncate text-[12px] text-faint">{run.runId}</p>
        </div>
        <StatusChip status={run.status} />
        <div className="flex items-center gap-1.5">
          <HeaderButton onClick={() => setDiffOpen(true)}>변경사항</HeaderButton>
          {active && <HeaderButton onClick={cancel}>취소</HeaderButton>}
          {!active && <HeaderButton onClick={archive}>보관</HeaderButton>}
        </div>
      </header>

      {waitingGates.length > 0 && (
        <div className="border-b border-gold/25 bg-gold/8 px-6 py-2 text-[13px] text-gold" style={{ animation: "fade-in 300ms ease-out both" }}>
          ✋ 어전 호출 — {waitingGates.length}건의 결재가 기다리고 있습니다
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <p className="mb-5 whitespace-pre-wrap text-[13px] leading-relaxed text-dim">{run.mission.goal}</p>
        <ol className="flex flex-col gap-2 pb-4">
          {nodes.map((node, i) => (
            <NodeRow key={node.spec.id} runId={run.runId} node={node} index={i} />
          ))}
        </ol>
      </div>

      <FollowUpComposer runId={runId} run={run} />
      {diffOpen && <DiffModal runId={runId} onClose={() => setDiffOpen(false)} />}
    </div>
  );
}

function HeaderButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-[12.5px] text-dim transition hover:border-line-strong hover:text-fg"
    >
      {children}
    </button>
  );
}

/* ---------- node rows ---------- */

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
      return <Pill tone="amber">결재 대기</Pill>;
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
  const toast = useToast();
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const isGateWaiting = node.spec.kind === "gate" && node.status === "waiting_human";
  const running = node.status === "running";
  const hasBody = Boolean(node.output || node.error || node.progress || isGateWaiting);
  const open = manualOpen ?? (isGateWaiting || running);
  const role = node.spec.role ? (ROLE_LABEL[node.spec.role] ?? node.spec.role) : null;
  const duration = durationOf(node);

  const retry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api(`/runs/${runId}/nodes/${encodeURIComponent(node.spec.id)}/retry`, { method: "POST" });
      toast(`${node.spec.title ?? node.spec.id} 다시 시도 중`);
    } catch (err) {
      toast(String(err instanceof Error ? err.message : err), "err");
    }
  };

  return (
    <li
      className="self-stretch overflow-hidden bg-panel transition-[border-radius] duration-300"
      style={{
        borderRadius: open ? 14 : 22,
        animation: `fade-up 450ms cubic-bezier(0.23,1,0.32,1) ${Math.min(index, 8) * 60}ms both`,
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
        {duration && <span className="font-mono text-[11px] tabular-nums text-faint">{duration}</span>}
        {node.status === "failed" && (
          <span
            role="button"
            tabIndex={0}
            onClick={retry}
            onKeyDown={(e) => e.key === "Enter" && retry(e as any)}
            className="rounded-lg border border-line px-2 py-0.5 text-[11.5px] text-dim transition hover:border-line-strong hover:text-fg"
          >
            다시 시도
          </span>
        )}
        {pillFor(node)}
        {hasBody && <Chevron open={open} />}
      </button>

      <Disclosure open={open}>
        {isGateWaiting && <ApprovalCard runId={runId} node={node} />}
        {(node.progress || node.output || node.error) && (
          <div className="mb-2.5 grid grid-cols-[24px_1fr] gap-2.5 px-2.5">
            <span aria-hidden className="mx-auto h-full w-px bg-line" />
            <div className="min-w-0">
              {running && node.progress && <LiveStream text={node.progress} />}
              {!running && node.progress && !node.output && !node.error && (
                <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-dim">{node.progress}</pre>
              )}
              {node.error && <pre className="mb-2 whitespace-pre-wrap font-mono text-[12px] text-ruby">{node.error}</pre>}
              {node.output && (
                <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-fg/90">
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

/** Live agent console: streaming text with auto-scroll and a gold caret. */
function LiveStream({ text }: { text: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [text]);
  return (
    <pre
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      className="stream-caret max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-ink/50 p-3 font-mono text-[12px] leading-relaxed text-fg/85"
    >
      {text}
    </pre>
  );
}

function ApprovalCard({ runId, node }: { runId: string; node: NodeState }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const decide = async (approved: boolean) => {
    setBusy(true);
    try {
      await api(`/runs/${runId}/gates/${node.spec.id}`, {
        method: "POST",
        body: JSON.stringify({ approved, note: note || undefined }),
      });
      toast(approved ? "윤허했습니다" : "불허했습니다");
    } catch (e) {
      toast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-2.5 mb-2.5 rounded-xl border border-gold/30 bg-gold/8 px-3.5 py-3">
      <p className="text-[13.5px] font-medium text-gold">✋ {node.spec.question ?? "결재가 필요합니다"}</p>
      {node.spec.risk && <p className="mt-0.5 text-[11.5px] text-dim">위험도 {node.spec.risk} · cmux Feed에서도 결재할 수 있습니다</p>}
      <div className="mt-2.5 flex gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="메모 (선택)"
          className="min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-[13px] outline-none placeholder:text-faint focus:border-gold/50"
        />
        <button
          disabled={busy}
          onClick={() => decide(true)}
          className="rounded-lg bg-jade/90 px-4 py-1.5 text-[13px] font-semibold text-ink transition hover:bg-jade disabled:opacity-50"
        >
          윤허
        </button>
        <button
          disabled={busy}
          onClick={() => decide(false)}
          className="rounded-lg bg-ruby/80 px-4 py-1.5 text-[13px] font-semibold text-ink transition hover:bg-ruby disabled:opacity-50"
        >
          불허
        </button>
      </div>
    </div>
  );
}

/* ---------- follow-up composer ---------- */

function FollowUpComposer({ runId, run }: { runId: string; run: RunDetailData }) {
  const toast = useToast();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const resumable = Object.values(run.nodes).some((n) => n.session?.sessionId);

  const send = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await api(`/runs/${runId}/follow-up`, { method: "POST", body: JSON.stringify({ prompt: text }) });
      setPrompt("");
      toast("에이전트에게 전달했습니다");
    } catch (e) {
      toast(String(e instanceof Error ? e.message : e), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-line bg-panel px-6 py-3">
      <div className="flex items-end gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={Math.min(4, Math.max(1, prompt.split("\n").length))}
          placeholder={resumable ? "에이전트에게 추가 지시… (같은 세션에 이어서 전달됩니다)" : "추가 지시… (새 작업 스텝으로 실행됩니다)"}
          className="min-h-9 flex-1 resize-none rounded-xl border border-line bg-ink/60 px-3.5 py-2 text-[13.5px] leading-relaxed outline-none placeholder:text-faint focus:border-gold/50"
        />
        <button
          disabled={busy || !prompt.trim()}
          onClick={send}
          className="rounded-xl bg-gold px-4 py-2 text-[13px] font-semibold text-ink transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? "전달 중…" : "전달"}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-faint">Enter 전송 · Shift+Enter 줄바꿈</p>
    </div>
  );
}
