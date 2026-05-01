export function Architecture() {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">系統架構</h1>
        <p className="text-sm text-slate-400">
          可互動的組件地圖 · 10月 W4 將支援點擊節點查看 ADR 與代碼路徑
        </p>
      </header>
      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/20 p-8 text-sm text-slate-500">
        即將支援：API / Redis / Worker / Prometheus / LLM Providers SVG 互動圖
      </div>
    </section>
  );
}
