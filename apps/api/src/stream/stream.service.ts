import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { TASK_DLQ, TASK_QUEUE_PREFIX } from '@app/queue';
import { REDIS_CONNECTION, RedisConnectionConfig } from '@app/queue/queue.module';

export interface QueueSnapshotEntry {
  queueName: string;
  userId: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface QueueSnapshot {
  ts: string;
  queues: QueueSnapshotEntry[];
  dlq: { waiting: number; failed: number };
}

@Injectable()
export class StreamService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly queues = new Map<string, Queue>();
  private dlqQueue?: Queue;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly redisConfig: RedisConnectionConfig,
  ) {
    this.redis = new Redis(redisConfig);
  }

  private getQueue(name: string): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;
    const q = new Queue(name, { connection: this.redisConfig });
    this.queues.set(name, q);
    return q;
  }

  private getDlq(): Queue {
    if (!this.dlqQueue) {
      this.dlqQueue = new Queue(TASK_DLQ, { connection: this.redisConfig });
    }
    return this.dlqQueue;
  }

  async snapshot(): Promise<QueueSnapshot> {
    const keys = await this.redis.keys(`bull:${TASK_QUEUE_PREFIX}*:meta`);
    const queueNames = keys
      .map((k) => k.match(/^bull:(.+):meta$/)?.[1])
      .filter((n): n is string => !!n);

    const queues: QueueSnapshotEntry[] = await Promise.all(
      queueNames.map(async (queueName) => {
        const q = this.getQueue(queueName);
        const counts = await q.getJobCounts(
          'waiting',
          'active',
          'completed',
          'failed',
          'delayed',
        );
        const userId = queueName.replace(TASK_QUEUE_PREFIX, '');
        return {
          queueName,
          userId,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        };
      }),
    );

    const dlqCounts = await this.getDlq().getJobCounts('waiting', 'failed');

    return {
      ts: new Date().toISOString(),
      queues: queues.sort((a, b) => a.userId.localeCompare(b.userId)),
      dlq: { waiting: dlqCounts.waiting ?? 0, failed: dlqCounts.failed ?? 0 },
    };
  }

  async onModuleDestroy() {
    await Promise.all(Array.from(this.queues.values()).map((q) => q.close()));
    if (this.dlqQueue) await this.dlqQueue.close();
    await this.redis.quit();
  }

}
