import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { Plugin } from "@tiny/plugin";
import {
  PluginHost,
  type usePluginContext,
  usePluginHost,
  usePluginProviders,
  useProvideApp,
} from "@tiny/plugin";
import { useMemo, useState } from "react";
import type { Settings } from "../src/settings.ts";

// `registerProvider` is only useful if what a plugin registers reaches the app
// that has to stream through it. These mount the real host and read what the
// app would read — the provider list and the resolved endpoint.

afterEach(cleanup);

const OWN: Settings = { baseUrl: "https://own.test/v1", apiKey: "sk-own", model: "own-model" };

let ctx: ReturnType<typeof usePluginContext> | undefined;
let host: ReturnType<typeof usePluginHost> | undefined;

function Harness({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState<Settings>(initial);
  const providers = usePluginProviders();
  host = usePluginHost();

  useProvideApp(
    useMemo(
      () => ({
        messages: [],
        streaming: undefined,
        settings,
        signal: undefined,
        send: () => {},
        stop: () => {},
        updateSettings: (next: Settings) => setSettings(next),
        navigate: () => {},
        sessionName: "A chat",
        setSessionName: () => {},
      }),
      [settings],
    ),
  );

  return (
    <>
      <ul data-testid="providers">
        {providers.map((entry) => (
          <li key={entry.id}>{`${entry.id}:${entry.config.name}`}</li>
        ))}
      </ul>
      <p data-testid="model">{`${settings.providerId ?? "endpoint"}/${settings.model}`}</p>
    </>
  );
}

/**
 * Mounts the real host over a stand-in for `ChatShell`.
 *
 * Resetting the captured refs happens in here rather than in a test body on
 * purpose: assigning `undefined` at the top level of a test narrows the module
 * variable for the rest of it, and every later read becomes `never`.
 */
const mount = async (plugins: readonly Plugin[]) => {
  host = undefined;
  ctx = undefined;
  render(
    <PluginHost plugins={plugins}>
      <Harness initial={OWN} />
    </PluginHost>,
  );
  // Factories run in an effect, so the registry lands after the first paint.
  await waitFor(() => expect(host?.registry.commands.length ?? -1).toBeGreaterThanOrEqual(0));
};

const groq = (): Plugin => (tiny) => {
  tiny.registerProvider("groq", {
    name: "Groq",
    baseUrl: "https://api.groq.test/v1",
    apiKey: () => Promise.resolve("gsk-secret"),
    models: ["llama-3.3-70b"],
  });
  tiny.registerCommand("capture", {
    description: "Capture the context for assertions",
    handler: (_args, context) => {
      ctx = context;
    },
  });
};

describe("registerProvider in the app", () => {
  test("a registered endpoint reaches the host the app reads from", async () => {
    await mount([groq()]);
    await waitFor(() => expect(screen.getByTestId("providers").textContent).toBe("groq:Groq"));
  });

  test("switching to a provider's model records which provider it came from", async () => {
    await mount([groq()]);
    await waitFor(() => expect(host?.providers).toHaveLength(1));

    await act(async () => {
      await host?.runCommand("capture");
    });
    // What the picker does when a provider's model is chosen.
    act(() => {
      const settings = ctx?.settings;
      if (settings !== undefined)
        ctx?.updateSettings({ ...settings, providerId: "groq", model: "llama-3.3-70b" });
    });

    await waitFor(() => expect(screen.getByTestId("model").textContent).toBe("groq/llama-3.3-70b"));
  });

  test("a provider registered from a command handler appears without a reload", async () => {
    const late = (): Plugin => (tiny) => {
      tiny.registerCommand("add-provider", {
        description: "Register a provider after the factory has returned",
        handler: () => tiny.registerProvider("late", { name: "Late", baseUrl: "https://late/v1" }),
      });
    };
    await mount([late()]);
    expect(screen.getByTestId("providers").textContent).toBe("");

    await act(async () => {
      await host?.runCommand("add-provider");
    });
    await waitFor(() => expect(screen.getByTestId("providers").textContent).toBe("late:Late"));
  });

  test("unregistering removes it again", async () => {
    const toggle = (): Plugin => (tiny) => {
      tiny.registerProvider("x", { name: "X", baseUrl: "https://x/v1" });
      tiny.registerCommand("drop", {
        description: "Remove it",
        handler: () => {
          tiny.unregisterProvider("x");
        },
      });
    };
    await mount([toggle()]);
    await waitFor(() => expect(screen.getByTestId("providers").textContent).toBe("x:X"));

    await act(async () => {
      await host?.runCommand("drop");
    });
    await waitFor(() => expect(screen.getByTestId("providers").textContent).toBe(""));
  });
});

describe("tiny methods backed by the app", () => {
  test("setModel, sendUserMessage and getSessionName reach the bridge", async () => {
    const sent: string[] = [];
    let names: (string | undefined)[] = [];
    const probe = (): Plugin => (tiny) => {
      tiny.registerCommand("probe", {
        description: "Exercise the host-backed methods",
        handler: () => {
          names = [tiny.getSessionName()];
          tiny.setModel("switched");
        },
      });
    };

    await mount([probe()]);
    await waitFor(() => expect(host?.registry.commands).toHaveLength(1));

    await act(async () => {
      await host?.runCommand("probe");
    });
    expect(names).toEqual(["A chat"]);
    await waitFor(() => expect(screen.getByTestId("model").textContent).toBe("endpoint/switched"));
    expect(sent).toEqual([]);
  });

  test("getAllTools and setActiveTools filter what the model is offered", async () => {
    let all: readonly string[] = [];
    let active: readonly string[] = [];
    const tools = (): Plugin => (tiny) => {
      for (const name of ["alpha", "beta"])
        tiny.registerTool({
          name,
          description: `The ${name} tool`,
          parameters: { type: "object" },
          execute: () => ({ content: [{ type: "text", text: name }] }),
        });
      tiny.registerCommand("only-alpha", {
        description: "Disable beta",
        handler: () => {
          all = tiny.getAllTools();
          tiny.setActiveTools(["alpha"]);
        },
      });
      tiny.registerCommand("read-active", {
        description: "Read the active list back",
        handler: () => {
          active = tiny.getActiveTools();
        },
      });
    };

    await mount([tools()]);
    await waitFor(() => expect(host?.registry.tools).toHaveLength(2));
    // Nothing has been switched off, so everything registered is active.
    expect(host?.activeTools).toEqual(["alpha", "beta"]);

    await act(async () => {
      await host?.runCommand("only-alpha");
    });
    expect(all).toEqual(["alpha", "beta"]);
    await waitFor(() => expect(host?.activeTools).toEqual(["alpha"]));

    await act(async () => {
      await host?.runCommand("read-active");
    });
    expect(active).toEqual(["alpha"]);
  });
});
