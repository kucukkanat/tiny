import { PluginBoundary } from "./Boundary.tsx";
import type { RouteEntry } from "./registry.ts";

/** One plugin-registered page, filling the app's main area; router-agnostic — see `usePluginRoutes`. */
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
