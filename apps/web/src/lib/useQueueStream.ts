import { useEffect, useRef, useState } from 'react';

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

export interface TaskFlowEvent {
  ts: string;
  jobId: string;
  queueName: string;
  userId: string;
  stage: 'waiting' | 'active' | 'completed' | 'failed' | 'dlq';
}

export type StreamStatus = 'connecting' | 'open' | 'closed' | 'error';

const FLOW_BUFFER_MAX = 80;

export function useQueueStream(): {
  snapshot: QueueSnapshot | null;
  flowEvents: TaskFlowEvent[];
  status: StreamStatus;
} {
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [flowEvents, setFlowEvents] = useState<TaskFlowEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const seenRef = useRef<Set<string>>(new Set());

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
    es.addEventListener('flow', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as TaskFlowEvent;
        const key = `${data.jobId}:${data.stage}:${data.ts}`;
        if (seenRef.current.has(key)) return;
        seenRef.current.add(key);
        if (seenRef.current.size > 500) {
          // prevent unbounded growth
          seenRef.current = new Set(Array.from(seenRef.current).slice(-200));
        }
        setFlowEvents((prev) => {
          const next = [...prev, data];
          return next.length > FLOW_BUFFER_MAX
            ? next.slice(-FLOW_BUFFER_MAX)
            : next;
        });
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

  return { snapshot, flowEvents, status };
}
