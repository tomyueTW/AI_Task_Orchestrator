# AI Task Orchestrator — 專案進度追蹤

> **版本：** v0.15.0
> **最後更新：** 2026-05-19
> **計畫週期：** 2026年4月 ─ 2027年1月（延長 4 個月，新增視覺化與學習化階段）

---

## 一、階段進度總覽

| 階段 | 月份 | 主題 | 狀態 |
|---|---|---|---|
| **一：系統穩定與健壯期** | 4月 | 單機穩定系統 (Core Engine) | ✅ 完成 |
| | 5月 | 可靠性與錯誤處理 (Engineering Depth) | ✅ 完成 |
| **二：進階調度與 AI 路由** | 6月 | 公平性與優先級 (Scheduling) | ✅ 完成 |
| | 7月 | AI Routing & Cost (Intelligence) | ✅ 完成 |
| **三：複雜場景與韌性驗證** | 8月 | 工作流與 Chaos (Resilience) | ✅ 完成 |
| **四：視覺化 (Visualization)** | 9月 | 即時狀態儀表板 (Live Dashboard) | ✅ 完成 |
| | 10月 | 互動式架構與 Chaos 控制台 | 🚧 進行中（W1–W2 ✅） |
| **五：學習化 (Learnability)** | 11月 | 穩定性三承諾 自練 | ⏳ 待開始 |
| | 12月 | 進階調度與工作流 自練 | ⏳ 待開始 |
| **六：品牌化與終極結案** | 2027年1月 | Portfolio / 電子書 / 正式發布 | ⏳ 待開始 |

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
| W4 | Chaos Testing + 文章 #5 | ✅ | `tests/chaos/` 5 腳本（load-generator、kill-worker、redis-chaos、latency-injection、soak）、文章 #5《系統韌性報告》 |

### 9月：即時狀態儀表板（視覺化階段啟動）

| 週 | 主題 | 狀態 | 計畫內容 |
|---|---|---|---|
| W1 | 前端骨架與 API 串接 | ✅ | `apps/web/`（React 18 + Vite 5 + Tailwind v4 + react-router-dom 6）、Vite proxy → :3000、Layout（側欄/頁頭）+ 4 placeholder 頁、API client、ADR-008 |
| W2 | 即時佇列監控 (SSE) | ✅ | `apps/api/src/stream`（StreamController + StreamService）每 1s push per-user queue + DLQ 計數；前端 `useQueueStream` hook + EventSource 自動重連；`QueueStackedBar`（recharts）即時堆疊條形圖；Dashboard 4 個總計卡片 + SSE 連線狀態 pill |
| W3 | 任務流轉動畫 | ✅ | API SSE 擴增 `flow` event（QueueEvents 訂閱 added/active/completed/failed/dlq）；前端 `TaskFlowAnimation`（framer-motion + SVG）以五階段欄位顯示流動圓點，spring 動畫 |
| W4 | 成本即時面板 + 文章 #4 | ✅ | API 新增 `GET /metrics/summary`（CostSummaryService 解析 Worker :9091 Prometheus 文字格式）；前端 `useCostSummary` hook + Costs 頁（4 卡片 + 累計成本 LineChart + Routed by Model BarChart + 限流表）；文章 #4 發布 |

### 10月：互動式架構與 Chaos 控制台

| 週 | 主題 | 狀態 | 計畫內容 |
|---|---|---|---|
| W1 | DAG 可視化 (ReactFlow) | ✅ | `reactflow@11.11.4`；新增 `/workflows/dag/:id` 前端頁（`DagView` + `DagGraph`）；以 backend `layers` 做 layered layout（無 force 模擬，re-poll 不抖動）；四色狀態（pending/active/completed/failed，ready 併入 pending）；`useDagStatus` 1.5s 輪詢、終態自動停止；節點點擊側欄詳情（status/dependsOn/jobId/result/failedReason）；MiniMap + Controls；`GET /workflows/dag/:id` 回傳擴增 per-node `dependsOn`（`DagCoordinator.getAllNodes`）；Workflows 頁加入「開啟既有 DAG」+ 範例 DAG 產生器（菱形 / 扇出扇入 12 / 渲染壓測 52） |
| W2 | 互動 DAG 編輯器 | ✅ | `/workflows/editor`（`DagEditor`）：ReactFlow 可編輯畫布（`useNodesState`/`useEdgesState`）、新增節點、拖曳連線（上游→下游即 `dependsOn`）、Delete 鍵刪除節點並自動清除懸空邊；節點側欄編輯 `payload`(JSON) / `taskType`；`lib/dagValidation.ts` 共用循環偵測 — `onConnect` 即時擋環 + 送出前 `validateDag`（前端先擋）；後端 `topologicalLayers` 失敗改映射為 **400 BadRequest**（後端再擋），`createDag` 解析 Nest 錯誤訊息回顯；匯出 JSON（檢視/複製）；送出後導向 W1 執行視圖 `/workflows/dag/:id` |
| W3 | Chaos 控制面板 | ⏳ | `POST /admin/chaos/:action` + ADMIN_TOKEN、前端按鈕觸發、即時觀察指標變化 |
| W4 | 架構互動地圖 + 影片 #2 | ⏳ | SVG 組件圖 + 點擊彈 ADR 卡；錄製並發布系統全貌 Demo 影片 |

### 11月：學習化階段 — 穩定性三承諾

> **練習方式：** 每週挑一個技術點，不看主專案源碼，從零寫最小可行版本；週六比對差異寫入 `learn/<topic>/diff.md`。

| 週 | 主題 | 狀態 | 練習目標 |
|---|---|---|---|
| W1 | 背壓 (Backpressure) 自練 | ⏳ | NestJS Guard + Redis counter + k6 驗證 429 |
| W2 | 冪等性 (Idempotency) 自練 | ⏳ | Idempotency-Key + Redis SETNX + 二階段 acquire/complete |
| W3 | 重試與 DLQ 自練 | ⏳ | 指數退避 + DLQ + manual recovery SOP |
| W4 | 可觀測性 自練 | ⏳ | prom-client + 自建 histogram/counter/gauge + Grafana 面板 |

### 12月：學習化階段 — 進階調度與工作流

| 週 | 主題 | 狀態 | 練習目標 |
|---|---|---|---|
| W1 | 公平調度 自練 | ⏳ | per-user queues + FairScheduler round-robin + 隔離驗證 |
| W2 | 成本追蹤 + 智慧路由 自練 | ⏳ | ModelRegistry + SDK 整合 + 路由 fallback + Token Bucket |
| W3 | DAG + 拓撲排序 自練 | ⏳ | Kahn's algorithm + DagCoordinator Redis schema |
| W4 | Chaos Engineering 自練 + 完結文 | ⏳ | 自設新 chaos scenario、學習系列完結文發布 |

### 2027年1月：品牌化與終極結案

| 週 | 主題 | 狀態 |
|---|---|---|
| W1 | 個人作品集與 Notion 整合 | ⏳ |
| W2 | 文檔工程化（README + Swagger + 白皮書） | ⏳ |
| W3 | 電子書撰寫與最終影片 | ⏳ |
| W4 | 正式發布與結案回顧（v1.0.0-final） | ⏳ |

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
│   │   ├── workflows.service.ts       # FlowProducer (chain) + DagCoordinator (dag)；DagStatusNode 含 dependsOn (10月 W1)；DagValidationError→400 (10月 W2)
│   │   └── dto/
│   │       ├── create-chain.dto.ts    # userId, priority, steps[]
│   │       └── create-dag.dto.ts      # userId, priority, nodes[{id, dependsOn, payload}]
│   ├── admin/
│   │   ├── admin.module.ts
│   │   └── admin.service.ts           # Bull Board + 動態掃描用戶佇列 (/admin/queues)
│   ├── stream/
│   │   ├── stream.module.ts
│   │   ├── stream.controller.ts       # GET /stream/queues (SSE)
│   │   └── stream.service.ts          # 1s snapshot + QueueEvents 訂閱 (ring buffer 50)
│   └── metrics/
│       ├── metrics.controller.ts      # GET /metrics, GET /metrics/summary
│       ├── metrics.module.ts
│       └── cost-summary.service.ts    # 解析 Worker :9091 Prometheus 文字
├── worker/src/                        # BullMQ Worker (3 files)
│   ├── main.ts                        # + metrics :9091
│   ├── worker.module.ts
│   └── fair-scheduler.service.ts      # 公平調度 + 真實 LLM 呼叫
└── web/                               # React 前端 (9月 W1+)
    ├── index.html
    ├── vite.config.mts                # Vite 5 + Tailwind v4 plugin (ESM)
    ├── tsconfig.json
    └── src/
        ├── main.tsx
        ├── App.tsx                    # react-router-dom routes
        ├── index.css                  # @import "tailwindcss"
        ├── components/
        │   ├── Layout.tsx             # 側欄 + 頁頭 + Outlet
        │   ├── QueueStackedBar.tsx    # recharts 即時堆疊條形圖
        │   ├── TaskFlowAnimation.tsx  # framer-motion SVG 任務流動動畫
        │   └── DagGraph.tsx           # ReactFlow — layered layout + 四色狀態 + MiniMap (10月 W1)
        ├── lib/
        │   ├── api.ts                 # createTask / getTask / listDlq / fetchPrometheus / getDagStatus / createDag（回顯 Nest 錯誤訊息）
        │   ├── useQueueStream.ts      # EventSource hook (snapshot + flow events)
        │   ├── useCostSummary.ts      # /metrics/summary 5s 輪詢 + trend buffer
        │   ├── useDagStatus.ts        # GET /workflows/dag/:id 1.5s 輪詢，終態自動停止 (10月 W1)
        │   └── dagValidation.ts       # 共用：循環偵測 wouldCreateCycle / validateDag / buildDagPayload (10月 W2)
        └── pages/
            ├── Dashboard.tsx          # 即時儀表板
            ├── Workflows.tsx          # DAG 啟動頁：開啟既有 + 範例產生器 + 編輯器入口 (10月 W1–W2)
            ├── DagView.tsx            # /workflows/dag/:id — 即時 DAG 圖 + 節點詳情側欄 (10月 W1)
            ├── DagEditor.tsx          # /workflows/editor — 拖拽建構 + 擋環 + 匯出 + 送出 (10月 W2)
            ├── Costs.tsx              # 成本面板 (placeholder)
            └── Architecture.tsx       # 系統架構 (placeholder)

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
    ├── dag-coordinator.ts             # Redis 原子計數器 + 下游就緒判定 + getAllNodes (10月 W1)
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
| `POST` | `/workflows/dag` | 建立 DAG 工作流（nodes[{id, dependsOn, payload}]，拓撲排序驗證 + 並行執行 + 結果注入 payload.dependencies；10月 W2 起驗證失敗回 `400 BadRequest` 並帶原因，非 500） | 8月 W2 / 擴充 10月 W2 |
| `GET` | `/workflows/dag/:id` | 查詢 DAG 狀態（layers, 各 node status/result/failedReason；10月 W1 起每 node 增回 `dependsOn` 供前端畫依賴邊） | 8月 W2 / 擴充 10月 W1 |
| `ALL` | `/admin/queues` | Bull Board 可視化看板（狀態、job 詳情、手動重試/刪除） | 8月 W3 |
| `GET` | `/stream/queues` | SSE 串流：每 1s push `snapshot`（per-user queue counts + DLQ）+ `flow` events（job lifecycle, ring buffer 50 筆） | 9月 W2 / 擴充 9月 W3 |
| `GET` | `/metrics` | Prometheus 指標（API） | 5月 W3 |
| `GET` | `/metrics/summary` | Worker :9091 Prometheus 解析後的 JSON 摘要（cost / tokens / routing / rate-limit / failures） | 9月 W4 |
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
| 故障注入測試 | `tests/chaos/`：load-generator、kill-worker (SIGKILL)、redis-chaos (docker pause)、latency-injection、soak (12h 綜合) | 8月 W4 |
| DAG 即時視覺化 | ReactFlow 依 backend 拓撲 `layers` 做 layered layout（無 force 模擬）、四色狀態節點、`useDagStatus` 1.5s 輪詢且終態自動停止、節點點擊詳情側欄 | 10月 W1 |
| 互動 DAG 編輯器 | ReactFlow 可編輯畫布（增/連/刪）、`onConnect` 即時擋環 + 送出前 `validateDag`（前端先擋）、後端 `topologicalLayers`→400（後端再擋）、匯出 JSON、一鍵 POST 後導向執行視圖 | 10月 W2 |

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
| `WORKER_METRICS_URL` | `http://localhost:9091/` | API 拉取 Worker Prometheus metrics 來源 | 9月 W4 |

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
| 技術文章 | 5/6 | ✅ #1 背壓、✅ #2 重試與冪等、✅ #3 成本控制、✅ #4 DAG 工作流、✅ #5 韌性報告、⏳ #6 學習系列完結文（12月 W4） |
| 影片 | 0/2 | ⏳ #1 公平調度 Demo、⏳ #2 系統全貌 Demo（含前端，10月 W4） |
| ADR | 3/9+ | ✅ ADR-001 NestJS+BullMQ、⏳ ADR-002/003/004/005/007、✅ ADR-006 DAG 拓撲排序、✅ ADR-008 前端選型、⏳ ADR-009 學習化階段設計（11月 W1） |
| 前端應用 | 🚧 進行中 | ✅ 即時儀表板（9月）、✅ DAG 視覺化（10月 W1）、✅ 互動 DAG 編輯器（10月 W2）、⏳ Chaos 控制台（10月 W3）、⏳ 架構互動地圖（10月 W4） |
| 學習筆記 | 0/8 | ⏳ `learn/` 8 個技術點練習目錄（11–12月） |
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
| React | ^18.3 | 前端 UI 框架 |
| Vite | ^5.4 | 前端 build / dev server |
| Tailwind CSS | ^4.2 | 樣式 (no-config v4) |
| react-router-dom | ^6.30 | 前端路由 |
| recharts | ^2.15 | 即時佇列堆疊條形圖 |
| framer-motion | ^11.11 | 任務流轉動畫 |
| reactflow | ^11.11 | DAG 即時視覺化（layered layout + 四色狀態） |
| Redis | 7.2 (Alpine) | Queue storage |
| Prometheus | v2.53 | Metrics collection |
| Grafana | 11.1 | Dashboard visualization |
| Docker Compose | v2 | Local infrastructure |

---

## 十、ReactFlow 選型與 Layout 決策（10月 W1 週日總結）

| 議題 | 決策 | 取捨理由 |
|---|---|---|
| 圖形函式庫 | `reactflow@11`（非 v12 `@xyflow/react`） | v11 與 React 18 穩定相容、社群文件最完整；v12 的新 API 對本階段唯讀視圖無增益，留待 W2 編輯器再評估 |
| Layout 演算法 | 直接採用 backend 拓撲 `layers`：layer index → 欄、layer 內序 → 列、各 layer 垂直置中 | 無需 dagre / elk / force 模擬；佈局**確定性**，每 1.5s re-poll 不會抖動或重排，菱形/扇出扇入天然對齊；代價是同層節點過多時會超出視窗（靠 `fitView` + MiniMap + zoom 緩解） |
| 依賴邊資料來源 | 擴增 `GET /workflows/dag/:id` 回傳 per-node `dependsOn`（資料早已存於 Redis `dag:{id}:nodes`） | 不另開端點；前端用 `dependsOn` 直接連邊，與既有輪詢共用一次請求 |
| 更新機制 | 輪詢（1.5s）而非 SSE | DAG 為有限生命週期、終態即停（active+ready=0），輪詢實作最簡且足夠；SSE 留給無限串流場景（佇列/flow，已於 9月採用） |
| ready 狀態著色 | 併入 pending（維持計畫「四色」） | 對外語意只需 pending/active/completed/failed；ready 為 coordinator 內部過渡態 |

**已知後續項**：web bundle 已達 ~827 kB（reactflow + recharts + framer-motion），未來可用 route-level `import()` code-split（非 W1 範圍）。

---

## 十一、DAG 編輯器 UX Review（10月 W2 週日總結）

| 觀察 | 決策 | 理由 |
|---|---|---|
| 節點 id 是否可改名 | **不可改名**，自動序號 `N1, N2…` | 改名需連帶重寫 edges/handles 與 `dependsOn`，易出錯；計畫只要求增/連/刪，「拒絕過度設計」 |
| 連線方向語意 | edge.source = 上游依賴、target = 下游（target.dependsOn ∋ source），與 W1 `DagGraph` 一致 | 編輯器與執行視圖同一套方向約定，使用者心智模型不需切換 |
| 擋環時機 | `onConnect` 當下即擋（不先加再驗證） | 即時回饋，畫布永遠維持合法 DAG；送出前再跑一次 `validateDag` 作保險 |
| 前端先擋 vs 後端再擋 | 兩段都保留：前端 `wouldCreateCycle` 即時、後端 `topologicalLayers`→400 回顯 | 前端體驗即時，後端為真實防線（API 可被直接呼叫）；錯誤訊息一致呈現於同一 notice 區 |
| payload 編輯 | 內嵌 JSON textarea + 即時解析驗證 | 免另開表單；非 object / 壞 JSON 即時標紅但不阻擋畫布操作 |
| 刪除後懸空邊 | `onNodesDelete` 主動過濾 source/target 命中被刪節點的 edges | 避免送出含未知節點依賴（後端會 400，但前端先清乾淨體驗較佳） |

---

*最後更新：2026-05-19 | 版本：v0.15.0*
