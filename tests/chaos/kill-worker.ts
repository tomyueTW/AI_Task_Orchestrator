/**
 * Kill-worker chaos — SIGKILL Worker process while jobs are active.
 * 驗證 BullMQ 的 stalled-job recovery：被中斷的 job 會在心跳逾時後自動 re-queue。
 *
 * Usage:
 *   # 先開一個 Worker：npm run start:worker:dev
 *   # 取得 PID 後執行：
 *   npx ts-node tests/chaos/kill-worker.ts --pid <worker_pid> --delay 5
 */

interface Args {
  pid: number;
  delaySec: number;
  signal: NodeJS.Signals;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let pid = 0;
  let delaySec = 5;
  let signal: NodeJS.Signals = 'SIGKILL';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--pid') pid = parseInt(argv[++i], 10);
    else if (argv[i] === '--delay') delaySec = parseInt(argv[++i], 10);
    else if (argv[i] === '--signal') signal = argv[++i] as NodeJS.Signals;
  }
  if (!pid) {
    console.error('Missing --pid <worker_pid>');
    process.exit(2);
  }
  return { pid, delaySec, signal };
}

async function main() {
  const { pid, delaySec, signal } = parseArgs();
  console.log(`[chaos] Will send ${signal} to PID ${pid} in ${delaySec}s...`);
  await new Promise((r) => setTimeout(r, delaySec * 1000));

  try {
    process.kill(pid, signal);
    console.log(`[chaos] ${signal} sent to PID ${pid}`);
  } catch (err: unknown) {
    console.error(`[chaos] Failed to signal PID ${pid}:`, err);
    process.exit(1);
  }

  console.log('[chaos] Now restart the worker manually and watch:');
  console.log('  - Bull Board /admin/queues: stalled jobs returning to waiting');
  console.log('  - Logs: "moving stalled job ... back to waiting"');
}

main();
