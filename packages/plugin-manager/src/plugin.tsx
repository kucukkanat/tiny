import type { IdentifiedPlugin } from "@tiny/plugin";
import { createExternalStore, definePlugin, useStore } from "@tiny/plugin";
import { type Activator, createActivator } from "./activate.ts";
import { type InstalledOptions, openInstalled } from "./installed.ts";
import { ManagerDialog } from "./ManagerDialog.tsx";
import { hostModules } from "./runtime.ts";

export type PluginManagerOptions = InstalledOptions;

/**
 * A plugin that installs other plugins. Installed plugins run through this
 * plugin's own `tiny`, with the same full page access as bundled code.
 */
export const pluginManager = (options: PluginManagerOptions = {}): IdentifiedPlugin => {
  const store = openInstalled(options);
  // Resolved once, so install-time validation and every later load use the same module set.
  const modules = hostModules(options.modules);

  const open = createExternalStore(false);

  // Set when the factory runs, which is before any UI can render.
  let activator: Activator | undefined;

  function ManagerOverlay() {
    const shown = useStore(open);
    if (!shown) return null;

    return (
      <ManagerDialog
        store={store}
        onChanged={async () => void (await activator?.apply())}
        onClose={() => open.set(false)}
      />
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

  // `after: ["*"]` is load-bearing: an installed plugin that loads first could
  // claim the `plugins` command, leaving the user no way in to remove it.
  return definePlugin("pluginManager", { after: ["*"] }, async (tiny) => {
    tiny.registerCommand("plugins", {
      description: "Add and manage plugins",
      handler: () => open.set(true),
    });
    tiny.registerShortcut("mod+shift+p", {
      description: "Manage plugins",
      handler: () => open.set(true),
    });
    tiny.contribute("app.overlays", ManagerOverlay);
    tiny.contribute("sidebar.footer", ManagerButton);

    activator = createActivator(store, tiny, modules);
    await activator.apply();
  });
};
