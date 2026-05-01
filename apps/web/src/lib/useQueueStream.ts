import { useEffect, useState } from 'react';

export interface QueueSnapshotEntry {
  queueName: string;
  userId: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface QueueSnapshot {
  ts: string;
  queues: QueueSnapshotEntry[];
  dlq: { waiting: number; failed: number };
}

export type StreamStatus = 'connecting' | 'open' | 'closed' | 'error';

export function useQueueStream(): {
  snapshot: QueueSnapshot | null;
  status: StreamStatus;
} {
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [status, setStatus] = useState<StreamStatus>('connecting');

  useEffect(() => {
    const es = new EventSource('/stream/queues');

    es.addEventListener('open', () => setStatus('open'));
    es.addEventListener('snapshot', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as QueueSnapshot;
        setSnapshot(data);
      } catch {
        // Ignore malformed payloads
      }
    });
    es.addEventListener('error', () => {
      setStatus(es.readyState === EventSource.CLOSED ? 'closed' : 'error');
    });

    return () => {
      es.close();
      setStatus('closed');
    };
  }, []);

  return { snapshot, status };
}
