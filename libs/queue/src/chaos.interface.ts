/**
 * Chaos control channel (10月 W3).
 *
 * The API process has no handle to the Worker process, so `POST /admin/chaos/:action`
 * writes a *time-boxed* directive to this Redis key; the Worker polls it (~1s) and
 * self-applies. Every effect auto-expires at `until` → reversible & demoable.
 *
 * This is intentionally distinct from the 8月 W4 `tests/chaos/` scripts, which do
 * real OS/Docker-level chaos (SIGKILL, `docker pause`). The panel is the safe,
 * UI-driven simulation; the scripts are the real out-of-band drill.
 */
export const CHAOS_KEY = 'chaos:directive';

export type ChaosAction = 'killWorker' | 'pauseRedis' | 'injectLatency';

export const CHAOS_ACTIONS: ChaosAction[] = [
  'killWorker',
  'pauseRedis',
  'injectLatency',
];

export interface ChaosDirective {
  action: ChaosAction;
  /** epoch ms when issued — used by the Worker to act once per directive */
  issuedAt: number;
  /** epoch ms until which the effect stays active */
  until: number;
  /** injectLatency only: artificial delay added before each LLM call (ms) */
  latencyMs?: number;
}

export interface ChaosActionMeta {
  description: string;
  /** Prometheus metrics expected to move when this action fires */
  expects: string[];
}

export const CHAOS_CATALOG: Record<ChaosAction, ChaosActionMeta> = {
  killWorker: {
    description:
      '時間窗內關閉所有 BullMQ Worker 再重建 — 進行中的 job 變 stalled，由 BullMQ 心跳恢復自動 re-queue（模擬崩潰；真實 SIGKILL 見 tests/chaos/kill-worker.ts）',
    expects: ['task_failed_total', 'task_dlq_total'],
  },
  pauseRedis: {
    description:
      '時間窗內 pause（非 close）所有 Worker — 佇列堆積、不丟 job，窗口結束自動 resume（模擬 Redis 不可用對吞吐的衝擊）',
    expects: ['task_queue_depth'],
  },
  injectLatency: {
    description:
      '每次 LLM 呼叫前注入人工延遲 — 超過 TASK_TIMEOUT_MS 觸發硬超時、重試耗盡入 DLQ',
    expects: ['task_timeout_total', 'task_dlq_total'],
  },
};
