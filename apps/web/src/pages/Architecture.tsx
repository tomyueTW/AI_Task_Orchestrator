import { useState } from 'react';

type Category = 'app' | 'infra' | 'external';

interface AdrRef {
  id: string;
  title: string;
  /** repo path when the ADR is written; undefined ⇒ still draft/pending */
  doc?: string;
  status: 'Accepted' | 'Draft' | 'Pending';
}

interface Component {
  id: string;
  label: string;
  sub: string;
  category: Category;
  x: number;
  y: number;
  w: number;
  h: number;
  description: string;
  adrs: AdrRef[];
  codePaths: string[];
  metrics: string[];
}

interface Edge {
  from: string;
  to: string;
  label: string;
  /** dashed = observability scrape path; solid = data path */
  dashed?: boolean;
}

const ADR = {
  a001: {
    id: 'ADR-001',
    title: '選用 NestJS + BullMQ 作為核心引擎',
    doc: 'docs/ADR-001-nestjs-bullmq-core-engine.md',
    status: 'Accepted',
  } as AdrRef,
  a002: {
    id: 'ADR-002',
    title: '冪等性實作策略 (Redis SETNX)',
    status: 'Draft',
  } as AdrRef,
  a003: {
    id: 'ADR-003',
    title: '可觀測性技術棧 (Prometheus + Grafana)',
    status: 'Draft',
  } as AdrRef,
  a004: {
    id: 'ADR-004',
    title: '公平調度演算法選型 (Per-User Queues)',
    status: 'Draft',
  } as AdrRef,
  a005: {
    id: 'ADR-005',
    title: 'AI 路由決策引擎設計',
    status: 'Pending',
  } as AdrRef,
  a006: {
    id: 'ADR-006',
    title: 'DAG 依賴拓撲排序策略',
    doc: 'docs/ADR-006-dag-topological-sort.md',
    status: 'Accepted',
  } as AdrRef,
  a007: {
    id: 'ADR-007',
    title: '成本模型與模型註冊表設計',
    status: 'Pending',
  } as AdrRef,
  a008: {
    id: 'ADR-008',
    title: '前端技術選型（React + Vite + Tailwind v4）',
    doc: 'docs/ADR-008-frontend-tech-selection.md',
    status: 'Accepted',
  } as AdrRef,
};

const COMPONENTS: Component[] = [
  {
    id: 'web',
    label: 'Web 前端',
    sub: 'React 18 · Vite',
    category: 'app',
    x: 420,
    y: 20,
    w: 170,
    h: 64,
    description:
      '即時儀表板、DAG 視覺化/編輯器、成本面板、Chaos 控制台、架構地圖。透過 Vite proxy 連 API，SSE + 輪詢更新。',
    adrs: [ADR.a008],
    codePaths: ['apps/web/src/App.tsx', 'apps/web/src/lib/useQueueStream.ts'],
    metrics: ['—（消費端，不產生指標）'],
  },
  {
    id: 'api',
    label: 'API',
    sub: 'NestJS · :3000',
    category: 'app',
    x: 120,
    y: 170,
    w: 180,
    h: 84,
    description:
      'HTTP 入口：建立任務（背壓 + 冪等）、Chain/DAG 工作流、SSE 串流、Bull Board、/admin/chaos。寫入 per-user 佇列與 chaos 指令。',
    adrs: [ADR.a001, ADR.a002],
    codePaths: [
      'apps/api/src/main.ts',
      'apps/api/src/tasks/tasks.service.ts',
      'apps/api/src/workflows/workflows.service.ts',
      'apps/api/src/admin/chaos.service.ts',
    ],
    metrics: ['task_queue_depth{state}'],
  },
  {
    id: 'redis',
    label: 'Redis',
    sub: '7.2 · BullMQ store',
    category: 'infra',
    x: 410,
    y: 170,
    w: 180,
    h: 84,
    description:
      'BullMQ 佇列與 DLQ、冪等 key (SETNX)、DAG 執行狀態與原子計數器、chaos 指令通道 (CHAOS_KEY)。',
    adrs: [ADR.a001, ADR.a002, ADR.a006],
    codePaths: [
      'libs/queue/src/queue.module.ts',
      'libs/idempotency/src/idempotency.service.ts',
      'libs/workflow/src/dag-coordinator.ts',
    ],
    metrics: ['—（由 API/Worker 觀測佇列深度）'],
  },
  {
    id: 'worker',
    label: 'Worker',
    sub: 'BullMQ · :9091',
    category: 'app',
    x: 700,
    y: 170,
    w: 180,
    h: 84,
    description:
      '公平調度（per-user round-robin）、真實 LLM 呼叫、重試/退避/DLQ、SLA 硬超時、DAG 下游觸發、chaos 1s 輪詢自套用。',
    adrs: [ADR.a001, ADR.a004, ADR.a006],
    codePaths: ['apps/worker/src/fair-scheduler.service.ts', 'apps/worker/src/main.ts'],
    metrics: [
      'task_completed_total',
      'task_failed_total',
      'task_dlq_total',
      'task_timeout_total',
      'task_cost_usd_total',
      'task_tokens_total{direction}',
      'task_routed_total{taskType,model}',
    ],
  },
  {
    id: 'llm',
    label: 'LLM Providers',
    sub: 'Anthropic · OpenAI · Ollama',
    category: 'external',
    x: 700,
    y: 340,
    w: 180,
    h: 84,
    description:
      '統一 LLM 介面 + 模型註冊表計費。智慧路由依 taskType 選模型，per-provider Token Bucket 限流。',
    adrs: [ADR.a005, ADR.a007],
    codePaths: [
      'libs/cost-governor/src/llm.service.ts',
      'libs/cost-governor/src/model-registry.ts',
    ],
    metrics: ['task_rate_limited_total{provider}', 'task_tokens_total{direction}'],
  },
  {
    id: 'prometheus',
    label: 'Prometheus',
    sub: 'v2.53 · :9090',
    category: 'infra',
    x: 120,
    y: 340,
    w: 180,
    h: 84,
    description:
      '抓取 API /metrics 與 Worker :9091/，儲存時序。前端成本面板也直接讀 /metrics/summary（API 解析後）。',
    adrs: [ADR.a003],
    codePaths: ['docker/prometheus.yml', 'libs/observability/src/metrics.service.ts'],
    metrics: ['task_processing_duration_seconds（Histogram, P99）'],
  },
  {
    id: 'grafana',
    label: 'Grafana',
    sub: '11.1 · dashboards',
    category: 'infra',
    x: 120,
    y: 470,
    w: 180,
    h: 64,
    description:
      '查詢 Prometheus，呈現 P99 延遲、錯誤率、佇列深度等健康看板（provisioned dashboard）。',
    adrs: [ADR.a003],
    codePaths: [
      'docker/grafana/provisioning/dashboards/task-orchestrator.json',
      'docker/docker-compose.yml',
    ],
    metrics: ['—（查詢端）'],
  },
];

const EDGES: Edge[] = [
  { from: 'web', to: 'api', label: 'HTTP / SSE' },
  { from: 'api', to: 'redis', label: 'enqueue · chaos directive' },
  { from: 'redis', to: 'worker', label: 'consume · DAG state' },
  { from: 'worker', to: 'llm', label: 'LLM API' },
  { from: 'prometheus', to: 'api', label: 'scrape /metrics', dashed: true },
  { from: 'prometheus', to: 'worker', label: 'scrape :9091', dashed: true },
  { from: 'grafana', to: 'prometheus', label: 'query', dashed: true },
];

const CAT_COLOR: Record<Category, { fill: string; stroke: string }> = {
  app: { fill: '#1e1b4b', stroke: '#6366f1' },
  infra: { fill: '#0f293a', stroke: '#22d3ee' },
  external: { fill: '#3b2705', stroke: '#f59e0b' },
};

function center(c: Component) {
  return { cx: c.x + c.w / 2, cy: c.y + c.h / 2 };
}

export function Architecture() {
  const [selectedId, setSelectedId] = useState<string>('worker');
  const byId = (id: string) => COMPONENTS.find((c) => c.id === id)!;
  const selected = byId(selectedId);

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">系統架構</h1>
        <p className="text-sm text-slate-400">
          點擊組件查看對應 ADR、代碼路徑與關鍵指標 · 實線＝資料路徑，虛線＝指標抓取
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-2">
          <svg viewBox="0 0 1000 560" className="h-auto w-full">
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="#64748b" />
              </marker>
            </defs>

            {EDGES.map((e) => {
              const a = center(byId(e.from));
              const b = center(byId(e.to));
              const mx = (a.cx + b.cx) / 2;
              const my = (a.cy + b.cy) / 2;
              return (
                <g key={`${e.from}-${e.to}`}>
                  <line
                    x1={a.cx}
                    y1={a.cy}
                    x2={b.cx}
                    y2={b.cy}
                    stroke="#475569"
                    strokeWidth={1.5}
                    strokeDasharray={e.dashed ? '5 4' : undefined}
                    markerEnd="url(#arrow)"
                  />
                  <text
                    x={mx}
                    y={my - 4}
                    textAnchor="middle"
                    className="fill-slate-500"
                    fontSize={11}
                  >
                    {e.label}
                  </text>
                </g>
              );
            })}

            {COMPONENTS.map((c) => {
              const col = CAT_COLOR[c.category];
              const isSel = c.id === selectedId;
              return (
                <g
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="cursor-pointer"
                >
                  <rect
                    x={c.x}
                    y={c.y}
                    width={c.w}
                    height={c.h}
                    rx={10}
                    fill={col.fill}
                    stroke={isSel ? '#e2e8f0' : col.stroke}
                    strokeWidth={isSel ? 3 : 1.5}
                  />
                  <text
                    x={c.x + c.w / 2}
                    y={c.y + c.h / 2 - 4}
                    textAnchor="middle"
                    className="fill-slate-100"
                    fontSize={16}
                    fontWeight={600}
                  >
                    {c.label}
                  </text>
                  <text
                    x={c.x + c.w / 2}
                    y={c.y + c.h / 2 + 16}
                    textAnchor="middle"
                    className="fill-slate-400"
                    fontSize={11}
                  >
                    {c.sub}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              組件
            </div>
            <div className="text-lg font-semibold">{selected.label}</div>
            <div className="text-xs text-slate-400">{selected.sub}</div>
          </div>

          <p className="text-slate-300">{selected.description}</p>

          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              對應 ADR
            </div>
            <ul className="mt-1 space-y-1">
              {selected.adrs.map((a) => (
                <li key={a.id} className="text-xs">
                  <span className="font-mono text-indigo-300">{a.id}</span>{' '}
                  {a.title}
                  {a.doc ? (
                    <div className="font-mono text-[11px] text-emerald-400">
                      {a.doc}
                    </div>
                  ) : (
                    <span className="ml-1 text-slate-500">
                      （{a.status}，見 execution-plans ADR 索引）
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              代碼路徑
            </div>
            <ul className="mt-1 space-y-0.5">
              {selected.codePaths.map((p) => (
                <li
                  key={p}
                  className="break-all font-mono text-[11px] text-slate-300"
                >
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              關鍵指標
            </div>
            <ul className="mt-1 flex flex-wrap gap-1">
              {selected.metrics.map((m) => (
                <li
                  key={m}
                  className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300"
                >
                  {m}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-slate-400">
        <Legend color="#6366f1" label="應用 (app)" />
        <Legend color="#22d3ee" label="基礎設施 (infra)" />
        <Legend color="#f59e0b" label="外部服務 (external)" />
      </div>

      <p className="rounded-lg border border-dashed border-slate-700 bg-slate-900/20 p-3 text-xs text-slate-500">
        🎬 影片 #2（系統全貌 Demo：架構導覽 + Chaos 演示）為人工錄製/發布項目 —
        交付物清單仍標記 ⏳，待錄製後更新。
      </p>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-3 w-3 rounded"
        style={{ background: color, opacity: 0.85 }}
      />
      {label}
    </span>
  );
}
