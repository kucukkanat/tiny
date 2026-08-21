import type { IdentifiedPlugin } from "@tiny/plugin";
import {
  createExternalStore,
  definePlugin,
  settingsComplete,
  usePluginContext,
  useStore,
} from "@tiny/plugin";
import { SettingsDialog } from "./SettingsDialog.tsx";

/**
 * Endpoint configuration, as a plugin.
 *
 * This is the dogfood, and it lives outside the app on purpose: the dialog
 * reaches the screen through `app.overlays`, opens through a registered command
 * and a shortcut, and reads and writes the endpoint through `ctx.settings` and
 * `ctx.updateSettings`. Nothing here imports the app. If a feature this central
 * can be built from outside, the plugin API is sufficient — and if it ever stops
 * being sufficient, this package stops compiling.
 */
export const settings = (): IdentifiedPlugin => {
  // Open/closed lives in the plugin's own closure: the command handler and the
  // contributed component are separate call sites that need the same switch.
  const open = createExternalStore(false);

  function SettingsOverlay() {
    const ctx = usePluginContext();
    const shown = useStore(open);
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

  return definePlugin("settings", { needs: ["settings"] }, (tiny) => {
    tiny.registerCommand("settings", {
      description: "Configure the endpoint",
      handler: () => open.set(true),
    });
    // pi's modifier set has no `mod`; `super` is Cmd on macOS.
    tiny.registerShortcut("super+,", {
      description: "Open settings",
      handler: () => open.set(true),
    });
    tiny.registerShortcut("ctrl+,", {
      description: "Open settings",
      handler: () => open.set(true),
    });
    tiny.contribute("app.overlays", SettingsOverlay);
  });
};
