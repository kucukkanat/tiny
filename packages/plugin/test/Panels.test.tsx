import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { usePluginContext, usePluginHost } from "../src/hooks.ts";
import { Panels } from "../src/Panels.tsx";
import { PluginHost } from "../src/PluginHost.tsx";
import { PluginPage } from "../src/PluginPage.tsx";
import type { Plugin } from "../src/pi.ts";
import { definePlugin } from "../src/pi.ts";
import { emptyRegistry, loadPlugins } from "../src/registry.ts";

// The rail is the one surface that has to be able to *not exist*: an app whose
// plugins register no panel must look exactly as it did before panels existed.

afterEach(() => {
  cleanup();
  host = undefined;
});

beforeEach(() => localStorage.clear());

let host: ReturnType<typeof usePluginHost> | undefined;
function Probe() {
  host = usePluginHost();
  return null;
}

const mount = async (plugins: readonly Plugin[], children?: React.ReactNode) => {
  host = undefined;
  await act(async () => {
    render(
      <PluginHost plugins={plugins}>
        <Probe />
        {children}
      </PluginHost>,
    );
  });
  await waitFor(() => {
    expect(host).toBeDefined();
    expect(host?.registry).not.toBe(emptyRegistry);
  });
};

const panel = (id: string, title: string, body: string) =>
  definePlugin(id, (pi) =>
    pi.registerPanel(id, { title, component: () => <p data-testid={`body-${id}`}>{body}</p> }),
  );

describe("the rail", () => {
  test("does not exist until a plugin registers a panel", async () => {
    await mount([definePlugin("quiet", () => {})], <Panels />);

    expect(screen.queryByTestId("plugin-panels")).toBeNull();
  });

  test("appears with one panel, titled rather than tabbed", async () => {
    await mount([panel("notes", "Notes", "note body")], <Panels />);

    await waitFor(() => expect(screen.getByTestId("plugin-panels")).toBeDefined());
    expect(screen.getByText("Notes")).toBeDefined();
    expect(screen.getByTestId("body-notes").textContent).toBe("note body");
    // One panel needs no tab strip to choose between.
    expect(screen.queryByTestId("plugin-panel-tab-notes")).toBeNull();
  });

  test("shows a tab per panel, in registration order, and switches between them", async () => {
    await mount(
      [panel("notes", "Notes", "note body"), panel("files", "Files", "file body")],
      <Panels />,
    );

    await waitFor(() => expect(screen.getByTestId("plugin-panel-tab-notes")).toBeDefined());
    const tabs = screen
      .getAllByRole("button")
      .filter((node) => node.dataset.testid?.startsWith("plugin-panel-tab-"));
    expect(tabs.map((node) => node.textContent)).toEqual(["Notes", "Files"]);

    // The first registered panel is what the rail opens on.
    expect(screen.getByTestId("body-notes")).toBeDefined();
    expect(screen.queryByTestId("body-files")).toBeNull();

    await act(async () => screen.getByTestId("plugin-panel-tab-files").click());
    expect(screen.getByTestId("body-files")).toBeDefined();
    expect(screen.queryByTestId("body-notes")).toBeNull();
  });

  test("stands an initial in for a missing icon only where there is no title", async () => {
    await mount(
      [panel("notes", "Notes", "note body"), panel("files", "Files", "file body")],
      <Panels />,
    );

    // Beside the title, an initial would only repeat the word.
    await waitFor(() =>
      expect(screen.getByTestId("plugin-panel-tab-notes").textContent).toBe("Notes"),
    );

    await act(async () => screen.getByTestId("plugin-panels-collapse").click());
    // Collapsed there is no title, so the initial is all there is to go on.
    expect(screen.getByTestId("plugin-panel-open-notes").textContent).toBe("N");
  });

  test("uses a declared icon in both the tab and the collapsed rail", async () => {
    const iconed = definePlugin("iconed", (pi) =>
      pi.registerPanel("iconed", {
        title: "Iconed",
        icon: <span data-testid="panel-icon">*</span>,
        component: () => <p>body</p>,
      }),
    );
    await mount([iconed, panel("files", "Files", "file body")], <Panels />);

    await waitFor(() =>
      expect(screen.getByTestId("plugin-panel-tab-iconed").textContent).toBe("*Iconed"),
    );

    await act(async () => screen.getByTestId("plugin-panels-collapse").click());
    expect(screen.getByTestId("plugin-panel-open-iconed").textContent).toBe("*");
  });

  test("collapses to a rail of openers, and reopens on the one clicked", async () => {
    await mount(
      [panel("notes", "Notes", "note body"), panel("files", "Files", "file body")],
      <Panels />,
    );

    await waitFor(() => expect(screen.getByTestId("plugin-panels-collapse")).toBeDefined());
    await act(async () => screen.getByTestId("plugin-panels-collapse").click());

    // Still there — collapsed, not gone, or there would be no way back.
    expect(screen.getByTestId("plugin-panels").dataset.collapsed).toBe("true");
    expect(screen.queryByTestId("body-notes")).toBeNull();

    await act(async () => screen.getByTestId("plugin-panel-open-files").click());
    expect(screen.getByTestId("plugin-panels").dataset.collapsed).toBe("false");
    expect(screen.getByTestId("body-files")).toBeDefined();
  });

  test("remembers which panel was open, and that it was collapsed", async () => {
    localStorage.setItem(
      "tiny-plugin:panels",
      JSON.stringify({ collapsed: false, activeId: "files:files" }),
    );
    await mount(
      [panel("notes", "Notes", "note body"), panel("files", "Files", "file body")],
      <Panels />,
    );

    await waitFor(() => expect(screen.getByTestId("body-files")).toBeDefined());

    await act(async () => screen.getByTestId("plugin-panels-collapse").click());
    expect(localStorage.getItem("tiny-plugin:panels")).toBe(
      JSON.stringify({ collapsed: true, activeId: "files:files" }),
    );
  });

  test("comes back collapsed, and on the panel that was open", async () => {
    // Persistence is a claim about surviving a reload, and a reload is a fresh
    // mount — so it is the *read* path that has to be exercised, not the write.
    localStorage.setItem(
      "tiny-plugin:panels",
      JSON.stringify({ collapsed: true, activeId: "files:files" }),
    );
    await mount(
      [panel("notes", "Notes", "note body"), panel("files", "Files", "file body")],
      <Panels />,
    );

    await waitFor(() => expect(screen.getByTestId("plugin-panels")).toBeDefined());
    expect(screen.getByTestId("plugin-panels").dataset.collapsed).toBe("true");

    // Expanding lands on Files, not on the first panel.
    await act(async () => screen.getByTestId("plugin-panel-open-files").click());
    expect(screen.getByTestId("body-files")).toBeDefined();
  });

  test("replaces an unreadable preference instead of throwing", async () => {
    // `readState` is a `useState` initialiser, so it runs during the rail's own
    // render — above every boundary. A throw here takes the app down, not one
    // panel, which is why the fallback is not decorative.
    localStorage.setItem("tiny-plugin:panels", "{ truncated");
    await mount([panel("notes", "Notes", "note body")], <Panels />);

    await waitFor(() => expect(screen.getByTestId("body-notes")).toBeDefined());
    expect(screen.getByTestId("plugin-panels").dataset.collapsed).toBe("false");
  });

  test("falls back to the first panel when the remembered one is gone", async () => {
    localStorage.setItem(
      "tiny-plugin:panels",
      JSON.stringify({ collapsed: false, activeId: "uninstalled:gone" }),
    );
    await mount([panel("notes", "Notes", "note body")], <Panels />);

    await waitFor(() => expect(screen.getByTestId("body-notes")).toBeDefined());
  });

  test("appears when a panelled plugin is switched on, and goes when it is off", async () => {
    // Requirements 2 and 3 in their live form: `@tiny/plugin-manager` enables and
    // disables plugins at runtime and calls `ctx.reload()`, so the rail has to
    // arrive and leave with them rather than only at startup.
    const { rerender } = render(
      <PluginHost plugins={[]}>
        <Probe />
        <Panels />
      </PluginHost>,
    );
    await waitFor(() => expect(host?.registry).not.toBe(emptyRegistry));
    expect(screen.queryByTestId("plugin-panels")).toBeNull();

    const enabled = [panel("notes", "Notes", "note body")];
    await act(async () => {
      rerender(
        <PluginHost plugins={enabled}>
          <Probe />
          <Panels />
        </PluginHost>,
      );
    });
    await waitFor(() => expect(screen.getByTestId("body-notes")).toBeDefined());

    await act(async () => {
      rerender(
        <PluginHost plugins={[]}>
          <Probe />
          <Panels />
        </PluginHost>,
      );
    });
    await waitFor(() => expect(screen.queryByTestId("plugin-panels")).toBeNull());
  });

  test("a panel reads the app's chat state through its own context", async () => {
    const reader = definePlugin("reader", (pi) =>
      pi.registerPanel("reader", {
        title: "Reader",
        component: function Reader() {
          const ctx = usePluginContext();
          ctx.storage.set("seen", true);
          return <span data-testid="mode">{ctx.mode}</span>;
        },
      }),
    );
    await mount([reader], <Panels />);

    await waitFor(() => expect(screen.getByTestId("mode").textContent).toBe("react"));
    // Namespaced to the panel's plugin, not to whoever rendered the rail.
    expect(localStorage.getItem("tiny-plugin:reader:seen")).toBe("true");
  });

  test("a throwing panel costs only the rail's body", async () => {
    const failing = definePlugin("boom", (pi) =>
      pi.registerPanel("boom", {
        title: "Boom",
        component: () => {
          throw new Error("panel exploded");
        },
      }),
    );
    const errors = mock(() => {});
    const original = console.error;
    console.error = errors;
    try {
      await mount([failing], <Panels />);
      await waitFor(() =>
        expect(screen.getByTestId("plugin-error").textContent).toBe("boom failed"),
      );
    } finally {
      console.error = original;
    }
    // The rail itself survived; only the panel's own output was replaced.
    expect(screen.getByTestId("plugin-panels")).toBeDefined();
  });
});

describe("a page", () => {
  test("renders the registered component, isolated and namespaced", async () => {
    const notes = definePlugin("notes", (pi) =>
      pi.registerRoute("/notes", {
        component: function Page() {
          const ctx = usePluginContext();
          return <span data-testid="page-mode">{ctx.mode}</span>;
        },
        label: "Notes",
      }),
    );
    const { routes } = await loadPlugins([notes]);
    const entry = routes[0];
    expect(entry).toBeDefined();
    if (entry === undefined) return;

    await mount([notes], <PluginPage entry={entry} />);

    await waitFor(() => expect(screen.getByTestId("page-mode").textContent).toBe("react"));
    expect(screen.getByTestId("plugin-page").dataset.path).toBe("/notes");
  });

  test("a throwing page is replaced rather than taking the app down", async () => {
    const failing = definePlugin("boom", (pi) =>
      pi.registerRoute("/boom", {
        component: () => {
          throw new Error("page exploded");
        },
      }),
    );
    const { routes } = await loadPlugins([failing]);
    const entry = routes[0];
    expect(entry).toBeDefined();
    if (entry === undefined) return;

    const errors = mock(() => {});
    const original = console.error;
    console.error = errors;
    try {
      await mount([failing], <PluginPage entry={entry} />);
      await waitFor(() =>
        expect(screen.getByTestId("plugin-error").textContent).toBe("boom failed"),
      );
    } finally {
      console.error = original;
    }
  });
});
