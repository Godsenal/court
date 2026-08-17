import { useEffect, useRef, useState } from "react";
import type { RunDetailData, RunEventMsg, RunSummary } from "./types.ts";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json();
}

/** One shared WebSocket; listeners receive every parsed frame. */
type Listener = (msg: any) => void;
const listeners = new Set<Listener>();
let socketStarted = false;

function ensureSocket(): void {
  if (socketStarted) return;
  socketStarted = true;
  const connect = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        for (const fn of listeners) fn(data);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => setTimeout(connect, 1500);
  };
  connect();
}

export function useSocket(listener: Listener): void {
  useEffect(() => {
    ensureSocket();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [listener]);
}

function sortRuns(runs: RunSummary[]): RunSummary[] {
  return [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function useLiveRuns(): { runs: RunSummary[]; drop: (id: string) => void } {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const listener = useRef<Listener>(() => {});
  listener.current = (data) => {
    if (data.type === "snapshot") setRuns(sortRuns(data.runs));
    if (data.type === "run.event") {
      setRuns((prev) => sortRuns([data.run, ...prev.filter((r) => r.runId !== data.run.runId)]));
    }
  };
  useSocket((msg) => listener.current(msg));
  return {
    runs,
    drop: (id) => setRuns((prev) => prev.filter((r) => r.runId !== id)),
  };
}

/**
 * Run detail that stays live: progress chunks apply locally (no refetch),
 * other events refetch the run once.
 */
export function useRunDetail(runId: string | null): RunDetailData | null {
  const [detail, setDetail] = useState<RunDetailData | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(runId);
  idRef.current = runId;

  useEffect(() => {
    setDetail(null);
    if (!runId) return;
    let cancelled = false;
    api<RunDetailData>(`/runs/${runId}`)
      .then((d) => !cancelled && setDetail(d))
      .catch(() => !cancelled && setDetail(null));
    return () => {
      cancelled = true;
    };
  }, [runId]);

  useSocket((msg: RunEventMsg | any) => {
    if (msg.type !== "run.event" || msg.event.runId !== idRef.current) return;
    if (msg.event.type === "node.progress") {
      setDetail((prev) => {
        if (!prev) return prev;
        const node = prev.nodes[msg.event.nodeId!];
        if (!node) return prev;
        const progress = ((node.progress ?? "") + (msg.event.chunk ?? "")).slice(-65536);
        return { ...prev, nodes: { ...prev.nodes, [msg.event.nodeId!]: { ...node, progress } } };
      });
      return;
    }
    // Debounce refetches for bursty non-progress events.
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => {
      const id = idRef.current;
      if (!id) return;
      api<RunDetailData>(`/runs/${id}`)
        .then((d) => idRef.current === id && setDetail(d))
        .catch(() => {});
    }, 150);
  });

  return detail;
}

export function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (sec < 60) return `${sec}초 전`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  return `${Math.floor(sec / 86400)}일 전`;
}
