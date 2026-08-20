import { describe, expect, test } from "bun:test";
import type { Extension, ExtensionAPI } from "@tiny/ai";
import { matchesKey } from "../src/keys.ts";
import type { Plugin } from "../src/pi.ts";
import { definePlugin } from "../src/pi.ts";
import { loadPlugins } from "../src/registry.ts";
import { identityTheme } from "../src/theme.ts";

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
      pi.on("turn_end", () => {});
      pi.on("context", () => {});
    };
    const { extensions } = await loadPlugins([plugin]);
    // Registering did not throw, and only the event @tiny/ai emits is replayed.
    expect(replayed(extensions)).toEqual(["context"]);
  });

  test("replays tool_call, which @tiny/ai does fire", async () => {
    const plugin: Plugin = (pi) => {
      pi.on("tool_call", () => ({ block: true }));
    };
    const { extensions } = await loadPlugins([plugin]);
    expect(replayed(extensions)).toEqual(["tool_call"]);
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
    const alpha = definePlugin("alpha", (pi) => {
      pi.registerCommand("a", { handler: () => {} });
    });
    const beta = definePlugin("beta", (pi) => {
      pi.registerCommand("b", { handler: () => {} });
    });
    const { commands } = await loadPlugins([alpha, beta]);
    expect(commands.map((c) => c.pluginId)).toEqual(["alpha", "beta"]);
  });
});

describe("plugin identity", () => {
  test("comes from the declared id, not the function's name", async () => {
    // `Function.name` is the obvious source and the wrong one: every minifier
    // erases it, so a plugin identified that way would be namespaced one way in
    // development and another in the build users run — silently relocating the
    // storage under `tiny-plugin:<id>:`. The name here is deliberately a lie.
    const misnamed = definePlugin("real-id", function wrongName(pi) {
      pi.registerCommand("x", { handler: () => {} });
    });

    const { commands } = await loadPlugins([misnamed]);

    expect(commands[0]?.pluginId).toBe("real-id");
  });

  test("falls back to its position when no id is declared", async () => {
    const { commands } = await loadPlugins([
      (pi) => pi.registerCommand("y", { handler: () => {} }),
    ]);

    expect(commands[0]?.pluginId).toBe("plugin-0");
  });
});

describe("contributions and shortcuts", () => {
  test("records the slot, component and owning plugin", async () => {
    const Button = () => null;
    const toolbar = definePlugin("toolbar", (pi) => {
      pi.contribute("composer.actions", Button);
      pi.registerShortcut("ctrl+k", { handler: () => {} });
    });
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

describe("the context event handlers receive", () => {
  /** Pull one handler out of the synthesised extension and call it. */
  const fire = async (plugin: Plugin, event: unknown) => {
    const { extensions } = await loadPlugins([plugin]);
    let handler: ((event: unknown, ctx: unknown) => unknown) | undefined;
    const api = {
      on: (_event: string, registered: (event: unknown, ctx: unknown) => unknown) => {
        handler = registered;
      },
    } as unknown as ExtensionAPI;
    for (const extension of extensions) await extension(api);
    // `@tiny/ai` supplies only this half; the plugin half is the host's job.
    return await handler?.(event, { model: undefined, signal: undefined });
  };

  test("without a host, ui is present but hasUI is false — pi's print mode", async () => {
    let saw: { hasUI: boolean; confirmed: boolean } | undefined;
    const plugin: Plugin = (pi) => {
      pi.on("tool_call", async (_event, ctx) => {
        saw = { hasUI: ctx.hasUI, confirmed: await ctx.ui.confirm("Run it?", "really?") };
      });
    };

    await fire(plugin, { type: "tool_call", toolCallId: "c1", toolName: "x", input: {} });
    // pi's dismissal value, so a gate written for pi fails closed rather than
    // crashing on a missing method.
    expect(saw).toEqual({ hasUI: false, confirmed: false });
  });

  test("the request's own model and signal win over the plugin context", async () => {
    const signal = AbortSignal.abort();
    let saw: unknown;
    const plugin: Plugin = (pi) => {
      pi.on("tool_call", (_event, ctx) => {
        saw = ctx.signal;
      });
    };
    const { extensions } = await loadPlugins([plugin]);
    let handler: ((event: unknown, ctx: unknown) => unknown) | undefined;
    const api = {
      on: (_event: string, registered: (event: unknown, ctx: unknown) => unknown) => {
        handler = registered;
      },
    } as unknown as ExtensionAPI;
    for (const extension of extensions) await extension(api);
    await handler?.({ type: "tool_call" }, { model: undefined, signal });
    expect(saw).toBe(signal);
  });
});
