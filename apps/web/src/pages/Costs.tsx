export function Costs() {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">成本面板</h1>
        <p className="text-sm text-slate-400">
          Token / Cost per provider · 9月 W4 將接入 Prometheus HTTP API
        </p>
      </header>
      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/20 p-8 text-sm text-slate-500">
        即將支援：累計成本、近 1h/24h 趨勢、按 provider/model 切片
      </div>
    </section>
  );
}
