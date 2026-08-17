import type { RunState, RunStatus } from "@court/engine";

export const RUN_STATUSES: RunStatus[] = ["running", "waiting_human", "completed", "failed", "cancelled"];

export interface Stats {
  totalRuns: number;
  byStatus: Record<RunStatus, number>;
  totalNodes: number;
}

function emptyByStatus(): Record<RunStatus, number> {
  const byStatus = {} as Record<RunStatus, number>;
  for (const status of RUN_STATUSES) byStatus[status] = 0;
  return byStatus;
}

export function computeStats(runs: RunState[]): Stats {
  const byStatus = emptyByStatus();
  let totalNodes = 0;

  for (const run of runs) {
    if (run.status in byStatus) byStatus[run.status]++;
    totalNodes += Object.keys(run.nodes).length;
  }

  return { totalRuns: runs.length, byStatus, totalNodes };
}
