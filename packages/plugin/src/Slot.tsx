import type { ComponentType } from "react";
import { PluginBoundary } from "./Boundary.tsx";
import { usePluginHost } from "./hooks.ts";
import type { PluginMessage, WidgetPlacement } from "./tiny.ts";

/**
 * What each named region passes to the components rendered into it.
 *
 * An interface, not a union, so **a plugin can declare a region of its own** and
 * have contributors to it typed as precisely as contributors to the app's:
 *
 * ```ts
 * declare module "@tiny/plugin" {
 *   interface SlotProps {
 *     "notes.toolbar": { readonly noteId: string };
 *   }
 * }
 * ```
 *
 * Then `<Slot name="notes.toolbar" noteId={id} />` renders it — from a panel, a
 * page, or another slot's component — and `tiny.contribute("notes.toolbar", C)`
 * requires `C` to take a `noteId`. Rendering a `Slot` is the whole of declaring
 * one; there is nothing to register, and a slot nobody contributes to renders
 * nothing.
 *
 * The five below are the app's. They are entries here like any other, with no
 * standing the app's own plugins do not share — which is what "the extension
 * points are not owned by the core" has to mean to be worth saying.
 *
 * `message.pending` is the one inside a reply still being written — for anything
 * the run is waiting on, which is where an approval belongs: a question about
 * this tool call, asked where the tool call is, rather than over the whole app.
 *
 * A slot is for a *fragment* placed among someone else's chrome. For a region of
 * one's own there are two other surfaces: `tiny.registerPanel` for the right-hand
 * rail, and `tiny.registerRoute` for a whole page — see Panels.tsx.
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

/**
 * A slot's name.
 *
 * `(string & {})` keeps the union open while leaving the declared names in
 * autocomplete — a plugin may render into a slot whose owner never declared its
 * props, and typing that as an error would make the open half unusable.
 */
export type SlotName = keyof SlotProps | (string & {});

/** What a component contributed to `name` is handed. */
export type PropsOf<S extends SlotName> = S extends keyof SlotProps ? SlotProps[S] : EmptyProps;

/**
 * A contributed component with its props erased.
 *
 * The registry holds contributions to every slot in one list, so the entry type
 * cannot name any one slot's props. `contribute` is where the typed check
 * happens; this is only how the result is stored.
 */
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
