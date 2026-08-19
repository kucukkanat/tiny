import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { loadPlugins, PluginHost, Slot, usePluginHost, useProvideApp } from "@tiny/plugin";
import { useMemo, useState } from "react";
import { plugins } from "../src/plugins/index.ts";
import { settings as settingsPlugin } from "../src/plugins/settings.tsx";
import type { Settings } from "../src/storage/settings.ts";

// Settings ships as a plugin, so the dialog reaches the screen through
// `app.overlays` and opens through a registered command. These drive the real
// plugin, not a stand-in, so the dogfood keeps working.

afterEach(cleanup);

const configured: Settings = { baseUrl: "https://example.test/v1", apiKey: "sk", model: "m" };

let host: ReturnType<typeof usePluginHost> | undefined;

/** A minimal stand-in for `App`: publishes settings and renders the overlay slot. */
function Harness({ initial }: { initial: Settings | undefined }) {
  const [current, setCurrent] = useState(initial);
  host = usePluginHost();

  useProvideApp(
    useMemo(
      () => ({
        messages: [],
        streaming: undefined,
        settings: current,
        signal: undefined,
        send: () => {},
        stop: () => {},
        updateSettings: setCurrent,
        navigate: () => {},
      }),
      [current],
    ),
  );

  return <Slot name="app.overlays" />;
}

const mount = async (initial: Settings | undefined) => {
  host = undefined;
  render(
    <PluginHost plugins={[settingsPlugin()]}>
      <Harness initial={initial} />
    </PluginHost>,
  );
  await waitFor(() => expect(host?.registry.contributions.length).toBe(1));
};

describe("settings as a plugin", () => {
  test("stays closed once an endpoint is configured", async () => {
    await mount(configured);
    expect(screen.queryByLabelText("Base URL")).toBeNull();
  });

  test("opens on the settings command", async () => {
    await mount(configured);

    await act(async () => {
      await host?.runCommand("settings");
    });
    await waitFor(() => expect(screen.getByLabelText("Base URL")).toBeDefined());
  });

  test("forces itself open, undismissably, until an endpoint is set", async () => {
    await mount(undefined);
    // No command run: an unconfigured app has nothing to chat with.
    await waitFor(() => expect(screen.getByLabelText("Base URL")).toBeDefined());
    expect(screen.queryByLabelText("Close")).toBeNull();
  });

  test("registers the command and both shortcuts", async () => {
    const { commands, shortcuts } = await loadPlugins([settingsPlugin()]);
    expect(commands.map((command) => command.invocationName)).toEqual(["settings"]);
    expect(shortcuts.map((shortcut) => shortcut.shortcut)).toEqual(["super+,", "ctrl+,"]);
  });

  test("is wired into the app's registry", async () => {
    const { commands, contributions } = await loadPlugins(plugins);
    expect(commands.some((command) => command.name === "settings")).toBe(true);
    expect(contributions.some((entry) => entry.slot === "app.overlays")).toBe(true);
  });
});
