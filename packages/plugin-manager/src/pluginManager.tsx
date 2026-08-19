import type { Plugin } from "@tiny/plugin";
import { usePluginContext } from "@tiny/plugin";
import { useSyncExternalStore } from "react";
import { activate } from "./activate.ts";
import { ManagerDialog } from "./Manager.tsx";
import { createStore, type StoreOptions } from "./store.ts";

export type PluginManagerOptions = StoreOptions;

/**
 * A plugin that installs other plugins.
 *
 * Its factory is `async`, and `loadPlugins` awaits each factory — so by the
 * time the host has a registry, everything installed at runtime has already
 * registered into it through the same `pi`. Nothing distinguishes a plugin the
 * user pasted in from one that shipped with the build.
 *
 * Adding, enabling or removing calls `ctx.reload()`, which rebuilds the whole
 * registry: that is what makes a removed plugin actually stop running, since
 * registrations have no undo of their own.
 */
export const pluginManager = (options: PluginManagerOptions = {}): Plugin => {
  const store = createStore(options);

  // Open/closed lives in the factory's closure, the same arrangement the
  // settings plugin uses: the command handler, the sidebar button and the
  // overlay are three call sites that need one switch. It survives `reload()`,
  // so the dialog stays open while plugins are being added.
  let open = false;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const isOpen = () => open;
  const setOpen = (next: boolean) => {
    open = next;
    for (const listener of listeners) listener();
  };

  function ManagerOverlay() {
    const ctx = usePluginContext();
    const shown = useSyncExternalStore(subscribe, isOpen, isOpen);
    if (!shown) return null;

    return (
      <ManagerDialog store={store} onChanged={() => ctx.reload()} onClose={() => setOpen(false)} />
    );
  }

  function ManagerButton() {
    return (
      <button
        type="button"
        data-testid="open-plugins"
        title="Plugins"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full items-center gap-1.5 rounded-control px-2 text-ink-2 hover:bg-hover-2"
      >
        <span aria-hidden className="shrink-0 text-[13px]">
          ⊞
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-[13.5px] font-medium">Plugins</span>
      </button>
    );
  }

  return async (pi) => {
    // Registered before the stored plugins run, so an installed plugin cannot
    // claim the `plugins` command name and push this one to `plugins:2` —
    // leaving the user no way in to remove it.
    pi.registerCommand("plugins", {
      description: "Add and manage plugins",
      handler: () => setOpen(true),
    });
    pi.registerShortcut("super+shift+p", {
      description: "Manage plugins",
      handler: () => setOpen(true),
    });
    pi.registerShortcut("ctrl+shift+p", {
      description: "Manage plugins",
      handler: () => setOpen(true),
    });
    pi.contribute("app.overlays", ManagerOverlay);
    pi.contribute("sidebar.footer", ManagerButton);

    await activate(store, pi);
  };
};
