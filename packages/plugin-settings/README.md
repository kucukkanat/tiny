# @tiny/plugin-settings

The endpoint configuration dialog, as a plugin.

This is the dogfood. The dialog reaches the screen through `app.overlays`, opens
through a registered command and two shortcuts, and reads and writes the endpoint
through `ctx.settings` / `ctx.updateSettings`. **It imports nothing from any
app** — so if a feature this central can be built from outside, the plugin API is
sufficient, and if it ever stops being sufficient this package stops compiling.

The host supplies the value and persists it; this package supplies the UI. An
unconfigured app gets the dialog forced open and undismissable, because there is
nothing to chat with until an endpoint answers.

## Usage

`examples/mount-the-dialog.tsx`:

```tsx path=packages/plugin-settings/examples/mount-the-dialog.tsx
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
```

## Test

```sh
bun test
```
