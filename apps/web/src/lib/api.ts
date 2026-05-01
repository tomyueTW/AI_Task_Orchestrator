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
