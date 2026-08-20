import type { Plugin } from "@tiny/plugin";
import { createExternalStore, usePluginContext } from "@tiny/plugin";
import { useSyncExternalStore } from "react";
import { SettingsDialog } from "../components/SettingsDialog.tsx";
import { settingsComplete } from "../storage/settings.ts";

/**
 * Endpoint configuration, shipped as a plugin rather than as app structure.
 *
 * This is the dogfood: the dialog reaches the screen through `app.overlays`,
 * opens through a registered command, and binds a shortcut — so the three
 * halves of the plugin API are exercised by a feature the app actually needs.
 * `App` keeps no settings state of its own, and `Sidebar`'s gear simply runs
 * the command.
 */
export const settings = (): Plugin => {
  // Open/closed lives in the plugin's own closure: the command handler and the
  // contributed component are separate call sites that need the same switch.
  const open = createExternalStore(false);

  function SettingsOverlay() {
    const ctx = usePluginContext();
    const shown = useSyncExternalStore(open.subscribe, open.get, open.get);
    // An unconfigured app has nothing to chat with, so the dialog is forced
    // open and cannot be dismissed until an endpoint answers.
    const required = !settingsComplete(ctx.settings);
    if (!shown && !required) return null;

    return (
      <SettingsDialog
        initial={ctx.settings}
        onSave={(next) => {
          ctx.updateSettings(next);
          open.set(false);
        }}
        onClose={required ? undefined : () => open.set(false)}
      />
    );
  }

  return function settings(pi) {
    pi.registerCommand("settings", {
      description: "Configure the endpoint",
      handler: () => open.set(true),
    });
    // pi's modifier set has no `mod`; `super` is Cmd on macOS.
    pi.registerShortcut("super+,", { description: "Open settings", handler: () => open.set(true) });
    pi.registerShortcut("ctrl+,", { description: "Open settings", handler: () => open.set(true) });
    pi.contribute("app.overlays", SettingsOverlay);
  };
};
