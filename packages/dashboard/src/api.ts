import { useEffect, useRef, useState } from "react";
import type { RunDetailData, RunSummary } from "./types.ts";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json();
}

/** Live run list + a bumped counter whenever any run event arrives over WS. */
export function useLiveRuns(): { runs: RunSummary[]; tick: number } {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [tick, setTick] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      wsRef.current = ws;
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.type === "snapshot") setRuns(sortRuns(data.runs));
          if (data.type === "run.event") {
            setRuns((prev) => sortRuns([data.run, ...prev.filter((r) => r.runId !== data.run.runId)]));
            setTick((t) => t + 1);
          }
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        if (!closed) setTimeout(connect, 1500);
      };
    };
    connect();
    return () => {
      closed = true;
      wsRef.current?.close();
    };
  }, []);

  return { runs, tick };
}

function sortRuns(runs: RunSummary[]): RunSummary[] {
  return [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function useRunDetail(runId: string | null, tick: number): RunDetailData | null {
  const [detail, setDetail] = useState<RunDetailData | null>(null);
  useEffect(() => {
    if (!runId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    api<RunDetailData>(`/runs/${runId}`)
      .then((d) => !cancelled && setDetail(d))
      .catch(() => !cancelled && setDetail(null));
    return () => {
      cancelled = true;
    };
  }, [runId, tick]);
  return detail;
}
