import Redis from 'ioredis';
import { DagMeta, DagNodeInput } from './dag.interface';
import { buildDependents } from './topological-sort';

const TTL_SECONDS = 86400 * 7; // 7 days

/**
 * Redis-backed DAG state.
 *
 * Keys per DAG:
 *   dag:{id}:meta                       JSON string — DagMeta
 *   dag:{id}:nodes                      hash — nodeId → JSON DagNodeInput
 *   dag:{id}:dependents                 hash — nodeId → JSON string[] of nodes that depend on it
 *   dag:{id}:deps-remaining:{nodeId}    int — outstanding dependencies to satisfy
 *   dag:{id}:results                    hash — nodeId → JSON of job result
 *   dag:{id}:status                     hash — nodeId → 'pending' | 'ready' | 'completed' | 'failed'
 */
export class DagCoordinator {
  constructor(private readonly redis: Redis) {}

  private metaKey(dagId: string) { return `dag:${dagId}:meta`; }
  private nodesKey(dagId: string) { return `dag:${dagId}:nodes`; }
  private dependentsKey(dagId: string) { return `dag:${dagId}:dependents`; }
  private remainingKey(dagId: string, nodeId: string) { return `dag:${dagId}:deps-remaining:${nodeId}`; }
  private resultsKey(dagId: string) { return `dag:${dagId}:results`; }
  private statusKey(dagId: string) { return `dag:${dagId}:status`; }

  async persist(meta: DagMeta, nodes: DagNodeInput[]): Promise<void> {
    const dependents = buildDependents(nodes);

    const pipeline = this.redis.pipeline();
    pipeline.set(this.metaKey(meta.dagId), JSON.stringify(meta), 'EX', TTL_SECONDS);

    for (const n of nodes) {
      pipeline.hset(this.nodesKey(meta.dagId), n.id, JSON.stringify(n));
      pipeline.hset(this.dependentsKey(meta.dagId), n.id, JSON.stringify(dependents.get(n.id) ?? []));
      pipeline.set(this.remainingKey(meta.dagId, n.id), (n.dependsOn?.length ?? 0).toString(), 'EX', TTL_SECONDS);
      pipeline.hset(this.statusKey(meta.dagId), n.id, (n.dependsOn?.length ?? 0) === 0 ? 'ready' : 'pending');
    }
    pipeline.expire(this.nodesKey(meta.dagId), TTL_SECONDS);
    pipeline.expire(this.dependentsKey(meta.dagId), TTL_SECONDS);
    pipeline.expire(this.statusKey(meta.dagId), TTL_SECONDS);

    await pipeline.exec();
  }

  async getMeta(dagId: string): Promise<DagMeta | null> {
    const raw = await this.redis.get(this.metaKey(dagId));
    return raw ? (JSON.parse(raw) as DagMeta) : null;
  }

  async getNode(dagId: string, nodeId: string): Promise<DagNodeInput | null> {
    const raw = await this.redis.hget(this.nodesKey(dagId), nodeId);
    return raw ? (JSON.parse(raw) as DagNodeInput) : null;
  }

  async getAllNodes(dagId: string): Promise<Record<string, DagNodeInput>> {
    const raw = await this.redis.hgetall(this.nodesKey(dagId));
    const out: Record<string, DagNodeInput> = {};
    for (const [id, json] of Object.entries(raw)) {
      out[id] = JSON.parse(json) as DagNodeInput;
    }
    return out;
  }

  async getAllStatuses(dagId: string): Promise<Record<string, string>> {
    return this.redis.hgetall(this.statusKey(dagId));
  }

  async getResults(dagId: string, nodeIds: string[]): Promise<Record<string, unknown>> {
    if (nodeIds.length === 0) return {};
    const values = await this.redis.hmget(this.resultsKey(dagId), ...nodeIds);
    const out: Record<string, unknown> = {};
    nodeIds.forEach((id, i) => {
      out[id] = values[i] ? JSON.parse(values[i] as string) : null;
    });
    return out;
  }

  async setJobId(dagId: string, nodeId: string, jobId: string): Promise<void> {
    await this.redis.hset(`dag:${dagId}:jobIds`, nodeId, jobId);
    await this.redis.expire(`dag:${dagId}:jobIds`, TTL_SECONDS);
  }

  async getJobIds(dagId: string): Promise<Record<string, string>> {
    return this.redis.hgetall(`dag:${dagId}:jobIds`);
  }

  async markActive(dagId: string, nodeId: string): Promise<void> {
    await this.redis.hset(this.statusKey(dagId), nodeId, 'active');
  }

  /**
   * Store node result and return downstream nodes that are now fully satisfied
   * (i.e. all of their dependencies have completed). Returned nodes must be enqueued by the caller.
   */
  async markCompleteAndFindReady(
    dagId: string,
    nodeId: string,
    result: unknown,
  ): Promise<DagNodeInput[]> {
    await this.redis.hset(this.resultsKey(dagId), nodeId, JSON.stringify(result));
    await this.redis.expire(this.resultsKey(dagId), TTL_SECONDS);
    await this.redis.hset(this.statusKey(dagId), nodeId, 'completed');

    const dependentsRaw = await this.redis.hget(this.dependentsKey(dagId), nodeId);
    const dependents: string[] = dependentsRaw ? JSON.parse(dependentsRaw) : [];
    if (dependents.length === 0) return [];

    const ready: DagNodeInput[] = [];
    for (const depId of dependents) {
      const remaining = await this.redis.decr(this.remainingKey(dagId, depId));
      if (remaining === 0) {
        const node = await this.getNode(dagId, depId);
        if (node) {
          await this.redis.hset(this.statusKey(dagId), depId, 'ready');
          ready.push(node);
        }
      }
    }
    return ready;
  }

  async markFailed(dagId: string, nodeId: string, reason: string): Promise<void> {
    await this.redis.hset(this.statusKey(dagId), nodeId, 'failed');
    await this.redis.hset(`dag:${dagId}:failures`, nodeId, reason);
    await this.redis.expire(`dag:${dagId}:failures`, TTL_SECONDS);
  }

  async getFailures(dagId: string): Promise<Record<string, string>> {
    return this.redis.hgetall(`dag:${dagId}:failures`);
  }
}
