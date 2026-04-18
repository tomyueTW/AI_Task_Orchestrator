import { DagNodeInput } from './dag.interface';

export class DagValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DagValidationError';
  }
}

/**
 * Kahn's algorithm — produces layers where each layer's nodes can run in parallel.
 * Throws DagValidationError on: cycle, missing dependency, duplicate id, self-loop.
 */
export function topologicalLayers(nodes: DagNodeInput[]): string[][] {
  if (nodes.length === 0) {
    throw new DagValidationError('DAG must contain at least one node');
  }

  const ids = new Set<string>();
  for (const n of nodes) {
    if (ids.has(n.id)) {
      throw new DagValidationError(`Duplicate node id: ${n.id}`);
    }
    ids.add(n.id);
  }

  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adjacency.set(n.id, []);
  }

  for (const n of nodes) {
    const deps = n.dependsOn ?? [];
    for (const dep of deps) {
      if (dep === n.id) {
        throw new DagValidationError(`Self-loop detected on node "${n.id}"`);
      }
      if (!ids.has(dep)) {
        throw new DagValidationError(
          `Node "${n.id}" depends on unknown node "${dep}"`,
        );
      }
      adjacency.get(dep)!.push(n.id);
      inDegree.set(n.id, inDegree.get(n.id)! + 1);
    }
  }

  const layers: string[][] = [];
  let frontier = nodes.filter((n) => inDegree.get(n.id) === 0).map((n) => n.id);

  let processed = 0;
  while (frontier.length > 0) {
    layers.push([...frontier]);
    processed += frontier.length;
    const next: string[] = [];
    for (const id of frontier) {
      for (const child of adjacency.get(id)!) {
        const deg = inDegree.get(child)! - 1;
        inDegree.set(child, deg);
        if (deg === 0) next.push(child);
      }
    }
    frontier = next;
  }

  if (processed !== nodes.length) {
    throw new DagValidationError('Cycle detected in DAG');
  }

  return layers;
}

/**
 * Reverse adjacency: for each node → list of nodes that depend on it.
 * Used at runtime by the DAG coordinator to find downstream nodes when one completes.
 */
export function buildDependents(nodes: DagNodeInput[]): Map<string, string[]> {
  const dependents = new Map<string, string[]>();
  for (const n of nodes) {
    dependents.set(n.id, []);
  }
  for (const n of nodes) {
    for (const dep of n.dependsOn ?? []) {
      dependents.get(dep)!.push(n.id);
    }
  }
  return dependents;
}
