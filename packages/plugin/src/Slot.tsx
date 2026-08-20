import type { ComponentType } from "react";
import { PluginBoundary } from "./Boundary.tsx";
import { usePluginHost } from "./hooks.ts";
import type { PluginMessage, WidgetPlacement } from "./tiny.ts";

/**
 * Named regions of the app a plugin can render into.
 *
 * `message.pending` is the one inside a reply still being written — for anything
 * the run is waiting on, which is where an approval belongs: a question about
 * this tool call, asked where the tool call is, rather than over the whole app.
 *
 * A slot is for a *fragment* placed among the app's own chrome. For a region of
 * one's own there are two other surfaces: `tiny.registerPanel` for the right-hand
 * rail, and `tiny.registerRoute` for a whole page — see Panels.tsx.
 */
export type SlotName =
  | "app.overlays"
  | "composer.actions"
  | "sidebar.footer"
  | "message.actions"
  | "message.pending";

/** Props a slot passes down; `message.actions` is the only one that carries data. */
export type SlotProps = {
  readonly message?: PluginMessage | undefined;
  readonly index?: number | undefined;
};

export type Contribution = ComponentType<SlotProps>;

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
        <PluginBoundary key={id} pluginId={pluginId}>
          <Contributed message={message} index={index} />
        </PluginBoundary>
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
        <div key={key} className="font-mono text-xs leading-[1.5] whitespace-pre-wrap text-ink-2">
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
      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-xs text-ink-3"
      data-testid="plugin-status"
    >
      {[...statuses.entries()].map(([key, text]) => (
        <span key={key}>{text}</span>
      ))}
    </div>
  );
}
