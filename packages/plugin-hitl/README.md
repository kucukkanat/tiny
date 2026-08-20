# @tiny/plugin-hitl

Ask the user before the model runs a tool.

The model asks to write a file. Everything stops, the arguments are shown, and
nothing happens until someone says yes. Refusing does not end the turn: the model
is told it was refused — and why, if you say why — so it can try something else.

```ts
import { humanInTheLoop } from "@tiny/plugin-hitl";

export const plugins = [humanInTheLoop()];
```

That is the whole setup. Every tool any plugin registers now stops and asks.

## How it works

There is no interception layer here. `@tiny/ai` fires pi's **`tool_call`** event
between preparing a tool's arguments and running it, and this plugin is an
ordinary subscriber:

```ts
pi.on("tool_call", async (event, ctx) => {
  // event.toolName, event.toolCallId, event.input
  const ok = await ctx.ui.confirm("Run it?", event.toolName);
  return ok ? undefined : { block: true, reason: "Blocked by user" };
});
```

(`ctx.ui.confirm` is the one-liner; this package answers with a rendered card
instead — see [What the user sees](#what-the-user-sees).)

Three things follow from using pi's event rather than a bespoke hook:

- **A block is an error result, not a failed request.** The reason is fed back as
  the tool's output, so a refusal steers the model instead of killing the turn.
- **`event.input` is mutable.** A handler can patch the model's arguments in
  place; the return value only ever blocks. That is pi's contract, kept exactly.
- **pi's own gates run here.** See [Running pi's gates](#running-pis-gates).

## Choosing what to ask about

Asking about everything gets old fast. Name the tools you trust:

`examples/readsAreFree.ts`

```ts path=packages/plugin-hitl/examples/readsAreFree.ts
import type { Plugin } from "@tiny/plugin";
import { humanInTheLoop } from "@tiny/plugin-hitl";

/**
 * Reading is cheap and reversible; writing is neither. Naming the safe tools is
 * usually all the policy an app needs.
 */
export const plugins: readonly Plugin[] = [
  humanInTheLoop({
    allow: ["fs_list", "fs_read"],
    deny: ["fs_delete"],
    labels: { fs_write: "Write File", fs_edit: "Edit File" },
  }),
];
```

`allow` and `deny` are tool names. For anything that depends on *what the tool
was asked to do*, use `decide` — the only rule handed the arguments:

`examples/decideOnArguments.ts`

```ts path=packages/plugin-hitl/examples/decideOnArguments.ts
import type { Plugin } from "@tiny/plugin";
import { humanInTheLoop } from "@tiny/plugin-hitl";

/**
 * `decide` is the only rule that sees the arguments, so it is where a policy
 * about *what* a tool is being asked to do belongs — pi's `protected-paths`
 * shape, as a configuration rather than a second plugin.
 */
export const plugins: readonly Plugin[] = [
  humanInTheLoop({
    decide: ({ toolName, input }) => {
      if (!toolName.startsWith("fs_")) return undefined;
      const path = String(input.path ?? "");
      if (path.startsWith("/scratch/")) return "allow";
      if (path.includes("/.env")) return "deny";
      return "ask";
    },
    denyReason: "That path is off limits — pick somewhere under /scratch.",
  }),
];
```

And the default, for completeness:

`examples/askForEverything.ts`

```ts path=packages/plugin-hitl/examples/askForEverything.ts
import type { Plugin } from "@tiny/plugin";
import { humanInTheLoop } from "@tiny/plugin-hitl";

/**
 * The default: every tool call stops and asks, and nothing is remembered until
 * the user ticks the box.
 */
export const plugins: readonly Plugin[] = [humanInTheLoop()];
```

### Which rule wins

Most binding first. `decide` sees the arguments, so it gets the first and last
word; a configured `deny` beats a remembered `allow`, because "always allow this"
is a shortcut through the questions rather than a way past a rule someone else
set.

| # | Rule | Set by |
| --- | --- | --- |
| 1 | `decide(call)` | you, per call, with the arguments in hand |
| 2 | `deny` | you |
| 3 | what the user chose to remember | the user, via the checkbox |
| 4 | `allow` | you |
| 5 | `fallback` — `"ask"` unless you say otherwise | you |

`resolve`, `remember` and `withoutDecision` are exported, so the same precedence is
testable on its own without a host or a model.

## What the user sees

The question appears **inside the reply**, under the tool line that is waiting —
not in a modal. A tool call is one decision inside one answer, and interrupting
the whole app for it is out of proportion; the card is built from Beautiful UI's
Approval Card, the primitive made for exactly this.

It names the tool, shows the arguments in full, offers a free-text row for saying
what to do instead, and an "always for this tool" box. Choosing arms the send
arrow rather than firing on a timer, because a mis-click here runs the tool.

- **Dismissing denies.** A closed question is not consent.
- **Stopping the reply takes the card down** with the run it belonged to.
- **Answering removes it.** The tool line above already records what happened,
  which is the part worth keeping in the transcript.
- **`/approvals`** lists what has been remembered and forgets any of it.

The card is contributed to the `message.pending` slot, so any host that renders

```tsx
{!done && <Slot name="message.pending" />}
```

inside its live assistant message gets it. Every element carries a `data-testid`
(`approval-card`, `approval-option-approve`, `approval-option-deny`,
`approval-note`, `approval-remember`, `approval-send`, `approval-dismiss`).

## Options

```ts
type HitlOptions = {
  allow?: readonly string[];       // runs without asking
  deny?: readonly string[];        // never runs
  fallback?: "allow" | "ask" | "deny";  // everything else; defaults to "ask"
  decide?: (call: { toolName: string; input: Record<string, unknown> }) =>
    "allow" | "ask" | "deny" | undefined;
  denyReason?: string;             // what the model is told
  labels?: Record<string, string>; // display names for the prompt
  remember?: boolean;              // false hides the "always" box, so every call asks
  command?: string;                // defaults to "approvals"
};
```

## Running pi's gates

pi ships no permission system — `docs/security.md` says so outright. What it
ships is the `tool_call` event and a set of example gates, and those gates run
here. Both files below are pi's, from
`@earendil-works/pi-coding-agent/examples/extensions/`, with **one edit each**:
the import line.

`examples/piPermissionGate.ts`

```ts path=packages/plugin-hitl/examples/piPermissionGate.ts
/**
 * Permission Gate Extension
 *
 * Prompts for confirmation before running potentially dangerous bash commands.
 * Patterns checked: rm -rf, sudo, chmod/chown 777
 *
 * This is pi's own `examples/extensions/permission-gate.ts`, from
 * `@earendil-works/pi-coding-agent`. The import on the next line is the only
 * edit: pi's `ExtensionAPI` becomes this host's `PluginAPI`. Everything below
 * it — the event, `event.input`, `ctx.hasUI`, `ctx.ui.select`, and the
 * `{ block, reason }` return — is pi's code, unchanged.
 */

import type { PluginAPI } from "@tiny/plugin";

export default function (pi: PluginAPI) {
  const dangerousPatterns = [/\brm\s+(-rf?|--recursive)/i, /\bsudo\b/i, /\b(chmod|chown)\b.*777/i];

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;

    const command = event.input.command as string;
    const isDangerous = dangerousPatterns.some((p) => p.test(command));

    if (isDangerous) {
      if (!ctx.hasUI) {
        // In non-interactive mode, block by default
        return { block: true, reason: "Dangerous command blocked (no UI for confirmation)" };
      }

      const choice = await ctx.ui.select(`⚠️ Dangerous command:\n\n  ${command}\n\nAllow?`, [
        "Yes",
        "No",
      ]);

      if (choice !== "Yes") {
        return { block: true, reason: "Blocked by user" };
      }
    }

    return undefined;
  });
}
```

`ctx.ui.select` opens a real dialog here, and `ctx.hasUI` is false exactly where
pi's is — under `loadPlugins` with no host mounted, which is pi's non-interactive
mode. The gate blocks by default there, as it was written to.

pi's other gate needs no dialog at all:

`examples/piProtectedPaths.ts`

```ts path=packages/plugin-hitl/examples/piProtectedPaths.ts
/**
 * Protected Paths Extension
 *
 * Blocks write and edit operations to protected paths.
 * Useful for preventing accidental modifications to sensitive files.
 *
 * pi's own `examples/extensions/protected-paths.ts`, with the same single edit
 * as `piPermissionGate.ts`: the import. It needs no dialog at all — a gate that
 * decides on its own is still a gate.
 */

import type { PluginAPI } from "@tiny/plugin";

export default function (pi: PluginAPI) {
  const protectedPaths = [".env", ".git/", "node_modules/"];

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "write" && event.toolName !== "edit") {
      return undefined;
    }

    const path = event.input.path as string;
    const isProtected = protectedPaths.some((p) => path.includes(p));

    if (isProtected) {
      if (ctx.hasUI) {
        ctx.ui.notify(`Blocked write to protected path: ${path}`, "warning");
      }
      return { block: true, reason: `Path "${path}" is protected` };
    }

    return undefined;
  });
}
```

## Testing

```sh
bun test packages/plugin-hitl
```

The tests are end to end and unmocked: a real server answers with a tool call, a
real `streamChat` runs the loop, the real host renders the card, and a real click
decides whether the tool executes. `test/pi-compat.test.tsx` runs pi's two gates
above through the same path.
