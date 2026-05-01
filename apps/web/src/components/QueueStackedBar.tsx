import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { QueueSnapshotEntry } from '../lib/useQueueStream';

const COLORS = {
  waiting: '#f59e0b',
  active: '#6366f1',
  completed: '#10b981',
  failed: '#ef4444',
  delayed: '#a855f7',
};

export function QueueStackedBar({ data }: { data: QueueSnapshotEntry[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/20 text-sm text-slate-500">
        尚未有任何用戶佇列 — 透過 POST /tasks 建立第一個任務
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">
        Per-User Queue Depth (live)
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="userId" stroke="#94a3b8" fontSize={12} />
          <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 6,
              fontSize: 12,
            }}
            cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="waiting" stackId="a" fill={COLORS.waiting} />
          <Bar dataKey="active" stackId="a" fill={COLORS.active} />
          <Bar dataKey="delayed" stackId="a" fill={COLORS.delayed} />
          <Bar dataKey="failed" stackId="a" fill={COLORS.failed} />
          <Bar dataKey="completed" stackId="a" fill={COLORS.completed} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
