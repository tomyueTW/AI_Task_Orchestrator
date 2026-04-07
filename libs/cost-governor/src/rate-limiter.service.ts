import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { MetricsService } from '@app/observability';

const KEY_PREFIX = 'ratelimit:';

// Lua script: atomic token bucket — returns 1 if token acquired, 0 if not
const ACQUIRE_SCRIPT = `
  local key = KEYS[1]
  local max = tonumber(ARGV[1])
  local window = tonumber(ARGV[2])
  local now = tonumber(ARGV[3])

  local bucket = redis.call('HMGET', key, 'tokens', 'last')
  local tokens = tonumber(bucket[1])
  local last = tonumber(bucket[2])

  if tokens == nil then
    tokens = max
    last = now
  end

  local elapsed = now - last
  local refill = elapsed / window * max
  tokens = math.min(max, tokens + refill)
  last = now

  if tokens >= 1 then
    tokens = tokens - 1
    redis.call('HMSET', key, 'tokens', tokens, 'last', last)
    redis.call('EXPIRE', key, window * 2)
    return 1
  else
    redis.call('HMSET', key, 'tokens', tokens, 'last', last)
    redis.call('EXPIRE', key, window * 2)
    return 0
  end
`;

@Injectable()
export class RateLimiterService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly redis: Redis;
  private readonly limits: Record<string, number>;
  private readonly windowSeconds = 60; // 1 minute

  constructor(
    config: ConfigService,
    private readonly metrics: MetricsService,
  ) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: parseInt(config.get('REDIS_PORT', '6379'), 10),
    });

    this.limits = {
      anthropic: parseInt(config.get('ANTHROPIC_RPM_LIMIT', '50'), 10),
      openai: parseInt(config.get('OPENAI_RPM_LIMIT', '60'), 10),
      ollama: parseInt(config.get('OLLAMA_RPM_LIMIT', '999'), 10),
    };

    this.logger.log(
      `Rate limits: ${Object.entries(this.limits).map(([k, v]) => `${k}=${v} RPM`).join(', ')}`,
    );
  }

  async acquire(provider: string): Promise<boolean> {
    const max = this.limits[provider] ?? 999;
    const now = Date.now() / 1000;

    const result = await this.redis.eval(
      ACQUIRE_SCRIPT,
      1,
      `${KEY_PREFIX}${provider}`,
      max,
      this.windowSeconds,
      now,
    );

    return result === 1;
  }

  async waitForToken(provider: string): Promise<void> {
    if (await this.acquire(provider)) return;

    this.metrics.taskRateLimited.inc({ provider });
    this.logger.warn(`Rate limited: ${provider} — waiting for token`);

    while (!(await this.acquire(provider))) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
