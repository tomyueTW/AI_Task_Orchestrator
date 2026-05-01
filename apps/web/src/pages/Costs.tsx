import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useCostSummary } from '../lib/useCostSummary';

export function Costs() {
  const { summary, trend, error } = useCostSummary(5000);

  const totalTokens =
    (summary?.totalTokens.input ?? 0) + (summary?.totalTokens.output ?? 0);

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">成本面板</h1>
          <p className="text-sm text-slate-400">
            從 Worker :9091 Prometheus metrics 拉取，每 5s 更新
          </p>
        </div>
        <div className="text-xs">
          {error ? (
            <span className="rounded-full bg-rose-500/15 px-3 py-1 text-rose-300 ring-1 ring-rose-500/40">
              metrics offline · {error}
            </span>
          ) : (
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-300 ring-1 ring-emerald-500/40">
              live
            </span>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card
          title="累計成本"
          value={`$${(summary?.totalCostUsd ?? 0).toFixed(4)}`}
          hint="task_cost_usd_total"
        />
        <Card
          title="Tokens"
          value={totalTokens.toLocaleString()}
          hint={`in ${summary?.totalTokens.input.toLocaleString() ?? 0} · out ${summary?.totalTokens.output.toLocaleString() ?? 0}`}
        />
        <Card
          title="Failed / Timeout"
          value={`${summary?.failures.failed ?? 0} / ${summary?.failures.timeout ?? 0}`}
          hint="DLQ 計數另計"
        />
        <Card
          title="DLQ"
          value={summary?.failures.dlq ?? 0}
          hint="重試耗盡進入 DLQ"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Cumulative Cost (last 60 ticks)">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={trend.map((t) => ({
                t: new Date(t.ts).toLocaleTimeString(),
                cost: t.costUsd,
              }))}
              margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="t" stroke="#94a3b8" fontSize={10} />
              <YAxis
                stroke="#94a3b8"
                fontSize={10}
                tickFormatter={(v) => `$${(v as number).toFixed(3)}`}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v) => [`$${(v as number).toFixed(6)}`, 'cost']}
              />
              <Line
                type="monotone"
                dataKey="cost"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Routed by Model (count)">
          {summary?.routedByModel.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={summary.routedByModel}
                layout="vertical"
                margin={{ top: 10, right: 12, left: 60, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis type="number" stroke="#94a3b8" fontSize={10} allowDecimals={false} />
                <YAxis dataKey="model" type="category" stroke="#94a3b8" fontSize={10} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty label="尚未有路由紀錄" />
          )}
        </Panel>
      </div>

      <Panel title="Rate-limit waits by provider">
        {summary && Object.keys(summary.rateLimitedByProvider).length ? (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 text-left">Provider</th>
                <th className="py-2 text-right">等待次數</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary.rateLimitedByProvider).map(([k, v]) => (
                <tr key={k} className="border-t border-slate-800">
                  <td className="py-2">{k}</td>
                  <td className="py-2 text-right tabular-nums">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty label="尚未觸發限流" />
        )}
      </Panel>
    </section>
  );
}

const tooltipStyle = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 6,
  fontSize: 12,
};

function Card({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-3 text-xs uppercase tracking-wide text-slate-500">{title}</div>
      {children}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-xs text-slate-500">
      {label}
    </div>
  );
}
