# Slots and rendering

```ts
tiny.contribute(slot: SlotName, component: ComponentType<SlotProps>): void;
```

`contribute` is the one part of the API with no pi equivalent. pi's answer to rich
UI is `ctx.ui.custom()` and `(tui, theme) => Component` factories — which is
exactly the terminal-only half of its SDK, the part that cannot cross into a
browser. So this is ours.

## The slots the app declares

```ts
interface SlotProps {
  "app.overlays": EmptyProps;
  "composer.actions": EmptyProps;
  "sidebar.footer": EmptyProps;
  "message.actions": { readonly message: PluginMessage; readonly index: number };
  "message.pending": EmptyProps;
}
```

| Slot | Renders | Rendered by |
| --- | --- | --- |
| `app.overlays` | modals and palettes, above everything | `packages/shell/src/ChatShell.tsx` |
| `composer.actions` | inline beside the model picker | `packages/shell/src/ChatShell.tsx` |
| `sidebar.footer` | below the sidebar's settings row | `packages/shell/src/ChatShell.tsx` |
| `message.actions` | under each finished assistant reply | `packages/shell/src/Thread.tsx` |
| `message.pending` | inside the reply still being written | `packages/shell/src/Thread.tsx` |

`message.pending` is the slot for something the run is *waiting on*, which is why it
renders only while the reply is live and disappears with it. An approval belongs
here rather than in `app.overlays`: the question is about one tool call, so it is
asked where that tool call is, instead of interrupting the whole app. See
[Approvals](tools.md#approvals-are-just-an-event).

## Declaring a slot of your own

`SlotProps` is an interface, so it is **open**. A plugin declares a region and
says what it passes:

```ts
declare module "@tiny/plugin" {
  interface SlotProps {
    "notes.toolbar": { readonly noteId: string };
  }
}
```

Then render it wherever you own the space — inside your
[panel](panels.md), your page, or another slot's component:

```tsx
function NotesPanel() {
  const noteId = useCurrentNote();
  return (
    <div>
      <Slot name="notes.toolbar" noteId={noteId} />
      …
    </div>
  );
}
```

That is all of it. There is nothing to register, no lifecycle, and no core
change: **rendering a `Slot` is declaring one.** A slot nobody contributes to
renders nothing, and another plugin can now do this without asking you:

```tsx
tiny.contribute("notes.toolbar", ({ noteId }) => <Stamp id={noteId} />);
```

The five above are the app's, and they are entries in the same interface with no
standing yours does not have.

> **The names are open, the props are checked.** `SlotName` is
> `keyof SlotProps | (string & {})`, so contributing to a slot whose owner never
> declared its props still compiles — which also means a typo compiles and
> silently renders nowhere. Declaring your slot in `SlotProps` is what buys the
> typo back, for you and for anyone extending you.

## Props are per slot

A component is checked against the slot it is contributed to:

```tsx
tiny.contribute("message.actions", ({ message, index }) => …);  // both required
tiny.contribute("sidebar.footer", () => …);                     // no props at all
```

`PropsOf<"message.actions">` names that type if you want to declare the
component separately:

```tsx
function CopyAction({ message }: PropsOf<"message.actions">) { … }
```

Before this, every slot shared one `{ message?, index? }` — so a component in
`message.actions` had to null-check a message that is always there, and a
component in `sidebar.footer` was offered one that never is.

## Reading app state

A contributed component is rendered inside the host, so it can call
`usePluginContext()` for the [full context](context.md) — namespaced to your
plugin — and re-renders when chat state moves.

```tsx path=packages/plugin/examples/savedPrompts.tsx
import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin, usePluginContext } from "@tiny/plugin";

/**
 * Per-plugin storage and a composer button, together.
 *
 * `ctx.storage` is namespaced to this plugin, so nothing it writes can collide
 * with the app's own keys or with another plugin's.
 */
export const savedPrompts = (): IdentifiedPlugin => {
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
export const savedPrompts = (): IdentifiedPlugin => {
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
export const settings = (): IdentifiedPlugin => {
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
