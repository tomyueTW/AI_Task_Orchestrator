import type { Edge, Node } from 'reactflow';
import type { DagNodeInput } from './api';

/**
 * Edge direction convention (shared with W1 DagGraph):
 *   edge.source = dependency (upstream) → edge.target = dependent (downstream)
 *   i.e. target.dependsOn includes source.
 */

/**
 * Would adding edge `source → target` create a cycle?
 * True if a path already exists from `target` back to `source`
 * (or it's a self-loop).
 */
export function wouldCreateCycle(
  edges: Pick<Edge, 'source' | 'target'>[],
  source: string,
  target: string,
): boolean {
  if (source === target) return true;
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === source) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(adj.get(cur) ?? []));
  }
  return false;
}

export interface EditorNodeData {
  payload: Record<string, unknown>;
  taskType?: DagNodeInput['taskType'];
}

/** Build the `POST /workflows/dag` body from the editor graph. */
export function buildDagPayload(
  nodes: Node<EditorNodeData>[],
  edges: Pick<Edge, 'source' | 'target'>[],
  userId: string,
): { userId: string; nodes: DagNodeInput[] } {
  const dependsOn = new Map<string, string[]>();
  for (const e of edges) {
    if (!dependsOn.has(e.target)) dependsOn.set(e.target, []);
    dependsOn.get(e.target)!.push(e.source);
  }
  return {
    userId,
    nodes: nodes.map((n) => ({
      id: n.id,
      dependsOn: dependsOn.get(n.id) ?? [],
      payload: n.data.payload,
      taskType: n.data.taskType,
    })),
  };
}

/** Local pre-flight mirroring the backend rules (frontend "先擋"). */
export function validateDag(
  nodes: Node<EditorNodeData>[],
  edges: Pick<Edge, 'source' | 'target'>[],
): string | null {
  if (nodes.length === 0) return '至少需要一個節點';
  for (const e of edges) {
    if (wouldCreateCycle(edges.filter((x) => x !== e), e.source, e.target)) {
      return '偵測到循環依賴，請移除造成環的連線';
    }
  }
  return null;
}
