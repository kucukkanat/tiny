import type { IdentifiedPlugin } from "@tiny/plugin";
import {
  createExternalStore,
  definePlugin,
  settingsComplete,
  usePluginContext,
  useStore,
} from "@tiny/plugin";
import { SettingsDialog } from "./SettingsDialog.tsx";

/** Endpoint configuration, as a plugin — built entirely on the plugin API, importing nothing from the app. */
export const settings = (): IdentifiedPlugin => {
  const open = createExternalStore(false);

  function SettingsOverlay() {
    const ctx = usePluginContext();
    const shown = useStore(open);
    // An unconfigured app forces the dialog open until an endpoint answers.
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
    tiny.registerShortcut("mod+,", {
      description: "Open settings",
      handler: () => open.set(true),
    });
    tiny.contribute("app.overlays", SettingsOverlay);
  });
};
