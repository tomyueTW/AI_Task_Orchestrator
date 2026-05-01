import { Inject, Module } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { MetricsService } from '@app/observability';
import { QueueModule, TASK_QUEUE_PREFIX, TASK_DLQ } from '@app/queue';
import { REDIS_CONNECTION, RedisConnectionConfig } from '@app/queue/queue.module';
import { MetricsController } from './metrics.controller';
import { CostSummaryService } from './cost-summary.service';

@Module({
  imports: [QueueModule],
  controllers: [MetricsController],
  providers: [CostSummaryService],
})
export class MetricsModule {
  private interval: ReturnType<typeof setInterval> | undefined;
  private readonly redis: Redis;

  constructor(
    private readonly metrics: MetricsService,
    @Inject(REDIS_CONNECTION) redisConfig: RedisConnectionConfig,
    @InjectQueue(TASK_DLQ) private readonly dlqQueue: Queue,
  ) {
    this.redis = new Redis(redisConfig);
  }

  onModuleInit() {
    this.interval = setInterval(async () => {
      // Discover all user queues and aggregate depth
      const keys = await this.redis.keys(`bull:${TASK_QUEUE_PREFIX}*:meta`);
      let totalWaiting = 0;
      let totalActive = 0;

      for (const key of keys) {
        const match = key.match(/^bull:(.+):meta$/);
        if (!match) continue;
        const queueName = match[1];
        const q = new Queue(queueName, { connection: { host: this.redis.options.host as string, port: this.redis.options.port as number } });
        totalWaiting += await q.getWaitingCount();
        totalActive += await q.getActiveCount();
        await q.close();
      }

      const dlq = await this.dlqQueue.getWaitingCount();

      this.metrics.queueDepth.set({ state: 'waiting' }, totalWaiting);
      this.metrics.queueDepth.set({ state: 'active' }, totalActive);
      this.metrics.queueDepth.set({ state: 'dlq' }, dlq);
    }, 5000);
  }

  async onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
    await this.redis.quit();
  }
}
