import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { TASK_DLQ, TASK_QUEUE_PREFIX } from '@app/queue';
import { REDIS_CONNECTION, RedisConnectionConfig } from '@app/queue/queue.module';

const BASE_PATH = '/admin/queues';

@Injectable()
export class AdminService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AdminService.name);
  private readonly redis: Redis;
  private readonly queues = new Map<string, Queue>();
  private readonly scanIntervalMs: number;
  private scanInterval?: ReturnType<typeof setInterval>;
  private boardAddQueue?: (queue: BullMQAdapter) => void;
  private boardRemoveQueue?: (name: string) => void;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly redisConfig: RedisConnectionConfig,
    private readonly adapterHost: HttpAdapterHost,
    private readonly config: ConfigService,
  ) {
    this.redis = new Redis(redisConfig);
    this.scanIntervalMs = parseInt(
      config.get('ADMIN_QUEUE_SCAN_INTERVAL_MS', '5000'),
      10,
    );
  }

  async onApplicationBootstrap() {
    const httpAdapter = this.adapterHost.httpAdapter;
    if (!httpAdapter) {
      this.logger.warn('No HTTP adapter available — Bull Board disabled');
      return;
    }

    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath(BASE_PATH);

    const board = createBullBoard({ queues: [], serverAdapter });
    this.boardAddQueue = board.addQueue.bind(board);
    this.boardRemoveQueue = board.removeQueue.bind(board);

    httpAdapter.getInstance().use(BASE_PATH, serverAdapter.getRouter());
    this.logger.log(`Bull Board mounted at ${BASE_PATH}`);

    // Register DLQ + existing user queues, then rescan periodically
    await this.registerQueue(TASK_DLQ);
    await this.discoverUserQueues();
    this.scanInterval = setInterval(() => {
      this.discoverUserQueues().catch((err) =>
        this.logger.error(`Queue discovery failed: ${err.message}`),
      );
    }, this.scanIntervalMs);
  }

  async onModuleDestroy() {
    if (this.scanInterval) clearInterval(this.scanInterval);
    await Promise.all(Array.from(this.queues.values()).map((q) => q.close()));
    await this.redis.quit();
    this.logger.log('AdminService closed');
  }

  private async discoverUserQueues() {
    const keys = await this.redis.keys(`bull:${TASK_QUEUE_PREFIX}*:meta`);
    for (const key of keys) {
      const match = key.match(/^bull:(.+):meta$/);
      if (!match) continue;
      const queueName = match[1];
      if (this.queues.has(queueName)) continue;
      await this.registerQueue(queueName);
    }
  }

  private async registerQueue(name: string) {
    if (this.queues.has(name) || !this.boardAddQueue) return;
    const queue = new Queue(name, { connection: this.redisConfig });
    this.queues.set(name, queue);
    this.boardAddQueue(new BullMQAdapter(queue));
    this.logger.log(`Queue registered in Bull Board: ${name}`);
  }
}
