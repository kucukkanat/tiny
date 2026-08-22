import { describe, expect, test } from "bun:test";
import { type Extension, type ExtensionAPI, toolOutput } from "@tiny/ai";
import { reported } from "../../../test/helpers.ts";
import { matchesKey } from "../src/keys.ts";
import { createProviderStore } from "../src/providers.ts";
import { loadPlugins, type PluginRuntime, type Registry } from "../src/registry.ts";
import type { Plugin } from "../src/tiny.ts";
import { definePlugin } from "../src/tiny.ts";

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

describe("withdrawing a registration", () => {
  test("every register* hands back a function", async () => {
    const Component = () => null;
    const returned: unknown[] = [];
    await loadPlugins([
      definePlugin("a", (tiny) => {
        returned.push(
          tiny.on("context", () => {}),
          tiny.registerCommand("c", { handler: () => {} }),
          tiny.registerShortcut("ctrl+j", { handler: () => {} }),
          tiny.registerTool({
            name: "t",
            description: "d",
            parameters: { type: "object" },
            execute: () => toolOutput("ok"),
          }),
          tiny.registerMarkdownTransformer((markdown) => markdown),
          tiny.contribute("composer.actions", Component),
          tiny.registerPanel("p", { title: "P", component: Component }),
          tiny.registerRoute("/r", { component: Component }),
        );
      }),
    ]);

    // Eight registration methods, eight disposers. Before this, one of the
    // nineteen was reversible, and it was `unregisterProvider`.
    expect(returned).toHaveLength(8);
    for (const value of returned) expect(typeof value).toBe("function");
  });

  test("a rejected registration still hands back a disposer that does nothing", async () => {
    const Component = () => null;
    let offClash: (() => void) | undefined;
    let registry!: PluginRuntime;
    await reported(async () => {
      registry = await loadPlugins([
        definePlugin("a", (tiny) => {
          tiny.registerPanel("p", { title: "First", component: Component });
          // Rejected — same plugin, same id — so there is nothing to withdraw.
          offClash = tiny.registerPanel("p", { title: "Second", component: Component });
        }),
      ]);
    });

    const seen: number[] = [];
    registry.subscribe((next) => seen.push(next.panels.length));
    offClash?.();

    // Calling it must not take the registration that *did* succeed.
    expect(seen).toEqual([]);
    expect(registry.panels.map((p) => p.options.title)).toEqual(["First"]);
  });

  test("subscribers hear the snapshot that follows a withdrawal", async () => {
    let offCommand: (() => void) | undefined;
    const registry = await loadPlugins([
      definePlugin("a", (tiny) => {
        offCommand = tiny.registerCommand("gone", { handler: () => {} });
        tiny.registerCommand("stay", { handler: () => {} });
      }),
    ]);

    const seen: string[][] = [];
    registry.subscribe((next) => seen.push(next.commands.map((c) => c.name)));

    offCommand?.();

    expect(seen).toEqual([["stay"]]);
  });

  test("withdrawing twice is harmless", async () => {
    let off: (() => void) | undefined;
    const registry = await loadPlugins([
      definePlugin("a", (tiny) => {
        off = tiny.registerCommand("once", { handler: () => {} });
      }),
    ]);
    const seen: number[] = [];
    registry.subscribe((next) => seen.push(next.commands.length));

    off?.();
    off?.();

    // One notification, not two: the second call found nothing to remove.
    expect(seen).toEqual([0]);
  });

  test("dispose takes one plugin out and leaves its neighbours whole", async () => {
    const Panel = () => null;
    const Contributed = () => null;
    const registry = await loadPlugins([
      definePlugin("going", (tiny) => {
        tiny.registerCommand("go", { handler: () => {} });
        tiny.registerShortcut("ctrl+g", { handler: () => {} });
        tiny.contribute("composer.actions", Contributed);
        tiny.registerPanel("p", { title: "P", component: Panel });
        tiny.registerRoute("/going", { component: Panel });
        tiny.registerTool({
          name: "going_tool",
          description: "d",
          parameters: { type: "object" },
          execute: () => toolOutput("ok"),
        });
        tiny.registerMarkdownTransformer((markdown) => markdown);
        tiny.on("context", () => {});
      }),
      definePlugin("staying", (tiny) => {
        tiny.registerCommand("stay", { handler: () => {} });
        tiny.registerShortcut("ctrl+s", { handler: () => {} });
        tiny.contribute("composer.actions", Contributed);
        tiny.registerPanel("p", { title: "P", component: Panel });
        tiny.registerRoute("/staying", { component: Panel });
        tiny.registerTool({
          name: "staying_tool",
          description: "d",
          parameters: { type: "object" },
          execute: () => toolOutput("ok"),
        });
        tiny.registerMarkdownTransformer((markdown) => markdown);
        tiny.on("context", () => {});
      }),
    ]);

    let latest = registry as Registry;
    registry.subscribe((next) => {
      latest = next;
    });

    expect(registry.dispose("going")).toBe(true);

    expect(latest.commands.map((c) => c.pluginId)).toEqual(["staying"]);
    expect(latest.shortcuts.map((s) => s.pluginId)).toEqual(["staying"]);
    expect(latest.contributions.map((c) => c.pluginId)).toEqual(["staying"]);
    expect(latest.panels.map((p) => p.pluginId)).toEqual(["staying"]);
    expect(latest.routes.map((r) => r.pluginId)).toEqual(["staying"]);
    expect(latest.tools.map((t) => t.name)).toEqual(["staying_tool"]);
    expect(latest.markdown.map((m) => m.pluginId)).toEqual(["staying"]);
    expect(replayed(latest.extensions)).toEqual(["context"]);
  });

  test("dispose reports whether there was anything to take out", async () => {
    const registry = await loadPlugins([
      definePlugin("a", (tiny) => tiny.registerCommand("x", { handler: () => {} })),
    ]);
    expect(registry.dispose("nobody")).toBe(false);
    expect(registry.dispose("a")).toBe(true);
    expect(registry.dispose("a")).toBe(false);
  });

  test("dispose drops the plugin's providers too", async () => {
    const providers = createProviderStore();
    const registry = await loadPlugins(
      [
        definePlugin("p", (tiny) =>
          tiny.registerProvider("groq", { name: "Groq", baseUrl: "https://a.example/v1" }),
        ),
      ],
      { providers },
    );

    expect(providers.list()).toHaveLength(1);
    expect(registry.dispose("p")).toBe(true);
    expect(providers.list()).toEqual([]);
  });

  test("a command name freed by a disposal loses its suffix", async () => {
    const claim = (id: string) =>
      definePlugin(id, (tiny) => tiny.registerCommand("review", { handler: () => {} }));
    const registry = await loadPlugins([claim("first"), claim("second")]);
    expect(registry.commands.map((c) => c.invocationName)).toEqual(["review:1", "review:2"]);

    let latest = registry as Registry;
    registry.subscribe((next) => {
      latest = next;
    });
    registry.dispose("first");

    // Only one claimant left, so it is invoked unsuffixed — the same rule the
    // load applies, recomputed rather than frozen at load time.
    expect(latest.commands.map((c) => c.invocationName)).toEqual(["review"]);
  });

  test("a tool name freed by a disposal goes to the plugin that lost it", async () => {
    const tool = (label: string) => ({
      name: "shared",
      description: label,
      parameters: { type: "object" },
      execute: () => toolOutput("ok"),
    });
    let registry!: PluginRuntime;
    const errors = await reported(async () => {
      registry = await loadPlugins([
        definePlugin("winner", (tiny) => tiny.registerTool(tool("first"))),
        definePlugin("loser", (tiny) => tiny.registerTool(tool("second"))),
      ]);
    });
    expect(errors.join(" ")).toContain('tool "shared" is already registered');
    expect(registry.tools.map((t) => t.description)).toEqual(["first"]);

    let latest = registry as Registry;
    registry.subscribe((next) => {
      latest = next;
    });
    registry.dispose("winner");

    expect(latest.tools.map((t) => t.description)).toEqual(["second"]);
  });
});

describe("declared load order", () => {
  /** Records the order factories actually ran in. */
  const recorder = () => {
    const ran: string[] = [];
    const mark = (id: string, order?: { after?: readonly string[]; before?: readonly string[] }) =>
      order === undefined
        ? definePlugin(id, () => void ran.push(id))
        : definePlugin(id, order, () => void ran.push(id));
    return { ran, mark };
  };

  test("the list's order stands when nothing is declared", async () => {
    const { ran, mark } = recorder();
    await loadPlugins([mark("a"), mark("b"), mark("c")]);
    expect(ran).toEqual(["a", "b", "c"]);
  });

  test("after moves a plugin behind the one it names", async () => {
    const { ran, mark } = recorder();
    await loadPlugins([mark("a", { after: ["c"] }), mark("b"), mark("c")]);
    expect(ran).toEqual(["b", "c", "a"]);
  });

  test("before moves a plugin ahead of the one it names", async () => {
    const { ran, mark } = recorder();
    await loadPlugins([mark("a"), mark("b"), mark("c", { before: ["a"] })]);
    // The rule is "the earliest-listed plugin whose prerequisites have run",
    // applied repeatedly — so `a` waits for `c`, and `b`, which waits for
    // nothing, goes while it does. `c` before `a` is what was asked for and
    // what happened; where `b` lands was never constrained.
    expect(ran).toEqual(["b", "c", "a"]);
  });

  test('after "*" loads last, however the list is written', async () => {
    // The app's one real ordering requirement: the plugin that installs other
    // plugins must not let them claim command names first.
    const { ran, mark } = recorder();
    await loadPlugins([mark("manager", { after: ["*"] }), mark("a"), mark("b")]);
    expect(ran).toEqual(["a", "b", "manager"]);
  });

  test('before "*" loads first', async () => {
    const { ran, mark } = recorder();
    await loadPlugins([mark("a"), mark("b"), mark("first", { before: ["*"] })]);
    expect(ran).toEqual(["first", "a", "b"]);
  });

  test("a name that is not installed is ignored, not an error", async () => {
    const { ran, mark } = recorder();
    const lines = await reported(async () => {
      await loadPlugins([mark("a", { after: ["absent"] }), mark("b")]);
    });
    expect(ran).toEqual(["a", "b"]);
    // Optional by nature: a plugin that prefers to follow another must not
    // break, or complain, when that other one is simply not there.
    expect(lines).toEqual([]);
  });

  test("everything not constrained keeps its place", async () => {
    const { ran, mark } = recorder();
    await loadPlugins([mark("a"), mark("b"), mark("c", { after: ["a"] }), mark("d")]);
    // `c` was already after `a`, so nothing needed to move.
    expect(ran).toEqual(["a", "b", "c", "d"]);
  });

  test("a cycle is reported, and every plugin still loads", async () => {
    const { ran, mark } = recorder();
    const lines = await reported(async () => {
      await loadPlugins([mark("a", { after: ["b"] }), mark("b", { after: ["a"] }), mark("c")]);
    });
    expect(lines.join(" ")).toContain("circular load order");
    // Losing plugins entirely would be a far worse answer to "these two
    // disagree about which goes first".
    expect(ran.sort()).toEqual(["a", "b", "c"]);
  });

  test("the order decides which plugin claims a command name unsuffixed", async () => {
    const claim = (id: string, order?: { after?: readonly string[] }) =>
      order === undefined
        ? definePlugin(id, (tiny) => tiny.registerCommand("go", { handler: () => {} }))
        : definePlugin(id, order, (tiny) => tiny.registerCommand("go", { handler: () => {} }));

    const { commands } = await loadPlugins([claim("late", { after: ["*"] }), claim("early")]);

    // Both keep the name, as pi does; the suffixes follow load order, so the
    // plugin that declared itself last is the one that gets `go:2`.
    expect(commands.map((command) => `${command.pluginId}=${command.invocationName}`)).toEqual([
      "early=go:1",
      "late=go:2",
    ]);
  });
});
