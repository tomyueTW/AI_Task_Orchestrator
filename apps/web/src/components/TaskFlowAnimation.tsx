import { AnimatePresence, motion } from 'framer-motion';
import type { TaskFlowEvent } from '../lib/useQueueStream';

const STAGE_COLUMNS: { key: TaskFlowEvent['stage']; label: string; color: string }[] = [
  { key: 'waiting', label: 'Queue', color: '#f59e0b' },
  { key: 'active', label: 'Worker', color: '#6366f1' },
  { key: 'completed', label: 'Completed', color: '#10b981' },
  { key: 'failed', label: 'Failed', color: '#ef4444' },
  { key: 'dlq', label: 'DLQ', color: '#7c3aed' },
];

const COLUMN_X = (i: number) => 60 + i * 180;
const ROW_Y = (n: number) => 56 + (n % 6) * 16;

export function TaskFlowAnimation({ events }: { events: TaskFlowEvent[] }) {
  // Group recent events by stage, keep last 6 per stage for animation density
  const byStage = new Map<TaskFlowEvent['stage'], TaskFlowEvent[]>();
  for (const ev of events) {
    const arr = byStage.get(ev.stage) ?? [];
    arr.push(ev);
    byStage.set(ev.stage, arr);
  }
  for (const [k, v] of byStage) byStage.set(k, v.slice(-6));

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          Task Flow (last {events.length})
        </div>
        <div className="text-[10px] text-slate-500">
          API → Queue → Worker → Completed / Failed / DLQ
        </div>
      </div>

      <svg viewBox="0 0 980 200" className="w-full">
        {/* Pipeline backbone */}
        <line x1="40" y1="40" x2="940" y2="40" stroke="#334155" strokeWidth="2" strokeDasharray="4 4" />

        {/* Stage columns */}
        {STAGE_COLUMNS.map((col, i) => (
          <g key={col.key}>
            <circle cx={COLUMN_X(i)} cy={40} r={10} fill={col.color} opacity={0.4} />
            <circle cx={COLUMN_X(i)} cy={40} r={5} fill={col.color} />
            <text
              x={COLUMN_X(i)}
              y={24}
              textAnchor="middle"
              fontSize="11"
              fill="#cbd5e1"
              fontWeight="600"
            >
              {col.label}
            </text>
          </g>
        ))}

        {/* Animated dots per recent event */}
        <AnimatePresence>
          {STAGE_COLUMNS.map((col, i) =>
            (byStage.get(col.key) ?? []).map((ev, n) => (
              <motion.circle
                key={`${ev.jobId}-${ev.stage}-${ev.ts}`}
                cx={COLUMN_X(i)}
                cy={ROW_Y(n) + 60}
                r={6}
                fill={col.color}
                initial={{ opacity: 0, scale: 0.3, cx: COLUMN_X(Math.max(0, i - 1)) }}
                animate={{ opacity: 0.85, scale: 1, cx: COLUMN_X(i) }}
                exit={{ opacity: 0, scale: 0.4 }}
                transition={{ type: 'spring', stiffness: 220, damping: 22 }}
              />
            )),
          )}
        </AnimatePresence>
      </svg>

      {events.length === 0 && (
        <div className="-mt-4 pb-3 text-center text-xs text-slate-500">
          尚未捕捉到任務事件 — 透過 POST /tasks 觸發第一筆
        </div>
      )}
    </div>
  );
}
