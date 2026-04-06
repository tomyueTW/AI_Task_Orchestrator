import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { TASK_QUEUE } from '@app/queue';

@Processor(TASK_QUEUE)
export class TaskProcessor
  extends WorkerHost
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TaskProcessor.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  onModuleInit() {
    const concurrency = parseInt(this.config.get('WORKER_CONCURRENCY', '3'), 10);
    this.worker.concurrency = concurrency;
    this.logger.log(`Worker started with concurrency=${concurrency}`);
  }

  async onModuleDestroy() {
    this.logger.log('Worker shutting down — waiting for active jobs...');
    await this.worker.close();
    this.logger.log('Worker closed gracefully');
  }

  async process(job: Job): Promise<Record<string, unknown>> {
    this.logger.log(`Processing job ${job.id} — name: ${job.name}`);

    const { payload } = job.data;

    // Simulate AI task processing with variable duration (1-3s)
    const duration = 1000 + Math.random() * 2000;
    await new Promise((resolve) => setTimeout(resolve, duration));

    this.logger.log(
      `Job ${job.id} processed in ${Math.round(duration)}ms`,
    );

    return { result: 'ok', processedAt: new Date().toISOString(), payload };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }
}
