/**
 * Soak test — 長時間綜合壓測 + 隨機故障注入。
 * 背景灌流量，每隔幾分鐘隨機觸發 Redis pause / Worker kill。
 *
 * Usage:
 *   npx ts-node tests/chaos/soak.ts --duration 3600 --rps 30
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const REDIS_CONTAINER = process.env.REDIS_CONTAINER ?? 'docker-redis-1';

interface Args {
  durationSec: number;
  rps: number;
  chaosIntervalSec: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let durationSec = 1800; // 30 min default
  let rps = 20;
  let chaosIntervalSec = 180; // every 3 min
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--duration') durationSec = parseInt(argv[++i], 10);
    else if (argv[i] === '--rps') rps = parseInt(argv[++i], 10);
    else if (argv[i] === '--chaos-interval') chaosIntervalSec = parseInt(argv[++i], 10);
  }
  return { durationSec, rps, chaosIntervalSec };
}

const USERS = ['alice', 'bob', 'carol', 'dave'];

async function submitTask() {
  try {
    await fetch(`${API_URL}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: USERS[Math.floor(Math.random() * USERS.length)],
        taskType: 'simple',
        payload: { prompt: `soak ts=${Date.now()}` },
      }),
    });
  } catch {
    // Ignore — we're measuring system-wide behavior, not per-request
  }
}

async function pauseRedis(sec: number) {
  console.log(`[soak:chaos] Pausing Redis for ${sec}s`);
  try {
    await run('docker', ['pause', REDIS_CONTAINER]);
    await new Promise((r) => setTimeout(r, sec * 1000));
    await run('docker', ['unpause', REDIS_CONTAINER]);
    console.log('[soak:chaos] Redis resumed');
  } catch (err: unknown) {
    console.error('[soak:chaos] Redis pause failed:', err);
  }
}

async function main() {
  const { durationSec, rps, chaosIntervalSec } = parseArgs();
  const end = Date.now() + durationSec * 1000;
  console.log(
    `[soak] duration=${durationSec}s rps=${rps} chaosEvery=${chaosIntervalSec}s`,
  );

  // Load generator
  const loadTick = setInterval(submitTask, 1000 / rps);

  // Periodic chaos
  const chaosTick = setInterval(() => {
    const which = Math.random();
    if (which < 0.5) {
      void pauseRedis(5);
    } else {
      console.log('[soak:chaos] (Manual) Kill one worker now — restart within 30s');
    }
  }, chaosIntervalSec * 1000);

  await new Promise((r) => setTimeout(r, durationSec * 1000));
  clearInterval(loadTick);
  clearInterval(chaosTick);

  console.log('[soak] Complete. Review:');
  console.log('  - Grafana: duration P99 stability, error rate spikes/recovery');
  console.log('  - DLQ count vs total submitted (expected lossless)');
  console.log('  - Any jobs stuck in "active" past TTL (should be 0)');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
