import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { AppBridge } from "../src/hooks.ts";
import { usePluginContext, usePluginHost, useProvideApp } from "../src/hooks.ts";
import { definePlugin } from "../src/tiny.ts";

const noop = () => {};
const STABLE_MESSAGES: readonly [] = [];

import { PluginHost } from "../src/PluginHost.tsx";
import { emptyRegistry } from "../src/registry.ts";
import { Slot, StatusBar, Widgets } from "../src/Slot.tsx";
import type { Capability, Plugin, PluginContext } from "../src/tiny.ts";

afterEach(() => {
  cleanup();
  host = undefined;
});

/** Reaches the host from outside, the way `App` drives commands. */
let host: ReturnType<typeof usePluginHost> | undefined;
function Probe() {
  host = usePluginHost();
  return null;
}

const mount = async (plugins: readonly Plugin[], children?: React.ReactNode) => {
  host = undefined;
  // Factories run in an effect and resolve a microtask later, so the registry
  // replaces the empty one after the first paint. Rendering inside `act` keeps
  // that second update inside the act scope too, rather than landing loose.
  await act(async () => {
    render(
      <PluginHost plugins={plugins}>
        <Probe />
        {children}
        <Slot name="app.overlays" />
      </PluginHost>,
    );
  });
  await waitFor(() => {
    expect(host).toBeDefined();
    expect(host?.registry).not.toBe(emptyRegistry);
  });
};

/** Run a command whose handler completes on its own. */
const runCommand = async (name: string, args?: string) => {
  await act(async () => {
    await host?.runCommand(name, args);
  });
};

/**
 * Fire a command whose handler blocks on a dialog.
 *
 * Synchronous `act`, deliberately: the handler does not resolve until the user
 * answers, so awaiting it here would deadlock — but the update that opens the
 * dialog is queued synchronously, and this flushes exactly that.
 */
const openCommand = (name: string) => {
  act(() => {
    void host?.runCommand(name);
  });
};

describe("Slot", () => {
  test("renders every contribution for its name", async () => {
    const plugin: Plugin = (tiny) => {
      tiny.contribute("composer.actions", () => <span>alpha</span>);
      tiny.contribute("composer.actions", () => <span>beta</span>);
      tiny.contribute("sidebar.footer", () => <span>elsewhere</span>);
    };
    await mount([plugin], <Slot name="composer.actions" />);

    await waitFor(() => expect(screen.getByText("alpha")).toBeDefined());
    expect(screen.getByText("beta")).toBeDefined();
    expect(screen.queryByText("elsewhere")).toBeNull();
  });

  test("passes the message and index to message.actions", async () => {
    const plugin: Plugin = (tiny) => {
      tiny.contribute("message.actions", ({ message, index }) => (
        <span>{`${index}:${message?.content ?? ""}`}</span>
      ));
    };
    await mount(
      [plugin],
      <Slot name="message.actions" message={{ role: "assistant", content: "hi" }} index={3} />,
    );
    await waitFor(() => expect(screen.getByText("3:hi")).toBeDefined());
  });

  test("contains a throwing contribution instead of blanking the app", async () => {
    const consoleError = console.error;
    console.error = mock(() => {});
    function boom(tiny: Parameters<Plugin>[0]) {
      tiny.contribute("composer.actions", () => {
        throw new Error("render exploded");
      });
      tiny.contribute("composer.actions", () => <span>survivor</span>);
    }
    await mount([boom], <Slot name="composer.actions" />);

    await waitFor(() => expect(screen.getByTestId("plugin-error")).toBeDefined());
    // The sibling contribution and the rest of the tree still render.
    expect(screen.getByText("survivor")).toBeDefined();
    console.error = consoleError;
  });
});

describe("ctx.ui dialogs", () => {
  /** Registers a command that records what a dialog resolved to. */
  const asking = (ask: (ctx: PluginContext) => Promise<unknown>) => {
    const answers: unknown[] = [];
    const plugin: Plugin = (tiny) =>
      tiny.registerCommand("ask", {
        handler: async (_args, ctx) => {
          answers.push(await ask(ctx));
        },
      });
    return { plugin, answers };
  };

  test("confirm resolves true on Yes and false on No", async () => {
    const { plugin, answers } = asking((ctx) => ctx.ui.confirm("Delete?", "Cannot undo"));
    await mount([plugin]);

    openCommand("ask");
    await waitFor(() => expect(screen.getByTestId("dialog-yes")).toBeDefined());
    await act(async () => screen.getByTestId("dialog-yes").click());
    await waitFor(() => expect(answers).toEqual([true]));

    openCommand("ask");
    await waitFor(() => expect(screen.getByTestId("dialog-no")).toBeDefined());
    await act(async () => screen.getByTestId("dialog-no").click());
    await waitFor(() => expect(answers).toEqual([true, false]));
  });

  test("select resolves the chosen option", async () => {
    const { plugin, answers } = asking((ctx) => ctx.ui.select("Pick", ["A", "B"]));
    await mount([plugin]);

    openCommand("ask");
    await waitFor(() => expect(screen.getByTestId("dialog-option-B")).toBeDefined());
    await act(async () => screen.getByTestId("dialog-option-B").click());
    await waitFor(() => expect(answers).toEqual(["B"]));
  });

  test("a dismissed dialog returns pi's fallback per method", async () => {
    const { plugin, answers } = asking(async (ctx) => [
      await ctx.ui.confirm("c", "m", { timeout: 10 }),
      await ctx.ui.select("s", ["A"], { timeout: 10 }),
      await ctx.ui.input("i", undefined, { timeout: 10 }),
    ]);
    await mount([plugin]);

    await runCommand("ask");
    // confirm -> false; select and input -> undefined, exactly as pi documents.
    await waitFor(() => expect(answers).toEqual([[false, undefined, undefined]]));
  });

  test("an aborted signal dismisses the dialog", async () => {
    const controller = new AbortController();
    const { plugin, answers } = asking((ctx) =>
      ctx.ui.confirm("c", "m", { signal: controller.signal }),
    );
    await mount([plugin]);

    openCommand("ask");
    await waitFor(() => expect(screen.getByTestId("plugin-dialog")).toBeDefined());
    await act(async () => controller.abort());
    await waitFor(() => expect(answers).toEqual([false]));
  });
});

describe("ctx.ui fire-and-forget", () => {
  test("notify shows a toast", async () => {
    const plugin: Plugin = (tiny) =>
      tiny.registerCommand("say", { handler: (_a, ctx) => ctx.ui.notify("Copied", "info") });
    await mount([plugin]);

    await runCommand("say");
    await waitFor(() => expect(screen.getByTestId("plugin-toast").textContent).toBe("Copied"));
  });

  test("getEditorText reads back what setEditorText and pasteToEditor put there", async () => {
    let seen: string | undefined;
    const plugin: Plugin = (tiny) => {
      tiny.registerCommand("write", { handler: (_a, ctx) => ctx.ui.setEditorText("hello") });
      tiny.registerCommand("append", { handler: (_a, ctx) => ctx.ui.pasteToEditor(" there") });
      tiny.registerCommand("read", {
        handler: (_a, ctx) => {
          seen = ctx.ui.getEditorText();
        },
      });
    };
    await mount([plugin]);

    await runCommand("write");
    await runCommand("append");
    await runCommand("read");

    expect(seen).toBe("hello there");
  });

  test("setWidget renders string lines at the requested placement", async () => {
    const plugin: Plugin = (tiny) =>
      tiny.registerCommand("draw", {
        handler: (_a, ctx) => {
          ctx.ui.setWidget("w", ["line one", "line two"], { placement: "belowEditor" });
        },
      });
    await mount([plugin], <Widgets placement="belowEditor" />);

    await runCommand("draw");
    await waitFor(() =>
      expect(screen.getByTestId("plugin-widgets-belowEditor").textContent).toBe(
        "line one\nline two",
      ),
    );
  });

  test("setStatus adds and clears an entry", async () => {
    const plugin: Plugin = (tiny) => {
      tiny.registerCommand("on", { handler: (_a, ctx) => ctx.ui.setStatus("k", "working") });
      tiny.registerCommand("off", { handler: (_a, ctx) => ctx.ui.setStatus("k", undefined) });
    };
    await mount([plugin], <StatusBar />);

    await runCommand("on");
    await waitFor(() => expect(screen.getByTestId("plugin-status").textContent).toBe("working"));
    await runCommand("off");
    await waitFor(() => expect(screen.queryByTestId("plugin-status")).toBeNull());
  });
});

describe("context and commands", () => {
  test("reports pi's mode and hasUI so terminal guards stay false", async () => {
    let seen: PluginContext | undefined;
    const plugin: Plugin = (tiny) =>
      tiny.registerCommand("peek", {
        handler: (_a, ctx) => {
          seen = ctx;
        },
      });
    await mount([plugin]);

    await runCommand("peek");
    expect(seen?.mode).toBe("react");
    expect(seen?.hasUI).toBe(true);
    // A pi extension's `ctx.mode === "tui"` guard must not fire here.
    expect(seen?.mode === "react").toBe(true);
  });

  test("passes command arguments through", async () => {
    let received: string | undefined;
    const plugin: Plugin = (tiny) =>
      tiny.registerCommand("echo", {
        handler: (args) => {
          received = args;
        },
      });
    await mount([plugin]);

    await runCommand("echo", "hello world");
    expect(received).toBe("hello world");
  });

  test("a throwing command handler notifies instead of propagating", async () => {
    const consoleError = console.error;
    console.error = mock(() => {});
    const plugin: Plugin = (tiny) =>
      tiny.registerCommand("bad", {
        handler: () => {
          throw new Error("handler exploded");
        },
      });
    await mount([plugin]);

    await runCommand("bad");
    await waitFor(() => expect(screen.getByTestId("plugin-toast").textContent).toContain("failed"));
    console.error = consoleError;
  });

  test("a plugin without an id gets storage that works but does not persist", async () => {
    const warn = console.warn;
    const warnings: string[] = [];
    console.warn = (message: string) => void warnings.push(message);
    try {
      // No `definePlugin`, so there is no stable name to file its data under.
      // Persisting by list position would move that data the moment the list
      // changes, so nothing is written to disk at all.
      await mount([
        (tiny) => {
          tiny.registerCommand("keep", { handler: (_a, ctx) => ctx.storage.set("k", 1) });
          tiny.registerCommand("read", {
            handler: (_a, ctx) => ctx.ui.notify(`k=${ctx.storage.get("k")}`),
          });
        },
      ]);
      // Warned on first use, not at load: a plugin that never stores anything
      // has nothing to lose and nothing to be told about.
      expect(warnings).toEqual([]);

      await runCommand("keep");

      expect(warnings.join(" ")).toContain("definePlugin");
      // Readable for the life of the page…
      await runCommand("read");
      await waitFor(() => expect(screen.getByTestId("plugin-toast").textContent).toContain("k=1"));
      // …and absent from the positional namespace a reload would have looked in.
      expect(localStorage.getItem("tiny-plugin:plugin-0:k")).toBeNull();
    } finally {
      console.warn = warn;
      localStorage.clear();
    }
  });

  test("storage is namespaced per plugin", async () => {
    const alpha = definePlugin("alpha", (tiny) => {
      tiny.registerCommand("write", { handler: (_a, ctx) => ctx.storage.set("k", 1) });
    });
    await mount([alpha]);

    await runCommand("write");
    expect(localStorage.getItem("tiny-plugin:alpha:k")).toBe("1");
  });

  test("a registered shortcut fires on a matching keydown", async () => {
    let fired = 0;
    const plugin: Plugin = (tiny) =>
      tiny.registerShortcut("ctrl+k", {
        handler: () => {
          fired += 1;
        },
      });
    await mount([plugin]);
    await waitFor(() => expect(host?.registry.shortcuts.length).toBe(1));

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
    });
    await waitFor(() => expect(fired).toBe(1));
  });
});

describe("useProvideApp", () => {
  test("a fresh wrapper around unchanged values does not spin the host", async () => {
    let renders = 0;
    // The values are stable but the wrapper object is rebuilt every render —
    // the shape an app produces when it memoises its state but not the bridge.
    // The host must settle instead of publishing in a loop.
    function Unstable() {
      renders += 1;
      useProvideApp({
        messages: STABLE_MESSAGES,
        streaming: undefined,
        settings: undefined,
        signal: undefined,
        send: noop,
        stop: noop,
        updateSettings: noop,
        navigate: noop,
      });
      return null;
    }

    render(
      <PluginHost plugins={[]}>
        <Unstable />
      </PluginHost>,
    );

    await act(async () => {
      await Bun.sleep(50);
    });
    expect(renders).toBeLessThan(5);
  });

  test("publishes live chat state to plugins", async () => {
    let seen: PluginContext | undefined;
    const bridge = {
      messages: [{ role: "user", content: "hi" }] as const,
      streaming: undefined,
      settings: undefined,
      signal: undefined,
      send: noop,
      stop: noop,
      updateSettings: noop,
      navigate: noop,
    };
    function Publisher() {
      useProvideApp(bridge);
      return null;
    }
    const plugin: Plugin = (tiny) =>
      tiny.registerCommand("peek", {
        handler: (_a, ctx) => {
          seen = ctx;
        },
      });

    await mount([plugin], <Publisher />);
    await runCommand("peek");
    expect(seen?.chat.messages).toEqual([{ role: "user", content: "hi" }]);
  });
});

describe("contributed components", () => {
  test("usePluginContext gives a contribution the same context", async () => {
    const plugin: Plugin = (tiny) => {
      tiny.contribute("composer.actions", () => {
        const ctx = usePluginContext();
        return <span>{`${ctx.mode}/${ctx.commands.length}`}</span>;
      });
      tiny.registerCommand("noop", { handler: () => {} });
    };
    await mount([plugin], <Slot name="composer.actions" />);
    await waitFor(() => expect(screen.getByText("react/1")).toBeDefined());
  });
});

describe("reload", () => {
  /** What a plugin registers can change between loads — that is the whole point. */
  const shifting =
    (extra: () => boolean): Plugin =>
    (tiny) => {
      tiny.registerCommand("base", { handler: () => {} });
      if (extra()) tiny.registerCommand("extra", { handler: () => {} });
    };

  const names = () => host?.commands.map((command) => command.name);

  /**
   * Kick the reload off, let React flush, *then* await it. Awaiting inside
   * `act` deadlocks: the promise settles from the load effect, and the effect
   * does not run until the act scope it is waiting on has exited. So the kick
   * is a synchronous `act` — enough to flush the state update that starts the
   * reload — and the wait happens outside.
   */
  const reload = async () => {
    let pending: Promise<void> | undefined;
    act(() => {
      pending = host?.contextFor("test").reload();
    });
    await act(async () => {});
    await pending;
  };

  test("re-runs every factory, picking up what is now registered", async () => {
    let extra = false;
    await mount([shifting(() => extra)]);
    expect(names()).toEqual(["base"]);

    extra = true;
    await reload();
    expect(names()).toEqual(["base", "extra"]);
  });

  test("drops what is no longer registered, so a removed plugin stops running", async () => {
    let extra = true;
    await mount([shifting(() => extra)]);
    expect(names()).toEqual(["base", "extra"]);

    extra = false;
    await reload();
    expect(names()).toEqual(["base"]);
  });

  test("settles even when a factory throws, rather than leaving the caller waiting", async () => {
    const failing: Plugin = () => {
      throw new Error("nope");
    };
    host = undefined;
    await act(async () => {
      render(
        <PluginHost plugins={[failing]}>
          <Probe />
        </PluginHost>,
      );
    });
    await waitFor(() => expect(host).toBeDefined());

    // The load is reported by the host and the registry stays empty; `reload()`
    // promises only that the attempt finished.
    await reload();
    expect(names()).toEqual([]);
  });
});

describe("disposing a plugin in a mounted host", () => {
  test("removes its contributions and leaves the others rendering", async () => {
    const going = definePlugin("going", (tiny) => {
      tiny.contribute("composer.actions", () => <span>going</span>);
      tiny.registerCommand("go", { handler: () => {} });
    });
    const staying = definePlugin("staying", (tiny) => {
      tiny.contribute("composer.actions", () => <span>staying</span>);
      tiny.registerCommand("stay", { handler: () => {} });
    });
    await mount([going, staying], <Slot name="composer.actions" />);

    await waitFor(() => expect(screen.getByText("going")).toBeDefined());
    expect(screen.getByText("staying")).toBeDefined();

    // No reload: the other plugin's factory does not run again.
    await act(async () => {
      host?.registry.dispose("going");
    });

    await waitFor(() => expect(screen.queryByText("going")).toBeNull());
    expect(screen.getByText("staying")).toBeDefined();
    expect(host?.commands.map((command) => command.name)).toEqual(["stay"]);
  });

  test("a factory is not re-run, unlike reload", async () => {
    let runs = 0;
    const counted = definePlugin("counted", (tiny) => {
      runs += 1;
      tiny.registerCommand("c", { handler: () => {} });
    });
    const other = definePlugin("other", (tiny) => tiny.registerCommand("o", { handler: () => {} }));
    await mount([counted, other]);
    expect(runs).toBe(1);

    await act(async () => {
      host?.registry.dispose("other");
    });

    expect(runs).toBe(1);
    expect(host?.commands.map((command) => command.name)).toEqual(["c"]);
  });
});

describe("declared capabilities", () => {
  const settings = { baseUrl: "https://e.test/v1", apiKey: "secret", model: "m" };
  const bridge: AppBridge = {
    messages: [{ role: "user", content: "hi" }],
    streaming: undefined,
    settings,
    signal: undefined,
    send: noop,
    stop: noop,
    updateSettings: noop,
    navigate: noop,
  };
  function Publishes() {
    useProvideApp(bridge);
    return null;
  }

  /**
   * What a plugin declaring `needs` is actually handed, in a host publishing
   * real settings and a real thread.
   */
  const contextOf = async (needs?: readonly Capability[]): Promise<PluginContext | undefined> => {
    let seen: PluginContext | undefined;
    const read = (tiny: Parameters<Plugin>[0]) =>
      tiny.registerCommand("read", {
        handler: (_a, ctx) => {
          seen = ctx;
        },
      });
    const plugin =
      needs === undefined
        ? definePlugin("under-test", read)
        : definePlugin("under-test", { needs }, read);

    await mount([plugin], <Publishes />);
    await runCommand("read");
    return seen;
  };

  test("a plugin that declares nothing is handed everything, as before", async () => {
    const ctx = await contextOf();

    // The default has to stay wide, or declaring would be a breaking change for
    // every plugin that already exists — including every pi extension.
    expect(ctx?.settings?.apiKey).toBe("secret");
    expect(ctx?.chat.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  test('declaring narrows: needs ["chat"] is handed no settings', async () => {
    const ctx = await contextOf(["chat"]);

    // The point of the whole thing: a plugin that never said it wanted the key
    // is not handed the key.
    expect(ctx?.settings).toBeUndefined();
    expect(ctx?.chat.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  test('needs ["settings"] is handed the settings and no conversation', async () => {
    const ctx = await contextOf(["settings"]);

    expect(ctx?.settings?.apiKey).toBe("secret");
    expect(ctx?.chat.messages).toEqual([]);
  });

  test("updateSettings is refused, and says which capability was missing", async () => {
    const warned: string[] = [];
    const consoleError = console.error;
    console.error = (...args: unknown[]) => void warned.push(args.join(" "));
    try {
      const ctx = await contextOf([]);
      ctx?.updateSettings({ baseUrl: "x", apiKey: "y", model: "z" });
    } finally {
      console.error = consoleError;
    }

    expect(warned.join(" ")).toContain('"settings" capability');
  });

  test("registerTool is refused for a plugin that did not ask for tools", async () => {
    const warned: string[] = [];
    const consoleError = console.error;
    console.error = (...args: unknown[]) => void warned.push(args.join(" "));
    try {
      await mount([
        definePlugin("sneaky", { needs: ["chat"] }, (tiny) =>
          tiny.registerTool({
            name: "exfiltrate",
            description: "d",
            parameters: { type: "object" },
            execute: () => ({ content: [{ type: "text", text: "" }] }),
          }),
        ),
      ]);
    } finally {
      console.error = consoleError;
    }

    expect(warned.join(" ")).toContain('"tools" capability');
    expect(host?.registry.tools).toEqual([]);
  });

  test("what each plugin declared is on the registry, for a UI to show", async () => {
    await mount([
      definePlugin("asks", { needs: ["tools", "chat"] }, () => {}),
      definePlugin("quiet", () => {}),
    ]);

    expect(host?.registry.needs.get("asks")).toEqual(["tools", "chat"]);
    // Absent, not empty: "declared nothing" and "declared it wants nothing" are
    // different answers, and only the second one narrows.
    expect(host?.registry.needs.has("quiet")).toBe(false);
  });
});
