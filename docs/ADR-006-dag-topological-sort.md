# ADR-006: DAG 依賴拓撲排序策略

```
狀態：    Accepted
日期：    2026-04-18
決策者：  Lead Architect
受影響範圍：libs/workflow, apps/api /workflows/dag, apps/worker DagCoordinator
```

---

## 情境 (Context)

8月 W1 的線性任務鏈（Sequential Chain）僅支援 A → B → C 線性依賴，由 BullMQ FlowProducer 原生 parent-child 樹處理。8月 W2 需要支援任意 DAG（Directed Acyclic Graph），包含：

- **扇出 (Fan-out)：** A 完成後同時觸發 B、C
- **扇入 (Fan-in)：** B、C 都完成後才觸發 D
- **菱形依賴：** A → {B, C} → D，D 需同時等 B 與 C

**關鍵限制：**
1. BullMQ FlowProducer 只支援「樹」（每節點至多一個 parent），不支援菱形依賴
2. 節點失敗時下游必須阻斷，不可繼續執行
3. 下游節點需能讀取所有 upstream 節點的 output（不只直接前驅）
4. 多 Worker 環境需保證 pendingDeps 計數的原子性

---

## 決策 (Decision)

採用 **Kahn's Algorithm（拓撲排序）做靜態驗證 + Redis 原子計數器做運行時協調**，不使用 BullMQ Flow。

### 1. 靜態驗證 — `libs/workflow/topological-sort.ts`

API 收到 `POST /workflows/dag` 時執行：

```typescript
function topologicalLayers(nodes: DagNodeInput[]): string[][]
```

- 入度為 0 的節點入佇列
- 逐層剝離，若處理數量 < 節點總數 → 偵測到環，拋 `DagValidationError`
- 副作用：同時檢查自我依賴（self-loop）、重複 id、未知依賴
- 回傳「分層節點 id」(`layers[]`)，僅作為 debug/可視化用途

**為何選 Kahn's 而非 DFS：**
- Kahn's 逐層輸出天然貼合「哪些節點可並行」的語意
- DFS 需反向追蹤產生順序，並行層資訊需額外計算
- 兩者時間複雜度同為 O(V + E)

### 2. 運行時協調 — `libs/workflow/dag-coordinator.ts`

**Redis 狀態鍵：**
```
dag:{id}:meta                    JSON  DagMeta
dag:{id}:nodes                   HASH  nodeId → DagNodeInput JSON
dag:{id}:dependents              HASH  nodeId → string[] JSON（反向鄰接）
dag:{id}:deps-remaining:{node}   INT   尚未滿足的依賴數
dag:{id}:results                 HASH  nodeId → 節點回傳值
dag:{id}:status                  HASH  nodeId → pending|ready|active|completed|failed
dag:{id}:jobIds                  HASH  nodeId → BullMQ jobId
dag:{id}:failures                HASH  nodeId → 失敗原因
```

全部 TTL 7 天。

**執行流程：**

```
(API) POST /workflows/dag
 ├─ topologicalLayers() 驗證並計算 layers
 ├─ dagCoordinator.persist() 寫入 Redis
 └─ 取 dependsOn.length === 0 的 root 節點，全部入 per-user 佇列

(Worker) Job 完成（含 dagId + dagNodeId）
 └─ onDagNodeCompleted():
     ├─ HSET results.{nodeId} = job 回傳值
     ├─ HGET dependents.{nodeId} → 下游 id 陣列
     └─ 對每個下游:
         ├─ DECR deps-remaining.{dep} (Redis 原子操作)
         └─ 若結果 == 0:
             ├─ getResults(dep.dependsOn) 取所有 upstream 結果
             ├─ 注入 payload.dependencies = { [depId]: result }
             └─ queue.add() 入佇列

(Worker) Job 失敗（重試耗盡）
 └─ markFailed(): HSET status.{nodeId} = 'failed'
     下游 deps-remaining 永不歸零 → 自然阻斷，無需主動取消
```

**原子性保證：** 所有「下游是否就緒」的判定基於 `DECR` 原子回傳值，不會有 double-enqueue 的 race condition。

### 3. 結果注入 API

下游節點的 `payload` 會被注入 `dependencies`：

```typescript
{
  ...originalPayload,
  dependencies: {
    "A": { result: "...", cost: 0.001, ... },
    "B": { result: "...", cost: 0.002, ... }
  }
}
```

Worker 的 `processJob` 同時支援 Chain 的 `previousResult` 與 DAG 的 `dependencies`，兩者可並存。

---

## 備選方案與拒絕理由

### Option A：擴充 BullMQ FlowProducer 支援多父 ❌

FlowProducer 的 Lua script 前提是 parent-child 樹；為支援菱形依賴需改動 BullMQ 核心或維護 fork。成本過高且破壞 upgrade path。

### Option B：層序阻塞（Layer-by-layer barrier）❌

每層結束後由 API/協調器統一入下一層。簡單但會造成長尾任務拖慢整層（tail latency），違背「可並行節點應最早啟動」的原則。

### Option C：DFS 拓撲排序 + 遞迴觸發 ❌

可行但：
- 遞迴 Promise 鏈在 Worker 端難以觀測
- 失敗處理邏輯分散在多個 async 邊界
- 不如 Kahn's + Redis counter 的狀態機清晰

### Option D：外部 workflow engine（Temporal / Airflow）❌

重型依賴、違背專案「輕量工業級」的定位，且需額外 infra 元件。

---

## 影響 (Consequences)

### 正面
- **支援任意 DAG 拓撲**（扇出、扇入、菱形、多根）
- **自動失敗阻斷**：失敗節點的下游永不觸發，無需額外 cancellation 訊息
- **可並行度最大化**：任何就緒節點立即入佇列，不等整層
- **可觀測性**：`GET /workflows/dag/:id` 可即時看到每節點 status 與 result

### 負面 / 風險
- **Redis 成為狀態單點**：若 Redis 資料丟失，進行中的 DAG 會卡住（可接受，畢竟所有佇列狀態都在 Redis）
- **無自動清理**：目前只靠 TTL 7 天，若 DAG 運行超過 7 天會被誤刪（超出本計畫範圍，後續可加 activity-touch 續命）
- **無孤兒節點偵測**：若某節點進 DLQ 後手動重試成功，需手動觸發下游（目前未實作；記為已知限制）

---

## 測試案例（8月 W2 W6 壓測）

| 場景 | 節點 | 依賴 | 驗證 |
|---|---|---|---|
| 線性 | A→B→C | 簡單 | 基本等價於 chain |
| 扇出 | A→{B,C,D} | 單 root 多子 | B、C、D 並行執行 |
| 扇入 | {A,B,C}→D | 多 root 單子 | D 只在 A、B、C 全完成後觸發 |
| 菱形 | A→{B,C}→D | 經典測試 | D.payload.dependencies 含 B、C 結果 |
| 環偵測 | A→B→A | 應拒絕 | API 回 400 + DagValidationError |
| 失敗阻斷 | A(fail)→B | 上游失敗 | B 永不執行，status=pending |

---

## 相關

- 前序：8月 W1 Sequential Chain（BullMQ FlowProducer）
- 後續：8月 W3 Bull Board 可視化（看板需讀取 DAG status hash）
