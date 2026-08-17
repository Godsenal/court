export const STATUS_META: Record<string, { label: string; dot: string; text: string }> = {
  pending: { label: "대기", dot: "bg-dim/40", text: "text-dim" },
  running: { label: "작업 중", dot: "bg-sky animate-working", text: "text-sky" },
  waiting_human: { label: "승인 대기", dot: "bg-amber animate-working", text: "text-amber" },
  completed: { label: "완료", dot: "bg-jade", text: "text-jade" },
  failed: { label: "실패", dot: "bg-ruby", text: "text-ruby" },
  skipped: { label: "건너뜀", dot: "bg-dim/40", text: "text-dim" },
  cancelled: { label: "취소", dot: "bg-dim/40", text: "text-dim" },
};

export function StatusDot({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending!;
  return <span className={`inline-block size-2 shrink-0 rounded-full ${meta.dot}`} />;
}

export function StatusChip({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending!;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-panel-2 px-2 py-0.5 text-xs ${meta.text}`}>
      <StatusDot status={status} />
      {meta.label}
    </span>
  );
}

export const KIND_ICON: Record<string, string> = {
  agent: "🤖",
  gate: "🖐️",
  judge: "⚖️",
  fanout: "🔀",
  loop: "🔁",
  tool: "🔧",
};

export const ROLE_LABEL: Record<string, string> = {
  pm: "재상",
  designer: "화공",
  developer: "장인",
  reviewer: "감찰",
  researcher: "학사",
};
