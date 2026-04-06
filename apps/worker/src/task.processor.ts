import { Processor, WorkerHost, OnWorkerEvent, InjectQueue } from '@nestjs/bullmq';
import { Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { TASK_QUEUE, TASK_DLQ } from '@app/queue';

@Processor(TASK_QUEUE)
export class TaskProcessor
  extends WorkerHost
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TaskProcessor.name);
  private readonly failureRate: number;

  constructor(
    private readonly config: ConfigService,
    @InjectQueue(TASK_DLQ) private readonly dlqQueue: Queue,
  ) {
    super();
    this.failureRate = parseFloat(config.get('TASK_FAILURE_RATE', '0'));
  }

  onModuleInit() {
    const concurrency = parseInt(this.config.get('WORKER_CONCURRENCY', '3'), 10);
    this.worker.concurrency = concurrency;
    this.logger.log(`Worker started with concurrency=${concurrency}`);
    if (this.failureRate > 0) {
      this.logger.warn(`Failure simulation enabled: rate=${this.failureRate}`);
    }
  }

  async onModuleDestroy() {
    this.logger.log('Worker shutting down — waiting for active jobs...');
    await this.worker.close();
    this.logger.log('Worker closed gracefully');
  }

  async process(job: Job): Promise<Record<string, unknown>> {
    this.logger.log(
      `Processing job ${job.id} (attempt ${job.attemptsMade + 1}/${job.opts.attempts})`,
    );

    // Simulate failure for testing
    if (this.failureRate > 0 && Math.random() < this.failureRate) {
      throw new Error(`Simulated failure for job ${job.id}`);
    }

    const { payload } = job.data;

    // Simulate AI task processing with variable duration (1-3s)
    const duration = 1000 + Math.random() * 2000;
    await new Promise((resolve) => setTimeout(resolve, duration));

    this.logger.log(`Job ${job.id} processed in ${Math.round(duration)}ms`);

    return { result: 'ok', processedAt: new Date().toISOString(), payload };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job | undefined, error: Error) {
    if (!job) return;

    const maxAttempts = job.opts.attempts ?? 1;

    if (job.attemptsMade >= maxAttempts) {
      this.logger.error(
        `Job ${job.id} exhausted all ${maxAttempts} attempts — moving to DLQ`,
      );
      await this.dlqQueue.add('dead-letter', {
        ...job.data,
        originalJobId: job.id,
        failedReason: error.message,
        failedAt: new Date().toISOString(),
      });
    } else {
      this.logger.warn(
        `Job ${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}): ${error.message}`,
      );
    }
  }
}
