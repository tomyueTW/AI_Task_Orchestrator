import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { TASK_DLQ, TASK_QUEUE_PREFIX } from '@app/queue';
import { REDIS_CONNECTION, RedisConnectionConfig } from '@app/queue/queue.module';

export interface TaskFlowEvent {
  ts: string;
  jobId: string;
  queueName: string;
  userId: string;
  stage: 'waiting' | 'active' | 'completed' | 'failed' | 'dlq';
}

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
export class StreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StreamService.name);
  private readonly redis: Redis;
  private readonly queues = new Map<string, Queue>();
  private readonly queueEvents = new Map<string, QueueEvents>();
  private dlqQueue?: Queue;
  private dlqEvents?: QueueEvents;
  private readonly ringBuffer: TaskFlowEvent[] = [];
  private static readonly RING_SIZE = 50;
  private discoverInterval?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly redisConfig: RedisConnectionConfig,
  ) {
    this.redis = new Redis(redisConfig);
  }

  async onModuleInit() {
    await this.discoverEventSources();
    this.discoverInterval = setInterval(() => {
      this.discoverEventSources().catch((err) =>
        this.logger.error(`event source discovery failed: ${err.message}`),
      );
    }, 5000);

    this.dlqEvents = new QueueEvents(TASK_DLQ, { connection: this.redisConfig });
    this.dlqEvents.on('added', ({ jobId }) => {
      this.recordEvent({
        ts: new Date().toISOString(),
        jobId,
        queueName: TASK_DLQ,
        userId: '_dlq',
        stage: 'dlq',
      });
    });
  }

  private async discoverEventSources() {
    const keys = await this.redis.keys(`bull:${TASK_QUEUE_PREFIX}*:meta`);
    for (const key of keys) {
      const queueName = key.match(/^bull:(.+):meta$/)?.[1];
      if (!queueName || this.queueEvents.has(queueName)) continue;

      const events = new QueueEvents(queueName, { connection: this.redisConfig });
      const userId = queueName.replace(TASK_QUEUE_PREFIX, '');

      events.on('added', ({ jobId }) =>
        this.recordEvent({
          ts: new Date().toISOString(),
          jobId,
          queueName,
          userId,
          stage: 'waiting',
        }),
      );
      events.on('active', ({ jobId }) =>
        this.recordEvent({
          ts: new Date().toISOString(),
          jobId,
          queueName,
          userId,
          stage: 'active',
        }),
      );
      events.on('completed', ({ jobId }) =>
        this.recordEvent({
          ts: new Date().toISOString(),
          jobId,
          queueName,
          userId,
          stage: 'completed',
        }),
      );
      events.on('failed', ({ jobId }) =>
        this.recordEvent({
          ts: new Date().toISOString(),
          jobId,
          queueName,
          userId,
          stage: 'failed',
        }),
      );

      this.queueEvents.set(queueName, events);
      this.logger.log(`QueueEvents subscribed: ${queueName}`);
    }
  }

  private recordEvent(ev: TaskFlowEvent) {
    this.ringBuffer.push(ev);
    if (this.ringBuffer.length > StreamService.RING_SIZE) {
      this.ringBuffer.shift();
    }
  }

  recentEvents(): TaskFlowEvent[] {
    return [...this.ringBuffer];
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
    if (this.discoverInterval) clearInterval(this.discoverInterval);
    await Promise.all(Array.from(this.queueEvents.values()).map((e) => e.close()));
    if (this.dlqEvents) await this.dlqEvents.close();
    await Promise.all(Array.from(this.queues.values()).map((q) => q.close()));
    if (this.dlqQueue) await this.dlqQueue.close();
    await this.redis.quit();
  }

}
