import type { CmuxClient } from "@court/adapters";
import type { Engine } from "@court/engine";
import type { GateRequest } from "@court/engine";

const REQUEST_PREFIX = "court:gate:";

/**
 * Bridges court gates into the cmux Feed: a waiting gate becomes a question
 * card (윤허/불허) answerable from the Feed sidebar or its notification, and
 * the reply resolves the gate. The dashboard/CLI remain alternative paths —
 * whichever answers first wins.
 */
export class FeedGateBridge {
  constructor(
    private cmux: CmuxClient,
    private engine: Engine,
  ) {}

  /** Push the gate as a Feed question card. Failures are non-fatal. */
  async push(req: GateRequest): Promise<void> {
    const requestId = `${REQUEST_PREFIX}${req.runId}:${req.nodeId}`;
    try {
      await this.cmux.rpc("feed.push", {
        session_id: `court-${req.runId}`,
        hook_event_name: "AskUserQuestion",
        _source: "court",
        cwd: process.cwd(),
        _opencode_request_id: requestId,
        tool_input: {
          questions: [
            {
              question: req.question,
              header: `Court · risk=${req.risk}`,
              multiSelect: false,
              options: [
                { label: "승인", description: "계속 진행" },
                { label: "거절", description: "이 단계에서 중단" },
              ],
            },
          ],
        },
      });
    } catch (e) {
      console.error(`[feed-bridge] push failed: ${e}`);
    }
  }

  /** Watch the cmux event stream for question replies and resolve gates. */
  start(signal?: AbortSignal): void {
    void (async () => {
      while (!signal?.aborted) {
        try {
          for await (const event of this.cmux.events({ categories: ["feed"], signal })) {
            if (event.name !== "feed.item.resolved") continue;
            const payload = event.payload as
              | { method?: string; params?: { request_id?: string; selections?: string[] } }
              | undefined;
            if (payload?.method !== "feed.question.reply") continue;
            const requestId = payload.params?.request_id ?? "";
            if (!requestId.startsWith(REQUEST_PREFIX)) continue;
            const [runId, nodeId] = requestId.slice(REQUEST_PREFIX.length).split(":");
            if (!runId || !nodeId) continue;
            const approved = payload.params?.selections?.[0] === "opt0";
            try {
              this.engine.resolveGate(runId, nodeId, approved, "cmux Feed");
              console.log(`[feed-bridge] gate ${runId}/${nodeId} ${approved ? "approved" : "denied"} via Feed`);
            } catch {
              // already resolved elsewhere — fine
            }
          }
        } catch (e) {
          console.error(`[feed-bridge] event stream error: ${e}`);
        }
        if (!signal?.aborted) await new Promise((r) => setTimeout(r, 5000));
      }
    })();
  }
}
