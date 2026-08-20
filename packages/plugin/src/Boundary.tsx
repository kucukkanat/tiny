import { Component, type ErrorInfo, type ReactNode } from "react";
import { PluginIdContext } from "./hooks.ts";

/**
 * `@tiny/ai` catches nothing by design — right for a request, wrong for a
 * render, where one throwing plugin would blank the whole app. Everything a
 * plugin renders goes through here, so a broken one costs only its own output.
 */
class Catch extends Component<{ pluginId: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[plugin:${this.props.pluginId}] render failed`, error, info.componentStack);
  }

  override render() {
    if (this.state.failed)
      return (
        <span data-testid="plugin-error" className="text-xs text-red">
          {this.props.pluginId} failed
        </span>
      );
    return this.props.children;
  }
}

/**
 * One plugin's rendered output: isolated from the rest of the app, and told
 * which plugin it belongs to so `usePluginContext()` inside it resolves to that
 * plugin's namespace.
 *
 * Every surface a plugin can draw on — a [slot](./Slot.tsx), a
 * [panel](./Panels.tsx), a [page](./PluginPage.tsx) — wraps in this, so the
 * guarantee is the same wherever the component ends up.
 */
export function PluginBoundary({ pluginId, children }: { pluginId: string; children: ReactNode }) {
  return (
    <Catch pluginId={pluginId}>
      <PluginIdContext.Provider value={pluginId}>{children}</PluginIdContext.Provider>
    </Catch>
  );
}
