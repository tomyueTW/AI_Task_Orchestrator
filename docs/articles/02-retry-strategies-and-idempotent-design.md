# 當 AI 任務失敗時：重試策略與冪等設計

> When AI Tasks Fail: Retry Strategies and Idempotent Design

---

## 前言：AI 任務為什麼會失敗？

在生產環境中呼叫 LLM API，失敗是常態而非例外：

- **Provider 限流 (429)**：OpenAI、Anthropic 都有 Rate Limit，高併發時必定觸發
- **網路抖動**：TCP 超時、DNS 解析失敗、SSL 握手中斷
- **模型服務中斷**：Provider 偶爾會有幾分鐘的服務降級
- **Token 超限**：Payload 過大導致模型拒絕處理

如果你的系統在任務失敗時只是 log 一行 error 就放棄，那麼每天可能有 1-3% 的任務會莫名消失。對用戶來說，這就是「任務提交了，但永遠沒有結果」。

本文將分享我們如何用**指數退避重試**、**死信隊列**和**冪等性設計**，讓 AI 任務在失敗時自動修復，且絕不重複執行。

---

## 第一道防線：指數退避重試

### 為什麼不能立即重試？

假設任務因為 Provider 限流失敗。如果你立即重試：

```
嘗試 1 → 429 (限流)
嘗試 2 → 429 (限流)     ← 立即重試，Provider 還沒恢復
嘗試 3 → 429 (限流)     ← 繼續打，加劇限流
```

三次重試在幾毫秒內全部失敗。你不僅沒救回任務，還讓 Provider 更討厭你。

### 指數退避 (Exponential Backoff)

```
嘗試 1 → 失敗 → 等 1 秒
嘗試 2 → 失敗 → 等 2 秒
嘗試 3 → 失敗 → 等 4 秒
```

每次等待時間翻倍，給 Provider 喘息的空間。在 BullMQ 中，一行設定搞定：

```typescript
// libs/queue/src/queue.module.ts
BullModule.registerQueue({
  name: TASK_QUEUE,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
}),
```

| 參數 | 值 | 說明 |
|---|---|---|
| `attempts` | 3 | 最多重試 3 次（含首次） |
| `backoff.type` | `exponential` | 指數退避 |
| `backoff.delay` | `1000` | 基礎延遲 1 秒 |

Worker 端不需要寫任何重試邏輯，BullMQ 自動管理。只要 `process()` 拋出錯誤，BullMQ 就會根據 backoff 策略安排下次執行：

```typescript
// apps/worker/src/task.processor.ts
async process(job: Job): Promise<Record<string, unknown>> {
  this.logger.log(
    `Processing job ${job.id} (attempt ${job.attemptsMade + 1}/${job.opts.attempts})`,
  );

  // 如果 LLM API 回傳 429 或 5xx，直接拋錯
  // BullMQ 會自動安排重試
  const result = await callLLM(job.data.payload);
  return result;
}
```

### 重試過程的可觀測性

我們在 Worker 的 `onFailed` 事件中區分「重試中」和「重試耗盡」：

```typescript
@OnWorkerEvent('failed')
async onFailed(job: Job | undefined, error: Error) {
  if (!job) return;

  const maxAttempts = job.opts.attempts ?? 1;

  if (job.attemptsMade >= maxAttempts) {
    // 重試耗盡 — 需要人工介入
    this.logger.error(
      `Job ${job.id} exhausted all ${maxAttempts} attempts — moving to DLQ`,
    );
  } else {
    // 還有重試機會 — 只是 warning
    this.logger.warn(
      `Job ${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}): ${error.message}`,
    );
  }
}
```

實際 log 輸出：

```
[TaskProcessor] Processing job abc123 (attempt 1/3)
[TaskProcessor] Job abc123 failed (attempt 1/3): Rate limit exceeded
[TaskProcessor] Processing job abc123 (attempt 2/3)
[TaskProcessor] Job abc123 failed (attempt 2/3): Rate limit exceeded
[TaskProcessor] Processing job abc123 (attempt 3/3)
[TaskProcessor] Job abc123 exhausted all 3 attempts — moving to DLQ
```

---

## 第二道防線：死信隊列 (DLQ)

重試 3 次後仍然失敗的任務去哪？如果只是標記為 `failed` 然後遺忘，就回到了「任務丟失」的老問題。

### DLQ 的角色

死信隊列是「失敗任務的停車場」。任務不會被丟棄，而是被轉移到一個獨立的佇列中等待人工處理。

```typescript
// 重試耗盡時，將任務數據轉移到 DLQ
if (job.attemptsMade >= maxAttempts) {
  await this.dlqQueue.add('dead-letter', {
    ...job.data,
    originalJobId: job.id,
    failedReason: error.message,
    failedAt: new Date().toISOString(),
  });
}
```

DLQ 任務保留了完整的上下文：原始 payload、失敗原因、失敗時間。這些資訊讓你能快速判斷「為什麼失敗」以及「能不能修復後重試」。

### DLQ 管理 API

```bash
# 查看 DLQ 中的任務
curl http://localhost:3000/tasks/dlq
```

```json
[
  {
    "dlqJobId": "1",
    "originalJobId": "abc123",
    "payload": { "prompt": "summarize this article" },
    "failedReason": "Rate limit exceeded",
    "failedAt": "2026-05-15T08:30:00.000Z",
    "createdAt": "2026-05-15T08:29:50.000Z"
  }
]
```

```bash
# 手動恢復 — 重新加入主佇列
curl -X POST http://localhost:3000/tasks/dlq/1/retry
```

恢復操作會：
1. 從 DLQ 取出任務數據
2. 用新的 ID 重新加入主佇列（重新獲得 3 次重試機會）
3. 從 DLQ 中移除原始記錄

**為什麼用新 ID？** 因為 BullMQ 用 job ID 追蹤狀態。如果用相同 ID 重新入隊，會和原本 failed 的記錄衝突。新 ID 意味著一個全新的生命週期。

---

## 第三道防線：冪等性設計

### 問題場景

用戶提交了一個 AI 摘要任務。網路超時了，用戶看到「請求失敗」，於是點了重試。但其實第一次請求已經成功到達服務器，任務已經在處理中。

結果：同一篇文章被摘要了兩次，用戶被計費兩次。

### 冪等性 = 同一操作執行多次，結果和執行一次相同

我們用 `Idempotency-Key` HTTP header 實現這個保證：

```bash
# 客戶端在每次請求時帶上唯一的冪等 key
curl -X POST http://localhost:3000/tasks \
  -H "Idempotency-Key: user-123-article-456" \
  -H "Content-Type: application/json" \
  -d '{"payload": {"prompt": "summarize this article"}}'
```

### 三種狀態的處理

```
Client → POST /tasks (Idempotency-Key: abc)
                ↓
        ┌─── Key 存在嗎？ ───┐
        ↓ No                  ↓ Yes
    SETNX 成功            讀取 Redis
    處理請求              ┌──────────┐
    儲存結果              │ status?  │
                         ├──────────┤
                         │processing│→ 409 Conflict
                         │done      │→ 回傳快取結果
                         └──────────┘
```

#### 狀態 1：Key 不存在

```typescript
// IdempotencyService — acquire()
const result = await this.redis.set(
  redisKey, 
  JSON.stringify({ status: 'processing' }), 
  'EX', this.ttlSeconds,  // 24 小時 TTL
  'NX'                     // 只在 key 不存在時設定
);

if (result === 'OK') {
  return null;  // 成功取得鎖，放行處理
}
```

`SET key value EX 86400 NX` — 這是一個原子操作。即使兩個相同的請求在同一毫秒到達，Redis 保證只有一個能成功。

#### 狀態 2：Key 存在，狀態 `processing`

前一個請求還在處理中。回傳 `409 Conflict`，讓客戶端稍後重試。

#### 狀態 3：Key 存在，狀態 `done`

前一個請求已完成。直接回傳快取的結果，**不產生新任務**。

```typescript
// IdempotencyInterceptor
if (entry.status === 'done') {
  return of(entry.response);  // 直接回傳，不進 handler
}
```

### NestJS Interceptor 實作

選用 Interceptor 而非 Guard 或 Middleware，因為 Interceptor 可以同時控制 **請求前** 和 **回應後** 的行為：

```typescript
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler) {
    const key = request.headers['idempotency-key'];

    if (!key) return next.handle();  // 無 header → 不強制冪等

    const entry = await this.idempotency.acquire(key);

    if (entry?.status === 'processing') {
      throw new ConflictException('Already being processed.');
    }
    if (entry?.status === 'done') {
      return of(entry.response);  // 回傳快取
    }

    // 放行 → 處理完後儲存結果
    return next.handle().pipe(
      tap(async (response) => {
        await this.idempotency.complete(key, response);
      }),
    );
  }
}
```

### TTL：為什麼是 24 小時？

冪等 key 不應該永久存在：
- **太短**（幾分鐘）：網路延遲可能導致客戶端重試時 key 已過期，失去冪等保護
- **太長**（永久）：Redis 記憶體無限增長
- **24 小時**：覆蓋了大部分「用戶重試」場景，同時保持 Redis 記憶體可控

---

## 三道防線如何協同工作

```
用戶提交任務
     ↓
[冪等層] ← 重複請求？直接回傳快取結果
     ↓
[入隊] → BullMQ Queue
     ↓
[Worker 處理]
     ↓ 失敗
[指數退避重試] → 1s → 2s → 4s
     ↓ 3 次都失敗
[DLQ] → 等待人工修復
     ↓ 人工確認後
[恢復] → POST /tasks/dlq/:id/retry → 重回主佇列
```

| 防線 | 解決的問題 | 觸發條件 |
|---|---|---|
| 冪等性 | 客戶端重複提交 | 相同 `Idempotency-Key` |
| 指數退避 | 暫時性故障（限流、超時） | `process()` 拋錯 |
| DLQ | 永久性故障（配置錯誤、資源不足） | 重試耗盡 |

---

## 可觀測性：你怎麼知道系統在自癒？

光有自癒機制不夠，你還需要知道「系統正在自癒」。我們用 Prometheus metrics 追蹤每一層的運作：

```
# Worker 暴露的指標
task_completed_total              3847    ← 成功處理數
task_failed_total                 23      ← 失敗次數（含重試中）
task_dlq_total                    2       ← 進入 DLQ 數

# Histogram — 處理耗時分佈
task_processing_duration_seconds_bucket{le="1",status="completed"} 892
task_processing_duration_seconds_bucket{le="2",status="completed"} 2941
task_processing_duration_seconds_bucket{le="3",status="completed"} 3847
```

Grafana dashboard 即時呈現：
- **Error Rate**：`task_failed_total / (task_completed_total + task_failed_total)`
- **P99 Latency**：`histogram_quantile(0.99, rate(task_processing_duration_seconds_bucket[5m]))`
- **DLQ Count**：任何非零值都應該觸發告警

---

## 設計決策回顧

| 決策 | 選擇 | 原因 |
|---|---|---|
| 重試策略 | BullMQ 內建 exponential backoff | 零額外代碼，Worker 只需拋錯 |
| 退避基礎延遲 | 1 秒 | LLM API 限流通常在秒級恢復 |
| 重試次數 | 3 次 | 平衡恢復率和延遲（1s+2s+4s=7s） |
| DLQ 實作 | 獨立 BullMQ queue | 和主佇列完全隔離，不影響正常處理 |
| 冪等 key 存儲 | Redis SET NX | 原子操作，天然防並發 |
| 冪等 TTL | 24 小時 | 覆蓋用戶重試場景，不永久佔記憶體 |
| 冪等層位置 | NestJS Interceptor | 可同時控制請求前（檢查）和回應後（儲存） |

---

## 小結

AI 任務失敗不可怕，可怕的是「失敗了你不知道，知道了你無法修復」。

三道防線的設計哲學很簡單：

1. **冪等性**：確保重複操作不會造成重複影響 — 解決「客戶端的問題」
2. **指數退避重試**：給暫時性故障自動修復的機會 — 解決「基礎設施的問題」
3. **死信隊列**：永久性故障不丟棄，保留現場等待人工修復 — 解決「業務邏輯的問題」

每一層都有明確的職責邊界，不重疊、不遺漏。加上 Prometheus metrics 的可觀測性，你隨時知道每一層的運作狀態。

下一篇我們將探討：**AI 基礎設施的成本控制 — 如何根據任務類型智慧路由到不同模型，在品質和成本之間找到最佳平衡。**

---

*技術棧：NestJS 11 · BullMQ 5 · Redis 7.2 · prom-client · TypeScript 5.9*
*專案原始碼：[AI Task Orchestrator](https://github.com/your-repo/ai-task-orchestrator)*
