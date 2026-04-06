# AI Task Orchestrator

Industrial-grade AI task orchestrator built with backpressure control, idempotency, and observability.

## Architecture

```
ai-task-orchestrator/
├── apps/
│   ├── api/                    # NestJS HTTP API
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       └── tasks/
│   │           ├── tasks.module.ts
│   │           ├── tasks.controller.ts   # POST /tasks, GET /tasks/:id
│   │           ├── tasks.service.ts
│   │           └── dto/
│   │               └── create-task.dto.ts
│   └── worker/                 # BullMQ Worker
│       └── src/
│           ├── main.ts
│           ├── worker.module.ts
│           └── task.processor.ts         # Job processor
├── libs/
│   └── queue/                  # BullMQ queue abstraction
│       └── src/
│           ├── index.ts
│           ├── task.interface.ts          # Task, TaskStatus
│           └── queue.module.ts
├── docker/
│   └── docker-compose.yml      # Redis 7.2
└── docs/
    ├── execution-plans.md
    └── ADR-001-nestjs-bullmq-core-engine.md
```

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| Node.js | v25.x | Runtime |
| TypeScript | ^5.9 | Language |
| NestJS | ^11.x | Application framework |
| BullMQ | ^5.73 | Task queue engine |
| ioredis | ^5.10 | Redis client |
| prom-client | ^15.1 | Prometheus metrics |
| Redis | 7.2 (Alpine) | Queue storage |
| Prometheus | v2.53 | Metrics collection |
| Grafana | 11.1 | Dashboard visualization |
| Docker Compose | v2 | Local infrastructure |

## Prerequisites

- Node.js >= 20
- Docker & Docker Compose
- npm

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start Redis

```bash
docker compose -f docker/docker-compose.yml up -d
```

### 3. Configure environment

```bash
cp .env.example .env
```

Default values work with the Docker Compose setup.

| Variable | Default | Description |
|---|---|---|
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `WORKER_CONCURRENCY` | `3` | Max parallel jobs per worker |
| `BACKPRESSURE_THRESHOLD` | `CONCURRENCY × 100` | Queue depth limit before 429 |
| `IDEMPOTENCY_TTL_SECONDS` | `86400` | Idempotency key TTL (24h) |

### 4. Run the API + Worker

```bash
# Terminal 1 — API (watch mode)
npm run start:dev

# Terminal 2 — Worker (watch mode)
npm run start:worker:dev
```

The API starts on `http://localhost:3000`.

### Task Status Flow

```
PENDING → ACTIVE → COMPLETED
                 → FAILED (auto-retry with exponential backoff: 1s → 2s → 4s)
                        → DLQ (after 3 failed attempts)
```

### Retry & Dead Letter Queue (DLQ)

Failed tasks are automatically retried up to 3 times with exponential backoff (1s, 2s, 4s). Tasks that exhaust all retries are moved to a Dead Letter Queue for manual inspection and recovery.

### Backpressure

When `waiting + active` jobs exceed the threshold (`WORKER_CONCURRENCY × 100` by default), `POST /tasks` returns `429 Too Many Requests`. The system recovers automatically once workers drain the queue below the threshold.

### Graceful Shutdown

The worker waits for all active jobs to complete before exiting. Send `SIGTERM` or `SIGINT` to trigger graceful shutdown. Stalled jobs (from crashed workers) are automatically re-queued by BullMQ.

### Observability

Prometheus metrics are exposed on two endpoints:
- **API** `http://localhost:3000/metrics` — queue depth gauges
- **Worker** `http://localhost:9091/` — processing duration histogram, completed/failed/DLQ counters

Grafana dashboard available at `http://localhost:3001` (admin/admin) with panels for:
- Task Processing Rate (completed/s, failed/s)
- Queue Depth (waiting, active, DLQ)
- P99/P50 Processing Latency
- Error Rate & DLQ Count

## API

### Create Task

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-request-id" \
  -d '{"payload": {"prompt": "hello world"}}'
```

The optional `Idempotency-Key` header prevents duplicate task creation. Sending the same key twice returns the original response without creating a new job.

Response (`201 Created`):

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING",
  "payload": { "prompt": "hello world" },
  "createdAt": "2026-04-06T08:00:00.000Z"
}
```

### Get Task Status

```bash
curl http://localhost:3000/tasks/{id}
```

Response (`200 OK`):

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "COMPLETED",
  "payload": { "prompt": "hello world" },
  "createdAt": "2026-04-06T08:00:00.000Z"
}
```

### List Dead Letter Queue

```bash
curl http://localhost:3000/tasks/dlq
```

### Retry DLQ Task

```bash
curl -X POST http://localhost:3000/tasks/dlq/{dlqJobId}/retry
```

Re-enqueues the task from DLQ back to the main queue with a new ID.

## Scripts

| Command | Description |
|---|---|
| `npm run start:dev` | Start API in watch mode |
| `npm run start:worker:dev` | Start Worker in watch mode |
| `npm run build` | Build the project |
| `npm run start:prod` | Run production build |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests |

## License

MIT
