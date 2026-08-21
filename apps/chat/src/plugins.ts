import type { IdentifiedPlugin } from "@tiny/plugin";
import { fileSystem } from "@tiny/plugin-fs";
import { humanInTheLoop } from "@tiny/plugin-hitl";
import { pluginManager } from "@tiny/plugin-manager";
import { settings } from "@tiny/plugin-settings";
import { approvalLog, streamTrace, usageLogger } from "@tiny/plugin-trace";
import * as tinyUi from "@tiny/ui";

/**
 * The plugins this app runs, in order.
 *
 * This file is the whole of the app's plugin configuration — every plugin is a
 * package, including the settings dialog, so nothing here is privileged. To add
 * one: install it, import it, add it to the list. Nothing in `@tiny/ai`,
 * `@tiny/plugin`, `useChat` or any component changes.
 *
 * `IdentifiedPlugin` rather than `Plugin`: a plugin's id namespaces its storage,
 * so the compiler insists every entry declares one.
 *
 * Nothing enabled here rewrites what is sent to the model. `@tiny/plugin-prompt`
 * does — a system prompt, a history window — which is why it is not in this list
 * and not in the app's dependencies. Add it deliberately.
 */
export const plugins: readonly IdentifiedPlugin[] = [
  usageLogger(),
  streamTrace(),
  // Logs what the approval gate below decided, and how. It reaches that plugin
  // over `tiny.events` rather than importing it, so the order of these two does
  // not matter and removing either leaves the other working.
  approvalLog(),
  settings(),
  // Ask before the model runs a tool. Listed before the plugins that register
  // tools only for readability — `tool_call` fires for every tool in the
  // registry regardless of load order.
  //
  // Reads inside the OPFS sandbox are free: they cannot reach the real disk and
  // cannot destroy anything. Everything else asks, including tools that arrive
  // later from `pluginManager`, which are the ones nobody has vetted.
  humanInTheLoop({
    allow: ["fs_list", "fs_read"],
    labels: { fs_write: "Write File", fs_edit: "Edit File", fs_delete: "Delete" },
  }),
  // Filesystem tools for the model, sandboxed to this origin's OPFS. Needs a
  // tool-calling model; endpoints without tool support simply ignore them.
  fileSystem(),
  // Lets the user install further plugins at runtime, from a URL or pasted
  // source. It must come after the plugins that ship with the app so those own
  // their command names.
  //
  // `modules` is what an installed plugin may `import` by name. `react` and
  // `@tiny/plugin` come as standard; this app adds its design system, so a
  // plugin's UI is built from the same components — and the same tokens — as
  // the rest of the app rather than hand-rolled CSS that drifts from the theme.
  pluginManager({ modules: { "@tiny/ui": tinyUi } }),
];
