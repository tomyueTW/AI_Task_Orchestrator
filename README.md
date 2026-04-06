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
| Redis | 7.2 (Alpine) | Queue storage |
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
                 → FAILED (auto-retry up to 3 attempts)
```

### Backpressure

When `waiting + active` jobs exceed the threshold (`WORKER_CONCURRENCY × 100` by default), `POST /tasks` returns `429 Too Many Requests`. The system recovers automatically once workers drain the queue below the threshold.

### Graceful Shutdown

The worker waits for all active jobs to complete before exiting. Send `SIGTERM` or `SIGINT` to trigger graceful shutdown. Stalled jobs (from crashed workers) are automatically re-queued by BullMQ.

## API

### Create Task

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"payload": {"prompt": "hello world"}}'
```

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
