import type { Plugin } from "@tiny/plugin";
import { fileSystem } from "@tiny/plugin-fs";
import { pluginManager } from "@tiny/plugin-manager";
import { historyWindow } from "./historyWindow.ts";
import { settings } from "./settings.tsx";
import { streamTrace } from "./streamTrace.ts";
import { systemPrompt } from "./systemPrompt.ts";
import { usageLogger } from "./usageLogger.ts";

export { historyWindow, settings, streamTrace, systemPrompt, usageLogger };

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
 * Only observers and `settings` are enabled by default: none can alter what is
 * sent. The two commented out rewrite the request, so they are left opt-in
 * rather than quietly changing how every conversation behaves.
 */
export const plugins: readonly Plugin[] = [
  usageLogger(),
  streamTrace(),
  settings(),
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
