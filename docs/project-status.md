# AI Task Orchestrator — 專案進度追蹤

> **版本：** v0.7.0
> **最後更新：** 2026-04-18
> **計畫週期：** 2026年4月 ─ 9月

---

## 一、階段進度總覽

| 階段 | 月份 | 主題 | 狀態 |
|---|---|---|---|
| **一：系統穩定與健壯期** | 4月 | 單機穩定系統 (Core Engine) | ✅ 完成 |
| | 5月 | 可靠性與錯誤處理 (Engineering Depth) | ✅ 完成 |
| **二：進階調度與 AI 路由** | 6月 | 公平性與優先級 (Scheduling) | ✅ 完成 |
| | 7月 | AI Routing & Cost (Intelligence) | ✅ 完成 |
| **三：複雜場景與品牌包裝** | 8月 | 工作流與 Chaos (Resilience) | 🔄 進行中 |
| | 9月 | 品牌化與結案 (Portfolio Assets) | ⏳ 待開始 |

---

## 二、各週完成明細

### 4月：單機穩定系統

| 週 | 主題 | 狀態 | 完成內容 |
|---|---|---|---|
| W1 | Core Engine | ✅ | NestJS monorepo 初始化、POST /tasks API、BullMQ 入隊、Docker Redis 7.2 |
| W2 | Worker + 狀態流轉 | ✅ | apps/worker 應用、TaskProcessor、GET /tasks/:id、狀態映射 PENDING→ACTIVE→COMPLETED |
| W3 | 並行控制 + 優雅停機 | ✅ | WORKER_CONCURRENCY 環境變數、OnModuleDestroy graceful shutdown、Stalled job recovery |
| W4 | 背壓機制 | ✅ | BackpressureGuard (NestJS CanActivate)、queue depth >= threshold → 429 |

### 5月：可靠性與錯誤處理

| 週 | 主題 | 狀態 | 完成內容 |
|---|---|---|---|
| W1 | 冪等性 (Idempotency) | ✅ | libs/idempotency、Redis SETNX acquire/complete、IdempotencyInterceptor、Idempotency-Key header |
| W2 | 重試策略 + DLQ | ✅ | 指數退避 backoff (1s→2s→4s)、tasks-dlq 死信佇列、GET /tasks/dlq、POST /tasks/dlq/:id/retry |
| W3 | 可觀測性 (Observability) | ✅ | libs/observability (prom-client)、API /metrics、Worker :9091 metrics、Prometheus + Grafana Docker |
| W4 | 階段性總結 | ✅ | 文章 #2《重試策略與冪等設計》 |

### 6月：公平性與優先級

| 週 | 主題 | 狀態 | 完成內容 |
|---|---|---|---|
| W1 | 一用戶一隊列 (Fair Scheduling) | ✅ | userId 欄位、per-user 動態佇列 `tasks-user-{userId}`、FairScheduler round-robin worker |
| W2 | 權重優先級 (Priority) | ✅ | TaskPriority enum (critical/high/normal/low)、BullMQ 內建 priority 搶佔 |
| W3 | SLA 與超時管理 | ✅ | TASK_TIMEOUT_MS 硬性超時、Promise.race timeout wrapper、task_timeout_total metric |
| W4 | 影片 #1 + 總結 | ✅ | 專案完成後製作 |

### 7月：AI Routing & Cost — 接入真實 LLM API

| 週 | 主題 | 狀態 | 計畫內容 |
|---|---|---|---|
| W1 | Cost Model 與模型庫 | ✅ | `libs/cost-governor`（ModelRegistry + LlmService + CostTracker）、Anthropic SDK + OpenAI SDK、真實 API 呼叫、cost/token Prometheus metrics |
| W2 | 智慧路由 (Decision Engine) | ✅ | `libs/router`（RouterService）、TaskType enum (simple/code/complex)、ROUTING_TABLE 候選模型、provider 可用性檢查、task_routed_total metric |
| W3 | Token Bucket 限流 | ✅ | RateLimiterService (Redis Lua script)、per-provider RPM 限流、waitForToken 等待機制、task_rate_limited_total metric |
| W4 | 文章 #3 + 總結 | ✅ | 文章 #3《探討 AI 基礎設施成本控制》 |

### 8月：工作流與 Chaos — 使用 Bull Board

| 週 | 主題 | 狀態 | 計畫內容 |
|---|---|---|---|
| W1 | 線性任務鏈 (Sequential Chain) | ✅ | `apps/api/src/workflows`（WorkflowsService + FlowProducer）、POST /workflows/chain、GET /workflows/:id、前一步 output 自動注入 `payload.previousResult`、workflow meta 存 Redis (TTL 7d) |
| W2 | 靜態 DAG 依賴檢查 | ✅ | `libs/workflow`（Kahn's topological sort + DagCoordinator）、POST /workflows/dag、GET /workflows/dag/:id、Redis 原子計數器驅動運行時、菱形依賴/扇出扇入/失敗阻斷、ADR-006 |
| W3 | Bull Board 可視化看板 | ✅ | `@bull-board/api` + `@bull-board/express`、`apps/api/src/admin` AdminService、啟動時透過 HttpAdapterHost 掛載於 `/admin/queues`、每 5s 掃描 Redis `bull:tasks-user-*:meta` 自動註冊新用戶佇列 + DLQ |
| W4 | Chaos Testing + 文章 #5 | ⏳ | 故障注入腳本（Worker crash, Redis 斷線）、系統韌性報告 |

### 9月：品牌化與結案（待開始）

| 週 | 主題 | 狀態 |
|---|---|---|
| W1 | 個人作品集與 Notion 整合 | ⏳ |
| W2 | 文檔工程化 | ⏳ |
| W3 | 電子書撰寫與最終影片 | ⏳ |
| W4 | 正式發布與結案回顧 | ⏳ |

---

## 三、程式碼結構

```
apps/
├── api/src/                           # HTTP API (14 files)
│   ├── main.ts
│   ├── app.module.ts
│   ├── tasks/
│   │   ├── tasks.module.ts
│   │   ├── tasks.controller.ts        # POST /tasks, GET /tasks/:id, DLQ
│   │   ├── tasks.service.ts           # 動態 per-user 佇列
│   │   ├── dto/create-task.dto.ts     # userId, priority, model, payload
│   │   ├── guards/backpressure.guard.ts
│   │   └── interceptors/idempotency.interceptor.ts
│   ├── workflows/
│   │   ├── workflows.module.ts
│   │   ├── workflows.controller.ts    # POST /workflows/chain|dag, GET /workflows/:id|dag/:id
│   │   ├── workflows.service.ts       # FlowProducer (chain) + DagCoordinator (dag)
│   │   └── dto/
│   │       ├── create-chain.dto.ts    # userId, priority, steps[]
│   │       └── create-dag.dto.ts      # userId, priority, nodes[{id, dependsOn, payload}]
│   ├── admin/
│   │   ├── admin.module.ts
│   │   └── admin.service.ts           # Bull Board + 動態掃描用戶佇列 (/admin/queues)
│   └── metrics/
│       ├── metrics.controller.ts      # GET /metrics
│       └── metrics.module.ts
└── worker/src/                        # BullMQ Worker (3 files)
    ├── main.ts                        # + metrics :9091
    ├── worker.module.ts
    └── fair-scheduler.service.ts      # 公平調度 + 真實 LLM 呼叫

libs/
├── queue/src/                         # 佇列抽象 (3 files)
│   ├── task.interface.ts              # Task, TaskStatus, TaskPriority, TokenUsage
│   ├── queue.module.ts                # Redis 連線 + DLQ
│   └── index.ts
├── idempotency/src/                   # 冪等性 (3 files)
│   ├── idempotency.service.ts
│   ├── idempotency.module.ts
│   └── index.ts
├── observability/src/                 # 可觀測性 (3 files)
│   ├── metrics.service.ts             # 9 metrics (duration, completed, failed, dlq, timeout, cost, tokens, queue depth)
│   ├── observability.module.ts
│   └── index.ts
├── cost-governor/src/                 # AI 成本控管 (5 files)
│   ├── model-registry.ts              # 5 模型定義 (Haiku, Sonnet, GPT-4o-mini, GPT-4o, Llama3.2)
│   ├── llm.service.ts                 # Anthropic + OpenAI + Ollama 統一介面
│   ├── cost-tracker.service.ts        # Token/Cost 計算
│   ├── cost-governor.module.ts
│   └── index.ts
└── workflow/src/                      # DAG 工作流 (4 files)
    ├── dag.interface.ts               # DagNodeInput, DagMeta
    ├── topological-sort.ts            # Kahn's algorithm + 環/重複/自環檢查
    ├── dag-coordinator.ts             # Redis 原子計數器 + 下游就緒判定
    └── index.ts

docker/
├── docker-compose.yml                 # Redis + Prometheus + Grafana
├── prometheus.yml
└── grafana/provisioning/
    ├── datasources/prometheus.yml
    └── dashboards/
        ├── dashboard.yml
        └── task-orchestrator.json
```

---

## 四、API 端點

| Method | Path | 說明 | 加入版本 |
|---|---|---|---|
| `POST` | `/tasks` | 建立任務（userId + model + priority + 背壓 + 冪等） | 4月 W1 |
| `GET` | `/tasks/:id?userId=` | 查詢任務狀態（需帶 userId） | 4月 W2 |
| `GET` | `/tasks/dlq` | 列出死信佇列 | 5月 W2 |
| `POST` | `/tasks/dlq/:id/retry` | 恢復 DLQ 任務 | 5月 W2 |
| `POST` | `/workflows/chain` | 建立線性任務鏈（steps[]，前一步 output 自動注入下一步 payload.previousResult） | 8月 W1 |
| `GET` | `/workflows/:id` | 查詢工作流狀態（所有 step job 狀態 + 結果） | 8月 W1 |
| `POST` | `/workflows/dag` | 建立 DAG 工作流（nodes[{id, dependsOn, payload}]，拓撲排序驗證 + 並行執行 + 結果注入 payload.dependencies） | 8月 W2 |
| `GET` | `/workflows/dag/:id` | 查詢 DAG 狀態（layers, 各 node status/result/failedReason） | 8月 W2 |
| `ALL` | `/admin/queues` | Bull Board 可視化看板（狀態、job 詳情、手動重試/刪除） | 8月 W3 |
| `GET` | `/metrics` | Prometheus 指標（API） | 5月 W3 |
| `GET` | `:9091/` | Prometheus 指標（Worker） | 5月 W3 |

---

## 五、系統能力

| 能力 | 實作方式 | 加入版本 |
|---|---|---|
| 任務入隊 | BullMQ Queue + UUID jobId | 4月 W1 |
| 狀態流轉 | BullMQ job state → TaskStatus 映射 | 4月 W2 |
| 並行控制 | `WORKER_CONCURRENCY` 環境變數 | 4月 W3 |
| 優雅停機 | `worker.close()` + enableShutdownHooks | 4月 W3 |
| Stalled Recovery | BullMQ 內建心跳偵測 | 4月 W3 |
| 背壓控制 | Queue depth >= threshold → 429 | 4月 W4 |
| 冪等性 | `Idempotency-Key` header + Redis SETNX | 5月 W1 |
| 指數退避重試 | BullMQ backoff: 1s → 2s → 4s | 5月 W2 |
| 死信隊列 | 重試耗盡自動轉 DLQ + 手動恢復 API | 5月 W2 |
| 可觀測性 | Prometheus metrics + Grafana dashboard | 5月 W3 |
| 公平調度 | Per-user queues + FairScheduler round-robin | 6月 W1 |
| 優先級搶佔 | TaskPriority (critical/high/normal/low) → BullMQ priority | 6月 W2 |
| SLA 超時 | TASK_TIMEOUT_MS 硬性超時 + task_timeout_total metric | 6月 W3 |
| 真實 LLM 呼叫 | Anthropic SDK + OpenAI SDK 統一介面 | 7月 W1 |
| 成本追蹤 | ModelRegistry 計費表 + CostTracker + task_cost_usd_total metric | 7月 W1 |
| 本地 LLM | Ollama + Llama 3.2 (免費本地推理, OpenAI 相容 API) | 7月 W1 |
| 智慧路由 | RouterService — taskType→model 自動路由 + provider 可用性檢查 | 7月 W2 |
| Provider 限流 | Redis Token Bucket per-provider RPM 限流（等待不失敗） | 7月 W3 |
| 線性任務鏈 | BullMQ FlowProducer parent-child、前一步 output 經 `job.getChildrenValues()` 注入下一步 `payload.previousResult` | 8月 W1 |
| DAG 工作流 | Kahn's 拓撲排序驗證 + Redis 原子計數器 (`DECR deps-remaining`) 驅動並行入佇列、upstream 結果注入 `payload.dependencies` | 8月 W2 |
| DAG 失敗阻斷 | 節點失敗標記 `status=failed`，下游 `deps-remaining` 永不歸零，自然停止傳播 | 8月 W2 |
| 佇列可視化 | Bull Board mounted via HttpAdapterHost + periodic Redis scan 動態註冊新用戶佇列 | 8月 W3 |

---

## 六、環境變數

| Variable | Default | 用途 | 加入版本 |
|---|---|---|---|
| `REDIS_HOST` | `localhost` | Redis 連線 | 4月 W1 |
| `REDIS_PORT` | `6379` | Redis 埠 | 4月 W1 |
| `WORKER_CONCURRENCY` | `3` | Worker 並行數 | 4月 W3 |
| `BACKPRESSURE_THRESHOLD` | `CONCURRENCY×100` | 背壓閾值 | 4月 W4 |
| `IDEMPOTENCY_TTL_SECONDS` | `86400` | 冪等 key TTL | 5月 W1 |
| `TASK_FAILURE_RATE` | `0` | 失敗模擬（測試用） | 5月 W2 |
| `MAX_CONCURRENCY_PER_USER` | `1` | 每用戶最大並行數 | 6月 W1 |
| `TASK_TIMEOUT_MS` | `30000` | Job 執行硬性超時 | 6月 W3 |
| `ANTHROPIC_API_KEY` | — | Anthropic API Key | 7月 W1 |
| `OPENAI_API_KEY` | — | OpenAI API Key | 7月 W1 |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama 本地 API | 7月 W1 |
| `ANTHROPIC_RPM_LIMIT` | `50` | Anthropic RPM 限流 | 7月 W3 |
| `OPENAI_RPM_LIMIT` | `60` | OpenAI RPM 限流 | 7月 W3 |
| `OLLAMA_RPM_LIMIT` | `999` | Ollama RPM 限流 | 7月 W3 |
| `ADMIN_QUEUE_SCAN_INTERVAL_MS` | `5000` | Bull Board 掃描新用戶佇列的頻率 | 8月 W3 |

---

## 七、Prometheus Metrics

| Metric | Type | 來源 | 說明 | 加入版本 |
|---|---|---|---|---|
| `task_processing_duration_seconds` | Histogram | Worker :9091 | Job 處理耗時 | 5月 W3 |
| `task_completed_total` | Counter | Worker :9091 | 完成任務數 | 5月 W3 |
| `task_failed_total` | Counter | Worker :9091 | 失敗次數 | 5月 W3 |
| `task_dlq_total` | Counter | Worker :9091 | 進入 DLQ 數 | 5月 W3 |
| `task_timeout_total` | Counter | Worker :9091 | SLA 超時次數 | 6月 W3 |
| `task_cost_usd_total` | Counter | Worker :9091 | 累計成本 (USD) | 7月 W1 |
| `task_tokens_total{direction}` | Counter | Worker :9091 | Token 消耗 (input/output) | 7月 W1 |
| `task_queue_depth{state}` | Gauge | API :3000 | 佇列深度 (waiting/active/dlq) | 5月 W3 |

---

## 八、交付物進度

| 類型 | 進度 | 清單 |
|---|---|---|
| 技術文章 | 3/5 | ✅ #1 背壓設計、✅ #2 重試與冪等、✅ #3 成本控制、⏳ #4 DAG 工作流、⏳ #5 韌性報告 |
| 影片 | 0/2 | ⏳ #1 公平調度 Demo、⏳ #2 系統全貌 Demo |
| ADR | 2/5+ | ✅ ADR-001 NestJS+BullMQ、⏳ ADR-002 冪等性、⏳ ADR-003 可觀測性、⏳ ADR-004 公平調度、⏳ ADR-005 AI 路由、✅ ADR-006 DAG 拓撲排序 |
| 電子書 | 0/1 | ⏳《Building Scalable AI Agent Infrastructure》 |
| 技術白皮書 | 0/1 | ⏳ "How we scaled to 10k TPS" |

---

## 九、技術棧

| Technology | Version | Purpose |
|---|---|---|
| Node.js | v25.x | Runtime |
| TypeScript | ^5.9 | Language |
| NestJS | ^11.x | Application framework |
| BullMQ | ^5.73 | Task queue engine |
| ioredis | ^5.10 | Redis client |
| prom-client | ^15.1 | Prometheus metrics |
| @anthropic-ai/sdk | latest | Anthropic Claude API |
| openai | latest | OpenAI GPT API |
| Ollama | v0.20 | 本地 LLM runtime (Llama 3.2) |
| @bull-board/api | ^7.0 | Bull Board 核心 |
| @bull-board/express | ^7.0 | Express adapter for Bull Board |
| Redis | 7.2 (Alpine) | Queue storage |
| Prometheus | v2.53 | Metrics collection |
| Grafana | 11.1 | Dashboard visualization |
| Docker Compose | v2 | Local infrastructure |

---

*最後更新：2026-04-18 | 版本：v0.7.0*
