import type { ComponentType } from "react";
import { PluginBoundary } from "./Boundary.tsx";
import { usePluginHost } from "./hooks.ts";
import type { PluginMessage, WidgetPlacement } from "./tiny.ts";

/**
 * What each named region passes to the components rendered into it. An interface,
 * not a union, so a plugin can declare a region of its own by augmenting it:
 * ```ts
 * declare module "@tiny/plugin" {
 *   interface SlotProps {
 *     "notes.toolbar": { readonly noteId: string };
 *   }
 * }
 * ```
 * Rendering `<Slot name="notes.toolbar" noteId={id} />` is the whole of declaring one.
 */
export interface SlotProps {
  "app.overlays": EmptyProps;
  "composer.actions": EmptyProps;
  "sidebar.footer": EmptyProps;
  "message.actions": { readonly message: PluginMessage; readonly index: number };
  "message.pending": EmptyProps;
}

/** A slot that passes nothing. Spelled once so the entries above read as a table. */
export type EmptyProps = Record<never, never>;

/** A slot's name. `(string & {})` keeps the union open while leaving declared names in autocomplete. */
export type SlotName = keyof SlotProps | (string & {});

/** What a component contributed to `name` is handed. */
export type PropsOf<S extends SlotName> = S extends keyof SlotProps ? SlotProps[S] : EmptyProps;

/** A contributed component with its props erased; `contribute` is where the typed check happens. */
// biome-ignore lint/suspicious/noExplicitAny: the one place props are erased, so `contribute` can be exact
export type Contribution = ComponentType<any>;

/** Renders every component contributed to `name`, each independently isolated. */
export function Slot<S extends SlotName>({ name, ...props }: { name: S } & PropsOf<S>) {
  const { registry } = usePluginHost();
  const entries = registry.contributions.filter((entry) => entry.slot === name);
  if (entries.length === 0) return null;

  return (
    <>
      {entries.map(({ component: Contributed, pluginId, id }) => (
        <PluginBoundary key={id} pluginId={pluginId}>
          <Contributed {...props} />
        </PluginBoundary>
      ))}
    </>
  );
}

/** The render target for pi's `setWidget` — plain string lines, all the RPC protocol carries. */
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
