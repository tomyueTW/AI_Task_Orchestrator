import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ModelCostRow {
  model: string;
  taskType: string;
  count: number;
}

export interface CostSummary {
  ts: string;
  source: string;
  totalCostUsd: number;
  totalTokens: { input: number; output: number };
  rateLimitedByProvider: Record<string, number>;
  routedByModel: ModelCostRow[];
  failures: { failed: number; dlq: number; timeout: number };
  raw: { available: boolean; error?: string };
}

@Injectable()
export class CostSummaryService {
  private readonly logger = new Logger(CostSummaryService.name);
  private readonly workerMetricsUrl: string;

  constructor(config: ConfigService) {
    this.workerMetricsUrl = config.get(
      'WORKER_METRICS_URL',
      'http://localhost:9091/',
    );
  }

  async fetchSummary(): Promise<CostSummary> {
    let text = '';
    let available = true;
    let error: string | undefined;

    try {
      const res = await fetch(this.workerMetricsUrl);
      if (!res.ok) throw new Error(`worker metrics returned ${res.status}`);
      text = await res.text();
    } catch (err: unknown) {
      available = false;
      error = (err as Error).message;
      this.logger.warn(`Could not fetch worker metrics: ${error}`);
    }

    return {
      ts: new Date().toISOString(),
      source: this.workerMetricsUrl,
      totalCostUsd: parseSimpleCounter(text, 'task_cost_usd_total'),
      totalTokens: {
        input: parseLabeledCounter(text, 'task_tokens_total', { direction: 'input' }),
        output: parseLabeledCounter(text, 'task_tokens_total', { direction: 'output' }),
      },
      rateLimitedByProvider: parseAllLabels(text, 'task_rate_limited_total', 'provider'),
      routedByModel: parseRouted(text),
      failures: {
        failed: parseSimpleCounter(text, 'task_failed_total'),
        dlq: parseSimpleCounter(text, 'task_dlq_total'),
        timeout: parseSimpleCounter(text, 'task_timeout_total'),
      },
      raw: { available, error },
    };
  }
}

function parseSimpleCounter(text: string, name: string): number {
  const re = new RegExp(`^${name}\\s+(\\d+(?:\\.\\d+)?)`, 'm');
  const m = re.exec(text);
  return m ? Number(m[1]) : 0;
}

function parseLabeledCounter(
  text: string,
  name: string,
  labels: Record<string, string>,
): number {
  const labelStr = Object.entries(labels)
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
  const re = new RegExp(`^${name}\\{[^}]*${escapeRegex(labelStr)}[^}]*\\}\\s+(\\d+(?:\\.\\d+)?)`, 'm');
  const m = re.exec(text);
  return m ? Number(m[1]) : 0;
}

function parseAllLabels(
  text: string,
  name: string,
  labelKey: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  const re = new RegExp(`^${name}\\{([^}]*)\\}\\s+(\\d+(?:\\.\\d+)?)`, 'gm');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const labelMatch = new RegExp(`${labelKey}="([^"]+)"`).exec(m[1]);
    if (labelMatch) {
      out[labelMatch[1]] = Number(m[2]);
    }
  }
  return out;
}

function parseRouted(text: string): ModelCostRow[] {
  const out: ModelCostRow[] = [];
  const re = /^task_routed_total\{([^}]*)\}\s+(\d+(?:\.\d+)?)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const labels = m[1];
    const count = Number(m[2]);
    const model = /model="([^"]+)"/.exec(labels)?.[1] ?? 'unknown';
    const taskType = /taskType="([^"]+)"/.exec(labels)?.[1] ?? 'none';
    out.push({ model, taskType, count });
  }
  return out.sort((a, b) => b.count - a.count);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
