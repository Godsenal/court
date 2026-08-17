/**
 * cmux integration: workspace spawning, notifications, and the reconnectable
 * event stream. Talks to the cmux app through its bundled socket CLI.
 * See ~/LTH/cmux/docs/{cli-contract,events,feed}.md for the contract.
 */

const DEFAULT_CMUX_BIN = "/Applications/cmux.app/Contents/Resources/bin/cmux";

export interface CmuxClientOptions {
  bin?: string;
}

export interface CmuxEvent {
  seq: number;
  boot_id?: string;
  name?: string;
  category?: string;
  at?: string;
  [key: string]: unknown;
}

export class CmuxClient {
  private bin: string;

  constructor(opts: CmuxClientOptions = {}) {
    this.bin = opts.bin ?? DEFAULT_CMUX_BIN;
  }

  async available(): Promise<boolean> {
    try {
      const proc = Bun.spawn([this.bin, "ping"], { stdout: "pipe", stderr: "pipe" });
      const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
      if (code !== 0) console.error(`[cmux] ping exit ${code}: ${stderr.slice(0, 300)}`);
      return code === 0;
    } catch (e) {
      console.error(`[cmux] ping spawn failed: ${e}`);
      return false;
    }
  }

  private async exec(args: string[]): Promise<string> {
    const proc = Bun.spawn([this.bin, ...args], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (code !== 0) throw new Error(`cmux ${args[0]} exited ${code}: ${stderr.slice(0, 500)}`);
    return stdout;
  }

  /** Create a workspace running a command; returns raw CLI output (workspace ref/id when --json). */
  async newWorkspace(opts: { cwd: string; command?: string; name?: string }): Promise<string> {
    const args = ["--json", "new-workspace", "--cwd", opts.cwd];
    if (opts.command) args.push("--command", opts.command);
    if (opts.name) args.push("--name", opts.name);
    return (await this.exec(args)).trim();
  }

  /** Raw v2 socket call: `cmux rpc <method> <json>`. */
  async rpc(method: string, params: unknown): Promise<string> {
    return this.exec(["rpc", method, JSON.stringify(params)]);
  }

  /** Desktop notification through cmux (visible on Mac + forwarded by cmux-remote). */
  async notify(opts: { title: string; subtitle?: string; body?: string }): Promise<void> {
    const args = ["notify", "--title", opts.title];
    if (opts.subtitle) args.push("--subtitle", opts.subtitle);
    if (opts.body) args.push("--body", opts.body);
    await this.exec(args);
  }

  /**
   * Stream cmux events as parsed NDJSON. Yields until aborted.
   * Uses `cmux events --reconnect` with a cursor file for at-least-once delivery.
   */
  async *events(opts: { categories?: string[]; cursorFile?: string; signal?: AbortSignal } = {}): AsyncGenerator<CmuxEvent> {
    const args = ["events", "--reconnect", "--no-heartbeat"];
    for (const c of opts.categories ?? []) args.push("--category", c);
    if (opts.cursorFile) args.push("--cursor-file", opts.cursorFile);
    const proc = Bun.spawn([this.bin, ...args], { stdout: "pipe", stderr: "ignore" });
    opts.signal?.addEventListener("abort", () => proc.kill());
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of proc.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          yield JSON.parse(line) as CmuxEvent;
        } catch {
          // skip malformed line
        }
      }
    }
  }
}
