# ADR-001: 選用 NestJS + BullMQ 作為核心引擎

```
狀態：    Accepted
日期：    2026-04-06
決策者：  Lead Architect
受影響範圍：系統整體架構
```

---

## 情境 (Context)

我們正在建構一個工業級 AI 任務編排器，需要處理以下核心挑戰：

1. **高併發 AI 任務分派** — 需要穩定地將大量任務分發至不同 Worker
2. **任務生命週期管理** — 需要追蹤 Pending / Active / Completed / Failed 等狀態
3. **背壓控制** — Worker 過載時必須能優雅地拒絕或緩衝新任務
4. **可觀測性整合** — 每個任務的執行狀態、延遲、錯誤必須可被追蹤
5. **長期可維護性** — 6個月計畫，需要清晰的模組邊界與測試能力

評估時考量的替代方案：

- Express + Bull (v3)
- Fastify + BullMQ
- NestJS + BullMQ ← **本方案**
- NestJS + Kafka (KafkaJS)
- NestJS + RabbitMQ (amqplib)

---

## 決策 (Decision)

**採用 NestJS 作為應用框架，搭配 BullMQ 作為任務佇列引擎。**

Redis 作為 BullMQ 的底層儲存，同時兼任冪等性 key 儲存與速率限制計數器。

---

## 理由 (Rationale)

### 為何選 NestJS 而非純 Express / Fastify？

| 考量點 | NestJS | Express/Fastify |
|--------|--------|-----------------|
| 模組化邊界 | ✅ 內建 Module/Provider 系統，強制清晰邊界 | ❌ 需自行建立慣例 |
| 依賴注入 | ✅ 原生 IoC 容器，便於測試 mock | ❌ 需引入第三方 (InversifyJS) |
| 可測試性 | ✅ `@nestjs/testing` 提供完整 unit/integration 測試支援 | ⚠️ 可行但需更多樣板 |
| 型別安全 | ✅ TypeScript first，class-validator 整合 | ⚠️ 需額外配置 |
| 學習曲線 | ⚠️ 較陡，但長期維護成本低 | ✅ 較平，但長期成本高 |

**結論：** NestJS 的模組系統讓我們可以將 `QueueModule`、`ObservabilityModule`、`CostGovernorModule` 等關注點完全隔離，對 6 個月計畫的可維護性至關重要。

### 為何選 BullMQ 而非 Bull v3？

BullMQ 是 Bull 的完全重寫版本，關鍵差異：

```
Bull v3        → 使用 Lua scripts，單一 Redis 連線模型
BullMQ (v4+)   → 使用 Redis Streams 概念，支援 Worker 並行模型
```

| 功能 | Bull v3 | BullMQ |
|------|---------|--------|
| TypeScript 支援 | ⚠️ 有型別但不完整 | ✅ 原生 TypeScript |
| Repeatable Jobs | ✅ | ✅ 更完善 |
| Job Groups (QueueScheduler) | ❌ 需額外設定 | ✅ 內建 |
| Rate Limiter | ⚠️ 基礎 | ✅ 精細控制 |
| Sandboxed Processors | ✅ | ✅ |
| 主動維護狀態 | ⚠️ 維護模式 | ✅ 活躍開發中 |

**結論：** BullMQ 的 Rate Limiter 與精細的並行控制對於我們的「背壓」設計目標是不可或缺的。

### 為何不選 Kafka？

Kafka 在以下場景優於 BullMQ：
- 需要事件日誌重播 (Event sourcing)
- 消費者群組 (Consumer groups) 超過 50+ 個
- 吞吐量需求在 1M+ msg/sec 級別

對於本專案，Kafka 的成本與複雜度超出需求：
- 需要 ZooKeeper 或 KRaft 叢集
- 冷啟動複雜度高
- 針對 AI 任務的 job-level 狀態追蹤需要額外實作

**BullMQ 的 Redis 單一依賴讓我們在 M1 內就能有可運行系統，符合「可測試性優先」原則。**

---

## 後果 (Consequences)

### 正面影響

- ✅ 6個月內技術棧單純，降低認知負擔
- ✅ `@nestjs/bullmq` 官方整合，減少樣板代碼
- ✅ Redis 一物多用：佇列 + 冪等性 key + Rate limiter + 語意快取（M5）
- ✅ BullMQ Dashboard (Bull Board) 可快速整合，提供開發期可觀測性
- ✅ 測試友好：NestJS Test Module 可輕鬆 mock BullMQ Producer

### 負面影響 / 風險

- ⚠️ **Redis 單點風險：** Redis 實例故障會影響佇列與應用。緩解：M4 驗證 Redis Sentinel / Cluster
- ⚠️ **BullMQ 強依賴 Redis 版本：** 需要 Redis 6.2+ (LMPOP 指令)。緩解：Docker Compose 鎖定版本
- ⚠️ **NestJS 啟動時間：** DI 容器初始化比 Express 慢 ~200ms。接受：對長期運行服務影響可忽略

---

## 技術約束對應 (Three-Dimensional Check)

| 維度 | 實現方式 |
|------|----------|
| **背壓 (Backpressure)** | BullMQ `limiter` 選項控制 Worker 並行數；Producer 端檢查佇列深度 |
| **冪等性 (Idempotency)** | Job `jobId` 設定確保相同 ID 不重複入隊；Redis `SET NX` 作為應用層去重 |
| **可觀測性 (Observability)** | BullMQ Worker events (`completed`, `failed`, `stalled`) + Pino structured logs |

---

## 版本約束

```json
{
  "@nestjs/core": "^11.x",
  "@nestjs/bullmq": "^11.x",
  "bullmq": "^5.x",
  "ioredis": "^5.x",
  "redis": "7.2+"
}
```

---

## 關聯決策

- 本決策為 **ADR-002**（冪等性實作策略）的前提
- 本決策為 **ADR-003**（可觀測性技術棧）的前提
- Redis 選型將在 **ADR-004** 中進一步評估 Cluster vs Sentinel

---

*ADR 格式參考：Michael Nygard's Architecture Decision Records*
