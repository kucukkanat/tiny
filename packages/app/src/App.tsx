import { useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router'
import { Icon, IconButton } from '@tiny/ui'
import { plugins } from './plugins'

function Nav({ onNavigate }: { onNavigate?(): void }) {
  return (
    // Any click in here is a navigation as far as the mobile drawer is concerned.
    <nav className="flex min-h-0 flex-1 flex-col pt-1" onClickCapture={onNavigate}>
      <div className="mx-2 mb-2 flex h-10 items-center gap-1.5 px-2 text-ink">
        <Icon name="spark" size={20} />
        <span className="text-[15px] font-semibold tracking-[-0.01em]">tiny</span>
      </div>
      {plugins.map((p) => p.sidebar && <p.sidebar key={p.id} />)}
    </nav>
  )
}

export function App() {
  const [drawer, setDrawer] = useState(false)

  return (
    <HashRouter>
      <main className="flex h-[100dvh] gap-2.5 bg-canvas p-2.5 text-ink">
        {drawer && (
          <div
            className="fixed inset-0 z-20 bg-black/40 lg:hidden"
            data-testid="sidebar-backdrop"
            onClick={() => setDrawer(false)}
          />
        )}

        {/* One sidebar: a drawer under lg, a column at lg and up. */}
        <aside
          className={`fixed inset-y-0 left-0 z-30 flex w-[264px] max-w-[80%] flex-col border-r border-line bg-canvas p-2.5 transition-transform duration-200 lg:static lg:w-[224px] lg:max-w-none lg:translate-x-0 lg:border-0 lg:p-0 lg:shadow-none ${
            drawer ? 'translate-x-0 shadow-card' : '-translate-x-full'
          }`}
        >
          <Nav onNavigate={() => setDrawer(false)} />
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-window border border-line bg-page">
          <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2 lg:hidden">
            <IconButton icon="sidebar" label="Menu" data-testid="sidebar-toggle" onClick={() => setDrawer(true)} />
            <span className="text-[14px] font-semibold tracking-[-0.01em]">tiny</span>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <Routes>
              {plugins.flatMap((p) => p.routes.map((r) => <Route key={r.path} path={r.path} element={r.element} />))}
            </Routes>
          </div>
        </section>
      </main>
    </HashRouter>
  )
}
