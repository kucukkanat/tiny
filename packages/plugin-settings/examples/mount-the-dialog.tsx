import type { PluginSettings } from "@tiny/plugin";
import { PluginHost, Slot, useProvideApp } from "@tiny/plugin";
import { settings } from "@tiny/plugin-settings";
import { useMemo, useState } from "react";

// The plugin owns the dialog; the app owns where the endpoint is persisted.
// They meet at `ctx.settings` / `ctx.updateSettings`, so this package imports
// nothing from any app.
function Host() {
  const [saved, setSaved] = useState<PluginSettings | undefined>(undefined);

  useProvideApp(
    useMemo(
      () => ({
        messages: [],
        streaming: undefined,
        settings: saved,
        signal: undefined,
        send: () => {},
        stop: () => {},
        updateSettings: setSaved,
        navigate: () => {},
      }),
      [saved],
    ),
  );

  // Unconfigured, the dialog opens itself and cannot be dismissed.
  return <Slot name="app.overlays" />;
}

export const App = () => (
  <PluginHost plugins={[settings()]}>
    <Host />
  </PluginHost>
);
