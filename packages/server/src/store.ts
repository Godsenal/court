import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { RunEvent } from "@court/engine";

/** Append-only JSONL persistence: one file per run under ~/.court/runs/. */
export class RunStore {
  readonly dir: string;

  constructor(baseDir?: string) {
    this.dir = baseDir ?? join(homedir(), ".court", "runs");
    mkdirSync(this.dir, { recursive: true });
  }

  append(event: RunEvent): void {
    appendFileSync(join(this.dir, `${event.runId}.jsonl`), JSON.stringify(event) + "\n");
  }

  load(runId: string): RunEvent[] {
    const file = join(this.dir, `${runId}.jsonl`);
    if (!existsSync(file)) return [];
    return readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RunEvent);
  }

  listRunIds(): string[] {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => f.slice(0, -".jsonl".length));
  }
}
