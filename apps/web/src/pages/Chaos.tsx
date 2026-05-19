import { useEffect, useState } from 'react';
import {
  getChaosStatus,
  triggerChaos,
  type ChaosAction,
  type ChaosStatus,
  type ChaosTriggerResult,
} from '../lib/api';
import { useCostSummary } from '../lib/useCostSummary';

const ACTIONS: { action: ChaosAction; label: string; danger: boolean }[] = [
  { action: 'injectLatency', label: 'Inject Latency', danger: false },
  { action: 'pauseRedis', label: 'Pause Redis', danger: false },
  { action: 'killWorker', label: 'Kill Worker', danger: true },
];

type Failures = { failed: number; dlq: number; timeout: number };

export function Chaos() {
  const [token, setToken] = useState(
    () => localStorage.getItem('adminToken') ?? '',
  );
  const [status, setStatus] = useState<ChaosStatus | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [duration, setDuration] = useState(15000);
  const [latency, setLatency] = useState(35000);
  const [busy, setBusy] = useState<ChaosAction | null>(null);
  const [result, setResult] = useState<ChaosTriggerResult | null>(null);
  const [notice, setNotice] = useState<{ kind: 'err' | 'ok'; msg: string } | null>(
    null,
  );
  const [baseline, setBaseline] = useState<Failures | null>(null);
  const [now, setNow] = useState(Date.now());

  const { summary } = useCostSummary();
  const failures: Failures = summary?.failures ?? {
    failed: 0,
    dlq: 0,
    timeout: 0,
  };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadStatus = async (tok: string) => {
    if (!tok) {
      setStatus(null);
      setStatusErr(null);
      return;
    }
    try {
      setStatus(await getChaosStatus(tok));
      setStatusErr(null);
    } catch (e) {
      setStatus(null);
      setStatusErr((e as Error).message);
    }
  };

  useEffect(() => {
    loadStatus(token);
  }, [token]);

  const saveToken = (v: string) => {
    setToken(v);
    localStorage.setItem('adminToken', v);
  };

  const fire = async (action: ChaosAction) => {
    setBusy(action);
    setNotice(null);
    setBaseline({ ...failures });
    try {
      const res = await triggerChaos(action, token, {
        durationMs: duration,
        latencyMs: action === 'injectLatency' ? latency : undefined,
      });
      setResult(res);
      setNotice({ kind: 'ok', msg: `已觸發 ${action}，效果將於倒數結束後自動恢復` });
      loadStatus(token);
    } catch (e) {
      setNotice({ kind: 'err', msg: `觸發失敗：${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  const active = status?.active && status.active.until > now ? status.active : null;
  const remainingSec = active ? Math.ceil((active.until - now) / 1000) : 0;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Chaos 控制台</h1>
        <p className="text-sm text-slate-400">
          一鍵注入故障 — 全部 time-boxed、自動恢復。需 ADMIN_TOKEN（fail-closed）。
          真實 SIGKILL / docker pause 仍在 <code>tests/chaos/</code> 腳本。
        </p>
      </header>

      <div className="max-w-md space-y-2 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <label className="text-xs uppercase tracking-wide text-slate-500">
          ADMIN_TOKEN
        </label>
        <input
          type="password"
          value={token}
          onChange={(e) => saveToken(e.target.value)}
          placeholder="x-admin-token"
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        {statusErr && (
          <div className="text-xs text-rose-400">無法讀取狀態：{statusErr}</div>
        )}
        {status && !statusErr && (
          <div className="text-xs text-emerald-400">token 有效 · 已連線</div>
        )}
      </div>

      {active && (
        <div className="rounded-lg border border-amber-700 bg-amber-950/30 p-4 text-sm text-amber-200">
          ⚠ 進行中：<span className="font-mono">{active.action}</span> · 剩餘{' '}
          <span className="tabular-nums">{remainingSec}s</span>
          {active.latencyMs ? ` · latency ${active.latencyMs}ms` : ''}
        </div>
      )}

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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Metric label="task_failed_total" value={failures.failed} base={baseline?.failed} />
        <Metric label="task_dlq_total" value={failures.dlq} base={baseline?.dlq} />
        <Metric
          label="task_timeout_total"
          value={failures.timeout}
          base={baseline?.timeout}
        />
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm">
        <Field label="durationMs (1000–120000)">
          <input
            type="number"
            value={duration}
            min={1000}
            max={120000}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-32 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 outline-none focus:border-indigo-500"
          />
        </Field>
        <Field label="latencyMs (injectLatency 用)">
          <input
            type="number"
            value={latency}
            min={0}
            max={120000}
            onChange={(e) => setLatency(Number(e.target.value))}
            className="w-32 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 outline-none focus:border-indigo-500"
          />
        </Field>
        <span className="text-xs text-slate-500">
          latency &gt; TASK_TIMEOUT_MS 才會觸發硬超時 → DLQ
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {ACTIONS.map(({ action, label, danger }) => {
          const meta = status?.catalog?.[action];
          return (
            <div
              key={action}
              className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
            >
              <div className="font-mono text-sm">{action}</div>
              <p className="min-h-[3.5rem] text-xs text-slate-400">
                {meta?.description ?? '（輸入有效 token 後載入說明）'}
              </p>
              {meta && (
                <div className="flex flex-wrap gap-1">
                  {meta.expects.map((m) => (
                    <span
                      key={m}
                      className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
              <button
                onClick={() => fire(action)}
                disabled={!token || busy !== null}
                className={`mt-auto rounded-md px-4 py-2 text-sm font-medium disabled:opacity-40 ${
                  danger
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                {busy === action ? '觸發中…' : `觸發 ${label}`}
              </button>
            </div>
          );
        })}
      </div>

      {result && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-xs">
          <div className="mb-1 text-slate-500">最後一次觸發</div>
          <pre className="overflow-x-auto text-slate-300">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  base,
}: {
  label: string;
  value: number;
  base?: number;
}) {
  const delta = base != null ? value - base : null;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="font-mono text-[11px] text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
      {delta != null && (
        <div
          className={`mt-1 text-xs tabular-nums ${
            delta > 0 ? 'text-rose-400' : 'text-slate-500'
          }`}
        >
          {delta > 0 ? `+${delta} 自觸發以來` : '尚無變化'}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      {children}
    </div>
  );
}
