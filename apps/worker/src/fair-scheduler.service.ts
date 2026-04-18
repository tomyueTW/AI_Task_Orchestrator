import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Worker, Job, Queue } from 'bullmq';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  TASK_QUEUE_PREFIX,
  TASK_DLQ,
  TaskPriority,
  PRIORITY_MAP,
  getUserQueueName,
} from '@app/queue';
import { REDIS_CONNECTION, RedisConnectionConfig } from '@app/queue/queue.module';
import { MetricsService } from '@app/observability';
import { LlmService, CostTrackerService } from '@app/cost-governor';
import { RouterService } from '@app/router';
import { DagCoordinator } from '@app/workflow';

@Injectable()
export class FairScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FairScheduler.name);
  private readonly workers = new Map<string, Worker>();
  private readonly enqueueQueues = new Map<string, Queue>();
  private readonly redis: Redis;
  private readonly dagCoordinator: DagCoordinator;
  private readonly perUserConcurrency: number;
  private readonly failureRate: number;
  private readonly timeoutMs: number;
  private scanInterval: ReturnType<typeof setInterval> | undefined;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly redisConfig: RedisConnectionConfig,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
    private readonly llm: LlmService,
    private readonly costTracker: CostTrackerService,
    private readonly router: RouterService,
    @InjectQueue(TASK_DLQ) private readonly dlqQueue: Queue,
  ) {
    this.redis = new Redis(redisConfig);
    this.dagCoordinator = new DagCoordinator(this.redis);
    this.perUserConcurrency = parseInt(
      config.get('MAX_CONCURRENCY_PER_USER', '1'),
      10,
    );
    this.failureRate = parseFloat(config.get('TASK_FAILURE_RATE', '0'));
    this.timeoutMs = parseInt(config.get('TASK_TIMEOUT_MS', '30000'), 10);
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
    const enqueuePromises = Array.from(this.enqueueQueues.values()).map((q) => q.close());
    await Promise.all([...closePromises, ...enqueuePromises]);
    await this.redis.quit();
    this.logger.log('FairScheduler closed gracefully');
  }

  private getEnqueueQueue(userId: string): Queue {
    const existing = this.enqueueQueues.get(userId);
    if (existing) return existing;
    const queue = new Queue(getUserQueueName(userId), { connection: this.redisConfig });
    this.enqueueQueues.set(userId, queue);
    return queue;
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

    worker.on('completed', async (job: Job, result: unknown) => {
      this.metrics.taskCompleted.inc();
      this.logger.log(`[${queueName}] Job ${job.id} completed`);
      await this.onDagNodeCompleted(job, result);
    });

    worker.on('failed', async (job: Job | undefined, error: Error) => {
      if (!job) return;
      this.metrics.taskFailed.inc();

      if (error.message.includes('timed out')) {
        this.metrics.taskTimeout.inc();
        this.logger.warn(`[${queueName}] Job ${job.id} timed out`);
      }

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

        // DAG: mark the node as failed; downstream nodes will never fire (pendingDeps never reaches 0)
        if (job.data.dagId && job.data.dagNodeId) {
          await this.dagCoordinator.markFailed(
            job.data.dagId,
            job.data.dagNodeId,
            error.message,
          );
          this.logger.warn(
            `DAG ${job.data.dagId} node ${job.data.dagNodeId} failed — downstream blocked`,
          );
        }
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
      `Processing job ${job.id} [priority=${job.data.priority ?? 'normal'}] for user ${job.data.userId} (attempt ${job.attemptsMade + 1}/${job.opts.attempts})`,
    );

    const start = Date.now();

    // Simulate failure for testing
    if (this.failureRate > 0 && Math.random() < this.failureRate) {
      const durationSec = (Date.now() - start) / 1000;
      this.metrics.taskDuration.observe({ status: 'failed' }, durationSec);
      throw new Error(`Simulated failure for job ${job.id}`);
    }

    const { payload } = job.data;
    const modelId = this.router.resolve(job.data.model, job.data.taskType);
    this.metrics.taskRouted.inc({ taskType: job.data.taskType ?? 'none', model: modelId });

    // Sequential Chain: inject previous step output into payload
    let effectivePayload: Record<string, unknown> = payload;
    const childrenValues = await job.getChildrenValues();
    const childKeys = Object.keys(childrenValues);
    if (childKeys.length > 0) {
      const previousResult = childrenValues[childKeys[0]];
      effectivePayload = { ...payload, previousResult };
      this.logger.log(
        `Job ${job.id} received previousResult from ${childKeys.length} child job(s)`,
      );
    }

    // DAG: inject upstream node results into payload.dependencies
    if (job.data.dagId && job.data.dagNodeId) {
      await this.dagCoordinator.markActive(job.data.dagId, job.data.dagNodeId);
      const node = await this.dagCoordinator.getNode(job.data.dagId, job.data.dagNodeId);
      const depIds = node?.dependsOn ?? [];
      if (depIds.length > 0) {
        const dependencies = await this.dagCoordinator.getResults(job.data.dagId, depIds);
        effectivePayload = { ...effectivePayload, dependencies };
        this.logger.log(
          `DAG node ${job.data.dagNodeId} received ${depIds.length} upstream result(s)`,
        );
      }
    }

    const prompt = (effectivePayload.prompt as string) ?? JSON.stringify(effectivePayload);

    // Hard timeout wrapper
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Job ${job.id} timed out after ${this.timeoutMs}ms`)),
        this.timeoutMs,
      );
    });

    // Call real LLM API
    const llmResponse = await Promise.race([
      this.llm.call(modelId, prompt),
      timeoutPromise,
    ]);

    const costRecord = this.costTracker.record(
      job.id!,
      llmResponse.model,
      llmResponse.inputTokens,
      llmResponse.outputTokens,
    );

    const durationSec = (Date.now() - start) / 1000;
    this.metrics.taskDuration.observe({ status: 'completed' }, durationSec);

    this.logger.log(`Job ${job.id} processed in ${Math.round(durationSec * 1000)}ms`);

    return {
      result: llmResponse.content,
      model: llmResponse.model,
      tokenUsage: { input: llmResponse.inputTokens, output: llmResponse.outputTokens },
      cost: costRecord.costUsd,
      processedAt: new Date().toISOString(),
    };
  }

  /**
   * Called after a job successfully completes. If the job belongs to a DAG,
   * decrement pendingDeps on its downstream nodes and enqueue any that are now ready.
   */
  private async onDagNodeCompleted(job: Job, result: unknown): Promise<void> {
    const { dagId, dagNodeId, userId, priority } = job.data;
    if (!dagId || !dagNodeId) return;

    const readyNodes = await this.dagCoordinator.markCompleteAndFindReady(
      dagId,
      dagNodeId,
      result,
    );
    if (readyNodes.length === 0) return;

    const taskPriority = (priority as TaskPriority) ?? TaskPriority.NORMAL;
    const queue = this.getEnqueueQueue(userId);

    for (const node of readyNodes) {
      const jobId = uuidv4();
      await this.dagCoordinator.setJobId(dagId, node.id, jobId);
      await queue.add(
        'process',
        {
          id: jobId,
          userId,
          priority: taskPriority,
          taskType: node.taskType,
          model: node.model,
          payload: node.payload,
          createdAt: new Date().toISOString(),
          dagId,
          dagNodeId: node.id,
        },
        {
          jobId,
          priority: PRIORITY_MAP[taskPriority],
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      );
      this.logger.log(`DAG ${dagId} enqueued downstream node ${node.id} as job ${jobId}`);
    }
  }
}
