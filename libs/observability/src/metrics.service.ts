import { Injectable } from '@nestjs/common';
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry: Registry;

  readonly taskDuration: Histogram;
  readonly taskCompleted: Counter;
  readonly taskFailed: Counter;
  readonly taskDlq: Counter;
  readonly taskTimeout: Counter;
  readonly taskCostUsd: Counter;
  readonly taskTokens: Counter;
  readonly queueDepth: Gauge;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });

    this.taskDuration = new Histogram({
      name: 'task_processing_duration_seconds',
      help: 'Duration of task processing in seconds',
      labelNames: ['status'] as const,
      buckets: [0.1, 0.5, 1, 2, 3, 5, 10],
      registers: [this.registry],
    });

    this.taskCompleted = new Counter({
      name: 'task_completed_total',
      help: 'Total number of completed tasks',
      registers: [this.registry],
    });

    this.taskFailed = new Counter({
      name: 'task_failed_total',
      help: 'Total number of failed task attempts',
      registers: [this.registry],
    });

    this.taskDlq = new Counter({
      name: 'task_dlq_total',
      help: 'Total number of tasks moved to DLQ',
      registers: [this.registry],
    });

    this.taskTimeout = new Counter({
      name: 'task_timeout_total',
      help: 'Total number of task timeouts (SLA violations)',
      registers: [this.registry],
    });

    this.taskCostUsd = new Counter({
      name: 'task_cost_usd_total',
      help: 'Total cost in USD across all tasks',
      registers: [this.registry],
    });

    this.taskTokens = new Counter({
      name: 'task_tokens_total',
      help: 'Total tokens consumed',
      labelNames: ['direction'] as const,
      registers: [this.registry],
    });

    this.queueDepth = new Gauge({
      name: 'task_queue_depth',
      help: 'Current queue depth by state',
      labelNames: ['state'] as const,
      registers: [this.registry],
    });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
