import { Component, type ErrorInfo, type ReactNode } from "react";
import { PluginIdContext } from "./hooks.ts";
import { reportPluginProblem } from "./problems.ts";

// Everything a plugin renders goes through here, so a broken one costs only its own output.
class Catch extends Component<{ pluginId: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    if (info.componentStack != null) console.error(info.componentStack);
    reportPluginProblem({ pluginId: this.props.pluginId, message: "render failed", error });
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

/** One plugin's rendered output: error-isolated, and told which plugin it belongs to
 * so `usePluginContext()` inside it resolves to that plugin's namespace. */
export function PluginBoundary({ pluginId, children }: { pluginId: string; children: ReactNode }) {
  return (
    <Catch pluginId={pluginId}>
      <PluginIdContext.Provider value={pluginId}>{children}</PluginIdContext.Provider>
    </Catch>
  );
}
