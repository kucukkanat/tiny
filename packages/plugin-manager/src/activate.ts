import type { PluginAPI } from "@tiny/plugin";
import { compile } from "./compile.ts";
import type { Installed, InstalledPlugin } from "./installed.ts";

export type ActivationResult = {
  readonly plugin: InstalledPlugin;
  readonly error?: string | undefined;
};

/**
 * Runs every installed plugin that is enabled and still matches its pinned
 * hash, handing each the *same* `pi` the manager itself was given — so what
 * they register lands in the app's one registry, indistinguishable from a
 * plugin that shipped with the build.
 *
 * This is called from inside the manager's own factory, which `loadPlugins`
 * awaits; that is the whole trick, and why no change to the host was needed to
 * load code at runtime.
 *
 * A plugin that throws is reported and skipped. One bad plugin must not cost
 * the user the others, or the manager UI they need to remove it with.
 */
export const activate = async (
  store: Installed,
  pi: PluginAPI,
): Promise<readonly ActivationResult[]> => {
  const results: ActivationResult[] = [];
  for (const installed of store.list()) {
    if (!installed.enabled) continue;
    try {
      const plugin = await compile(await store.verifiedSource(installed));
      await plugin(pi);
      results.push({ plugin: installed });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[plugin-manager] "${installed.name}" did not load: ${message}`);
      results.push({ plugin: installed, error: message });
    }
  }
  return results;
};
