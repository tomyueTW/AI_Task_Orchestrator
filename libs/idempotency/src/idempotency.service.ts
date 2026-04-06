import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface IdempotencyEntry {
  status: 'processing' | 'done';
  response?: unknown;
}

const KEY_PREFIX = 'idempotency:';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly redis: Redis;
  private readonly ttlSeconds: number;

  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: parseInt(config.get('REDIS_PORT', '6379'), 10),
    });
    this.ttlSeconds = parseInt(
      config.get('IDEMPOTENCY_TTL_SECONDS', '86400'),
      10,
    );
  }

  async acquire(key: string): Promise<IdempotencyEntry | null> {
    const redisKey = KEY_PREFIX + key;
    const value = JSON.stringify({ status: 'processing' } satisfies IdempotencyEntry);

    // SETNX + TTL in one atomic operation
    const result = await this.redis.set(redisKey, value, 'EX', this.ttlSeconds, 'NX');

    if (result === 'OK') {
      // Key did not exist — we acquired it
      this.logger.debug(`Idempotency key acquired: ${key}`);
      return null;
    }

    // Key exists — read the stored entry
    const existing = await this.redis.get(redisKey);
    if (!existing) {
      // Race condition: key expired between SET and GET — treat as new
      return null;
    }

    const entry = JSON.parse(existing) as IdempotencyEntry;
    this.logger.debug(`Idempotency key hit: ${key} (status=${entry.status})`);
    return entry;
  }

  async complete(key: string, response: unknown): Promise<void> {
    const redisKey = KEY_PREFIX + key;
    const value = JSON.stringify({ status: 'done', response } satisfies IdempotencyEntry);

    await this.redis.set(redisKey, value, 'EX', this.ttlSeconds);
    this.logger.debug(`Idempotency key completed: ${key}`);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
