import { describe, expect, test } from "bun:test";
import { loadPlugins } from "@tiny/plugin";
import { chatEndpoint } from "../../../test/helpers.ts";
import { plugins } from "../src/plugins.ts";

// Driven through streamChat against a real OpenAI-compatible server, so these
// run through pi-shaped registration and the actual request path rather than
// through a stand-in host.

const { sentMessages, stream: run } = chatEndpoint();

// The app's plugin file is a list of packages. What each does is tested in the
// package that owns it; what is tested here is the list this app ships.

describe("registry", () => {
  test("ships observers only, leaving the request byte-identical", async () => {
    await run([]);
    const baseline = sentMessages();
    // The registry holds plugins, so it reaches streamChat the way the app
    // sends it: through the host, which replays the recorded `on()` calls.
    await run(plugins);
    expect(sentMessages()).toEqual(baseline);
  });

  test("wires the settings dialog in, so the app owns no settings UI of its own", async () => {
    const { commands, contributions } = await loadPlugins(plugins);

    expect(commands.some((command) => command.name === "settings")).toBe(true);
    expect(contributions.some((entry) => entry.slot === "app.overlays")).toBe(true);
  });
});
