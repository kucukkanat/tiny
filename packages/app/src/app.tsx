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
import { attach, migrateTools, useExtensions } from '@tiny/extension-manager'
import { Safely } from '@tiny/host'
import { Loading } from '@tiny/ui/components/loading'
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router'
import { BUNDLED, tiny } from './extensions'

// What ships, handed to the registry before the first render asks it for a
// route. This is also the only thing that evaluates `extensions.tsx` — drop the
// import and the app boots with no routes at all.
attach(tiny, BUNDLED)

// Tools were their own screen once. Whatever is left of that becomes an
// extension, on the first boot that has this.
migrateTools()

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
  const { screens, ready } = useExtensions()
  // On the segment, not the string: `/chat-plus` is not `/chat`, and an
  // extension picks its own id.
  const active = screens.find(
    ({ id }) => pathname === `/${id}` || pathname.startsWith(`/${id}/`),
  )
  // Where an unknown route lands. Not a constant: what ships can be switched
  // off, and redirecting to a route with no `<Route>` matches the catch-all
  // again. The manager can't be switched off, so there is normally one.
  const home = screens[0]

  return (
    <>
      <Sidebar>
        <SidebarHeader className="h-topbar justify-center px-4 font-medium">
          tiny
        </SidebarHeader>

        <SidebarContent>
          {screens.map(
            ({ id, title, Sidebar: Section }) =>
              Section && (
                <Safely key={id} name={title} resetKey={pathname}>
                  <Section />
                </Safely>
              ),
          )}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            {screens
              // One with its own section up there is already reachable from it.
              .filter(({ Sidebar: Section }) => !Section)
              .map(({ id, title }) => (
                <SidebarMenuItem key={id}>
                  {/* Matches the sidebar rows: thumb-sized on touch, tight on a pointer. */}
                  <SidebarMenuButton
                    asChild
                    isActive={active?.id === id}
                    className="h-11 md:h-8"
                  >
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
            {screens.map(({ id, title, Screen }) => (
              <Route
                key={id}
                path={`/${id}/*`}
                element={
                  <Safely name={title}>
                    <Screen />
                  </Safely>
                }
              />
            ))}
            {/* Nowhere to send you while a route might still be arriving. */}
            <Route
              path="*"
              element={
                ready ? (
                  home ? (
                    <Navigate to={`/${home.id}`} replace />
                  ) : null
                ) : (
                  <Loading label="Loading" />
                )
              }
            />
          </Routes>
        </main>
      </SidebarInset>
    </>
  )
}
