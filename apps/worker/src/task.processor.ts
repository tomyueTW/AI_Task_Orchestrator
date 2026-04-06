import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TASK_QUEUE } from '@app/queue';

@Processor(TASK_QUEUE)
export class TaskProcessor extends WorkerHost {
  private readonly logger = new Logger(TaskProcessor.name);

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
