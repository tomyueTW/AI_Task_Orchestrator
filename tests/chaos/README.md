# Chaos Testing

故障注入腳本，驗證系統在異常條件下的自癒能力。每個腳本獨立可跑，也可由 `soak.ts` 串起全流程演習。

---

## 前置條件

1. Infra 已啟動：`docker compose -f docker/docker-compose.yml up -d`
2. API 與 Worker 以開發模式執行：
   ```bash
   npm run start:dev         # API  (port 3000)
   npm run start:worker:dev  # Worker (metrics port 9091)
   ```
3. 在另一個 shell 執行 chaos script：
   ```bash
   npx ts-node tests/chaos/kill-worker.ts
   ```

---

## 可用腳本

| Script | 驗證目標 |
|---|---|
| `load-generator.ts` | 以指定 RPS 灌入任務（背壓、優先級、Chain、DAG 混合） |
| `kill-worker.ts` | 在 job 執行中途 SIGKILL Worker，驗證 stalled job 自動 re-queue |
| `redis-chaos.ts` | 暫停/恢復 Redis container，驗證連線中斷自動重連 |
| `latency-injection.ts` | 透過環境變數使 Worker 注入人工延遲，觸發 SLA 硬性超時 |
| `soak.ts` | 12h 長時間壓測：load-generator + 隨機故障注入輪流執行 |

---

## 觀測位置

- Grafana `http://localhost:3001`：`task_processing_duration_seconds`、`task_failed_total`、`task_dlq_total`、`task_timeout_total`
- Bull Board `http://localhost:3000/admin/queues`：即時看到 stalled / failed / DLQ job
- Prometheus `http://localhost:9090`：raw metrics 與 alert 規則

---

## 預期表現（Pass Criteria）

| 場景 | 預期行為 |
|---|---|
| Worker crash | stalled job 於 `maxStalledCount` 內自動回 waiting，由其他 Worker 處理；不丟失 |
| Redis 短暫斷線 (<30s) | ioredis 自動 reconnect；queue 在恢復後繼續消費，無手動介入 |
| SLA 超時 | 由 `Promise.race()` 觸發，`task_timeout_total` 計數增加，重試耗盡後入 DLQ |
| 10k job 灌入 | 背壓閘門於 queue depth ≥ threshold 時回 429，API 保持可用 |
| DAG 節點失敗 | 下游 `deps-remaining` 永不歸零，自然阻斷；DAG status = failed |
