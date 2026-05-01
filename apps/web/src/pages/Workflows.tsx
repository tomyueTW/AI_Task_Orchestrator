export function Workflows() {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">工作流</h1>
        <p className="text-sm text-slate-400">
          Chain（線性）與 DAG（拓撲排序）— 10月 W1–W2 將加入 ReactFlow 視覺化與互動編輯器
        </p>
      </header>
      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/20 p-8 text-sm text-slate-500">
        即將支援：DAG 圖形渲染、拖拽建構、即時節點狀態高亮
      </div>
    </section>
  );
}
