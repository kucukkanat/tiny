import type { Plugin } from "@tiny/plugin";
import { PluginManagerError } from "./errors.ts";

/**
 * Turns plugin source into a callable plugin.
 *
 * The source is imported as a real ES module through a blob URL, so it gets
 * module scope, top-level await and `import` of anything the page can reach —
 * the same thing a bundled plugin gets. There is no sandbox here and there
 * cannot be one: a plugin renders React into the app and calls the same APIs
 * the app does. The trust decision happens before this is ever called, in the
 * manifest; see `installed.ts`.
 */
export const compile = async (source: string): Promise<Plugin> => {
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  try {
    const module: unknown = await import(/* @vite-ignore */ url).catch((error: unknown) => {
      throw new PluginManagerError(
        `The source is not a loadable module: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    const factory = (module as { default?: unknown }).default;
    if (typeof factory !== "function")
      throw new PluginManagerError("A plugin module must `export default` a function");
    return factory as Plugin;
  } finally {
    // The module is fully loaded by now, so the URL has done its job.
    URL.revokeObjectURL(url);
  }
};
