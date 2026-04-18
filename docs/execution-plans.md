# AI Task Orchestrator 2026 — Project Plan (v0.2.0)

> **計畫週期：** 2026年4月 ─ 9月（6個月）
> **核心技術棧：** NestJS · Redis (BullMQ) · TypeScript
> **三維設計原則：** 背壓 (Backpressure) · 冪等性 (Idempotency) · 可觀測性 (Observability)

---

## 一、目標宣言 (Mission Statement)

打造一個工業級 AI 任務編排器，解決 AI 生產環境三大核心挑戰：

- **彈性調度 (Elastic Scheduling)：** 透過背壓控制與公平分配算法，在高負載下維持系統穩健，確保不同用戶間的資源隔離與任務優先級
- **極致可靠 (High Resilience)：** 實作任務冪等性、指數退避重試與死信隊列 (DLQ)，確保 AI 任務在網路波動或模型崩潰時具備自動修復與不丟失的自癒能力
- **智慧路由 (Intelligence Routing)：** 根據任務類型自動分流至最適模型（Cost-Effective Routing），精確計算 Token 消耗，達成成本與效能最佳平衡

**一句話定義：** 具備「高抗壓、自癒能力與智慧成本意識」的 AI 任務編排與執行中樞。

---

## 二、三階段執行計畫

---

### 🧱 第一階段：系統穩定與健壯期 (4月 – 5月)

**核心：4月做到「不塞車」，5月做到「不丟失」。**

---

#### 📅 4月：單機穩定系統 (Core Engine)

##### W1：核心契約與基礎 Enqueue
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 初始化 NestJS/Redis 環境；定義極簡 `tasks` Schema（ID, Status, Payload）；實作 `POST /tasks` API |
| 六 (壓力測試) | 壓力測試 API 入口，確認每秒可接收的 Request 上限 (TPS) |
| 日 (總結) | 紀錄基礎架構決策 (ADR-001)；使用 Conventional Commit 提交代碼 |

##### W2：Worker 運作與狀態流轉
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 整合 BullMQ；實作 Worker Handler；定義 Task Status（Pending → Active → Completed/Failed） |
| 六 (壓力測試) | 模擬 Worker 處理時間長短不一（Slow Consumer）情境，觀察隊列堆積情況 |
| 日 (總結) | 產出狀態流轉圖；確保代碼邏輯在 Worker 重啟時不會卡死 |

##### W3：並行控制與優雅停機
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 實作 `concurrency` 限制；實作 Graceful Shutdown（接收 SIGTERM 後確保完成當前任務再關機） |
| 六 (壓力測試) | 在執行中暴力重啟 Worker，檢查任務是否能被自動重新分配（Re-queue） |
| 日 (總結) | 紀錄不同並行數設定下的 CPU/Memory 資源消耗關係 |

##### W4：背壓機制 (Backpressure) — 最小實作
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 實作門檻檢查：`Threshold = Concurrency × 100`；超過閾值則 API 回傳 `429 Too Many Requests` |
| 六 (壓力測試) | 持續灌入流量直至觸發 429，觀察系統在壓力釋放後的恢復速度 |
| 日 (總結) | 🚀 **發布文章 #1**：《構建一個不會爆的 AI 任務隊列》 |

---

#### 📅 5月：可靠性與錯誤處理 (Engineering Depth)

##### W1：Idempotency (冪等性) — 最小實作
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 實作 Redis `SETNX idempotency_key` 檢查；若重複則直接回報「已處理」，不重複執行 |
| 六 (壓力測試) | 模擬極短時間內送出相同 Key 的請求，驗證 `SETNX` 是否成功攔截 |
| 日 (總結) | 紀錄冪等層在「執行中」與「已完成」狀態下的處理邏輯 |

##### W2：重試策略與 DLQ — 最小實作
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 實作固定重試次數 + 指數退避 (Exponential Backoff)；建立死信隊列 (DLQ) |
| 六 (壓力測試) | 模擬 Fake Failure（隨機拋出錯誤），觀察任務是否如期進入重試流與 DLQ |
| 日 (總結) | 紀錄手動恢復 DLQ 任務的 SOP 流程 |

##### W3：數據觀測指標 (Observability)
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 整合 Prometheus；埋點 `P99 Latency` 與 `Task Error Rate`；設定 Grafana 看板 |
| 六 (壓力測試) | 在高壓下檢查指標數據的準確性 |
| 日 (總結) | 建立系統健康診斷清單 (Health Check List) |

##### W4：5月階段性總結
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 修正前三週 Bug；撰寫文章 #2 |
| 六 (壓力測試) | 執行 12 小時長穩定性測試 (Soak Test) |
| 日 (總結) | 🚀 **發布文章 #2**：《當 AI 任務失敗時：重試策略與冪等設計》 |

---

### ⚙️ 第二階段：進階調度與 AI 路由 (6月 – 7月)

**核心：解決資源分配公平性，引入智慧模型路由。**

---

#### 📅 6月：公平性與優先級 (Scheduling)

##### W1：基礎公平分配 — 最小實作
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 實作「一用戶一隊列 (One User One Queue)」架構，確保資源隔離 |
| 六 (壓力測試) | 模擬 A 用戶灌入大量任務，驗證 B 用戶任務是否仍能即時處理 |
| 日 (總結) | 紀錄多隊列架構下的系統資源分佈數據 |

##### W2：權重優先級 (Priority)
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 利用 BullMQ 內建優先級實作 High Priority Job 搶佔邏輯 |
| 六 (壓力測試) | 混合流量測試，觀察高優先級任務的處理順序 |
| 日 (總結) | 紀錄優先級設計 ADR |

##### W3：SLA 與超時管理
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 實作任務執行硬性超時 (Hard Timeout)；強制終止殭屍任務 |
| 六 (壓力測試) | 模擬任務掛起 (Hang) 情境，驗證自動終止功能 |
| 日 (總結) | 建立 SLA 違約告警規則 |

##### W4：6月總結與影片產出
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 錄製演算法 Demo 影片；撰寫影片 #1 腳本 |
| 日 (總結) | 🎬 **發布影片 #1**：展示系統如何處理插隊與公平分配 |

---

#### 📅 7月：AI Routing & Cost (Intelligence)

> **核心決策：** 接入真實 LLM API（Anthropic Claude + OpenAI GPT），非模擬。

##### W1：Cost Model 與模型庫
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 新增 `libs/cost-governor` 模組；建立模型註冊表（ModelRegistry）定義各模型 ID、Provider、Token 單價（input/output）；整合 Anthropic SDK + OpenAI SDK，實作真實 LLM 呼叫 Service；Worker 處理 job 時呼叫真實 API 並記錄 token 消耗 |
| 六 (壓力測試) | 測試不同模型的 Token 計算準確度；對照 Provider Dashboard 驗證計費一致性 |
| 日 (總結) | 紀錄成本模型設計決策 (ADR-007) |

**模型註冊表設計：**
```typescript
interface ModelDefinition {
  id: string;              // e.g. 'claude-haiku-4-5', 'gpt-4o-mini'
  provider: 'anthropic' | 'openai';
  inputPricePerMToken: number;   // USD per 1M input tokens
  outputPricePerMToken: number;  // USD per 1M output tokens
  maxTokens: number;
  tags: string[];          // e.g. ['fast', 'cheap'] or ['code', 'complex']
}
```

**環境變數：**
- `ANTHROPIC_API_KEY` — Anthropic API Key
- `OPENAI_API_KEY` — OpenAI API Key

##### W2：智慧路由 (Decision Engine)
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 新增 `libs/router` 模組；根據 task payload 中的 `taskType` 標籤自動選擇最適模型；路由規則：`simple` → Haiku/GPT-4o-mini（低成本）、`code` → Sonnet/GPT-4o（平衡）、`complex` → Opus/o3（高品質）；路由決策記錄在 job data 中供成本追蹤 |
| 六 (壓力測試) | 驗證路由邏輯的命中率；對比不同路由策略下的成本差異 |
| 日 (總結) | 紀錄路由策略 ADR-005 |

**路由規則設計：**
```
taskType: 'simple'  → claude-haiku-4-5 / gpt-4o-mini    (最低成本)
taskType: 'code'    → claude-sonnet-4-6 / gpt-4o         (平衡)
taskType: 'complex' → claude-opus-4-6 / o3               (最高品質)
```

##### W3：Token Bucket 限流 (Rate Limit)
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 實作 Redis Token Bucket 限流器（per-provider）；每個 Provider 獨立桶：Anthropic RPM/TPM、OpenAI RPM/TPM；限流觸發時 job 延遲處理（delay re-queue），不直接失敗 |
| 六 (壓力測試) | 高併發呼叫測試，驗證限流桶是否平滑整流；觀察限流觸發後的排隊與恢復行為 |
| 日 (總結) | 建立限流參數調優文件 |

**環境變數：**
- `ANTHROPIC_RPM_LIMIT` — Anthropic Requests Per Minute（預設 50）
- `OPENAI_RPM_LIMIT` — OpenAI Requests Per Minute（預設 60）

##### W4：文章 #3 與總結
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 撰寫文章 #3；整理 7 月 ADR |
| 日 (總結) | 🚀 **發布文章 #3**：《探討 AI 基礎設施成本控制》 |

---

### 🚀 第三階段：複雜場景與品牌包裝 (8月 – 9月)

**核心：實踐工作流依賴，並完成高品質的作品集封裝。**

---

#### 📅 8月：受限工作流與 Chaos (Resilience)

> **核心決策：** Dashboard 採用 Bull Board（`@bull-board/nestjs`），不自建前端。

##### W1：線性任務鏈 (Sequential Chain)
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 利用 BullMQ Flow（parent-child）實作 Task A → Task B 數據注入；A 的 output 自動作為 B 的 input；API 新增 `POST /workflows/chain` 接收任務鏈定義 `[{step, payload}]` |
| 六 (壓力測試) | 測試鏈結任務中單點失敗後的阻斷行為；驗證 A 失敗時 B 不會被執行 |
| 日 (總結) | 紀錄任務鏈設計模式 |

**API 設計：**
```json
POST /workflows/chain
{
  "userId": "alice",
  "steps": [
    { "name": "summarize", "payload": { "text": "..." } },
    { "name": "translate",  "payload": { "targetLang": "zh" } }
  ]
}
```
→ Step 1 完成後，output 注入 Step 2 的 input 自動執行

##### W2：靜態 DAG 依賴檢查
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 新增 `libs/workflow` 模組；實作拓撲排序 (Topological Sort) 驗證 DAG 無循環依賴；API 新增 `POST /workflows/dag` 接收 DAG 定義；可並行的節點同時執行，有依賴的節點等待前置完成 |
| 六 (壓力測試) | 測試複雜 DAG（菱形依賴、扇出扇入）的並行執行正確性 |
| 日 (總結) | 紀錄 DAG 演算法選型 ADR-006 |

**DAG 定義格式：**
```json
POST /workflows/dag
{
  "userId": "alice",
  "nodes": [
    { "id": "A", "payload": {...} },
    { "id": "B", "payload": {...}, "dependsOn": ["A"] },
    { "id": "C", "payload": {...}, "dependsOn": ["A"] },
    { "id": "D", "payload": {...}, "dependsOn": ["B", "C"] }
  ]
}
```
→ A 先執行 → B、C 並行 → D 最後（扇出扇入）

##### W3：Bull Board 可視化看板
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 整合 `@bull-board/nestjs` + `@bull-board/api`；自動掃描所有用戶佇列 + DLQ 註冊至 Bull Board；暴露於 `/admin/queues` 路徑；支援即時查看佇列狀態、job 詳情、手動重試/刪除 |
| 六 (壓力測試) | 驗證看板在高流量下的數據延遲與準確性 |
| 日 (總結) | 撰寫文章 #4 草稿 |

##### W4：Chaos Testing (故障注入)
| 類型 | 內容 |
|------|------|
| 一四五 (開發) | 實作故障注入腳本（`tests/chaos/`）：隨機殺 Worker、Redis 斷線模擬、高延遲注入；撰寫文章 #5 系統終極回顧 |
| 六 (壓力測試) | 🔥 **故障大演習**：隨機停掉 Worker → 驗證 stalled job 自動 re-queue；Redis 短暫斷線 → 驗證重連後系統恢復；同時執行背壓 + 超時 + DLQ 全流程 |
| 日 (總結) | 🚀 **發布文章 #5**：《系統韌性報告》 |

---

#### 📅 9月：品牌化與終極結案 (The Portfolio Assets)

##### W1：個人作品集與 Notion 整合
| 日期 | 內容 |
|------|------|
| 一 | 整理 4–8 月所有 ADR 與 5 篇技術文章 |
| 四 | 建立 **Notion Portfolio**：開發日誌、系統指標圖、代碼片段視覺化 |
| 五 | 優化個人 GitHub Profile，將此專案設為 Pinned 項目 |
| 六 (測試) | 測試作品集在跨裝置、不同瀏覽器的顯示效果 |
| 日 (總結) | 完成作品集初步架構 |

##### W2：文檔工程化 (Engineering Documentation)
| 日期 | 內容 |
|------|------|
| 一 | 撰寫全英文 **README.md**（系統架構圖、安裝指南、壓測數據） |
| 四 | 自動生成 API Swagger Docs，編寫開發者使用手冊 |
| 五 | 撰寫 **"How we scaled to 10k TPS"** 技術白皮書草稿 |
| 六 (測試) | 邀請朋友 / AI 進行代碼與文檔 Proofreading |
| 日 (總結) | 完成全系統文檔中心 |

##### W3：電子書撰寫與最終影片 (Knowledge Distillation)
| 日期 | 內容 |
|------|------|
| 一 | 彙整所有設計模式，產出電子書 **《Building Scalable AI Agent Infrastructure》** 精華版 |
| 四 | 錄製專案 Demo 最終影片（架構講解、壓測演示、故障自癒展示） |
| 五 | 進行影片剪輯與後製（字幕與技術註解） |
| 六 (測試) | 執行最後一次全系統回歸測試 (Regression Test) |
| 日 (總結) | 完成電子書初稿與影片後製 |

##### W4：正式發布與結案回顧
| 日期 | 內容 |
|------|------|
| 一 | 在 **Product Hunt** 或 **X / Twitter / LinkedIn** 正式發布專案與電子書 |
| 四 | 回覆社群反饋，修復最後的邊際 Bug |
| 五 | **2026 年度大計結案複盤**：對照 4 月設定的目標，紀錄成長數據 |
| 六 | 清理技術債，進行最終代碼 Refactor 與版本標記（`v1.0.0-final`） |
| 日 | 🎉 **慶祝結案**，規劃下一個階段的進階目標 |

---

## 三、交付物總覽 (Deliverables)

| 類型 | 數量 | 清單 |
|------|------|------|
| 技術文章 | 5 篇 | 背壓設計、冪等設計、成本控制、DAG 工作流、韌性報告 |
| 影片 | 2 支 | 公平調度 Demo、系統全貌 Demo |
| ADR | 5+ 份 | 核心技術選型決策紀錄 |
| 電子書 | 1 本 | 《Building Scalable AI Agent Infrastructure》 |
| 技術白皮書 | 1 份 | "How we scaled to 10k TPS" |
| GitHub 開源發布 | 1 次 | `v1.0.0-final` |

---

## 四、執行 Protocol

| 週期 | 模式 | 原則 |
|------|------|------|
| 週一四五 | **開發模式** | 拒絕過度設計，只寫「能被測試」且「符合本週目標」的代碼 |
| 週六 | **壓力測試模式** | 唯一目標是**證明系統會壞掉**，這是 Senior 工程師最重要的實踐 |
| 週日 | **總結與品牌化模式** | 將本週的失敗、思考與 ADR 整理成文，為後續文章累積素材 |

---

## 五、架構決策索引 (ADR Index)

| ADR | 標題 | 狀態 | 預計月份 |
|-----|------|------|------|
| ADR-001 | 選用 NestJS + BullMQ 作為核心引擎 | ✅ Accepted | 4月 |
| ADR-002 | 冪等性實作策略 (Redis SETNX) | 🔄 Draft | 5月 |
| ADR-003 | 可觀測性技術棧 (Prometheus + Grafana) | 🔄 Draft | 5月 |
| ADR-004 | 公平調度演算法選型 (Per-User Queues) | 🔄 Draft | 6月 |
| ADR-005 | AI 路由決策引擎設計 (Cost-Effective Routing) | ⏳ Pending | 7月 |
| ADR-006 | DAG 依賴拓撲排序策略 | ✅ Accepted | 8月 |
| ADR-007 | 成本模型與模型註冊表設計 | ⏳ Pending | 7月 |

---

## 六、專案目錄結構（規劃）

```
ai-task-orchestrator/
├── apps/
│   ├── api/                    # NestJS HTTP API 入口
│   └── worker/                 # BullMQ Worker 程序
├── libs/
│   ├── queue/                  # BullMQ 佇列抽象層
│   ├── idempotency/            # 冪等性 middleware
│   ├── observability/          # Metrics / Tracing / Logging
│   ├── cost-governor/          # AI 成本控管模組 (7月)
│   ├── router/                 # AI 智慧路由引擎 (7月)
│   └── workflow/               # DAG 工作流引擎 (8月)
├── docs/
│   └── adr/                    # 架構決策紀錄
├── tests/
│   ├── unit/
│   ├── integration/
│   └── load/                   # k6 腳本
├── docker/
│   ├── docker-compose.yml
│   └── docker-compose.test.yml
├── .github/
│   └── workflows/
├── CHANGELOG.md
└── README.md
```

---

## 七、Conventional Commits 規範

```
feat(queue): add priority queue support
fix(worker): resolve race condition in job deduplication
docs(adr): add ADR-002 idempotency strategy
test(load): add k6 script for 10k RPS scenario
chore(deps): upgrade bullmq to v5.x
perf(cache): implement semantic cache for AI responses
```

**Commit 類型對照表：**

| 類型 | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修復 |
| `docs` | 文件 (包含 ADR) |
| `test` | 測試腳本 |
| `chore` | 建置設定、依賴更新 |
| `perf` | 效能優化 |
| `refactor` | 重構 (無功能變更) |

---

*最後更新：2026-04-18 | 版本：v0.5.0*
