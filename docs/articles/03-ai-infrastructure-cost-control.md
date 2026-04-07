# 探討 AI 基礎設施成本控制

> Taming AI Infrastructure Costs: Smart Routing, Token Tracking, and Rate Limiting

---

## 前言：AI 基礎設施的成本陷阱

呼叫一次 GPT-4o 的成本可能只有 $0.01。但乘上每天 10 萬次請求，就是每天 $1,000。一個月 $30,000。

更危險的是：**你可能連花了多少都不知道。**

大多數團隊在接入 LLM API 時只關心「功能能不能用」，直到月底帳單到來才意識到成本控制的重要性。到那時候，要麼砍功能，要麼砍預算。

本文將分享我們如何透過三個機制，在不犧牲用戶體驗的前提下控制 AI 基礎設施成本：

1. **智慧路由** — 不是所有任務都需要最貴的模型
2. **Token 計費追蹤** — 精準知道每一分錢花在哪裡
3. **Rate Limiting** — 防止帳單爆炸的最後一道防線

---

## 成本意識的第一步：模型計費表

不同模型的成本差異可以超過 100 倍：

| 模型 | Input ($/1M tokens) | Output ($/1M tokens) | 適用場景 |
|---|---|---|---|
| Llama 3.2 (Local) | $0 | $0 | 簡單任務、開發測試 |
| GPT-4o Mini | $0.15 | $0.60 | 簡單對話、分類 |
| Claude Haiku 4.5 | $0.80 | $4.00 | 快速回應、摘要 |
| GPT-4o | $2.50 | $10.00 | 程式碼、複雜分析 |
| Claude Sonnet 4.6 | $3.00 | $15.00 | 程式碼、深度推理 |

同一個「幫我打招呼」的請求，用 Sonnet 還是 Llama 3.2，成本差距是 **無限大 vs 免費**。

我們在系統中建立了一個 `ModelRegistry`，每個模型的計費資訊都被精確定義：

```typescript
// libs/cost-governor/src/model-registry.ts
interface ModelDefinition {
  id: string;
  provider: 'anthropic' | 'openai' | 'ollama';
  inputPricePerMToken: number;
  outputPricePerMToken: number;
  maxOutputTokens: number;
  tags: string[];  // ['fast','cheap'] or ['code','complex']
}
```

每個模型帶有 `tags` 標籤，這是智慧路由的基礎。

---

## 智慧路由：讓任務找到最適合的模型

### 問題

如果所有任務都用最貴的模型，成本爆炸。如果都用最便宜的，品質下降。

### 解法：按任務類型路由

用戶提交任務時指定 `taskType`，系統自動選擇最適模型：

```json
POST /tasks
{
  "userId": "alice",
  "taskType": "simple",
  "payload": { "prompt": "Say hello" }
}
```

路由表根據任務複雜度定義候選模型：

```typescript
// libs/router/src/router.service.ts
const ROUTING_TABLE = {
  simple:  ['llama3.2', 'gpt-4o-mini', 'claude-haiku-4-5'],
  code:    ['claude-sonnet-4-6', 'gpt-4o', 'llama3.2'],
  complex: ['gpt-4o', 'claude-sonnet-4-6', 'llama3.2'],
};
```

| taskType | 策略 | 第一候選 |
|---|---|---|
| `simple` | 最低成本 | Llama 3.2（免費本地） |
| `code` | 平衡品質 | Claude Sonnet（程式碼能力最強） |
| `complex` | 最高品質 | GPT-4o（複雜推理） |

### Provider 可用性檢查

不是所有 Provider 都一定可用。用戶可能沒設定 Anthropic API key，或 OpenAI 帳戶餘額不足。路由器會**按候選順序嘗試，選第一個可用的 Provider**：

```typescript
resolve(model?: string, taskType?: TaskType): string {
  // 1. 明確指定 model → 直接使用
  if (model) return model;

  // 2. 按 taskType 路由
  if (taskType) {
    for (const candidate of ROUTING_TABLE[taskType]) {
      if (this.isAvailable(candidate)) return candidate;
    }
  }

  // 3. Fallback → 本地 Llama（永遠可用）
  return 'llama3.2';
}
```

Ollama 作為 fallback 的好處：**它永遠可用**。即使所有雲端 API key 都失效，系統仍然能用本地模型處理任務，只是品質可能不如雲端模型。

### 成本節省估算

假設一天 10,000 個任務，其中 70% 是簡單任務、20% 程式碼、10% 複雜任務：

| 方案 | 計算 | 日成本 |
|---|---|---|
| 全用 Sonnet | 10K × ~500 tokens × $18/MT | ~$90 |
| 智慧路由 | 7K×$0 + 2K×$18/MT×500 + 1K×$12.5/MT×500 | ~$24 |
| **節省** | | **~73%** |

---

## Token 追蹤：精準到每一分錢

### 每次呼叫都記錄

LLM API 回傳的 `usage` 欄位包含精確的 token 數量。我們在 `CostTrackerService` 中計算並記錄每次呼叫的成本：

```typescript
// libs/cost-governor/src/cost-tracker.service.ts
record(taskId, modelId, inputTokens, outputTokens): CostRecord {
  const costUsd =
    (inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000;

  this.metrics.taskCostUsd.inc(costUsd);
  this.metrics.taskTokens.inc({ direction: 'input' }, inputTokens);
  this.metrics.taskTokens.inc({ direction: 'output' }, outputTokens);

  return { taskId, model: modelId, inputTokens, outputTokens, costUsd };
}
```

### Prometheus 指標

```
# Worker 暴露的成本指標
task_cost_usd_total        0.00342    ← 累計成本
task_tokens_total{direction="input"}   3847
task_tokens_total{direction="output"}  1203

# 路由決策追蹤
task_routed_total{taskType="simple",model="llama3.2"}   7000
task_routed_total{taskType="code",model="claude-sonnet"} 2000
task_routed_total{taskType="complex",model="gpt-4o"}     1000
```

在 Grafana 中，你可以即時看到：
- **每小時成本趨勢** — `rate(task_cost_usd_total[1h]) * 3600`
- **每模型使用比例** — `task_routed_total` by model
- **Token 消耗速率** — `rate(task_tokens_total[5m])`

### 本地模型的隱藏成本

Llama 3.2 在帳單上是 $0，但它有隱藏成本：

- **GPU/CPU 資源** — 本地推理佔用算力
- **延遲** — 本地模型可能比雲端慢（取決於硬體）
- **品質** — 3B 參數模型的能力有限

我們在 ModelRegistry 中把本地模型的 price 設為 0，但在 Prometheus 中仍然追蹤 token 消耗，讓你可以監控本地推理的負載。

---

## Rate Limiting：帳單爆炸的最後防線

### 為什麼需要 Rate Limiting？

即使有路由和成本追蹤，如果不限制呼叫頻率，一個 bug 或惡意用戶可以在幾分鐘內耗盡整個月的 API 配額。

LLM Provider 自己有 Rate Limit（Anthropic ~50 RPM，OpenAI ~60 RPM），但觸發 Provider 限流意味著你的請求會失敗，需要重試，浪費時間和系統資源。

### Redis Token Bucket

我們在 Worker 呼叫 LLM 之前，先檢查 Provider 的令牌桶：

```
每個 Provider 一個桶
├── anthropic: 50 tokens/min
├── openai:    60 tokens/min
└── ollama:    999 tokens/min (本地幾乎無限)
```

令牌桶使用 Redis Lua script 實現原子操作：

```lua
-- 計算令牌補充
local elapsed = now - last
local refill = elapsed / window * max
tokens = math.min(max, tokens + refill)

-- 嘗試取令牌
if tokens >= 1 then
  tokens = tokens - 1
  return 1  -- 放行
else
  return 0  -- 等待
end
```

### 等待而非失敗

關鍵設計決策：**令牌不足時等待，不拋錯。**

```typescript
async waitForToken(provider: string): Promise<void> {
  if (await this.acquire(provider)) return;

  this.logger.warn(`Rate limited: ${provider} — waiting for token`);

  while (!(await this.acquire(provider))) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
```

這意味著：
- 任務不會因為限流而失敗（不會進入重試流、不會進 DLQ）
- Worker 只是暫停等待，令牌補充後自動繼續
- 對用戶來說，任務只是「處理慢了一點」，而非「失敗了」

### 限流行為實測

設定 `OLLAMA_RPM_LIMIT=2`（每分鐘 2 次），快速送入 4 個 task：

```
Job 1 → 立即處理 (9:43:51) → 完成 (9:43:53)    ← 消耗令牌 1
Job 2 → 立即處理 (9:43:51) → 完成 (9:43:53)    ← 消耗令牌 2
Job 3 → "Rate limited: ollama — waiting"         ← 令牌耗盡
        → 等待 ~30 秒 → 完成 (9:44:22)          ← 令牌補充
Job 4 → 同樣等待 → 完成 (9:44:52)
```

流量被平滑整流：前 2 個立即處理，後 2 個排隊等待。Provider 不會收到超出限額的請求。

---

## 三層成本控制如何協同

```
用戶提交任務 (taskType=simple)
     ↓
[智慧路由] → llama3.2 (免費本地)     ← 第一層：選最便宜的模型
     ↓
[Rate Limiter] → waitForToken(ollama)  ← 第二層：避免超出配額
     ↓
[LLM 呼叫] → Ollama 本地推理
     ↓
[Cost Tracker] → tokens=36+7, cost=$0  ← 第三層：精準記錄
     ↓
[Prometheus] → task_cost_usd_total += $0
```

| 層 | 作用 | 節省方式 |
|---|---|---|
| 智慧路由 | 選對模型 | 簡單任務用免費/便宜模型 |
| Rate Limiting | 控制頻率 | 防止帳單失控 |
| Cost Tracking | 看見成本 | 數據驅動優化決策 |

---

## 設計決策回顧

| 決策 | 選擇 | 原因 |
|---|---|---|
| 路由實作位置 | Worker 端（處理時） | 不在 API 端決定，因為 Provider 可用性可能變化 |
| 路由 Fallback | Llama 3.2 (本地) | 永遠可用，系統不會因為沒有 API key 而停擺 |
| Rate Limiter | Redis Token Bucket | 原子操作、分散式友好、令牌自動補充 |
| 限流行為 | 等待而非失敗 | 任務不丟失、不浪費重試次數、用戶體驗更好 |
| Cost Tracking | Prometheus Counter | 即時可視、支援 Grafana 告警 |
| 本地模型 | Ollama + Llama 3.2 | 零成本、開發友好、始終可用的 fallback |

---

## 小結

AI 基礎設施的成本控制不是「省錢」的問題，而是「可持續性」的問題。

一個月 $30,000 的 LLM 帳單可以讓很多公司直接放棄 AI 功能。但如果你能把成本降到 $8,000 而不犧牲核心功能的品質，AI 就從「奢侈品」變成了「基礎設施」。

三層控制的核心思想：

1. **智慧路由** — 不浪費：用對的模型做對的事
2. **Rate Limiting** — 不失控：限制頻率避免帳單爆炸
3. **Cost Tracking** — 不盲目：精準數據支撐優化決策

下一篇我們將進入工作流編排領域：**如何實作 DAG 依賴的任務鏈，讓多個 AI 任務有序、可靠地串接執行。**

---

*技術棧：NestJS 11 · BullMQ 5 · Redis 7.2 · Anthropic SDK · OpenAI SDK · Ollama · prom-client*
*專案原始碼：[AI Task Orchestrator](https://github.com/your-repo/ai-task-orchestrator)*
