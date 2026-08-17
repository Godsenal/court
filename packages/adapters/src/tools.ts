import type { ToolExecutor } from "@court/engine";
import type { ToolNodeSpec } from "@court/engine";

export interface ToolDeps {
  /** Runs a natural-language browser task via ego-browser; returns a result summary. */
  browser?: (task: string) => Promise<string>;
  /** Runs a computer-use task (screen control). */
  computer?: (task: string) => Promise<string>;
  shellTimeoutMs?: number;
}

/** Dispatches tool nodes: shell directly, browser/computer via injected runners. */
export class DefaultToolExecutor implements ToolExecutor {
  constructor(private deps: ToolDeps = {}) {}

  async run(node: ToolNodeSpec, input: string): Promise<string> {
    switch (node.tool) {
      case "shell": {
        const proc = Bun.spawn(["zsh", "-lc", input], {
          cwd: node.cwd,
          stdout: "pipe",
          stderr: "pipe",
        });
        const timer = setTimeout(() => proc.kill(), this.deps.shellTimeoutMs ?? 10 * 60 * 1000);
        const [stdout, stderr, code] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]);
        clearTimeout(timer);
        if (code !== 0) throw new Error(`shell exited ${code}: ${stderr.slice(0, 2000)}`);
        return stdout.trim();
      }
      case "browser": {
        if (!this.deps.browser) throw new Error("browser runner not configured (ego-browser)");
        return this.deps.browser(input);
      }
      case "computer": {
        if (!this.deps.computer) throw new Error("computer-use runner not configured");
        return this.deps.computer(input);
      }
    }
  }
}
