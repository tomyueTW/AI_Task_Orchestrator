import { useEffect, useRef, useState } from 'react';

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

export interface CostTrendPoint {
  ts: string;
  costUsd: number;
}

const TREND_LIMIT = 60;

export function useCostSummary(intervalMs = 5000): {
  summary: CostSummary | null;
  trend: CostTrendPoint[];
  error: string | null;
} {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [trend, setTrend] = useState<CostTrendPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const res = await fetch('/metrics/summary');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as CostSummary;
        if (cancelled.current) return;
        setSummary(data);
        setError(data.raw.available ? null : (data.raw.error ?? 'unavailable'));
        setTrend((prev) => {
          const next = [...prev, { ts: data.ts, costUsd: data.totalCostUsd }];
          return next.length > TREND_LIMIT ? next.slice(-TREND_LIMIT) : next;
        });
      } catch (err: unknown) {
        if (!cancelled.current) setError((err as Error).message);
      } finally {
        if (!cancelled.current) timer = setTimeout(tick, intervalMs);
      }
    };

    tick();

    return () => {
      cancelled.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [intervalMs]);

  return { summary, trend, error };
}
