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
