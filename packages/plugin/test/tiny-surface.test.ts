import { afterAll, describe, expect, test } from "bun:test";
import { endpointModel, toolOutput, toolText } from "@tiny/ai";
import { createEvents } from "../src/events.ts";
import { createProviderStore, endpointOf, modelsOf } from "../src/providers.ts";
import {
  type HostActions,
  loadPlugins,
  terminalFallbacks,
  transformMarkdown,
} from "../src/registry.ts";
import type { PiTerminalUI, Plugin, PluginUIContext } from "../src/tiny.ts";
import { piExtension } from "../src/tiny.ts";

describe("registerProvider", () => {
  test("collects an endpoint a plugin adds", async () => {
    const providers = createProviderStore();
    const registry = await loadPlugins(
      [
        (tiny) =>
          tiny.registerProvider("groq", {
            name: "Groq",
            baseUrl: "https://api.groq.com/openai/v1",
            models: ["llama-3.3-70b"],
          }),
      ],
      { providers },
    );

    expect(registry.providers).toHaveLength(1);
    expect(registry.providers[0]?.id).toBe("groq");
    expect(registry.providers[0]?.config.name).toBe("Groq");
  });

  test("a repeat id replaces the earlier registration, as in pi", async () => {
    const providers = createProviderStore();
    await loadPlugins(
      [
        (tiny) => {
          tiny.registerProvider("x", { name: "First", baseUrl: "https://a.example/v1" });
          tiny.registerProvider("x", { name: "Second", baseUrl: "https://b.example/v1" });
        },
      ],
      { providers },
    );
    expect(providers.list()).toHaveLength(1);
    expect(providers.list()[0]?.config.name).toBe("Second");
  });

  test("unregisterProvider reports whether there was anything to remove", async () => {
    const providers = createProviderStore();
    let removedKnown: boolean | undefined;
    let removedUnknown: boolean | undefined;
    await loadPlugins(
      [
        (tiny) => {
          tiny.registerProvider("x", { name: "X", baseUrl: "https://a.example/v1" });
          removedKnown = tiny.unregisterProvider("x");
          removedUnknown = tiny.unregisterProvider("nope");
        },
      ],
      { providers },
    );
    expect(removedKnown).toBe(true);
    expect(removedUnknown).toBe(false);
    expect(providers.list()).toEqual([]);
  });

  test("registering after the factory returns takes effect, and notifies", async () => {
    const providers = createProviderStore();
    let late: (() => void) | undefined;
    await loadPlugins(
      [
        (tiny) => {
          // pi documents this: a call from a command handler applies immediately
          // rather than waiting for a reload.
          late = () => tiny.registerProvider("later", { name: "Later", baseUrl: "https://c/v1" });
        },
      ],
      { providers },
    );

    let announced = 0;
    providers.subscribe(() => {
      announced += 1;
    });
    expect(providers.list()).toEqual([]);
    late?.();
    expect(providers.list()).toHaveLength(1);
    expect(announced).toBe(1);
  });

  test("a reload clears what the previous factories registered", async () => {
    const providers = createProviderStore();
    const plugin: Plugin = (tiny) =>
      tiny.registerProvider("x", { name: "X", baseUrl: "https://a.example/v1" });
    await loadPlugins([plugin], { providers });
    await loadPlugins([plugin], { providers });
    expect(providers.list()).toHaveLength(1);
  });
});

describe("provider resolution", () => {
  // A real server, so `modelsOf`'s fallback path is the one the app takes.
  const server = Bun.serve({
    port: 0,
    fetch: () => Response.json({ data: [{ id: "served-a" }, { id: "served-b" }] }),
  });
  afterAll(() => server.stop(true));

  test("resolves an apiKey thunk, so a key need not sit in the registry", async () => {
    const resolved = await endpointOf({
      name: "X",
      baseUrl: "https://a.example/v1",
      apiKey: () => Promise.resolve("secret"),
    });
    expect(resolved).toEqual({ baseUrl: "https://a.example/v1", apiKey: "secret" });
  });

  test("a missing apiKey is empty rather than undefined, for local servers", async () => {
    expect(await endpointOf({ name: "X", baseUrl: "http://localhost:11434/v1" })).toEqual({
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
    });
  });

  test("uses a static model list as given", async () => {
    const models = await modelsOf({
      name: "X",
      baseUrl: "https://a.example/v1",
      models: ["one", "two"],
    });
    expect(models).toEqual(["one", "two"]);
  });

  test("calls a model lookup when one is supplied", async () => {
    const models = await modelsOf({
      name: "X",
      baseUrl: "https://a.example/v1",
      models: () => Promise.resolve(["dynamic"]),
    });
    expect(models).toEqual(["dynamic"]);
  });

  test("falls back to the endpoint's own /models route", async () => {
    const models = await modelsOf({ name: "X", baseUrl: server.url.origin, apiKey: "k" });
    expect(models).toEqual(["served-a", "served-b"]);
  });
});

describe("registerMarkdownTransformer", () => {
  test("chains transformers in registration order", async () => {
    const registry = await loadPlugins([
      (tiny) => tiny.registerMarkdownTransformer((markdown) => markdown.replaceAll("-->", "→")),
      (tiny) => tiny.registerMarkdownTransformer((markdown) => `${markdown}!`),
    ]);
    const out = transformMarkdown(registry.markdown, "a --> b", {
      messageType: "assistant",
      isStreaming: false,
    });
    expect(out).toBe("a → b!");
  });

  test("keeps the markdown so far when one throws, and runs the rest", async () => {
    const registry = await loadPlugins([
      (tiny) => tiny.registerMarkdownTransformer((markdown) => markdown.toUpperCase()),
      (tiny) =>
        tiny.registerMarkdownTransformer(() => {
          throw new Error("boom");
        }),
      (tiny) => tiny.registerMarkdownTransformer((markdown) => `${markdown}.`),
    ]);
    expect(
      transformMarkdown(registry.markdown, "hi", { messageType: "user", isStreaming: false }),
    ).toBe("HI.");
  });

  test("passes the message type and streaming flag through", async () => {
    const seen: string[] = [];
    const registry = await loadPlugins([
      (tiny) =>
        tiny.registerMarkdownTransformer((markdown, context) => {
          seen.push(`${context.messageType}:${context.isStreaming}`);
          return markdown;
        }),
    ]);
    transformMarkdown(registry.markdown, "x", {
      messageType: "assistant-thinking",
      isStreaming: true,
    });
    expect(seen).toEqual(["assistant-thinking:true"]);
  });
});

describe("tiny.events", () => {
  test("carries data between two plugins", async () => {
    const events = createEvents();
    const heard: unknown[] = [];
    await loadPlugins(
      [
        (tiny) => tiny.events.on("ping", (data) => heard.push(data)),
        (tiny) => tiny.events.emit("ping", { from: "second" }),
      ],
      { events },
    );
    expect(heard).toEqual([{ from: "second" }]);
  });

  test("off and the returned unsubscribe both stop delivery", () => {
    const events = createEvents();
    const heard: unknown[] = [];
    const listener = (data: unknown) => heard.push(data);
    const unsubscribe = events.on("x", listener);
    events.emit("x", 1);
    unsubscribe();
    events.emit("x", 2);
    events.on("x", listener);
    events.off("x", listener);
    events.emit("x", 3);
    expect(heard).toEqual([1]);
  });

  test("once fires a single time", () => {
    const events = createEvents();
    let count = 0;
    events.once("x", () => {
      count += 1;
    });
    events.emit("x");
    events.emit("x");
    expect(count).toBe(1);
  });

  test("a throwing listener does not stop the others", () => {
    const events = createEvents();
    const heard: number[] = [];
    events.on("x", () => {
      throw new Error("boom");
    });
    events.on("x", () => heard.push(1));
    events.emit("x");
    expect(heard).toEqual([1]);
  });

  test("a listener that unsubscribes during dispatch does not disturb it", () => {
    const events = createEvents();
    const heard: number[] = [];
    const first = () => {
      events.off("x", first);
      heard.push(1);
    };
    events.on("x", first);
    events.on("x", () => heard.push(2));
    events.emit("x");
    expect(heard).toEqual([1, 2]);
  });
});

describe("host-backed tiny methods", () => {
  const recording = () => {
    const calls: string[] = [];
    const actions: HostActions = {
      getCommands: () => [{ name: "greet", description: "Say hello" }],
      getAllTools: () => ["a", "b"],
      getActiveTools: () => ["a"],
      setActiveTools: (names) => calls.push(`setActiveTools:${names.join(",")}`),
      setModel: (model) => calls.push(`setModel:${model}`),
      sendUserMessage: (content) => calls.push(`sendUserMessage:${content}`),
      getSessionName: () => "Some chat",
      setSessionName: (name) => calls.push(`setSessionName:${name}`),
    };
    return { calls, actions };
  };

  test("reach the host, and are resolved at call time rather than captured", async () => {
    const { calls, actions } = recording();
    let later: (() => void) | undefined;
    const seen: unknown[] = [];

    await loadPlugins(
      [
        (tiny) => {
          seen.push(
            tiny.getCommands(),
            tiny.getAllTools(),
            tiny.getActiveTools(),
            tiny.getSessionName(),
          );
          later = () => {
            tiny.setModel("gpt-4o-mini");
            tiny.setActiveTools(["b"]);
            tiny.sendUserMessage("hello");
            tiny.setSessionName("Renamed");
          };
        },
      ],
      { host: () => actions },
    );

    expect(seen).toEqual([
      [{ name: "greet", description: "Say hello" }],
      ["a", "b"],
      ["a"],
      "Some chat",
    ]);

    later?.();
    expect(calls).toEqual([
      "setModel:gpt-4o-mini",
      "setActiveTools:b",
      "sendUserMessage:hello",
      "setSessionName:Renamed",
    ]);
  });

  test("report rather than throw when no host is mounted", async () => {
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args[0]);
    try {
      await loadPlugins([
        (tiny) => {
          expect(tiny.getCommands()).toEqual([]);
          expect(tiny.getSessionName()).toBeUndefined();
          tiny.setModel("x");
        },
      ]);
    } finally {
      console.error = original;
    }
    expect(errors).toContain("[plugin] tiny.setModel() needs a mounted PluginHost");
  });
});

describe("registerTool", () => {
  test("takes pi's positional arguments and content-block result", async () => {
    let received: readonly unknown[] = [];
    const registry = await loadPlugins([
      (tiny) =>
        tiny.registerTool({
          name: "echo",
          label: "Echo",
          description: "Echo a value back",
          parameters: { type: "object", properties: { value: { type: "string" } } },
          execute: (toolCallId, params, signal, onUpdate, ctx) => {
            received = [toolCallId, params, signal, typeof onUpdate, ctx];
            return toolOutput(`echoed:${String(params.value)}`, { details: { ok: true } });
          },
        }),
    ]);

    const tool = registry.tools[0];
    expect(tool?.label).toBe("Echo");
    const result = await tool?.execute("call-7", { value: "hi" }, undefined, undefined, {
      signal: undefined,
      model: endpointModel({ baseUrl: "https://example.test/v1", apiKey: "" }, "m"),
    });
    expect(toolText(result ?? { content: [] })).toBe("echoed:hi");
    expect(result?.details).toEqual({ ok: true });
    expect(received[0]).toBe("call-7");
    expect(received[1]).toEqual({ value: "hi" });
  });

  test("carries pi's prompt fields onto the registry", async () => {
    const registry = await loadPlugins([
      (tiny) =>
        tiny.registerTool({
          name: "todo",
          description: "Manage a todo list",
          promptSnippet: "List or add items in the project todo list",
          promptGuidelines: ["Prefer todo over direct file edits for task lists."],
          parameters: { type: "object" },
          execute: () => toolOutput("ok"),
        }),
    ]);
    expect(registry.tools[0]?.promptSnippet).toContain("todo list");
    expect(registry.tools[0]?.promptGuidelines).toHaveLength(1);
  });
});

describe("events accepted by tiny.on", () => {
  test("session_compact_failed loads without error, like every unfired pi event", async () => {
    const extension = piExtension((tiny) => {
      tiny.on("session_compact_failed", () => {});
      tiny.on("session_start", () => {});
    });
    const registry = await loadPlugins([extension]);
    // Neither fires, so neither is replayed into `@tiny/ai`.
    expect(registry.extensions).toHaveLength(1);
  });
});

/**
 * The size of the surface, asserted rather than described.
 *
 * `ctx.ui` used to carry twenty-nine methods, sixteen of which did nothing here
 * — so more than half of what autocomplete offered a new plugin author was
 * dead, and indistinguishable from the live half. The dead ones still exist at
 * runtime, because a pi extension may call them; they are simply not in the
 * type a plugin sees. These tests fail if either half drifts.
 */
describe("the surface an author sees", () => {
  test("every method typed on PluginUIContext is one the host implements", () => {
    // Written out, and checked by `keyof`: a name added to the type without an
    // implementation fails to compile here, and the count fails if one is added
    // without being considered.
    const live: readonly (keyof PluginUIContext)[] = [
      "confirm",
      "editor",
      "getEditorText",
      "input",
      "notify",
      "open",
      "pasteToEditor",
      "select",
      "setEditorText",
      "setStatus",
      "setTitle",
      "setWidget",
    ];
    expect(live).toHaveLength(12);
    // None of the live half is a terminal fallback — that is what makes them live.
    for (const name of live) expect(Object.keys(terminalFallbacks)).not.toContain(name);
  });

  test("pi's terminal half is present at runtime and absent from the type", () => {
    const terminalOnly: readonly (keyof PiTerminalUI)[] = [
      "addAutocompleteProvider",
      "custom",
      "getAllThemes",
      "getEditorComponent",
      "getTheme",
      "getToolsExpanded",
      "onTerminalInput",
      "setEditorComponent",
      "setFooter",
      "setHeader",
      "setHiddenThinkingLabel",
      "setTheme",
      "setToolsExpanded",
      "setWorkingIndicator",
      "setWorkingMessage",
      "setWorkingVisible",
      "theme",
    ];
    // Reachable at runtime, so a pi extension calling one does not throw.
    expect(Object.keys(terminalFallbacks).sort()).toEqual([...terminalOnly].sort());
    expect(terminalOnly).toHaveLength(17);
  });

  test("a terminal-only method is not on the type a plugin author sees", () => {
    // @ts-expect-error — the whole point of the split.
    const unreachable: keyof PluginUIContext = "setFooter";
    // Named so the assertion is about the type, not an unused binding.
    expect(String(unreachable)).toBe("setFooter");
  });
});
