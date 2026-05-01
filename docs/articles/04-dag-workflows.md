# DAG 工作流：讓任務之間的依賴不再是惡夢

> Building a Distributed DAG Workflow Engine on BullMQ + Redis

---

## 前言：為什麼 Chain 不夠

幾個月前，我們的系統只支援線性鏈：A → B → C。BullMQ 的 FlowProducer 內建 parent-child，把每個 step 當成下一個 step 的 child，跑得乾淨利落。

但真實世界很快就破壞了這個假設。一個常見需求出現了：

> 「先擷取網頁內容（A），同時讓兩個模型分別摘要（B、C），再把兩個摘要交給第三個模型做 fact-checking（D）。」

畫成圖：

```
        ┌─→ B ─┐
   A ───┤      ├─→ D
        └─→ C ─┘
```

這是經典的**菱形依賴 (diamond dependency)**。FlowProducer 不支援它 —— BullMQ Flow 是樹狀結構，每個節點只能有一個 parent，D 沒辦法同時是 B 與 C 的 parent。

我們在 8 月做的選擇是：**不擴充 BullMQ，自己寫一層 DAG 引擎在它之上。** 這篇文章記錄這個決策的過程。

---

## 第一個問題：靜態驗證

在執行 DAG 之前，我們必須先確認它**確實是 DAG**。
- 沒有環（A → B → A 應該被拒絕）
- 沒有自我依賴（A → A）
- 所有依賴都指向已存在的節點

我們用 **Kahn's algorithm** 做拓撲排序：

```typescript
export function topologicalLayers(nodes: DagNodeInput[]): string[][] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const n of nodes) {
    for (const dep of n.dependsOn ?? []) {
      adjacency.get(dep)!.push(n.id);
      inDegree.set(n.id, inDegree.get(n.id)! + 1);
    }
  }

  const layers: string[][] = [];
  let frontier = nodes.filter((n) => inDegree.get(n.id) === 0).map((n) => n.id);
  let processed = 0;

  while (frontier.length > 0) {
    layers.push([...frontier]);
    processed += frontier.length;
    const next: string[] = [];
    for (const id of frontier) {
      for (const child of adjacency.get(id)!) {
        const deg = inDegree.get(child)! - 1;
        inDegree.set(child, deg);
        if (deg === 0) next.push(child);
      }
    }
    frontier = next;
  }

  if (processed !== nodes.length) {
    throw new DagValidationError('Cycle detected in DAG');
  }

  return layers;
}
```

**為什麼選 Kahn's 而不是 DFS？**

兩者時間複雜度都是 O(V+E)。但 Kahn's 的副產物 —— 「分層」 —— 直接告訴你「哪些節點可以並行」，這正是我們執行階段需要的資訊。DFS 必須額外計算 longest path 才能得到並行層，得不償失。

---

## 第二個問題：執行階段協調

驗證通過後，DAG 進入執行。挑戰：
- 多個 Worker 並行消費，必須**精準判定**「下游是否就緒」
- 任何 race condition 都會導致 double-enqueue 或漏掉節點
- 失敗時下游必須**自然停止**，不能繼續執行

我們的設計核心：**Redis 原子計數器 (`DECR`)**。

每個下游節點有一個 `deps-remaining:{node}` 計數器，初始等於它的依賴數。當上游節點完成：

```typescript
async markCompleteAndFindReady(dagId, nodeId, result): Promise<DagNodeInput[]> {
  // 1. 寫入結果
  await this.redis.hset(`dag:${dagId}:results`, nodeId, JSON.stringify(result));

  // 2. 找出所有「依賴 nodeId」的下游節點
  const dependents = JSON.parse(
    await this.redis.hget(`dag:${dagId}:dependents`, nodeId) ?? '[]'
  );

  // 3. 對每個下游：DECR 計數器；歸零者進 ready 列表
  const ready: DagNodeInput[] = [];
  for (const depId of dependents) {
    const remaining = await this.redis.decr(`dag:${dagId}:deps-remaining:${depId}`);
    if (remaining === 0) {
      const node = await this.getNode(dagId, depId);
      if (node) ready.push(node);
    }
  }

  return ready;
}
```

`DECR` 是 Redis 的原子操作。即使有 10 個 Worker 同時完成 10 個上游節點，每個下游節點的計數器都會被精準遞減；只有「最後一個讓它歸零」的那次操作會回傳 0，從而觸發入佇列。

**沒有 race，沒有重複，沒有遺漏。**

---

## 第三個問題：上游結果如何流到下游

D 需要 B 和 C 的結果。我們把所有結果存在一個 hash：

```
HSET dag:{id}:results B {result_of_B}
HSET dag:{id}:results C {result_of_C}
```

當 D 被入佇列時，Worker 在執行 D 的處理函式之前，先批量讀回所有 upstream：

```typescript
const dependencies = await this.dagCoordinator.getResults(
  dagId,
  node.dependsOn ?? [],
);
effectivePayload = { ...node.payload, dependencies };
```

D 的 prompt 因此會收到：

```json
{
  "originalPayload": "...",
  "dependencies": {
    "B": { "result": "summary 1...", "cost": 0.0008 },
    "C": { "result": "summary 2...", "cost": 0.0007 }
  }
}
```

D 的 LLM prompt 可以直接消費這個結構。

---

## 第四個問題：節點失敗怎麼辦？

最初我以為要寫一套 cancellation 訊息：當某節點進入 DLQ，廣播給所有下游讓它們自殺。

但 Redis 計數器的設計讓這個邏輯變得**完全不必要**。

如果 B 失敗（沒有呼叫 `markCompleteAndFindReady`），D 的 `deps-remaining` 計數器**永遠不會歸零**。D 永遠不會被入佇列。下游所有節點自動阻斷。

這是我特別欣賞的「設計帶來的紅利」：失敗傳播不需要任何主動機制，自然發生。

---

## 一個完整例子

```http
POST /workflows/dag
{
  "userId": "alice",
  "nodes": [
    { "id": "fetch", "payload": { "url": "https://example.com/article" } },
    { "id": "summarize-en",
      "payload": { "lang": "en" },
      "dependsOn": ["fetch"] },
    { "id": "summarize-zh",
      "payload": { "lang": "zh" },
      "dependsOn": ["fetch"] },
    { "id": "fact-check",
      "payload": { "model": "gpt-4o" },
      "dependsOn": ["summarize-en", "summarize-zh"] }
  ]
}
```

執行軌跡：
1. API 驗證拓撲（無環）→ 持久化 → 入佇列 `fetch`（layer 0）
2. Worker 執行 `fetch` → `markCompleteAndFindReady` → `summarize-en` 與 `summarize-zh` 的計數器歸零 → 兩者**並行**入佇列
3. `summarize-en` 完成 → `fact-check` 計數器 2 → 1
4. `summarize-zh` 完成 → `fact-check` 計數器 1 → 0 → 入佇列
5. `fact-check` 執行時收到 `payload.dependencies = { "summarize-en": {...}, "summarize-zh": {...} }`

整個過程沒有單一協調者進程。每個 Worker 都是平等的協調者，靠 Redis 的 atomic 操作維持正確性。

---

## 為什麼不用 Temporal / Airflow？

我評估過這條路。它們是工業界 DAG 引擎的標竿。

但對我們的專案而言：
- **重量過大**：Temporal 需要獨立的 server cluster + history database。Airflow 需要 scheduler + executor + metadata DB。
- **耦合過深**：一旦接入，整個 task lifecycle 都被它接管，違背我們「在 BullMQ 之上輕量擴充」的原則。
- **學習價值低**：用了它們，我永遠不會理解 DAG 引擎本質。

自寫一個薄層的代價是：~150 行 TypeScript，一個 ADR，一個 7-day TTL 的 Redis 狀態機。這是值得的價格。

---

## 視覺化 (10月 W1 預告)

接下來我們會用 ReactFlow 把 DAG 渲染成可互動的圖：
- 節點顏色即時反映 status（pending/active/completed/failed）
- 點擊節點看 result 與 cost
- 拖拽建構 + 一鍵 POST
- 失敗的節點高亮，下游灰色化以視覺化「自然阻斷」

---

## 總結

DAG 引擎不是必須用重型框架解決的問題。**在你已經有 Redis 的環境下**，它是一個算法 + 一組原子操作 + 一張狀態表。

如果你的 task queue 也撐到了「需要依賴」這一步，希望這篇文章給你一個自己動手的選項。

---

**系列文章：**
1. 《構建一個不會爆的 AI 任務隊列》
2. 《當 AI 任務失敗時：重試策略與冪等設計》
3. 《探討 AI 基礎設施成本控制》
4. 《DAG 工作流：讓任務之間的依賴不再是惡夢》← 本篇
5. 《系統韌性報告》

---

*發布日期：2026-05-01 (草稿)*
