export const STATUS_META: Record<string, { label: string; dot: string; text: string }> = {
  pending: { label: "대기", dot: "bg-dim/40", text: "text-dim" },
  running: { label: "실행 중", dot: "bg-sky animate-working", text: "text-sky" },
  waiting_human: { label: "승인 대기", dot: "bg-amber animate-working", text: "text-amber" },
  completed: { label: "완료", dot: "bg-jade", text: "text-jade" },
  failed: { label: "실패", dot: "bg-ruby", text: "text-ruby" },
  skipped: { label: "건너뜀", dot: "bg-dim/40", text: "text-dim" },
  cancelled: { label: "취소됨", dot: "bg-dim/40", text: "text-dim" },
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

/** Small stroke icon set (lucide-style, hand-inlined to stay dependency-free). */
function icon(path: React.ReactNode, size = 14) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {path}
    </svg>
  );
}

export const ICONS = {
  // node kinds
  agent: icon(<><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 10l2.5 2.5L8 15M13 15h3" /></>),
  gate: icon(<><path d="M12 3l8 4v5c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V7l8-4z" /></>),
  judge: icon(<><path d="M9 12l2 2 4-5" /><circle cx="12" cy="12" r="9" /></>),
  fanout: icon(<><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M7.8 7.8L10.5 16M16.2 7.8L13.5 16" /></>),
  loop: icon(<><path d="M3 12a9 9 0 019-9 9 9 0 018 4.9M21 12a9 9 0 01-9 9 9 9 0 01-8-4.9" /><path d="M21 3v5h-5M3 21v-5h5" /></>),
  tool: icon(<path d="M14.7 6.3a4.5 4.5 0 00-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 006-6l-3 3-3-3 3-3z" />),
  // rail
  tasks: icon(<><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeWidth="2.6" /></>, 18),
  roles: icon(<><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17.5" cy="9" r="2.5" /><path d="M16.5 14.5c2.8.3 4.5 2.6 4.5 5.5" /></>, 18),
  schedules: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>, 18),
} as const;

export function KindIcon({ kind }: { kind: string }) {
  const node = (ICONS as Record<string, React.ReactNode>)[kind];
  return <span className="inline-flex text-dim">{node ?? ICONS.agent}</span>;
}

export const ROLE_LABEL: Record<string, string> = {
  pm: "PM",
  designer: "Designer",
  developer: "Developer",
  reviewer: "Reviewer",
  researcher: "Researcher",
};
