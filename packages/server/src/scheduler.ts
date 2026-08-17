import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { MissionInput } from "./templates.ts";

export interface Schedule {
  name: string;
  /** Re-run when this many hours have passed since the last run. */
  intervalHours: number;
  mission: MissionInput;
  enabled?: boolean;
}

interface SchedulerState {
  lastRun: Record<string, string>;
}

const DIR = join(homedir(), ".court");
const SCHEDULES_FILE = join(DIR, "schedules.json");
const STATE_FILE = join(DIR, "schedules-state.json");

/** Recurring missions (반복 어명). Definitions in ~/.court/schedules.json. */
export function startScheduler(submit: (mission: MissionInput, source: string) => void): void {
  mkdirSync(DIR, { recursive: true });
  if (!existsSync(SCHEDULES_FILE)) writeFileSync(SCHEDULES_FILE, JSON.stringify(DEFAULT_SCHEDULES, null, 2));

  const tick = () => {
    let schedules: Schedule[];
    try {
      schedules = JSON.parse(readFileSync(SCHEDULES_FILE, "utf8"));
    } catch (e) {
      console.error(`[scheduler] bad schedules.json: ${e}`);
      return;
    }
    const state: SchedulerState = existsSync(STATE_FILE)
      ? JSON.parse(readFileSync(STATE_FILE, "utf8"))
      : { lastRun: {} };
    const now = Date.now();
    for (const schedule of schedules) {
      if (schedule.enabled === false) continue;
      const last = state.lastRun[schedule.name] ? Date.parse(state.lastRun[schedule.name]!) : 0;
      if (now - last < schedule.intervalHours * 3600_000) continue;
      state.lastRun[schedule.name] = new Date(now).toISOString();
      writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      console.log(`[scheduler] firing: ${schedule.name}`);
      try {
        submit({ ...schedule.mission, title: `[스케줄] ${schedule.name}` }, schedule.name);
      } catch (e) {
        console.error(`[scheduler] ${schedule.name} failed to submit: ${e}`);
      }
    }
  };

  tick();
  setInterval(tick, 10 * 60 * 1000);
}

const DEFAULT_SCHEDULES: Schedule[] = [
  {
    name: "cmux-upstream-sync",
    intervalHours: 24,
    enabled: true,
    mission: {
      goal: "cmux 포크를 upstream과 동기화",
      template: "custom",
      graph: {
        nodes: [
          {
            kind: "tool",
            id: "sync",
            dependsOn: [],
            tool: "shell",
            cwd: `${homedir()}/LTH/cmux`,
            input: "./scripts/sync-upstream.sh --push",
            title: "upstream 머지+푸시",
          },
        ],
      },
    },
  },
];
