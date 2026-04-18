/**
 * Latency injection — 送入會故意「卡住」超過 TASK_TIMEOUT_MS 的任務。
 * 驗證：硬性超時觸發 → task_timeout_total 計數增加 → 重試耗盡入 DLQ。
 *
 * 本腳本不需要修改 Worker 代碼：我們利用 payload 中的 prompt 長度觸發
 * LLM 呼叫的自然延遲，或透過 --fail-rate 搭配 TASK_FAILURE_RATE env 同時測試。
 *
 * Usage:
 *   npx ts-node tests/chaos/latency-injection.ts --count 20
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

interface Args {
  count: number;
  userId: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let count = 10;
  let userId = 'chaos-latency';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--count') count = parseInt(argv[++i], 10);
    else if (argv[i] === '--user') userId = argv[++i];
  }
  return { count, userId };
}

async function submit(seq: number, userId: string) {
  // 超長 prompt → LLM 回應時間拉長 → 觸發 TASK_TIMEOUT_MS
  const filler = 'x'.repeat(5000);
  const res = await fetch(`${API_URL}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId,
      taskType: 'complex',
      payload: {
        prompt: `Describe in exhaustive detail: ${filler} [seq=${seq}]`,
      },
    }),
  });
  return { ok: res.ok, status: res.status };
}

async function main() {
  const { count, userId } = parseArgs();
  console.log(`[chaos] Submitting ${count} latency-inducing tasks for user="${userId}"`);
  console.log('[chaos] Ensure TASK_TIMEOUT_MS is set low (e.g. 3000) before running Worker');

  const results = await Promise.all(
    Array.from({ length: count }, (_, i) => submit(i, userId)),
  );
  const ok = results.filter((r) => r.ok).length;
  console.log(`[chaos] submitted=${results.length} accepted=${ok}`);
  console.log('[chaos] Watch metrics:');
  console.log('  - task_timeout_total (should increase)');
  console.log('  - task_dlq_total (should increase after retries exhausted)');
  console.log('  - GET /tasks/dlq to confirm DLQ entries');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
