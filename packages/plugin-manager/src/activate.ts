import type { Dispose, PluginAPI } from "@tiny/plugin";
import { compile } from "./compile.ts";
import type { Installed, InstalledPlugin } from "./installed.ts";
import { defaultModules, type HostModules } from "./runtime.ts";

export type ActivationResult = {
  readonly plugin: InstalledPlugin;
  readonly error?: string | undefined;
  /**
   * Withdraws everything this plugin registered.
   *
   * Every installed plugin is handed the manager's own `tiny`, so the registry
   * files their registrations under `pluginManager` and cannot tell them apart.
   * Collecting the disposers as they are handed out is what draws the line back:
   * disabling one installed plugin takes out its commands and panels and nobody
   * else's, without `reload()` re-running every factory in the app.
   */
  readonly dispose: Dispose;
};

/**
 * `tiny`, plus a record of what one plugin registered through it.
 *
 * Each method is wrapped rather than the object proxied: the wrapper has to
 * return what the real one returns — the disposer the plugin may keep for
 * itself — while also keeping a copy.
 */
const recording = (tiny: PluginAPI): { readonly api: PluginAPI; readonly dispose: Dispose } => {
  const disposers: Dispose[] = [];
  const keep = (off: Dispose): Dispose => {
    disposers.push(off);
    return off;
  };

  const api: PluginAPI = {
    ...tiny,
    on: ((event: never, handler: never) => keep(tiny.on(event, handler))) as PluginAPI["on"],
    registerCommand: (name, options) => keep(tiny.registerCommand(name, options)),
    registerShortcut: (shortcut, options) => keep(tiny.registerShortcut(shortcut, options)),
    registerTool: (tool) => keep(tiny.registerTool(tool)),
    registerMarkdownTransformer: (transformer) =>
      keep(tiny.registerMarkdownTransformer(transformer)),
    contribute: (slot, component) => keep(tiny.contribute(slot, component)),
    registerPanel: (id, options) => keep(tiny.registerPanel(id, options)),
    registerRoute: (path, options) => keep(tiny.registerRoute(path, options)),
  };

  return {
    api,
    // Drained, so disabling and re-enabling does not withdraw the new
    // registrations with the old ones' disposers.
    dispose: () => {
      for (const off of disposers.splice(0)) off();
    },
  };
};

/**
 * Runs every installed plugin that is enabled and still matches its pinned
 * hash, handing each the *same* `tiny` the manager itself was given — so what
 * they register lands in the app's one registry, with the same capabilities as
 * a plugin that shipped with the build.
 *
 * **They also share the manager's identity**, because `tiny` carries the id that
 * `loadPlugins` assigned to the manager. So every installed plugin writes to
 * `ctx.storage` under `tiny-plugin:pluginManager:` and its errors are labelled
 * with the manager's name. Two installed plugins that both store a key called
 * `"state"` overwrite each other, and — for the same reason — two that both
 * register a panel called `"notes"` collapse into one, since a panel's id is
 * namespaced by the plugin's. Giving each its own id needs `loadPlugins` to
 * hand out a scoped `tiny`, which it cannot do yet.
 *
 * What the shared identity no longer costs is the ability to remove one: each
 * gets a `dispose` of its own, built from the disposers its registrations
 * returned. See `recording`.
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
  tiny: PluginAPI,
  modules: HostModules = defaultModules,
): Promise<readonly ActivationResult[]> => createActivator(store, tiny, modules).apply();

/** What a plugin has to change about itself before it is worth restarting. */
const revisionOf = (installed: InstalledPlugin): string => `${installed.id}@${installed.sha256}`;

export type Activator = {
  /**
   * Bring what is running into line with the manifest, and report on it.
   *
   * Idempotent: a plugin already running at its current revision is left alone,
   * so calling this after every change costs nothing for the plugins that did
   * not change.
   */
  apply(): Promise<readonly ActivationResult[]>;
};

/**
 * Keeps the set of running installed plugins matching the manifest.
 *
 * The reason this exists rather than a plain `activate` called again: enabling
 * or removing a plugin used to mean `ctx.reload()`, which re-runs every factory
 * in the app — the settings dialog, the filesystem tools, the approval gate —
 * to change one checkbox, and there was no alternative because a registration
 * could not be taken back. Now it can, so the reconciler withdraws exactly the
 * plugins that should stop and starts exactly the ones that should run.
 *
 * Keyed by revision, not id, so re-approving new source for an installed plugin
 * stops the old code before the new code starts.
 */
export const createActivator = (
  store: Installed,
  tiny: PluginAPI,
  modules: HostModules = defaultModules,
): Activator => {
  const running = new Map<string, Dispose>();

  const start = async (installed: InstalledPlugin): Promise<ActivationResult> => {
    const { api, dispose } = recording(tiny);
    try {
      const plugin = await compile(await store.verifiedSource(installed), modules);
      await plugin(api);
      running.set(revisionOf(installed), dispose);
      return { plugin: installed, dispose };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[plugin-manager] "${installed.name}" did not load: ${message}`);
      // Whatever it managed to register before throwing is still withdrawable,
      // and half a plugin is not something to leave running.
      dispose();
      return { plugin: installed, error: message, dispose };
    }
  };

  return {
    apply: async () => {
      const manifest = store.list();
      const wanted = new Set(manifest.filter((entry) => entry.enabled).map(revisionOf));

      // Stop first: a plugin whose source was re-approved must release its
      // command names before the new revision claims them.
      for (const [revision, dispose] of [...running]) {
        if (wanted.has(revision)) continue;
        dispose();
        running.delete(revision);
      }

      const results: ActivationResult[] = [];
      for (const installed of manifest) {
        if (!installed.enabled) continue;
        const already = running.get(revisionOf(installed));
        if (already !== undefined) {
          results.push({ plugin: installed, dispose: already });
          continue;
        }
        results.push(await start(installed));
      }
      return results;
    },
  };
};
