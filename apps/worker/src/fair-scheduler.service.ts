import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Worker, Job, Queue } from 'bullmq';
import Redis from 'ioredis';
import { TASK_QUEUE_PREFIX, TASK_DLQ } from '@app/queue';
import { REDIS_CONNECTION, RedisConnectionConfig } from '@app/queue/queue.module';
import { MetricsService } from '@app/observability';

@Injectable()
export class FairScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FairScheduler.name);
  private readonly workers = new Map<string, Worker>();
  private readonly redis: Redis;
  private readonly perUserConcurrency: number;
  private readonly failureRate: number;
  private scanInterval: ReturnType<typeof setInterval> | undefined;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly redisConfig: RedisConnectionConfig,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
    @InjectQueue(TASK_DLQ) private readonly dlqQueue: Queue,
  ) {
    this.redis = new Redis(redisConfig);
    this.perUserConcurrency = parseInt(
      config.get('MAX_CONCURRENCY_PER_USER', '1'),
      10,
    );
    this.failureRate = parseFloat(config.get('TASK_FAILURE_RATE', '0'));
  }

  async onModuleInit() {
    this.logger.log(
      `FairScheduler started — per-user concurrency=${this.perUserConcurrency}`,
    );

    // Initial scan
    await this.discoverQueues();

    // Periodically scan for new user queues
    this.scanInterval = setInterval(() => this.discoverQueues(), 5000);
  }

  async onModuleDestroy() {
    if (this.scanInterval) clearInterval(this.scanInterval);

    this.logger.log('FairScheduler shutting down — closing all workers...');
    const closePromises = Array.from(this.workers.values()).map((w) => w.close());
    await Promise.all(closePromises);
    await this.redis.quit();
    this.logger.log('FairScheduler closed gracefully');
  }

  private async discoverQueues() {
    // Scan for BullMQ queue meta keys: bull:{queueName}:meta
    const keys = await this.redis.keys(`bull:${TASK_QUEUE_PREFIX}*:meta`);

    for (const key of keys) {
      // Extract queue name: bull:tasks:user-alice:meta → tasks:user-alice
      const match = key.match(/^bull:(.+):meta$/);
      if (!match) continue;

      const queueName = match[1];
      if (this.workers.has(queueName)) continue;

      this.createWorker(queueName);
    }
  }

  private createWorker(queueName: string) {
    const worker = new Worker(
      queueName,
      async (job: Job) => this.processJob(job),
      {
        connection: this.redisConfig,
        concurrency: this.perUserConcurrency,
      },
    );

    worker.on('completed', (job: Job) => {
      this.metrics.taskCompleted.inc();
      this.logger.log(`[${queueName}] Job ${job.id} completed`);
    });

    worker.on('failed', async (job: Job | undefined, error: Error) => {
      if (!job) return;
      this.metrics.taskFailed.inc();

      const maxAttempts = job.opts.attempts ?? 1;
      if (job.attemptsMade >= maxAttempts) {
        this.logger.error(
          `[${queueName}] Job ${job.id} exhausted ${maxAttempts} attempts — moving to DLQ`,
        );
        this.metrics.taskDlq.inc();
        await this.dlqQueue.add('dead-letter', {
          ...job.data,
          originalJobId: job.id,
          failedReason: error.message,
          failedAt: new Date().toISOString(),
        });
      } else {
        this.logger.warn(
          `[${queueName}] Job ${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}): ${error.message}`,
        );
      }
    });

    this.workers.set(queueName, worker);
    this.logger.log(`Worker created for queue: ${queueName}`);
  }

  private async processJob(job: Job): Promise<Record<string, unknown>> {
    this.logger.log(
      `Processing job ${job.id} for user ${job.data.userId} (attempt ${job.attemptsMade + 1}/${job.opts.attempts})`,
    );

    const start = Date.now();

    // Simulate failure for testing
    if (this.failureRate > 0 && Math.random() < this.failureRate) {
      const durationSec = (Date.now() - start) / 1000;
      this.metrics.taskDuration.observe({ status: 'failed' }, durationSec);
      throw new Error(`Simulated failure for job ${job.id}`);
    }

    const { payload } = job.data;

    // Simulate AI task processing (1-3s)
    const duration = 1000 + Math.random() * 2000;
    await new Promise((resolve) => setTimeout(resolve, duration));

    const durationSec = (Date.now() - start) / 1000;
    this.metrics.taskDuration.observe({ status: 'completed' }, durationSec);

    this.logger.log(`Job ${job.id} processed in ${Math.round(duration)}ms`);

    return { result: 'ok', processedAt: new Date().toISOString(), payload };
  }
}
