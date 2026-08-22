import type { Dispose, PluginAPI } from "@tiny/plugin";
import { compile } from "./compile.ts";
import type { Installed, InstalledPlugin } from "./installed.ts";
import { defaultModules, type HostModules } from "./runtime.ts";

export type ActivationResult = {
  readonly plugin: InstalledPlugin;
  readonly error?: string | undefined;
  /** Withdraws everything this plugin registered, without a full reload. */
  readonly dispose: Dispose;
};

// `tiny`, with each registering method wrapped to keep a copy of the disposer it returns.
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
    // Drained, so re-enabling does not withdraw new registrations with old disposers.
    dispose: () => {
      for (const off of disposers.splice(0)) off();
    },
  };
};

/**
 * Runs every enabled installed plugin that still matches its pinned hash, handing each
 * the manager's own `tiny` — full app access, and the manager's shared identity/storage.
 */
export const activate = async (
  store: Installed,
  tiny: PluginAPI,
  modules: HostModules = defaultModules,
): Promise<readonly ActivationResult[]> => createActivator(store, tiny, modules).apply();

/** What a plugin has to change about itself before it is worth restarting. */
const revisionOf = (installed: InstalledPlugin): string => `${installed.id}@${installed.sha256}`;

export type Activator = {
  /** Bring what is running into line with the manifest; idempotent per revision. */
  apply(): Promise<readonly ActivationResult[]>;
};

/**
 * Keeps the set of running installed plugins matching the manifest. Keyed by
 * revision, not id, so re-approving new source stops the old code first.
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
      // Withdraw whatever it managed to register before throwing.
      dispose();
      return { plugin: installed, error: message, dispose };
    }
  };

  return {
    apply: async () => {
      const manifest = store.list();
      const wanted = new Set(manifest.filter((entry) => entry.enabled).map(revisionOf));

      // Stop first: a re-approved plugin must release its names before the new revision claims them.
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
