import { useEffect, useState } from "react";
import type { Schedule } from "../types.ts";
import { api, timeAgo } from "../api.ts";
import { useToast } from "./Toast.tsx";

export function SchedulesView({ onOpenRun }: { onOpenRun: (id: string) => void }) {
  const toast = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [lastRun, setLastRun] = useState<Record<string, string>>({});

  const load = () =>
    api<{ schedules: Schedule[]; lastRun: Record<string, string> }>("/schedules").then((d) => {
      setSchedules(d.schedules);
      setLastRun(d.lastRun);
    });

  useEffect(() => {
    void load();
  }, []);

  const saveAll = async (next: Schedule[]) => {
    setSchedules(next);
    try {
      await api("/schedules", { method: "PUT", body: JSON.stringify(next) });
      toast("스케줄 저장됨");
    } catch (e) {
      toast(String(e instanceof Error ? e.message : e), "err");
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl">
        <h2 className="text-[16px] font-semibold">스케줄</h2>
        <p className="mt-0.5 text-[12px] text-faint">
          주기적으로 자동 실행되는 작업 — <code className="font-mono">~/.court/schedules.json</code>
        </p>

        <ul className="mt-5 flex flex-col gap-2.5">
          {schedules.map((schedule, i) => (
            <li key={schedule.name} className="rounded-xl border border-line bg-panel p-4">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[13.5px] font-medium">{schedule.name}</h3>
                  <p className="mt-0.5 truncate text-[12px] text-dim">{schedule.mission.goal}</p>
                </div>
                <span className="font-mono text-[11.5px] text-faint">{schedule.intervalHours}시간마다</span>
                <button
                  role="switch"
                  aria-checked={schedule.enabled !== false}
                  onClick={() => {
                    const next = [...schedules];
                    next[i] = { ...schedule, enabled: schedule.enabled === false };
                    void saveAll(next);
                  }}
                  className={`relative h-5.5 w-10 rounded-full transition ${schedule.enabled !== false ? "bg-jade/80" : "bg-line"}`}
                >
                  <span
                    className="absolute top-0.5 size-4.5 rounded-full bg-fg transition-all"
                    style={{ left: schedule.enabled !== false ? "calc(100% - 20px)" : "2px" }}
                  />
                </button>
              </div>
              {lastRun[schedule.name] && (
                <p className="mt-2 text-[11.5px] text-faint">마지막 실행 {timeAgo(lastRun[schedule.name]!)}</p>
              )}
            </li>
          ))}
        </ul>
        {!schedules.length && <p className="mt-6 text-[13px] text-faint">등록된 스케줄이 없습니다.</p>}
        <p className="mt-5 text-[11.5px] text-faint">
          새 스케줄은 <code className="font-mono">schedules.json</code>에 직접 추가하세요 — 형식: {"{ name, intervalHours, mission: { goal, template, cwd } }"}. 10분 주기로 반영됩니다.
        </p>
      </div>
    </div>
  );
}
