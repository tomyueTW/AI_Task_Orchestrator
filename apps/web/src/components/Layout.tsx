import { NavLink, Outlet } from 'react-router-dom';

const NAV = [
  { to: '/', label: '即時儀表板', exact: true },
  { to: '/workflows', label: '工作流' },
  { to: '/costs', label: '成本面板' },
  { to: '/chaos', label: 'Chaos 控制台' },
  { to: '/architecture', label: '系統架構' },
];

export function Layout() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-slate-800 bg-slate-900/60 px-4 py-6">
        <div className="mb-8 px-2">
          <div className="text-lg font-semibold">AI Task Orchestrator</div>
          <div className="text-xs text-slate-400">v0.9 · Visualization</div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                [
                  'rounded-md px-3 py-2 text-sm transition',
                  isActive
                    ? 'bg-indigo-500/15 text-indigo-200'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-slate-800 bg-slate-900/40 px-6">
          <div className="text-sm text-slate-400">
            <span className="text-slate-200">/admin/queues</span>
            <span className="mx-2 text-slate-600">·</span>
            <a
              href="/admin/queues"
              className="text-indigo-300 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Bull Board ↗
            </a>
          </div>
          <div className="text-xs text-slate-500">
            connected via Vite proxy → :3000
          </div>
        </header>
        <div className="flex-1 px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
