import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@tiny/ui/components/sidebar'
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router'
import { home, plugins } from './plugins'

// The sidebar writes its own cookie; reading it back is what survives a reload.
const openOnLoad = () => !document.cookie.includes('sidebar_state=false')

export function App() {
  return (
    <HashRouter>
      <SidebarProvider
        defaultOpen={openOnLoad()}
        // Border-box, so the insets eat into the height rather than overflowing it.
        className="h-dvh min-h-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      >
        <Shell />
      </SidebarProvider>
    </HashRouter>
  )
}

function Shell() {
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()
  const active = plugins.find(({ id }) => pathname.startsWith(`/${id}`))

  return (
    <>
      <Sidebar>
        <SidebarHeader className="h-topbar justify-center px-4 font-medium">
          tiny
        </SidebarHeader>

        <SidebarContent>
          {plugins.map(({ id, Sidebar: Section }) => Section && <Section key={id} />)}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            {plugins
              // A plugin with its own section up there is already reachable from it.
              .filter(({ Sidebar: Section }) => !Section)
              .map(({ id, title }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton size="lg" asChild isActive={active?.id === id}>
                    <NavLink
                      to={`/${id}`}
                      data-testid={`nav-${id}`}
                      onClick={() => setOpenMobile(false)}
                    >
                      {title}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-h-0">
        <header className="border-border h-topbar flex shrink-0 items-center gap-2 border-b px-2">
          <SidebarTrigger data-testid="sidebar-toggle" className="size-10" />
          <span className="truncate font-medium">{active?.title}</span>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4" data-testid="screen">
          <Routes>
            {plugins.map(({ id, Screen }) => (
              <Route key={id} path={`/${id}/*`} element={<Screen />} />
            ))}
            <Route path="*" element={<Navigate to={home} replace />} />
          </Routes>
        </main>
      </SidebarInset>
    </>
  )
}
