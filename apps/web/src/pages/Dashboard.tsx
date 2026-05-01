export function Dashboard() {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">即時儀表板</h1>
        <p className="text-sm text-slate-400">
          Live queue status · 9月 W2 將接入 SSE 即時推送
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card title="Waiting" hint="尚未被 Worker 取走" />
        <Card title="Active" hint="處理中的 job" />
        <Card title="DLQ" hint="重試耗盡的失敗 job" />
      </div>

      <Placeholder label="任務流轉動畫 (9月 W3)" />
    </section>
  );
}

function Card({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">—</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/20 text-sm text-slate-500">
      {label}
    </div>
  );
}
