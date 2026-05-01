import { useQueueStream } from '../lib/useQueueStream';
import { QueueStackedBar } from '../components/QueueStackedBar';
import { TaskFlowAnimation } from '../components/TaskFlowAnimation';

export function Dashboard() {
  const { snapshot, flowEvents, status } = useQueueStream();

  const totals = snapshot?.queues.reduce(
    (acc, q) => ({
      waiting: acc.waiting + q.waiting,
      active: acc.active + q.active,
      failed: acc.failed + q.failed,
    }),
    { waiting: 0, active: 0, failed: 0 },
  ) ?? { waiting: 0, active: 0, failed: 0 };

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">即時儀表板</h1>
          <p className="text-sm text-slate-400">
            SSE 串流 · 1s 推送 · 每用戶佇列 + DLQ
          </p>
        </div>
        <StatusPill status={status} ts={snapshot?.ts} />
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card title="Waiting" value={totals.waiting} hint="尚未被 Worker 取走" />
        <Card title="Active" value={totals.active} hint="處理中的 job" />
        <Card title="Failed" value={totals.failed} hint="當前失敗中的 job" />
        <Card
          title="DLQ"
          value={(snapshot?.dlq.waiting ?? 0) + (snapshot?.dlq.failed ?? 0)}
          hint="重試耗盡的死信"
        />
      </div>

      <QueueStackedBar data={snapshot?.queues ?? []} />

      <TaskFlowAnimation events={flowEvents} />
    </section>
  );
}

function Card({
  title,
  value,
  hint,
}: {
  title: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function StatusPill({ status, ts }: { status: string; ts?: string }) {
  const color =
    status === 'open'
      ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40'
      : status === 'connecting'
        ? 'bg-amber-500/15 text-amber-300 ring-amber-500/40'
        : 'bg-rose-500/15 text-rose-300 ring-rose-500/40';
  return (
    <div className={`rounded-full px-3 py-1 text-xs ring-1 ${color}`}>
      SSE {status}
      {ts && (
        <span className="ml-2 text-[10px] text-slate-400">
          · {new Date(ts).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}

