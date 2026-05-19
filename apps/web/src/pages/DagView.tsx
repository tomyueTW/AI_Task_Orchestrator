import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDagStatus } from '../lib/useDagStatus';
import { DagGraph } from '../components/DagGraph';
import type { DagNodeStatus } from '../lib/api';

const LEGEND: { status: DagNodeStatus; label: string; dot: string }[] = [
  { status: 'pending', label: 'Pending', dot: 'bg-slate-500' },
  { status: 'active', label: 'Active', dot: 'bg-amber-400' },
  { status: 'completed', label: 'Completed', dot: 'bg-emerald-400' },
  { status: 'failed', label: 'Failed', dot: 'bg-rose-400' },
];

export function DagView() {
  const { id } = useParams<{ id: string }>();
  const { dag, error, polling } = useDagStatus(id);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const counts =
    dag?.nodes.reduce<Record<string, number>>((acc, n) => {
      const key = n.status === 'ready' ? 'pending' : n.status;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}) ?? {};

  const selected = dag?.nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <section className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Link to="/workflows" className="text-indigo-300 hover:underline">
              工作流
            </Link>
            <span className="text-slate-600">/</span>
            <span>DAG</span>
          </div>
          <h1 className="mt-1 font-mono text-xl font-semibold">{id}</h1>
          {dag && (
            <p className="text-sm text-slate-400">
              user <span className="text-slate-200">{dag.userId}</span> ·{' '}
              {dag.nodes.length} nodes · {dag.layers.length} layers · 建立於{' '}
              {new Date(dag.createdAt).toLocaleString()}
            </p>
          )}
        </div>
        <div
          className={`rounded-full px-3 py-1 text-xs ring-1 ${
            polling
              ? 'bg-amber-500/15 text-amber-300 ring-amber-500/40'
              : 'bg-slate-500/15 text-slate-300 ring-slate-500/40'
          }`}
        >
          {polling ? '輪詢中 · 1.5s' : '已停止（終態）'}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
        {LEGEND.map((l) => (
          <span key={l.status} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${l.dot}`} />
            {l.label}
            <span className="tabular-nums text-slate-500">
              ({counts[l.status] ?? 0})
            </span>
          </span>
        ))}
      </div>

      {error && !dag && (
        <div className="rounded-lg border border-rose-800 bg-rose-950/30 p-4 text-sm text-rose-300">
          無法載入 DAG：{error}
        </div>
      )}

      {dag && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <div className="h-[70vh] rounded-lg border border-slate-800 bg-slate-900/40">
            <DagGraph
              dag={dag}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>

          <aside className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm">
            {selected ? (
              <div className="space-y-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Node
                  </div>
                  <div className="font-mono text-base">{selected.id}</div>
                </div>
                <Field label="Status" value={selected.status} />
                <Field
                  label="Depends on"
                  value={
                    selected.dependsOn.length
                      ? selected.dependsOn.join(', ')
                      : '—（root）'
                  }
                />
                {selected.jobId && (
                  <Field label="Job ID" value={selected.jobId} mono />
                )}
                {selected.failedReason && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Failed reason
                    </div>
                    <pre className="mt-1 overflow-x-auto rounded bg-rose-950/40 p-2 text-xs text-rose-300">
                      {selected.failedReason}
                    </pre>
                  </div>
                )}
                {selected.result !== undefined && selected.result !== null && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Result
                    </div>
                    <pre className="mt-1 max-h-60 overflow-auto rounded bg-slate-950/60 p-2 text-xs text-slate-300">
                      {JSON.stringify(selected.result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-slate-500">點擊節點查看詳情</p>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`mt-0.5 break-all ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </div>
    </div>
  );
}
