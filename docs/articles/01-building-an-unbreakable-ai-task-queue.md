# 構建一個不會爆的 AI 任務隊列

> Building an AI Task Queue That Won't Explode Under Pressure

---

## 前言：為什麼 AI 任務隊列會「爆」？

當你把 AI 模型接入生產環境，第一個遇到的問題不是模型準確度，而是**流量控制**。

想像一個場景：你的系統對外提供 AI 摘要服務，每次請求需要呼叫 LLM API 處理 3-5 秒。某天流量突增 10 倍——

- 請求瞬間堆積數千筆
- Worker 來不及消化，記憶體飆升
- Redis 被塞滿，開始 OOM
- 整個系統崩潰，所有任務丟失

這就是「爆了」。

本文將分享我們如何用 **NestJS + BullMQ + Redis** 構建一個具備背壓控制的 AI 任務隊列，讓系統在高壓下「拒絕」而非「崩潰」。

---

## 架構總覽

```
Client → [POST /tasks] → API (NestJS) → Redis (BullMQ Queue) → Worker
                ↑                                                   ↓
        BackpressureGuard                                    Task Processor
        (queue depth check)                              (concurrency controlled)
```

系統拆為兩個獨立 process：

- **API（apps/api）**：接收 HTTP 請求，將任務入隊
- **Worker（apps/worker）**：從佇列取出任務並處理

兩者透過 Redis 中的 BullMQ 佇列解耦。這個架構有一個關鍵好處：**API 和 Worker 可以獨立擴展**。流量大時加 Worker 就好，不用動 API。

---

## 第一層防線：任務入隊與狀態管理

### 極簡的任務契約

```typescript
// libs/queue/src/task.interface.ts
export enum TaskStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export interface Task {
  id: string;
  status: TaskStatus;
  payload: Record<string, unknown>;
  createdAt: string;
}
```

四種狀態，一個線性流轉：

```
PENDING → ACTIVE → COMPLETED
                 → FAILED
```

沒有多餘的中間態。BullMQ 本身就管理了 `waiting → active → completed/failed` 的狀態機，我們只需要做映射：

```typescript
// apps/api/src/tasks/tasks.service.ts
const STATE_MAP: Record<string, TaskStatus> = {
  waiting: TaskStatus.PENDING,
  'waiting-children': TaskStatus.PENDING,
  delayed: TaskStatus.PENDING,
  prioritized: TaskStatus.PENDING,
  active: TaskStatus.ACTIVE,
  completed: TaskStatus.COMPLETED,
  failed: TaskStatus.FAILED,
};
```

**設計原則：不要重新發明輪子。** BullMQ 已經是一個成熟的狀態機，不需要再用資料庫維護一套自己的狀態。直接查詢 BullMQ job state 就是真相來源（Single Source of Truth）。

### 入隊：一個 POST 搞定

```typescript
// apps/api/src/tasks/tasks.service.ts
async create(payload: Record<string, unknown>): Promise<Task> {
  const id = uuidv4();
  const createdAt = new Date().toISOString();

  await this.taskQueue.add(
    'process',
    { id, payload, createdAt },
    { jobId: id },
  );

  return { id, status: TaskStatus.PENDING, payload, createdAt };
}
```

注意 `{ jobId: id }` — 這讓我們用自己的 UUID 作為 BullMQ 的 job ID，後續查詢直接用這個 ID，不需要額外的映射表。

---

## 第二層防線：並行控制

Worker 不是越多越好。每個 AI 任務可能消耗大量記憶體（模型推理、Token 計算），盲目開高並行數只會讓系統更快崩潰。

```typescript
// apps/worker/src/task.processor.ts
@Processor(TASK_QUEUE)
export class TaskProcessor extends WorkerHost
  implements OnModuleInit, OnModuleDestroy
{
  onModuleInit() {
    const concurrency = parseInt(
      this.config.get('WORKER_CONCURRENCY', '3'), 10
    );
    this.worker.concurrency = concurrency;
    this.logger.log(`Worker started with concurrency=${concurrency}`);
  }

  async process(job: Job): Promise<Record<string, unknown>> {
    this.logger.log(`Processing job ${job.id}`);
    const { payload } = job.data;

    // AI task processing happens here
    // ...

    return { result: 'ok', processedAt: new Date().toISOString(), payload };
  }
}
```

`concurrency=3` 代表這個 Worker 最多同時處理 3 個 job。當 3 個 slot 都滿了，BullMQ 不會再拉新的 job 出來，它們會安靜地在 `waiting` 狀態排隊。

**這就是背壓的起點：消費者控制自己的消化速度。**

透過環境變數 `WORKER_CONCURRENCY` 控制，可以根據機器規格動態調整：

| 機器規格 | 建議 Concurrency | 原因 |
|---|---|---|
| 2 vCPU / 4GB | 2-3 | 避免 OOM |
| 4 vCPU / 8GB | 5-8 | CPU-bound AI 推理 |
| 8 vCPU / 16GB | 10-15 | 適合批次處理場景 |

---

## 第三層防線：背壓機制

並行控制只管了 Worker 端。但如果 Producer 端（API）不停灌入任務呢？佇列深度會無限增長，Redis 記憶體遲早爆掉。

這就是背壓機制的用武之地。

### 核心思路

```
Threshold = Worker Concurrency × 100
```

如果 `concurrency=3`，代表 Worker 每秒大約處理 3 個 job（假設每個 job 1 秒）。閾值設 300 代表佇列裡最多允許 100 秒的庫存量。超過這個量，代表消費速度已經跟不上生產速度，繼續接收只會讓情況更糟。

### NestJS Guard 實作

```typescript
// apps/api/src/tasks/guards/backpressure.guard.ts
@Injectable()
export class BackpressureGuard implements CanActivate {
  private readonly threshold: number;

  constructor(
    @InjectQueue(TASK_QUEUE) private readonly taskQueue: Queue,
    config: ConfigService,
  ) {
    const explicit = config.get<string>('BACKPRESSURE_THRESHOLD');
    const concurrency = parseInt(config.get('WORKER_CONCURRENCY', '3'), 10);
    this.threshold = explicit ? parseInt(explicit, 10) : concurrency * 100;
  }

  async canActivate(): Promise<boolean> {
    const waiting = await this.taskQueue.getWaitingCount();
    const active = await this.taskQueue.getActiveCount();
    const depth = waiting + active;

    if (depth >= this.threshold) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Server is under heavy load. Please retry later.',
          queueDepth: depth,
          threshold: this.threshold,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
```

用 NestJS Guard 而非 Middleware 有兩個好處：

1. **精準掛載**：只掛在 `POST /tasks` 上，`GET /tasks/:id` 查詢不受影響
2. **依賴注入**：可以直接注入 BullMQ Queue 和 ConfigService

```typescript
// apps/api/src/tasks/tasks.controller.ts
@Post()
@HttpCode(HttpStatus.CREATED)
@UseGuards(BackpressureGuard)
async create(@Body() dto: CreateTaskDto): Promise<Task> {
  return this.tasksService.create(dto.payload);
}
```

### 429 回應設計

回傳的 429 不只是一個 status code，還包含了 `queueDepth` 和 `threshold`，讓客戶端知道「現在有多擠」：

```json
{
  "statusCode": 429,
  "message": "Server is under heavy load. Please retry later.",
  "queueDepth": 300,
  "threshold": 300
}
```

客戶端拿到這個資訊可以實作智慧重試——佇列深度離閾值越遠，重試間隔越短。

---

## 第四層防線：優雅停機

Worker 被重啟（部署、擴縮容）時，正在處理的 job 怎麼辦？

```typescript
// apps/worker/src/task.processor.ts
async onModuleDestroy() {
  this.logger.log('Worker shutting down — waiting for active jobs...');
  await this.worker.close();
  this.logger.log('Worker closed gracefully');
}
```

`worker.close()` 會：
1. 停止從佇列拉取新 job
2. 等待所有 active job 處理完成
3. 然後才真正關閉連線

搭配 NestJS 的 `enableShutdownHooks()`，收到 `SIGTERM` 或 `SIGINT` 時會自動觸發 `OnModuleDestroy` 生命週期。

```typescript
// apps/worker/src/main.ts
const app = await NestFactory.createApplicationContext(WorkerModule);
app.enableShutdownHooks();
```

### 如果 Worker 被暴力 Kill 呢？

BullMQ 有內建的 **Stalled Job Detection**。Worker 必須定期對 active job 發送心跳。如果心跳超時（預設 30 秒），BullMQ 會自動將該 job 從 `active` 移回 `waiting`，讓其他 Worker 重新處理。

不需要額外寫程式碼，這是 BullMQ 的內建行為。

---

## 佇列設定：防止 Redis 無限膨脹

```typescript
// libs/queue/src/queue.module.ts
BullModule.registerQueue({
  name: TASK_QUEUE,
  defaultJobOptions: {
    attempts: 3,
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
}),
```

三個關鍵設定：

| 設定 | 值 | 用途 |
|---|---|---|
| `attempts` | 3 | 失敗自動重試 3 次 |
| `removeOnComplete` | 保留最近 1000 筆 | 防止 completed job 無限堆積 |
| `removeOnFail` | 保留最近 5000 筆 | 失敗 job 保留更多，方便排查 |

沒有這些設定，每個 completed job 都會永久留在 Redis 裡。一天 10 萬個 job，一個月就是 300 萬筆垃圾數據。

---

## 實測：壓力下的系統行為

設定 `BACKPRESSURE_THRESHOLD=5`（低閾值方便觀察），不啟動 Worker：

```bash
# 連續發送 7 個任務
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "Task $i → HTTP %{http_code}\n" \
    -X POST http://localhost:3000/tasks \
    -H "Content-Type: application/json" \
    -d "{\"payload\":{\"task\":$i}}"
done
```

結果：

```
Task 1 → HTTP 201
Task 2 → HTTP 201
Task 3 → HTTP 201
Task 4 → HTTP 201
Task 5 → HTTP 201
Task 6 → HTTP 429
Task 7 → HTTP 429
```

前 5 個任務成功入隊，第 6 個開始被拒。系統沒有崩潰，只是禮貌地說「我忙不過來了」。

啟動 Worker 消化幾個 job 後，API 自動恢復接收新任務。**零人工介入，自動恢復。**

---

## 設計決策回顧

| 決策 | 選擇 | 原因 |
|---|---|---|
| 佇列引擎 | BullMQ over Kafka | 單一 Redis 依賴，AI 任務量級不需要 Kafka |
| 狀態管理 | 直接查 BullMQ state | 避免維護額外狀態資料庫 |
| 背壓實作 | NestJS Guard | 精準掛載、可注入、不影響查詢路由 |
| 並行控制 | 環境變數 | 不同機器規格可動態調整 |
| 停機策略 | `worker.close()` + shutdown hooks | 等待 active job 完成，不丟任務 |

---

## 小結

一個「不會爆」的 AI 任務隊列，核心不是什麼高深的演算法，而是四層簡單的防線：

1. **任務入隊**：把請求和處理解耦，Worker 按自己的節奏消費
2. **並行控制**：Worker 控制自己的消化速度，不貪多
3. **背壓機制**：佇列太深時直接拒絕，而非繼續堆積
4. **優雅停機**：重啟不丟任務，崩潰自動恢復

每一層都很簡單，但疊在一起就構成了一個在生產環境下穩健運行的系統。

下一篇我們將探討：**當 AI 任務失敗時，如何用冪等性設計和重試策略確保任務不丟失。**

---

*技術棧：NestJS 11 · BullMQ 5 · Redis 7.2 · TypeScript 5.9*
*專案原始碼：[AI Task Orchestrator](https://github.com/your-repo/ai-task-orchestrator)*
