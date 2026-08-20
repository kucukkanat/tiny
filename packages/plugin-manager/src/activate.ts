import type { PluginAPI } from "@tiny/plugin";
import { compile } from "./compile.ts";
import type { Installed, InstalledPlugin } from "./installed.ts";
import { defaultModules, type HostModules } from "./runtime.ts";

export type ActivationResult = {
  readonly plugin: InstalledPlugin;
  readonly error?: string | undefined;
};

/**
 * Runs every installed plugin that is enabled and still matches its pinned
 * hash, handing each the *same* `pi` the manager itself was given — so what
 * they register lands in the app's one registry, with the same capabilities as
 * a plugin that shipped with the build.
 *
 * **They also share the manager's identity**, because `pi` carries the id that
 * `loadPlugins` assigned to the manager. So every installed plugin writes to
 * `ctx.storage` under `tiny-plugin:pluginManager:` and its errors are labelled
 * with the manager's name. Two installed plugins that both store a key called
 * `"state"` overwrite each other, and — for the same reason — two that both
 * register a panel called `"notes"` collapse into one, since a panel's id is
 * namespaced by the plugin's. Giving each its own id needs `loadPlugins` to
 * hand out a scoped `pi`, which it cannot do yet.
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
  modules: HostModules = defaultModules,
): Promise<readonly ActivationResult[]> => {
  const results: ActivationResult[] = [];
  for (const installed of store.list()) {
    if (!installed.enabled) continue;
    try {
      const plugin = await compile(await store.verifiedSource(installed), modules);
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
