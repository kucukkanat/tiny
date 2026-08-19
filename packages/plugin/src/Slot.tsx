import { Component, type ErrorInfo, type ReactNode } from "react";
import { PluginIdContext, usePluginHost } from "./context.ts";
import type { PluginMessage, SlotName, WidgetPlacement } from "./types.ts";

/**
 * `@tiny/ai` catches nothing by design — right for a request, wrong for a
 * render, where one throwing plugin would blank the whole app. Each
 * contribution is isolated so a broken plugin costs only its own output.
 */
class Boundary extends Component<{ pluginId: string; children: ReactNode }, { failed: boolean }> {
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
        <span data-testid="plugin-error" className="text-[11.5px] text-red">
          {this.props.pluginId} failed
        </span>
      );
    return this.props.children;
  }
}

/** Renders every component contributed to `name`, each independently isolated. */
export function Slot({
  name,
  message,
  index,
}: {
  name: SlotName;
  message?: PluginMessage | undefined;
  index?: number | undefined;
}) {
  const { registry } = usePluginHost();
  const entries = registry.contributions.filter((entry) => entry.slot === name);
  if (entries.length === 0) return null;

  return (
    <>
      {entries.map(({ component: Contributed, pluginId, id }) => (
        <Boundary key={id} pluginId={pluginId}>
          <PluginIdContext.Provider value={pluginId}>
            <Contributed message={message} index={index} />
          </PluginIdContext.Provider>
        </Boundary>
      ))}
    </>
  );
}

/**
 * The render target for pi's `setWidget` — plain string lines, which is all the
 * RPC protocol carries, so a pi extension can draw here without knowing React.
 */
export function Widgets({ placement }: { placement: WidgetPlacement }) {
  const { widgets } = usePluginHost();
  const shown = [...widgets.entries()].filter(([, widget]) => widget.placement === placement);
  if (shown.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 py-1.5" data-testid={`plugin-widgets-${placement}`}>
      {shown.map(([key, widget]) => (
        <div
          key={key}
          className="font-mono text-[11.5px] leading-[1.5] whitespace-pre-wrap text-ink-2"
        >
          {widget.lines.join("\n")}
        </div>
      ))}
    </div>
  );
}

/** pi's footer status line, which has no footer here to live in. */
export function StatusBar() {
  const { statuses } = usePluginHost();
  if (statuses.size === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-[11.5px] text-ink-3"
      data-testid="plugin-status"
    >
      {[...statuses.entries()].map(([key, text]) => (
        <span key={key}>{text}</span>
      ))}
    </div>
  );
}
