import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";
import { fileSystem } from "@tiny/plugin-fs";
import { humanInTheLoop } from "@tiny/plugin-hitl";
import { pluginManager } from "@tiny/plugin-manager";
import { historyWindow } from "./historyWindow.ts";
import { settingsPlugin } from "./settingsPlugin.tsx";
import { streamTrace } from "./streamTrace.ts";
import { systemPrompt } from "./systemPrompt.ts";
import { usageLogger } from "./usageLogger.ts";

export { historyWindow, settingsPlugin, streamTrace, systemPrompt, usageLogger };

/**
 * The plugins the app runs, in order.
 *
 * To add one: write a pi-shaped factory beside this file — it receives the
 * plugin API and calls `pi.on(...)`, `pi.registerCommand(...)`,
 * `pi.registerShortcut(...)` or `pi.contribute(...)` — and list it here.
 * Nothing in `@tiny/ai`, `@tiny/plugin`, `useChat` or any component changes.
 * See `packages/plugin/README.md`.
 *
 * A plugin that only subscribes to events is exactly an `@tiny/ai` extension,
 * which is why the four originals below need no edit.
 *
 * Nothing enabled here rewrites what is sent to the model: the observers only
 * watch, `settings` owns the endpoint dialog, and `humanInTheLoop` gates tool
 * calls rather than the request. The two commented out do rewrite it, so they
 * are left opt-in rather than quietly changing how every conversation behaves.
 */
export const plugins: readonly IdentifiedPlugin[] = [
  // Wrapped rather than declared inside: these two are plain `@tiny/ai`
  // extensions, and the point of them is that an extension *is* a plugin. The
  // app is what decides their identity, and the type above insists it does.
  definePlugin("usageLogger", usageLogger()),
  definePlugin("streamTrace", streamTrace()),
  settingsPlugin(),
  // Ask before the model runs a tool. Listed before the plugins that register
  // tools only for readability — `tool_call` fires for every tool in the
  // registry regardless of load order.
  //
  // Reads inside the OPFS sandbox are free: they cannot reach the real disk and
  // cannot destroy anything. Everything else asks, including tools that arrive
  // later from `pluginManager`, which are the ones nobody has vetted.
  humanInTheLoop({
    allow: ["fs_list", "fs_read"],
    labels: {
      fs_write: "Write File",
      fs_edit: "Edit File",
      fs_delete: "Delete",
    },
  }),
  // Filesystem tools for the model, sandboxed to this origin's OPFS. Needs a
  // tool-calling model; endpoints without tool support simply ignore them.
  fileSystem(),
  // Lets the user install further plugins at runtime, from a URL or pasted
  // source. It must come after the plugins that ship with the app so those own
  // their command names.
  pluginManager(),
  // systemPrompt("You are Tiny, a concise and friendly assistant."),
  // historyWindow(40),
];
