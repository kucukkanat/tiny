# Panels and pages

```ts
pi.registerPanel(id: string, options: PanelOptions): void;
pi.registerRoute(path: string, options: RouteOptions): void;
```

[`contribute`](slots.md) places a fragment among the app's own chrome — a button
beside the model picker, a line under a reply. These two are for when a fragment
is not enough: a **panel** is a region of your own down the right-hand side, and a
**page** is a whole screen of your own at an address.

Like `contribute`, both are ours rather than pi's. pi is a terminal: it has one
column of output and no addresses, so there is nothing here to inherit.

## Panels

```ts
type PanelOptions = {
  readonly title: string;
  readonly icon?: ReactNode | undefined;
  readonly component: ComponentType;
};
```

```tsx path=packages/plugin/examples/outlinePanel.tsx
import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin, usePluginContext } from "@tiny/plugin";

/**
 * A panel in the app's right-hand rail: every question asked so far, one click
 * from being asked again.
 *
 * The rail does not exist until a plugin registers a panel, so listing this
 * plugin is what makes the rail appear — and dropping it is what takes the rail
 * away again. Neither is an app change.
 */
export const outlinePanel = (): IdentifiedPlugin => {
  // Declared outside the factory, like any contributed component: React remounts
  // a component whose *type* changes identity, and a remount loses its state.
  function Outline() {
    const ctx = usePluginContext();
    const asked = ctx.chat.messages.flatMap((message, position) =>
      message.role === "user" ? [{ key: `${position}`, text: message.content }] : [],
    );

    if (asked.length === 0)
      return <p className="px-2 py-2 text-smd text-ink-3">Nothing asked yet.</p>;

    return (
      <ul className="flex flex-col gap-px py-1">
        {asked.map((entry) => (
          <li key={entry.key}>
            <button
              type="button"
              data-testid="outline-entry"
              title={entry.text}
              onClick={() => ctx.ui.setEditorText(entry.text)}
              className="w-full truncate rounded-control px-2 py-1.5 text-left text-smd text-ink-2 hover:bg-hover hover:text-ink"
            >
              {entry.text}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return definePlugin("outlinePanel", (pi) => {
    pi.registerPanel("outline", { title: "Outline", component: Outline });
  });
};
```

### The rail is absent until something fills it

This is the rule the surface is built around: **with no panels registered there is
no rail** — not an empty column, not a toggle for something that is not there. An
app whose plugins register no panel looks exactly as it did before panels existed.

One panel gives the rail a heading. Several give it a tab strip, in registration
order — plugin list order, then call order within a factory — and the first
registered is the one it opens on. Whichever is showing, the rail can be collapsed
to a strip of openers, so it is always one click from coming back; which panel was
open and whether it was collapsed both survive a reload.

### Ids are namespaced, so pick the obvious one

A panel's id is scoped to your plugin: two plugins may both call theirs `notes`
without either having to know about the other. Registering the same id twice
*within one plugin* is a mistake rather than a collision, and the second is
dropped with an error.

| Registered | Address |
| --- | --- |
| `notes` by plugin `a` | `a:notes` |
| `notes` by plugin `b` | `b:notes` |
| `notes` twice by plugin `a` | the first; the second is reported |

## Pages

```ts
type RouteOptions = {
  readonly component: ComponentType;
  readonly label?: string | undefined;
  readonly icon?: ReactNode | undefined;
};
```

```tsx path=packages/plugin/examples/scratchpadPage.tsx
import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin, usePluginContext } from "@tiny/plugin";
import { useState } from "react";

/**
 * A page of the plugin's own, at `/scratchpad`, listed in the app's navigation.
 *
 * `label` is what asks for that navigation row; a page without one is reached
 * from a command, a button, or `ctx.navigate` instead. Either way the page
 * replaces the thread and nothing else — the sidebar and the rail stay, so the
 * user is never somewhere with no way back.
 */
export const scratchpadPage = (): IdentifiedPlugin => {
  function Scratchpad() {
    const ctx = usePluginContext();
    // `ctx.storage` is namespaced to this plugin, so these notes outlive both
    // the conversation and the page without touching anything else's keys.
    const [text, setText] = useState(() => ctx.storage.get<string>("text") ?? "");

    return (
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-3 px-4 py-6">
        <h1 className="text-2xl font-semibold text-ink">Scratchpad</h1>
        <textarea
          data-testid="scratchpad"
          value={text}
          placeholder="Notes that outlive the conversation…"
          onChange={(event) => {
            setText(event.target.value);
            ctx.storage.set("text", event.target.value);
          }}
          className="min-h-0 flex-1 resize-none rounded-card bg-surface p-3 text-base text-ink shadow-hairline outline-none placeholder:text-ink-3"
        />
        <button
          type="button"
          data-testid="scratchpad-ask"
          onClick={() => ctx.chat.send(text)}
          className="h-8 self-start rounded-control bg-accent px-3 text-smd font-medium text-accent-ink"
        >
          Ask about this
        </button>
      </div>
    );
  }

  return definePlugin("scratchpadPage", (pi) => {
    pi.registerRoute("/scratchpad", { component: Scratchpad, label: "Scratchpad" });
  });
};
```

### A page replaces the thread, and only the thread

The sidebar and the rail stay where they are. That is deliberate: a page that
took the whole window could strand the user somewhere with no way back, and then
every page would have to grow its own navigation to make up for it.

### `label` is how a page asks to be listed

With a `label`, the app puts a row in its navigation — above Settings, and
highlighted while you are on that path. Without one, the page is still there and
still addressable; it is simply not listed, which is what you want for a page
reached from a command or a button:

```ts
pi.registerRoute("/report", { component: Report });
pi.registerCommand("report", {
  description: "Open the report",
  handler: (_args, ctx) => ctx.navigate("/report"),
});
```

`ctx.navigate` is the same call the rest of the app uses, so a panel, a command,
a shortcut and a composer button can all reach a page.

### A path is an address, not a name

Two plugins registering the same *command* both survive, because pi disambiguates
with numeric suffixes. A path cannot be suffixed — it is what the router resolves
— so the rules are stricter:

| Situation | Result |
| --- | --- |
| A path that does not start with `/` | dropped, and reported |
| A path containing `?`, `#` or whitespace | dropped, and reported |
| `/notes/`, `//notes` | stored as `/notes` |
| A path a plugin already claimed, in any spelling | the first wins; the second is reported |
| A path the app itself owns (`/`, `/c/:id`) | the app wins |

The middle rows are not tidiness. A router compiles a path into a regular
expression, and `?` is the one metacharacter it does not escape — `/note?s`
would quietly match `/notes`, an address its plugin never registered and another
plugin may own. Trailing slashes are not inert either: `/notes/` *outranks*
`/notes`, so without canonicalising, the slashed spelling of a path would win it
from whoever registered it first, and the clash check above — comparing strings,
where the router compares addresses — would never see the pair at all.

That is also what holds the last row up. The app declares its own routes first
and a tie in specificity is broken by declaration order, so `/c/:id` from a
plugin loses to the app's. Canonicalising is what stops a plugin dodging that tie
by spelling the same path more specifically. A plugin can still register a path
that is genuinely more specific — a static `/c/summary` beats the app's dynamic
`/c/:id` — because that is a different address, not the same one in disguise.

## Both are ordinary plugin components

A panel and a page are rendered inside the host, so each can call
`usePluginContext()` for the [full context](context.md) — namespaced to your
plugin — and re-renders when chat state moves. Everything in
[Slots](slots.md#declare-the-component-outside-the-factory) about declaring the
component outside the factory applies here for the same reason.

So does everything about [errors](slots.md#errors). A panel or a page that throws
is replaced by a small `<pluginId> failed` marker; the rail, the shell and every
other plugin render normally.

## Putting them in an app of your own

`@tiny/plugin` ships the rail and the page wrapper but no router, so the host app
decides where both go — see
[Hosting: panels and pages](host.md#panels-and-pages).
