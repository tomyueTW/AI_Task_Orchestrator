import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import {
  CHAOS_KEY,
  CHAOS_CATALOG,
  ChaosAction,
  ChaosDirective,
} from '@app/queue';
import { REDIS_CONNECTION, RedisConnectionConfig } from '@app/queue/queue.module';

const DEFAULT_DURATION_MS = 15000;
const DEFAULT_LATENCY_MS = 35000; // > default TASK_TIMEOUT_MS (30s) → guaranteed timeout

export interface ChaosTriggerResult {
  action: ChaosAction;
  issuedAt: number;
  until: number;
  durationMs: number;
  latencyMs?: number;
  description: string;
  expects: string[];
}

@Injectable()
export class ChaosService implements OnModuleDestroy {
  private readonly logger = new Logger(ChaosService.name);
  private readonly redis: Redis;

  constructor(
    @Inject(REDIS_CONNECTION) redisConfig: RedisConnectionConfig,
  ) {
    this.redis = new Redis(redisConfig);
  }

  async trigger(
    action: ChaosAction,
    opts: { durationMs?: number; latencyMs?: number },
  ): Promise<ChaosTriggerResult> {
    const now = Date.now();
    const durationMs = opts.durationMs ?? DEFAULT_DURATION_MS;
    const until = now + durationMs;
    const latencyMs =
      action === 'injectLatency'
        ? (opts.latencyMs ?? DEFAULT_LATENCY_MS)
        : undefined;

    const directive: ChaosDirective = {
      action,
      issuedAt: now,
      until,
      latencyMs,
    };

    // PX TTL with a small buffer so the Worker can still observe the final tick.
    await this.redis.set(
      CHAOS_KEY,
      JSON.stringify(directive),
      'PX',
      durationMs + 2000,
    );

    this.logger.warn(
      `Chaos triggered: ${action} for ${durationMs}ms` +
        (latencyMs ? ` (latency=${latencyMs}ms)` : ''),
    );

    return {
      action,
      issuedAt: now,
      until,
      durationMs,
      latencyMs,
      description: CHAOS_CATALOG[action].description,
      expects: CHAOS_CATALOG[action].expects,
    };
  }

  async status(): Promise<{
    active: ChaosDirective | null;
    catalog: typeof CHAOS_CATALOG;
  }> {
    const raw = await this.redis.get(CHAOS_KEY);
    let active: ChaosDirective | null = null;
    if (raw) {
      const d = JSON.parse(raw) as ChaosDirective;
      if (d.until > Date.now()) active = d;
    }
    return { active, catalog: CHAOS_CATALOG };
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
