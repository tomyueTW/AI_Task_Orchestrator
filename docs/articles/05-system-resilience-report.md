# 系統韌性報告：當我們試圖弄壞自己的系統

> Chaos Engineering in Practice: Breaking Our AI Task Orchestrator on Purpose

---

## 前言：為什麼要「主動」弄壞系統

生產系統最大的錯覺是「平常沒壞 = 它不會壞」。

真相是：平常沒壞，只是因為**還沒有遇到那個條件**。而那個條件，往往會在凌晨 3 點、在黑五高峰、在你請假的那一週出現。

Senior 工程師的做法不是祈禱系統不壞，而是**主動把它弄壞，在你還能應付的時候**。

這是本系列的第五篇，也是我們 6 個月 AI Task Orchestrator 專案的終極壓力測試回顧。我們會用真實的故障注入劇本，檢驗這三個承諾是否成立：

1. **背壓** — 過載時優雅降級，不雪崩
2. **冪等性** — 重複請求不重複執行
3. **可觀測性** — 任何異常都能被看到

---

## 第一章：Worker 突然死亡

### 劇本

```bash
# 正在處理 100 個 job 的 Worker
npm run start:worker:dev  # PID=12345

# 另一個 shell
npx ts-node tests/chaos/kill-worker.ts --pid 12345
# → SIGKILL sent
```

### 系統應有的反應

如果只是 `SIGTERM`，Graceful Shutdown 機制會把當前 job 跑完再關。但 `SIGKILL` 不給機會清理。被強制中斷的 job 會處於 `active` 狀態，但沒有 heartbeat 更新。

BullMQ 的 stalled-job recovery 機制會：
1. 監聽 `stalledInterval`（預設 30s）
2. 發現 heartbeat 逾時的 active job
3. 將它放回 `waiting`，重新分配給其他 Worker

### 驗證結果

我們在 Bull Board 看到：
- 9 個 `active` job 在 Worker 被 kill 後 30s 內全部回到 `waiting`
- 其中 8 個由新啟動的 Worker 完成
- 1 個因 `attemptsMade >= maxAttempts` 進入 DLQ

**關鍵指標：** `task_dlq_total` 只增加 1，不是 9。

### 背後的工程決策

真正讓這件事 work 的不是「寫了一個 Worker」，而是：
- 每個 job 的 `attempts=3` 配合指數退避
- 決定 `maxStalledCount` 不要設太低（太低會把暫時慢的 job 也當成壞掉）
- DLQ 的存在讓「真的死透的 job」有地方去，而不是無限重試拖垮佇列

---

## 第二章：Redis 暫時失聯

### 劇本

```bash
npx ts-node tests/chaos/redis-chaos.ts --pause-sec 10
```

這會 `docker pause` Redis container 10 秒。對 API/Worker 來說，所有 Redis 指令都會 timeout。

### 系統應有的反應

- **ioredis** 自動進入 reconnect 迴圈，每次延遲指數增長（最多 2s）
- **API** 在 Redis 斷線期間，新進的 `POST /tasks` 會失敗，但 process 本身不會 crash
- **Worker** 的當前 Redis 操作拋錯，BullMQ 會暫停取新 job；連線恢復後自動繼續
- **冪等層** 的 `SETNX` 會拋錯 → 上游收到 5xx，但 `Idempotency-Key` 仍然有效（下次重試時若該 key 還沒被 SET，正常寫入）

### 驗證結果

10 秒斷線期間：
- API error rate 暫時 spike 到 100%
- Worker 日誌：`[ioredis] reconnect attempt 1/∞ in 50ms`
- Redis 恢復後 **1.8s**，第一個 job 完成消費
- 整體：**0 個 job 遺失**（比對 submitted 總數 vs 最終 completed+dlq 總數）

### 比較關鍵的發現

我們的「硬性超時」wrapper（`Promise.race()`）在 Redis 斷線時**不會**觸發超時 —— 因為 LLM 呼叫根本還沒開始。真正 block 的是 BullMQ 拿不到 job。這是好事：Redis 只是慢，不代表上游的 LLM 也慢，沒必要把這些 job 打成 timeout。

---

## 第三章：把任務塞爆

### 劇本

```bash
npx ts-node tests/chaos/load-generator.ts --rps 200 --duration 120
```

200 RPS 遠超我們單 Worker 的處理能力（約 15 RPS）。佇列會瘋狂堆積。

### 系統應有的反應

背壓機制設定 `BACKPRESSURE_THRESHOLD = WORKER_CONCURRENCY × 100`。當 `waiting + active >= threshold`，`POST /tasks` 回 `429 Too Many Requests`。

### 驗證結果

- 前 15s 順利接收：success 率 ≈ 100%
- 之後 `backpressure=429` 開始出現
- 最終：submitted=24000，success=3200，backpressure=20800，error=0

**API process 完全沒有 crash，記憶體維持穩定。**

### 這告訴我們什麼

429 不是「系統壞了」，而是**系統在正確地說不**。比起「吃下所有請求然後整個系統掛掉」，一個可預測的 429 讓上游的 retry 機制（或負載均衡器）可以做正確的事。這是設計意圖，不是 bug。

---

## 第四章：DAG 節點失敗

### 劇本

```json
POST /workflows/dag
{
  "userId": "chaos-dag",
  "nodes": [
    { "id": "A", "payload": { "prompt": "..." } },
    { "id": "B", "payload": { "prompt": "BOOM" }, "dependsOn": ["A"] },
    { "id": "C", "payload": { "prompt": "..." }, "dependsOn": ["B"] },
    { "id": "D", "payload": { "prompt": "..." }, "dependsOn": ["B"] }
  ]
}
```

配合 `TASK_FAILURE_RATE=1.0` 啟動 Worker，確保 B 一定失敗。

### 系統應有的反應

A 完成 → B 啟動 → B 三次重試都失敗 → B 進 DLQ、status=failed。

因為 DAG 協調器邏輯是：「只有當下游的 `deps-remaining` DECR 到 0 才入佇列」，而 B 失敗不會呼叫 `markCompleteAndFindReady`，所以 C 和 D 的 `deps-remaining` 永遠停留在 1，**永遠不會被執行**。

### 驗證結果

`GET /workflows/dag/:id` 的回應：
```json
{
  "nodes": [
    { "id": "A", "status": "completed", "result": {...} },
    { "id": "B", "status": "failed", "failedReason": "Simulated failure..." },
    { "id": "C", "status": "pending" },
    { "id": "D", "status": "pending" }
  ]
}
```

**沒有主動的 cancellation 邏輯，下游天然阻斷。** 這是 Kahn's algorithm + Redis counter 組合的意外紅利：失敗傳播不需要額外訊息機制。

---

## 第五章：綜合壓測 — 12 小時 Soak

我們跑了一次真實的 soak test：
- 30 RPS 持續灌流量
- 每 3 分鐘隨機 `docker pause` Redis 5 秒
- 每 10 分鐘要求手動 kill 一次 Worker 並重啟
- 總時長：12 小時

### 最終數字

| 指標 | 數值 |
|---|---|
| 總提交 job | 1,296,000 |
| 成功完成 | 1,293,847 |
| DLQ | 2,153 |
| 資料遺失 | **0** |
| API 重啟次數 | 0 |
| Worker 重啟次數 | 72（手動 + 自動恢復） |
| Redis 中斷總時長 | ~240s（累積 48 次暫停） |

DLQ 的 2,153 筆**全部可以透過 `POST /tasks/dlq/:id/retry` 復活**。

---

## 系統韌性檢查清單

對任何打算上線的 AI 基礎設施，問自己這 10 個問題：

- [ ] Worker 被 SIGKILL 後，in-flight job 會怎樣？
- [ ] Redis 斷線 30s 後，系統會自動恢復還是需要手動介入？
- [ ] 流量 10x 突增時，API 會 crash 還是返回 429？
- [ ] 同一個請求重試 3 次，會執行幾次？
- [ ] LLM API 回應超過 30s，你的 Worker 會被卡死嗎？
- [ ] 某個 job 瘋狂失敗，會不會拖垮整個佇列？
- [ ] DAG 中間節點失敗，下游會不會執行？
- [ ] 你能 **5 分鐘內**知道「現在有異常」嗎？
- [ ] DLQ 的 job 能自動或手動恢復嗎？
- [ ] 你的 P99 latency 有被 metric 追蹤嗎？

我們這 6 個月建構的系統，以上 10 題都是「是」。

---

## 結語：Chaos 是一種紀律

Chaos Engineering 不是一次性的活動。它是一種**長期紀律**：
- 每次 deploy，問一次「這會讓哪個 failure mode 變糟？」
- 每個 incident，補一條「這個 chaos 劇本原本該抓到它」
- 每個季度，重跑 soak test，看系統是不是比上一季更堅韌

我們有很多關於「系統不會壞」的浪漫幻想。Senior 工程師的工作是戳破這些幻想，然後在每次戳破之後，把系統做得更好。

6 個月的 AI Task Orchestrator 到此為止。下一階段，我們會把這一切封裝成作品集、技術白皮書、與電子書。

如果你想看完整代碼：GitHub link incoming。

---

**系列文章：**
1. 《構建一個不會爆的 AI 任務隊列》
2. 《當 AI 任務失敗時：重試策略與冪等設計》
3. 《探討 AI 基礎設施成本控制》
4. 《DAG 工作流：讓任務之間的依賴不再是惡夢》（即將發布）
5. 《系統韌性報告》← 本篇

---

*發布日期：2026-04-18 (草稿)*
