import type { IdentifiedPlugin } from "@tiny/plugin";
import { createExternalStore, definePlugin, usePluginContext, useStore } from "@tiny/plugin";
import { activate } from "./activate.ts";
import { type InstalledOptions, openInstalled } from "./installed.ts";
import { ManagerDialog } from "./ManagerDialog.tsx";
import { hostModules } from "./runtime.ts";

export type PluginManagerOptions = InstalledOptions;

/**
 * A plugin that installs other plugins.
 *
 * Its factory is `async`, and `loadPlugins` awaits each factory — so by the
 * time the host has a registry, everything installed at runtime has already
 * registered into it through the same `tiny`. A plugin the user pasted in can do
 * everything one that shipped with the build can — including, for now, sharing
 * this plugin's storage namespace. See `activate.ts`.
 *
 * Adding, enabling or removing calls `ctx.reload()`, which rebuilds the whole
 * registry: that is what makes a removed plugin actually stop running, since
 * registrations have no undo of their own.
 */
export const pluginManager = (options: PluginManagerOptions = {}): IdentifiedPlugin => {
  const store = openInstalled(options);
  // Resolved once, so the set a plugin is validated against at install time is
  // exactly the set it is compiled against on every later load.
  const modules = hostModules(options.modules);

  // Open/closed lives in the factory's closure, the same arrangement the
  // settings plugin uses: the command handler, the sidebar button and the
  // overlay are three call sites that need one switch. It survives `reload()`,
  // so the dialog stays open while plugins are being added.
  const open = createExternalStore(false);

  function ManagerOverlay() {
    const ctx = usePluginContext();
    const shown = useStore(open);
    if (!shown) return null;

    return (
      <ManagerDialog store={store} onChanged={() => ctx.reload()} onClose={() => open.set(false)} />
    );
  }

  function ManagerButton() {
    return (
      <button
        type="button"
        data-testid="open-plugins"
        title="Plugins"
        onClick={() => open.set(true)}
        className="flex h-8 w-full items-center gap-1.5 rounded-control px-2 text-ink-2 hover:bg-hover-2"
      >
        <span aria-hidden className="shrink-0 text-base">
          ⊞
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-md font-medium">Plugins</span>
      </button>
    );
  }

  return definePlugin("pluginManager", async (tiny) => {
    // Registered before the stored plugins run, so an installed plugin cannot
    // claim the `plugins` command name and push this one to `plugins:2` —
    // leaving the user no way in to remove it.
    tiny.registerCommand("plugins", {
      description: "Add and manage plugins",
      handler: () => open.set(true),
    });
    tiny.registerShortcut("super+shift+p", {
      description: "Manage plugins",
      handler: () => open.set(true),
    });
    tiny.registerShortcut("ctrl+shift+p", {
      description: "Manage plugins",
      handler: () => open.set(true),
    });
    tiny.contribute("app.overlays", ManagerOverlay);
    tiny.contribute("sidebar.footer", ManagerButton);

    await activate(store, tiny, modules);
  });
};
