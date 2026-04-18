/**
 * Redis chaos — pause/unpause the Redis Docker container to simulate transient disconnection.
 * 驗證 ioredis 自動重連與 BullMQ 於 Redis 恢復後是否能繼續消費任務。
 *
 * Usage:
 *   npx ts-node tests/chaos/redis-chaos.ts --pause-sec 10
 *
 * Requires `docker` on PATH and the Redis service name matches `docker compose ps`.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

interface Args {
  container: string;
  pauseSec: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let container = process.env.REDIS_CONTAINER ?? 'docker-redis-1';
  let pauseSec = 10;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--container') container = argv[++i];
    else if (argv[i] === '--pause-sec') pauseSec = parseInt(argv[++i], 10);
  }
  return { container, pauseSec };
}

async function docker(...args: string[]) {
  const { stdout } = await run('docker', args);
  return stdout.trim();
}

async function main() {
  const { container, pauseSec } = parseArgs();
  console.log(`[chaos] Pausing Redis container "${container}" for ${pauseSec}s`);

  try {
    await docker('pause', container);
    console.log('[chaos] Redis paused — expect connection errors in API/Worker logs');
    await new Promise((r) => setTimeout(r, pauseSec * 1000));
    await docker('unpause', container);
    console.log('[chaos] Redis unpaused — verify:');
    console.log('  - ioredis reconnects ("reconnect" events)');
    console.log('  - Workers resume job processing');
    console.log('  - No jobs lost (compare submitted vs completed counts)');
  } catch (err: unknown) {
    console.error('[chaos] docker command failed:', err);
    console.error('Hint: set --container or REDIS_CONTAINER to match `docker compose ps` output');
    process.exit(1);
  }
}

main();
