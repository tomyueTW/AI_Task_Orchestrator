const BASE = '';

export interface Task {
  id: string;
  userId: string;
  status: string;
  priority: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export async function createTask(input: {
  userId: string;
  taskType?: string;
  payload: Record<string, unknown>;
}): Promise<Task> {
  const res = await fetch(`${BASE}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createTask failed: ${res.status}`);
  return res.json();
}

export async function getTask(id: string, userId: string): Promise<Task> {
  const res = await fetch(`${BASE}/tasks/${id}?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(`getTask failed: ${res.status}`);
  return res.json();
}

export async function listDlq(): Promise<unknown[]> {
  const res = await fetch(`${BASE}/tasks/dlq`);
  if (!res.ok) throw new Error(`listDlq failed: ${res.status}`);
  return res.json();
}

export async function fetchPrometheus(): Promise<string> {
  const res = await fetch(`${BASE}/metrics`);
  if (!res.ok) throw new Error(`fetchPrometheus failed: ${res.status}`);
  return res.text();
}

// ── DAG workflow ──────────────────────────────────────────────────────────

export type DagNodeStatus =
  | 'pending'
  | 'ready'
  | 'active'
  | 'completed'
  | 'failed';

export interface DagStatusNode {
  id: string;
  dependsOn: string[];
  jobId?: string;
  status: DagNodeStatus;
  result?: unknown;
  failedReason?: string;
}

export interface DagStatus {
  dagId: string;
  userId: string;
  createdAt: string;
  /** Topological layers — node ids grouped by parallel-execution depth. */
  layers: string[][];
  nodes: DagStatusNode[];
}

export interface DagNodeInput {
  id: string;
  payload: Record<string, unknown>;
  dependsOn?: string[];
  taskType?: 'simple' | 'code' | 'complex';
}

export async function getDagStatus(id: string): Promise<DagStatus> {
  const res = await fetch(`${BASE}/workflows/dag/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`getDagStatus failed: ${res.status}`);
  return res.json();
}

export async function createDag(input: {
  userId: string;
  nodes: DagNodeInput[];
}): Promise<{ dagId: string; layers: string[][] }> {
  const res = await fetch(`${BASE}/workflows/dag`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    // NestJS error body: { statusCode, message: string | string[], error }
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      const m = body?.message;
      detail = Array.isArray(m) ? m.join('; ') : (m ?? detail);
    } catch {
      /* non-JSON body — keep status code */
    }
    throw new Error(detail);
  }
  return res.json();
}

// ── Chaos control panel (10月 W3) ─────────────────────────────────────────

export type ChaosAction = 'killWorker' | 'pauseRedis' | 'injectLatency';

export interface ChaosActionMeta {
  description: string;
  expects: string[];
}

export interface ChaosDirective {
  action: ChaosAction;
  issuedAt: number;
  until: number;
  latencyMs?: number;
}

export interface ChaosStatus {
  active: ChaosDirective | null;
  catalog: Record<ChaosAction, ChaosActionMeta>;
}

export interface ChaosTriggerResult {
  action: ChaosAction;
  issuedAt: number;
  until: number;
  durationMs: number;
  latencyMs?: number;
  description: string;
  expects: string[];
}

async function adminErr(res: Response): Promise<string> {
  let detail = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    const m = body?.message;
    detail = Array.isArray(m) ? m.join('; ') : (m ?? detail);
  } catch {
    /* keep status */
  }
  return detail;
}

export async function getChaosStatus(token: string): Promise<ChaosStatus> {
  const res = await fetch(`${BASE}/admin/chaos`, {
    headers: { 'x-admin-token': token },
  });
  if (!res.ok) throw new Error(await adminErr(res));
  return res.json();
}

export async function triggerChaos(
  action: ChaosAction,
  token: string,
  body: { durationMs?: number; latencyMs?: number },
): Promise<ChaosTriggerResult> {
  const res = await fetch(`${BASE}/admin/chaos/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await adminErr(res));
  return res.json();
}
