import { Module } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MetricsService } from '@app/observability';
import { QueueModule, TASK_QUEUE, TASK_DLQ } from '@app/queue';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [QueueModule],
  controllers: [MetricsController],
})
export class MetricsModule {
  private interval: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly metrics: MetricsService,
    @InjectQueue(TASK_QUEUE) private readonly taskQueue: Queue,
    @InjectQueue(TASK_DLQ) private readonly dlqQueue: Queue,
  ) {}

  onModuleInit() {
    // Collect queue depth every 5 seconds
    this.interval = setInterval(async () => {
      const waiting = await this.taskQueue.getWaitingCount();
      const active = await this.taskQueue.getActiveCount();
      const dlq = await this.dlqQueue.getWaitingCount();

      this.metrics.queueDepth.set({ state: 'waiting' }, waiting);
      this.metrics.queueDepth.set({ state: 'active' }, active);
      this.metrics.queueDepth.set({ state: 'dlq' }, dlq);
    }, 5000);
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }
}
