import { useEffect, useRef, useState } from 'react';
import { getDagStatus, DagStatus } from './api';

/**
 * Poll `GET /workflows/dag/:id` for live node status.
 *
 * The DAG runtime only advances when a job is `active` or `ready`; once both
 * counts hit zero the graph can no longer progress (all done, or blocked by a
 * failed upstream), so we stop polling to avoid pointless load.
 */
export function useDagStatus(
  id: string | undefined,
  intervalMs = 1500,
): { dag: DagStatus | null; error: string | null; polling: boolean } {
  const [dag, setDag] = useState<DagStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!id) return;
    cancelled.current = false;
    setDag(null);
    setError(null);
    setPolling(true);
    let timer: ReturnType<typeof setTimeout> | undefined;

    const isTerminal = (d: DagStatus) =>
      d.nodes.length > 0 &&
      !d.nodes.some((n) => n.status === 'active' || n.status === 'ready');

    const tick = async () => {
      try {
        const data = await getDagStatus(id);
        if (cancelled.current) return;
        setDag(data);
        setError(null);
        if (isTerminal(data)) {
          setPolling(false);
          return;
        }
      } catch (err: unknown) {
        if (!cancelled.current) setError((err as Error).message);
      }
      if (!cancelled.current) timer = setTimeout(tick, intervalMs);
    };

    tick();

    return () => {
      cancelled.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, intervalMs]);

  return { dag, error, polling };
}
