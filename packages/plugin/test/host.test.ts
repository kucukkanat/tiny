import { describe, expect, test } from "bun:test";
import type { Extension, ExtensionAPI } from "@tiny/ai";
import { loadPlugins } from "../src/host.ts";
import { matchesKey } from "../src/keys.ts";
import { identityTheme } from "../src/theme.ts";
import type { Plugin } from "../src/types.ts";

/** Collect what a synthesised extension registers, the way streamChat would. */
const replayed = (extensions: readonly Extension[]): string[] => {
  const events: string[] = [];
  const api = { on: (event: string) => events.push(event) } as unknown as ExtensionAPI;
  for (const extension of extensions) void extension(api);
  return events;
};

describe("loadPlugins", () => {
  test("runs factories in array order", async () => {
    const order: string[] = [];
    const mark =
      (name: string): Plugin =>
      () => {
        order.push(name);
      };
    await loadPlugins([mark("first"), mark("second"), mark("third")]);
    expect(order).toEqual(["first", "second", "third"]);
  });

  test("awaits an async factory before the next one runs", async () => {
    const order: string[] = [];
    const slow: Plugin = async () => {
      await Bun.sleep(5);
      order.push("slow");
    };
    const fast: Plugin = () => {
      order.push("fast");
    };
    await loadPlugins([slow, fast]);
    expect(order).toEqual(["slow", "fast"]);
  });

  test("replays recorded on() calls in registration order", async () => {
    const plugin: Plugin = (pi) => {
      pi.on("context", () => {});
      pi.on("message_end", () => {});
    };
    const { extensions } = await loadPlugins([plugin]);
    expect(replayed(extensions)).toEqual(["context", "message_end"]);
  });

  test("replay is idempotent, so every request gets the same handlers", async () => {
    const plugin: Plugin = (pi) => {
      pi.on("context", () => {});
    };
    const { extensions } = await loadPlugins([plugin]);
    expect(replayed(extensions)).toEqual(replayed(extensions));
  });

  test("accepts pi events this facade never fires, and drops them from replay", async () => {
    const plugin: Plugin = (pi) => {
      pi.on("session_start", () => {});
      pi.on("tool_call", () => {});
      pi.on("context", () => {});
    };
    const { extensions } = await loadPlugins([plugin]);
    // Registering did not throw, and only the event @tiny/ai emits is replayed.
    expect(replayed(extensions)).toEqual(["context"]);
  });

  test("produces no extension when nothing subscribes", async () => {
    const { extensions } = await loadPlugins([(pi) => pi.contribute("app.overlays", () => null)]);
    expect(extensions).toEqual([]);
  });

  test("a throwing factory rejects, as in pi", async () => {
    const boom: Plugin = () => {
      throw new Error("bad plugin");
    };
    expect(loadPlugins([boom])).rejects.toThrow("bad plugin");
  });
});

describe("command registration", () => {
  test("keeps a single registration unsuffixed", async () => {
    const plugin: Plugin = (pi) => pi.registerCommand("review", { handler: () => {} });
    const { commands } = await loadPlugins([plugin]);
    expect(commands.map((c) => c.invocationName)).toEqual(["review"]);
  });

  test("suffixes duplicates in load order, as pi does", async () => {
    const claim = (): Plugin => (pi) => pi.registerCommand("review", { handler: () => {} });
    const { commands } = await loadPlugins([claim(), claim(), claim()]);
    expect(commands.map((c) => c.invocationName)).toEqual(["review:1", "review:2", "review:3"]);
    expect(commands.every((c) => c.name === "review")).toBe(true);
  });

  test("namespaces each registration by its plugin", async () => {
    function alpha(pi: Parameters<Plugin>[0]) {
      pi.registerCommand("a", { handler: () => {} });
    }
    function beta(pi: Parameters<Plugin>[0]) {
      pi.registerCommand("b", { handler: () => {} });
    }
    const { commands } = await loadPlugins([alpha, beta]);
    expect(commands.map((c) => c.pluginId)).toEqual(["alpha", "beta"]);
  });
});

describe("contributions and shortcuts", () => {
  test("records the slot, component and owning plugin", async () => {
    const Button = () => null;
    function toolbar(pi: Parameters<Plugin>[0]) {
      pi.contribute("composer.actions", Button);
      pi.registerShortcut("ctrl+k", { handler: () => {} });
    }
    const { contributions, shortcuts } = await loadPlugins([toolbar]);
    expect(contributions).toEqual([
      { id: "toolbar#0", slot: "composer.actions", pluginId: "toolbar", component: Button },
    ]);
    expect(shortcuts[0]?.shortcut).toBe("ctrl+k");
    expect(shortcuts[0]?.pluginId).toBe("toolbar");
  });
});

describe("matchesKey", () => {
  // A real KeyboardEvent always carries all four modifier booleans.
  const event = (init: Partial<KeyboardEvent> & { key: string }) =>
    ({ ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...init }) as KeyboardEvent;

  test("matches a bare key", () => {
    expect(matchesKey(event({ key: "k" }), "k")).toBe(true);
  });

  test("requires every modifier to agree", () => {
    expect(matchesKey(event({ key: "k", ctrlKey: true }), "ctrl+k")).toBe(true);
    // ctrl+k must not fire when shift is also held.
    expect(matchesKey(event({ key: "K", ctrlKey: true, shiftKey: true }), "ctrl+k")).toBe(false);
    expect(matchesKey(event({ key: "k" }), "ctrl+k")).toBe(false);
  });

  test("maps super to the meta key, pi's Cmd", () => {
    expect(matchesKey(event({ key: ",", metaKey: true }), "super+,")).toBe(true);
    expect(matchesKey(event({ key: ",", ctrlKey: true }), "super+,")).toBe(false);
  });

  test("treats pi's key aliases as equal", () => {
    expect(matchesKey(event({ key: "Escape" }), "esc")).toBe(true);
    expect(matchesKey(event({ key: "Enter" }), "return")).toBe(true);
    expect(matchesKey(event({ key: "ArrowUp" }), "up")).toBe(true);
  });
});

describe("identityTheme", () => {
  test("returns text unstyled rather than throwing, so pi styling degrades", () => {
    expect(identityTheme.fg("accent", "●")).toBe("●");
    expect(identityTheme.bold("hi")).toBe("hi");
    expect(identityTheme.getFgAnsi("accent")).toBe("");
  });
});
