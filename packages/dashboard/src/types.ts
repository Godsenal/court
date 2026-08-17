export interface RunSummary {
  runId: string;
  title: string;
  goal: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  done: number;
  waiting: string[];
}

export interface NodeState {
  spec: {
    id: string;
    kind: string;
    title?: string;
    role?: string;
    tier?: string;
    risk?: string;
    question?: string;
    prompt?: string;
    resumeSessionId?: string;
    dependsOn: string[];
  };
  status: string;
  output?: string;
  progress?: string;
  error?: string;
  startedAt?: string;
  endedAt?: string;
  session?: { runner: string; model?: string; sessionId?: string; cmuxWorkspaceId?: string; pid?: number };
}

export interface RunDetailData {
  runId: string;
  status: string;
  mission: { title: string; goal: string; createdAt: string };
  nodes: Record<string, NodeState>;
}

export interface Role {
  id: string;
  name: string;
  systemPrompt: string;
  policy: {
    runner: string;
    models: Record<string, string>;
    autoApproveBelow: string;
    allowedTools?: string[];
    disallowedTools?: string[];
  };
}

export interface Schedule {
  name: string;
  intervalHours: number;
  enabled?: boolean;
  mission: { goal: string; template?: string; cwd?: string };
}

export interface RunEventMsg {
  type: "run.event";
  event: { type: string; runId: string; nodeId?: string; chunk?: string };
  run: RunSummary;
}
