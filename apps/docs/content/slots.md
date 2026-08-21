# Slots and rendering

```ts
tiny.contribute(slot: SlotName, component: ComponentType<SlotProps>): void;
```

`contribute` is the one part of the API with no pi equivalent. pi's answer to rich
UI is `ctx.ui.custom()` and `(tui, theme) => Component` factories — which is
exactly the terminal-only half of its SDK, the part that cannot cross into a
browser. So this is ours.

## The five slots

```ts
type SlotName =
  | "app.overlays"
  | "composer.actions"
  | "sidebar.footer"
  | "message.actions"
  | "message.pending";
```

| Slot | Renders | Rendered by |
| --- | --- | --- |
| `app.overlays` | modals and palettes, above everything | `apps/chat/src/App.tsx` |
| `composer.actions` | inline beside the model picker | `apps/chat/src/App.tsx` |
| `sidebar.footer` | below the sidebar's settings row | `apps/chat/src/App.tsx` |
| `message.actions` | under each finished assistant reply | `apps/chat/src/Thread.tsx` |
| `message.pending` | inside the reply still being written | `apps/chat/src/Thread.tsx` |

The union is closed on purpose. A slot is a promise the app makes about where
something will appear and what props it will receive; adding one is an app change,
not a plugin change.

A slot is for a *fragment* placed among the app's own chrome. When you want a
region of your own instead, there are two other surfaces —
[`registerPanel` and `registerRoute`](panels.md) — and neither needs an app change
to use.

## Props

```ts
type SlotProps = {
  readonly message?: PluginMessage | undefined;
  readonly index?: number | undefined;
};
```

`message.pending` is the slot for something the run is *waiting on*, which is why it
renders only while the reply is live and disappears with it. An approval belongs
here rather than in `app.overlays`: the question is about one tool call, so it is
asked where that tool call is, instead of interrupting the whole app. See
[Approvals](tools.md#approvals-are-just-an-event).

Only `message.actions` fills them — with the message it is rendered under and that
message's position in the thread. The other four slots pass `undefined` for both,
so a component shared between slots must handle their absence:

```tsx
function CopyAction({ message }: SlotProps) {
  if (message === undefined) return null;
  // …
}
```

## Reading app state

A contributed component is rendered inside the host, so it can call
`usePluginContext()` for the [full context](context.md) — namespaced to your
plugin — and re-renders when chat state moves.

```tsx path=packages/plugin/examples/savedPrompts.tsx
import type { Plugin } from "@tiny/plugin";
import { definePlugin, usePluginContext } from "@tiny/plugin";

/**
 * Per-plugin storage and a composer button, together.
 *
 * `ctx.storage` is namespaced to this plugin, so nothing it writes can collide
 * with the app's own keys or with another plugin's.
 */
export const savedPrompts = (): Plugin => {
  function SaveButton() {
    const ctx = usePluginContext();

    return (
      <button
        type="button"
        data-testid="save-prompt"
        className="h-7 rounded-control px-1.5 text-sm text-ink-2 hover:bg-hover hover:text-ink"
        onClick={() => void ctx.runCommand("prompts")}
      >
        Prompts
      </button>
    );
  }

  return definePlugin("savedPrompts", (tiny) => {
    tiny.registerCommand("prompts", {
      description: "Insert a saved prompt",
      handler: async (_args, ctx) => {
        const saved = ctx.storage.get<string[]>("saved") ?? [
          "Explain this like I am five.",
          "Rewrite this more concisely.",
        ];
        const choice = await ctx.ui.select("Saved prompts", saved);
        if (choice !== undefined) ctx.ui.setEditorText(choice);
      },
    });

    tiny.registerCommand("prompts:add", {
      description: "Save a prompt for later",
      handler: async (args, ctx) => {
        const text = args !== "" ? args : await ctx.ui.input("Save a prompt", "Type it here");
        if (text === undefined || text === "") return;
        const saved = ctx.storage.get<string[]>("saved") ?? [];
        ctx.storage.set("saved", [...saved, text]);
        ctx.ui.notify("Saved", "info");
      },
    });

    tiny.contribute("composer.actions", SaveButton);
  });
};
```

Note the division of labour: the button does not contain the logic, it calls
`ctx.runCommand("prompts")`. The command is then reachable from the palette, from
a shortcut and from the button, with one implementation.

## Declare the component outside the factory

```tsx
// Good — one component identity for the life of the module.
export const savedPrompts = (): Plugin => {
  function SaveButton() { /* … */ }
  return (tiny) => tiny.contribute("composer.actions", SaveButton);
};
```

Define it in the factory's closure or at module scope, never inline in the
`contribute` call site of a re-running function. React remounts a component whose
*type* changes identity, and a remount loses its state.

## Overlays

`app.overlays` renders above the app, so a plugin owning a modal keeps the modal's
open state itself and contributes a component that renders `null` when closed:

```tsx
export const settings = (): Plugin => {
  const open = createExternalStore(false);

  function SettingsOverlay() {
    const shown = useStore(open);
    return shown ? <Dialog onClose={() => open.set(false)} /> : null;
  }

  return (tiny) => {
    tiny.registerCommand("settings", { handler: () => open.set(true) });
    tiny.contribute("app.overlays", SettingsOverlay);
  };
};
```

The switch lives in the factory's closure rather than in component state,
because the command handler and the contributed component are separate call
sites that need to reach the same one — and only the second of them is a
component. `createExternalStore` is that switch plus the subscription React
wants, and `useStore` reads it; it holds any value, not just a boolean.

A store that should be read but not reassigned can be handed out as a
`ReadableStore` — `useStore` takes either, and `@tiny/plugin-hitl` uses that to
keep the pending approval answerable only through `ask`.

That is the pattern the app's own settings dialog and the
[Plugins dialog](runtime.md) both use.

## Errors

`@tiny/ai` catches nothing, by design. This package catches deliberately, and the
difference is the point: **an unhandled throw is right for a request and wrong for
a render**, where one bad plugin would blank the whole app.

Every contribution is wrapped in its own error boundary. A component that throws
is replaced by a small `<pluginId> failed` marker, the error and component stack
go to the console, and every other contribution renders normally.

```tsx
<Boundary key={id} pluginId={pluginId}>
  <PluginIdContext.Provider value={pluginId}>
    <Contributed message={message} index={index} />
  </PluginIdContext.Provider>
</Boundary>
```

The same reasoning covers handlers: a throwing command handler is logged and
surfaced through `ctx.ui.notify("Command … failed", "error")` rather than
propagating, and a throwing shortcut handler is logged.

## Ordering and keys

Contributions render in registration order — plugin list order, then call order
within a factory. Each is keyed by `<pluginId>#<n>`, assigned once when the
factory runs, so React keeps component state across host re-renders.

## Widgets and the status bar

Two more regions exist that `contribute` has nothing to do with. They are driven
by [pi's own API](context.md#telling-the-user-something) and carry plain strings,
so a portable pi extension can draw into them without knowing React:

| Component | Renders |
| --- | --- |
| `<Widgets placement="aboveEditor" />` | whatever `ui.setWidget` holds for that placement |
| `<StatusBar />` | every `ui.setStatus` entry |

If you are wiring these into your own app, see
[Hosting the plugin system](host.md).
