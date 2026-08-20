import { PluginBoundary } from "./Boundary.tsx";
import type { RouteEntry } from "./registry.ts";

/**
 * One plugin-registered page, filling the app's main area.
 *
 * Deliberately not a router: this package stays router-agnostic, so the host app
 * maps `registry.routes` onto whatever routing it already has and renders this
 * as the element. See `usePluginRoutes`, and Hosting in the docs.
 */
export function PluginPage({ entry }: { entry: RouteEntry }) {
  const Page = entry.options.component;
  return (
    <main
      className="min-w-0 flex-1 overflow-y-auto bg-page"
      data-testid="plugin-page"
      data-path={entry.path}
    >
      <PluginBoundary pluginId={entry.pluginId}>
        <Page />
      </PluginBoundary>
    </main>
  );
}
