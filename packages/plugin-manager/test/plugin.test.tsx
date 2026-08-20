import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PluginHost, Slot, usePluginHost } from "@tiny/plugin";
import { memoryRoot } from "@tiny/plugin-fs/testing";
import { memoryManifest } from "../src/inMemoryManifest.ts";
import { type Installed, type InstalledOptions, openInstalled } from "../src/installed.ts";
import { pluginManager } from "../src/plugin.tsx";

// End to end, in the host the app uses: open the dialog from the sidebar,
// install source, and watch the command it registers become live — no page
// reload, no rebuild.

afterEach(() => {
  cleanup();
  host = undefined;
});

const HELLO = 'export default (tiny) => tiny.registerCommand("hello", { handler: () => {} });';

let host: ReturnType<typeof usePluginHost> | undefined;
function Probe() {
  host = usePluginHost();
  return null;
}

let options: InstalledOptions;
let store: Installed;

beforeEach(() => {
  const disk = memoryRoot();
  options = { root: () => Promise.resolve(disk), manifest: memoryManifest() };
  store = openInstalled(options);
  host = undefined;
});

const mount = async () => {
  // The manager's factory is async, so the registry lands a microtask after the
  // first paint — rendering inside `act` keeps that update in the act scope.
  await act(async () => {
    render(
      <PluginHost plugins={[pluginManager(options)]}>
        <Probe />
        <Slot name="sidebar.footer" />
        <Slot name="app.overlays" />
      </PluginHost>,
    );
  });
  await waitFor(() => expect(host?.commands.length).toBeGreaterThan(0));
};

const commandNames = () => host?.commands.map((command) => command.name) ?? [];

describe("in the host", () => {
  test("puts a way in on the sidebar and opens the dialog", async () => {
    await mount();
    expect(screen.queryByTestId("plugin-manager")).toBeNull();

    fireEvent.click(screen.getByTestId("open-plugins"));
    expect(await screen.findByTestId("plugin-manager")).toBeTruthy();
  });

  test("the `plugins` command opens it too", async () => {
    await mount();
    await act(async () => {
      await host?.runCommand("plugins");
    });
    expect(await screen.findByTestId("plugin-manager")).toBeTruthy();
  });

  test("a plugin installed through the dialog is registered without a page reload", async () => {
    await mount();
    expect(commandNames()).toEqual(["plugins"]);

    fireEvent.click(screen.getByTestId("open-plugins"));
    fireEvent.click(await screen.findByTestId("mode-paste"));
    fireEvent.change(screen.getByTestId("add-source"), { target: { value: HELLO } });
    fireEvent.click(screen.getByTestId("review-plugin"));
    fireEvent.change(await screen.findByTestId("review-name"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByTestId("confirm-install"));

    await waitFor(() => expect(commandNames()).toEqual(["plugins", "hello"]));
  });

  test("disabling one takes its command away again", async () => {
    await store.install({ name: "Hello", source: HELLO });
    await mount();
    expect(commandNames()).toEqual(["plugins", "hello"]);

    fireEvent.click(screen.getByTestId("open-plugins"));
    fireEvent.click(await screen.findByTestId("toggle-Hello"));

    await waitFor(() => expect(commandNames()).toEqual(["plugins"]));
  });
});
