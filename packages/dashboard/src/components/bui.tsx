/**
 * UI primitives adapted from beautifului.dev's TaskRows (MIT, Shane Levine),
 * recolored onto court's token palette.
 */
import type { ReactNode } from "react";

export function SpinnerRing({ active, children }: { active?: boolean; children?: ReactNode }) {
  const size = 24;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="absolute inset-0"
        style={active ? { animation: "spin 1.1s linear infinite" } : undefined}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        {active && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-sky)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * 0.28} ${c * 0.72}`}
          />
        )}
      </svg>
      <span className="relative text-[10.5px] font-semibold tabular-nums text-fg">{children}</span>
    </span>
  );
}

export function StatusBadge({ tone, children }: { tone: "ruby" | "jade" | "amber" | "dim"; children: ReactNode }) {
  const bg = { ruby: "bg-ruby", jade: "bg-jade", amber: "bg-amber", dim: "bg-line" }[tone];
  return (
    <span
      className={`flex size-[22px] shrink-0 items-center justify-center rounded-full text-ink ${bg}`}
      style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      {children}
    </span>
  );
}

export const CheckIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export const XIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export const HandIcon = <span className="text-[11px] leading-none">✋</span>;

export const SkipIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <path d="M5 12h14" />
  </svg>
);

export function Pill({ tone, children }: { tone: "jade" | "ruby" | "amber" | "dim"; children: ReactNode }) {
  const cls = {
    jade: "bg-jade/15 text-jade",
    ruby: "bg-ruby/15 text-ruby",
    amber: "bg-amber/15 text-amber",
    dim: "bg-line/40 text-dim",
  }[tone];
  return (
    <span
      className={`inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium ${cls}`}
      style={{ animation: "fade-in 200ms ease-out both" }}
    >
      {children}
    </span>
  );
}

/** Chevron that rotates when open — same grammar as beautifului's dropdown rows. */
export function Chevron({ open }: { open: boolean }) {
  return (
    <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full text-dim">
      <svg
        width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        className="transition-transform duration-300"
        style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  );
}

/** Height-animated disclosure using the grid-template-rows trick. */
export function Disclosure({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows,opacity] duration-300"
      style={{
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
      }}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}
