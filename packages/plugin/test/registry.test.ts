import { describe, expect, mock, test } from "bun:test";
import type { Extension, ExtensionAPI } from "@tiny/ai";
import { matchesKey } from "../src/keys.ts";
import { loadPlugins } from "../src/registry.ts";
import { identityTheme } from "../src/theme.ts";
import type { Plugin } from "../src/tiny.ts";
import { definePlugin, piExtension } from "../src/tiny.ts";

/**
 * Runs `body` with `console.error` captured, returning what it reported.
 *
 * The registry drops a clashing or malformed registration rather than throwing,
 * so this line is the whole of the feedback a plugin author gets — which makes
 * it part of the contract rather than noise, and worth asserting.
 */
const reported = async (body: () => Promise<void>): Promise<string[]> => {
  const lines: string[] = [];
  const original = console.error;
  console.error = mock((...args: unknown[]) => void lines.push(args.join(" ")));
  try {
    await body();
  } finally {
    console.error = original;
  }
  return lines;
};

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
    const plugin: Plugin = (tiny) => {
      tiny.on("context", () => {});
      tiny.on("message_end", () => {});
    };
    const { extensions } = await loadPlugins([plugin]);
    expect(replayed(extensions)).toEqual(["context", "message_end"]);
  });

  test("replay is idempotent, so every request gets the same handlers", async () => {
    const plugin: Plugin = (tiny) => {
      tiny.on("context", () => {});
    };
    const { extensions } = await loadPlugins([plugin]);
    expect(replayed(extensions)).toEqual(replayed(extensions));
  });

  test("accepts pi events this facade never fires, and drops them from replay", async () => {
    // `piExtension`, not a bare factory: the unfired names are off the surface
    // a new plugin sees, and reachable only by asking for pi's wider one.
    const plugin = piExtension((tiny) => {
      tiny.on("session_start", () => {});
      tiny.on("turn_end", () => {});
      tiny.on("context", () => {});
    });
    const { extensions } = await loadPlugins([plugin]);
    // Registering did not throw, and only the event @tiny/ai emits is replayed.
    expect(replayed(extensions)).toEqual(["context"]);
  });

  test("replays tool_call, which @tiny/ai does fire", async () => {
    const plugin: Plugin = (tiny) => {
      tiny.on("tool_call", () => ({ block: true }));
    };
    const { extensions } = await loadPlugins([plugin]);
    expect(replayed(extensions)).toEqual(["tool_call"]);
  });

  test("produces no extension when nothing subscribes", async () => {
    const { extensions } = await loadPlugins([
      (tiny) => tiny.contribute("app.overlays", () => null),
    ]);
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
    const plugin: Plugin = (tiny) => tiny.registerCommand("review", { handler: () => {} });
    const { commands } = await loadPlugins([plugin]);
    expect(commands.map((c) => c.invocationName)).toEqual(["review"]);
  });

  test("suffixes duplicates in load order, as pi does", async () => {
    const claim = (): Plugin => (tiny) => tiny.registerCommand("review", { handler: () => {} });
    const { commands } = await loadPlugins([claim(), claim(), claim()]);
    expect(commands.map((c) => c.invocationName)).toEqual(["review:1", "review:2", "review:3"]);
    expect(commands.every((c) => c.name === "review")).toBe(true);
  });

  test("namespaces each registration by its plugin", async () => {
    const alpha = definePlugin("alpha", (tiny) => {
      tiny.registerCommand("a", { handler: () => {} });
    });
    const beta = definePlugin("beta", (tiny) => {
      tiny.registerCommand("b", { handler: () => {} });
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
    const misnamed = definePlugin("real-id", function wrongName(tiny) {
      tiny.registerCommand("x", { handler: () => {} });
    });

    const { commands } = await loadPlugins([misnamed]);

    expect(commands[0]?.pluginId).toBe("real-id");
  });

  test("falls back to its position when no id is declared", async () => {
    const { commands } = await loadPlugins([
      (tiny) => tiny.registerCommand("y", { handler: () => {} }),
    ]);

    expect(commands[0]?.pluginId).toBe("plugin-0");
  });
});

describe("contributions and shortcuts", () => {
  test("records the slot, component and owning plugin", async () => {
    const Button = () => null;
    const toolbar = definePlugin("toolbar", (tiny) => {
      tiny.contribute("composer.actions", Button);
      tiny.registerShortcut("ctrl+k", { handler: () => {} });
    });
    const { contributions, shortcuts } = await loadPlugins([toolbar]);
    expect(contributions).toEqual([
      { id: "toolbar#0", slot: "composer.actions", pluginId: "toolbar", component: Button },
    ]);
    expect(shortcuts[0]?.shortcut).toBe("ctrl+k");
    expect(shortcuts[0]?.pluginId).toBe("toolbar");
  });
});

describe("panels", () => {
  test('namespaces the id, so two plugins may both register "notes"', async () => {
    const Left = () => null;
    const Right = () => null;
    const { panels } = await loadPlugins([
      definePlugin("a", (tiny) => tiny.registerPanel("notes", { title: "A", component: Left })),
      definePlugin("b", (tiny) => tiny.registerPanel("notes", { title: "B", component: Right })),
    ]);

    expect(panels.map((panel) => panel.id)).toEqual(["a:notes", "b:notes"]);
    expect(panels.map((panel) => panel.panelId)).toEqual(["notes", "notes"]);
    expect(panels[0]?.options.component).toBe(Left);
  });

  test("keeps the first when one plugin claims an id twice, and says so", async () => {
    const First = () => null;
    let panels: Awaited<ReturnType<typeof loadPlugins>>["panels"] = [];
    const lines = await reported(async () => {
      ({ panels } = await loadPlugins([
        definePlugin("a", (tiny) => {
          tiny.registerPanel("notes", { title: "First", component: First });
          tiny.registerPanel("notes", { title: "Second", component: () => null });
        }),
      ]));
    });

    expect(panels).toHaveLength(1);
    expect(panels[0]?.options.component).toBe(First);
    expect(lines).toEqual(['[plugin:a] panel "notes" is already registered']);
  });

  test("registers nothing when no plugin asks for a panel", async () => {
    const { panels } = await loadPlugins([definePlugin("a", () => {})]);
    expect(panels).toEqual([]);
  });
});

describe("routes", () => {
  test("records the path, options and owning plugin", async () => {
    const Page = () => null;
    const { routes } = await loadPlugins([
      definePlugin("notes", (tiny) =>
        tiny.registerRoute("/notes", { component: Page, label: "Notes" }),
      ),
    ]);

    expect(routes).toEqual([
      { path: "/notes", pluginId: "notes", options: { component: Page, label: "Notes" } },
    ]);
  });

  test("keeps the first claim on a path — an address cannot be suffixed", async () => {
    const First = () => null;
    let routes: Awaited<ReturnType<typeof loadPlugins>>["routes"] = [];
    const lines = await reported(async () => {
      ({ routes } = await loadPlugins([
        definePlugin("a", (tiny) => tiny.registerRoute("/notes", { component: First })),
        definePlugin("b", (tiny) => tiny.registerRoute("/notes", { component: () => null })),
      ]));
    });

    expect(routes).toHaveLength(1);
    expect(routes[0]?.pluginId).toBe("a");
    expect(routes[0]?.options.component).toBe(First);
    expect(lines).toEqual(['[plugin:b] route "/notes" is already registered']);
  });

  /**
   * The spellings a router treats as one address. Comparing the strings would
   * let each of these past the clash check, and then let the router choose —
   * and `/notes/` outranks `/notes`, so the *second* plugin would win.
   */
  test.each([["/Notes"], ["/notes/"], ["//notes"], ["/notes//"]])(
    "sees %s as the same address as /notes",
    async (spelling) => {
      const First = () => null;
      let routes: Awaited<ReturnType<typeof loadPlugins>>["routes"] = [];
      const lines = await reported(async () => {
        ({ routes } = await loadPlugins([
          definePlugin("a", (tiny) => tiny.registerRoute("/notes", { component: First })),
          definePlugin("b", (tiny) => tiny.registerRoute(spelling, { component: () => null })),
        ]));
      });

      expect(routes).toHaveLength(1);
      expect(routes[0]?.options.component).toBe(First);
      expect(lines).toEqual([`[plugin:b] route "${spelling}" is already registered`]);
    },
  );

  test("stores the canonical spelling, so a slashed path cannot outrank a plain one", async () => {
    const { routes } = await loadPlugins([
      definePlugin("a", (tiny) => tiny.registerRoute("//deep//page//", { component: () => null })),
    ]);

    expect(routes[0]?.path).toBe("/deep/page");
  });

  test("keeps the case of a path, because a page reads its own params back", async () => {
    const { routes } = await loadPlugins([
      definePlugin("a", (tiny) => tiny.registerRoute("/report/:userId", { component: () => null })),
    ]);

    expect(routes[0]?.path).toBe("/report/:userId");
  });

  /**
   * `?` is the one regex metacharacter a router does not escape when it compiles
   * a path, so it would survive as a quantifier: `/note?s` matches `/notes`.
   */
  test.each([["notes"], ["/note?s"], ["/search?q="], ["/a#b"], ["/two words"], [""]])(
    "drops the unusable path %p",
    async (path) => {
      let routes: Awaited<ReturnType<typeof loadPlugins>>["routes"] = [];
      const lines = await reported(async () => {
        ({ routes } = await loadPlugins([
          definePlugin("a", (tiny) => tiny.registerRoute(path, { component: () => null })),
        ]));
      });

      expect(routes).toEqual([]);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain(`route "${path}" is not a usable path`);
    },
  );
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
    const plugin: Plugin = (tiny) => {
      tiny.on("tool_call", async (_event, ctx) => {
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
    const plugin: Plugin = (tiny) => {
      tiny.on("tool_call", (_event, ctx) => {
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
