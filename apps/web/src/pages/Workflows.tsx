import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createDag, type DagNodeInput } from '../lib/api';

// Diamond: A → B,C → D (fan-out then fan-in).
function diamondNodes(): DagNodeInput[] {
  return [
    { id: 'A', payload: { text: 'root' } },
    { id: 'B', dependsOn: ['A'], payload: { text: 'left' } },
    { id: 'C', dependsOn: ['A'], payload: { text: 'right' } },
    { id: 'D', dependsOn: ['B', 'C'], payload: { text: 'join' } },
  ];
}

// Wide fan-out / fan-in: 1 root → N parallel → 1 sink (N+2 nodes).
function fanNodes(width: number): DagNodeInput[] {
  const mids = Array.from({ length: width }, (_, i) => `M${i}`);
  return [
    { id: 'root', payload: { text: 'start' } },
    ...mids.map((id) => ({ id, dependsOn: ['root'], payload: { i: id } })),
    { id: 'sink', dependsOn: mids, payload: { text: 'collect' } },
  ];
}

export function Workflows() {
  const navigate = useNavigate();
  const [dagId, setDagId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const open = () => {
    const id = dagId.trim();
    if (id) navigate(`/workflows/dag/${encodeURIComponent(id)}`);
  };

  const spawn = async (nodes: DagNodeInput[]) => {
    setBusy(true);
    setErr(null);
    try {
      const { dagId: id } = await createDag({ userId: 'demo', nodes });
      navigate(`/workflows/dag/${encodeURIComponent(id)}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">工作流</h1>
        <p className="text-sm text-slate-400">
          DAG（拓撲排序）即時視覺化 — ReactFlow，依 layers 佈局，四色狀態，1.5s 輪詢
        </p>
      </header>

      <div className="max-w-xl space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
        <div className="text-sm font-medium">開啟既有 DAG</div>
        <div className="flex gap-2">
          <input
            value={dagId}
            onChange={(e) => setDagId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && open()}
            placeholder="貼上 dagId（POST /workflows/dag 的回傳值）"
            className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <button
            onClick={open}
            disabled={!dagId.trim()}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40"
          >
            開啟視覺化
          </button>
        </div>
      </div>

      <div className="max-w-xl space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
        <div className="text-sm font-medium">建立範例 DAG（測試用）</div>
        <p className="text-xs text-slate-500">
          建立後自動跳轉至視覺化頁，可即時觀察節點四色狀態流轉
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => spawn(diamondNodes())}
            disabled={busy}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"
          >
            菱形 A→B,C→D（4 節點）
          </button>
          <button
            onClick={() => spawn(fanNodes(10))}
            disabled={busy}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"
          >
            扇出扇入（12 節點）
          </button>
          <button
            onClick={() => spawn(fanNodes(50))}
            disabled={busy}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"
          >
            渲染壓測（52 節點）
          </button>
        </div>
        {busy && <div className="text-xs text-slate-400">建立中…</div>}
        {err && <div className="text-xs text-rose-400">建立失敗：{err}</div>}
      </div>
    </section>
  );
}
