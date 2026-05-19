import { useCallback, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { createDag } from '../lib/api';
import {
  buildDagPayload,
  validateDag,
  wouldCreateCycle,
  type EditorNodeData,
} from '../lib/dagValidation';

type EData = EditorNodeData & { label: string };

const edgeOpts = {
  markerEnd: { type: MarkerType.ArrowClosed },
  style: { stroke: '#64748b' },
};

function makeNode(n: number): Node<EData> {
  const id = `N${n}`;
  return {
    id,
    position: { x: 80 + ((n - 1) % 4) * 180, y: 60 + Math.floor((n - 1) / 4) * 120 },
    data: { label: id, payload: { text: id } },
    style: {
      background: '#1e293b',
      color: '#e2e8f0',
      border: '2px solid #475569',
      borderRadius: 8,
      width: 130,
      fontSize: 12,
    },
  };
}

export function DagEditor() {
  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState<EData>([makeNode(1)]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [counter, setCounter] = useState(2);
  const [userId, setUserId] = useState('demo');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'err' | 'ok'; msg: string } | null>(
    null,
  );
  const [showJson, setShowJson] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  const addNode = () => {
    setNodes((ns) => [...ns, makeNode(counter)]);
    setCounter((c) => c + 1);
  };

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      if (wouldCreateCycle(edges, c.source, c.target)) {
        setNotice({
          kind: 'err',
          msg: `不可建立循環依賴：${c.source} → ${c.target}（前端已擋）`,
        });
        return;
      }
      if (edges.some((e) => e.source === c.source && e.target === c.target)) {
        return; // duplicate edge
      }
      setNotice(null);
      setEdges((es) => addEdge({ ...c, ...edgeOpts }, es));
    },
    [edges, setEdges],
  );

  // Prune dangling edges when a node is removed.
  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      const ids = new Set(deleted.map((d) => d.id));
      setEdges((es) =>
        es.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
      );
      setSelectedId((s) => (s && ids.has(s) ? null : s));
    },
    [setEdges],
  );

  const patchSelected = (patch: Partial<EData>) => {
    if (!selectedId) return;
    setNodes((ns) =>
      ns.map((n) =>
        n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    );
  };

  const dagJson = useMemo(
    () => buildDagPayload(nodes, edges, userId),
    [nodes, edges, userId],
  );

  const submit = async () => {
    const localErr = validateDag(nodes, edges);
    if (localErr) {
      setNotice({ kind: 'err', msg: `${localErr}（前端先擋）` });
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      const { dagId } = await createDag(dagJson);
      navigate(`/workflows/dag/${encodeURIComponent(dagId)}`);
    } catch (e) {
      // Backend re-block (e.g. 400 from topologicalLayers) surfaces here.
      setNotice({ kind: 'err', msg: `送出失敗（後端再擋）：${(e as Error).message}` });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Link to="/workflows" className="text-indigo-300 hover:underline">
              工作流
            </Link>
            <span className="text-slate-600">/</span>
            <span>DAG 編輯器</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold">互動 DAG 編輯器</h1>
          <p className="text-sm text-slate-400">
            拖點建構 · 連線即依賴（上游 → 下游）· 選取後按 Delete 刪除 · 匯出 JSON · 一鍵送出
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">userId</label>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-28 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm outline-none focus:border-indigo-500"
          />
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={addNode}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
        >
          + 新增節點
        </button>
        <button
          onClick={() => setShowJson((v) => !v)}
          className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
        >
          {showJson ? '隱藏 JSON' : '匯出 JSON'}
        </button>
        <button
          onClick={submit}
          disabled={submitting || !userId.trim()}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-40"
        >
          {submitting ? '送出中…' : '送出並查看執行視圖'}
        </button>
      </div>

      {notice && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            notice.kind === 'err'
              ? 'border-rose-800 bg-rose-950/30 text-rose-300'
              : 'border-emerald-800 bg-emerald-950/30 text-emerald-300'
          }`}
        >
          {notice.msg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="h-[65vh] rounded-lg border border-slate-800 bg-slate-900/40">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodesDelete={onNodesDelete}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            deleteKeyCode={['Backspace', 'Delete']}
            proOptions={{ hideAttribution: true }}
            fitView
          >
            <Background color="#1e293b" gap={20} />
            <Controls showInteractive={false} />
            <MiniMap maskColor="rgba(2,6,23,0.7)" style={{ background: '#0f172a' }} />
          </ReactFlow>
        </div>

        <aside className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm">
          {selected ? (
            <div className="space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Node
                </div>
                <div className="font-mono text-base">{selected.id}</div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500">
                  taskType
                </label>
                <select
                  value={selected.data.taskType ?? ''}
                  onChange={(e) =>
                    patchSelected({
                      taskType: (e.target.value || undefined) as
                        | EditorNodeData['taskType'],
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 outline-none focus:border-indigo-500"
                >
                  <option value="">（未指定 → 由 router 決定）</option>
                  <option value="simple">simple</option>
                  <option value="code">code</option>
                  <option value="complex">complex</option>
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500">
                  payload (JSON)
                </label>
                <PayloadEditor
                  value={selected.data.payload}
                  onValid={(p) => patchSelected({ payload: p })}
                />
              </div>
              <button
                onClick={() => {
                  setNodes((ns) => ns.filter((n) => n.id !== selected.id));
                  onNodesDelete([selected]);
                }}
                className="w-full rounded-md border border-rose-800 px-3 py-2 text-rose-300 hover:bg-rose-950/40"
              >
                刪除此節點
              </button>
            </div>
          ) : (
            <p className="text-slate-500">點擊節點以編輯 payload / taskType</p>
          )}

          {showJson && (
            <div className="space-y-2 border-t border-slate-800 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-slate-500">
                  POST /workflows/dag
                </span>
                <button
                  onClick={() =>
                    navigator.clipboard?.writeText(
                      JSON.stringify(dagJson, null, 2),
                    )
                  }
                  className="text-xs text-indigo-300 hover:underline"
                >
                  複製
                </button>
              </div>
              <pre className="max-h-72 overflow-auto rounded bg-slate-950/60 p-2 text-xs text-slate-300">
                {JSON.stringify(dagJson, null, 2)}
              </pre>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function PayloadEditor({
  value,
  onValid,
}: {
  value: Record<string, unknown>;
  onValid: (p: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="mt-1 space-y-1">
      <textarea
        value={text}
        rows={5}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              setErr(null);
              onValid(parsed);
            } else {
              setErr('payload 必須是 JSON object');
            }
          } catch {
            setErr('JSON 格式錯誤');
          }
        }}
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-xs outline-none focus:border-indigo-500"
      />
      {err && <div className="text-xs text-rose-400">{err}</div>}
    </div>
  );
}
