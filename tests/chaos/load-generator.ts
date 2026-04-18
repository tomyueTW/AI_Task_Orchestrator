/**
 * Load generator — 以固定 RPS 向 POST /tasks 灌入任務。
 * 混合 users/priorities 以觸發公平調度與搶佔邏輯。
 *
 * Usage:
 *   npx ts-node tests/chaos/load-generator.ts --rps 50 --duration 60
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

interface Args {
  rps: number;
  durationSec: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let rps = 20;
  let durationSec = 30;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--rps') rps = parseInt(argv[++i], 10);
    else if (argv[i] === '--duration') durationSec = parseInt(argv[++i], 10);
  }
  return { rps, durationSec };
}

const USERS = ['alice', 'bob', 'carol', 'dave'];
const PRIORITIES = ['critical', 'high', 'normal', 'normal', 'normal', 'low'];
const TASK_TYPES = ['simple', 'simple', 'code'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function submitTask(seq: number): Promise<{ ok: boolean; status: number }> {
  const body = {
    userId: pick(USERS),
    priority: pick(PRIORITIES),
    taskType: pick(TASK_TYPES),
    payload: { prompt: `chaos-load seq=${seq} ts=${Date.now()}` },
  };
  try {
    const res = await fetch(`${API_URL}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function main() {
  const { rps, durationSec } = parseArgs();
  const intervalMs = 1000 / rps;
  const end = Date.now() + durationSec * 1000;

  console.log(`[load] Target: ${rps} rps for ${durationSec}s → ${rps * durationSec} requests`);

  let submitted = 0;
  let success = 0;
  let backpressure = 0;
  let error = 0;

  const tick = setInterval(async () => {
    if (Date.now() >= end) return;
    submitted++;
    const { ok, status } = await submitTask(submitted);
    if (ok) success++;
    else if (status === 429) backpressure++;
    else error++;
  }, intervalMs);

  await new Promise((r) => setTimeout(r, durationSec * 1000 + 2000));
  clearInterval(tick);

  console.log(
    `[load] submitted=${submitted} success=${success} backpressure=${backpressure} error=${error}`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
