import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin, PluginHost } from "@tiny/plugin";
import { MemoryRouter } from "react-router";
import { App } from "../src/App.tsx";
import { deleteConversation, putConversation } from "../src/conversations.ts";

// Panels and pages are promises the *app* makes, so they are asserted against
// the real `App` rather than a stand-in: that a rail nobody asked for does not
// exist, that a page keeps the chrome around it, and that a plugin cannot take
// a path the app already owns.

afterEach(cleanup);
// The conversation store is emptied after every test by `test/setup.ts`, which
// is what lets the row counts below mean anything: they are taken against a
// sidebar with no chats in it, whatever ran before this file.
beforeEach(() => localStorage.clear());

const mount = async (plugins: readonly IdentifiedPlugin[], at = "/") => {
  await act(async () => {
    render(
      <PluginHost plugins={plugins}>
        <MemoryRouter initialEntries={[at]}>
          <App />
        </MemoryRouter>
      </PluginHost>,
    );
  });
};

const notesPanel = definePlugin("notes", (tiny) =>
  tiny.registerPanel("notes", {
    title: "Notes",
    component: () => <p data-testid="notes-body">jotted</p>,
  }),
);

const notesPage = definePlugin("notesPage", (tiny) =>
  tiny.registerRoute("/notes", {
    component: () => <p data-testid="notes-page">a page of my own</p>,
    label: "Notes",
  }),
);

describe("the conversation in the URL", () => {
  const seeded = {
    id: "seeded-id",
    title: "Seeded chat",
    updatedAt: 1,
    messages: [{ role: "user", content: "the seeded question" }],
  } as const;

  afterEach(() => void deleteConversation(seeded.id));

  test("still reaches the thread and the sidebar after the move off useParams", async () => {
    // `App` used to be mounted *by* a route and read `useParams`; it is now the
    // shell above the routes and reads `useMatch("/c/:id")`. Everything keyed on
    // that id — the loaded conversation and the highlighted row — has to survive
    // the swap, and a test that only asserts a composer would not notice: the
    // catch-all renders one too.
    await putConversation(seeded);
    await mount([], `/c/${seeded.id}`);

    await waitFor(() => expect(screen.getByText("the seeded question")).toBeDefined());
    const row = screen.getByTitle("Seeded chat");
    expect(row.className).toContain("bg-hover-2");
  });
});

describe("the right rail", () => {
  test("is absent when no plugin registers a panel", async () => {
    await mount([]);

    expect(screen.queryByTestId("plugin-panels")).toBeNull();
    // The rest of the app is untouched.
    expect(screen.getByLabelText("Chats")).toBeDefined();
    expect(screen.getByLabelText("Prompt")).toBeDefined();
  });

  test("appears as soon as one plugin registers a panel, and can be toggled off", async () => {
    await mount([notesPanel]);

    await waitFor(() => expect(screen.getByTestId("plugin-panels")).toBeDefined());
    expect(screen.getByTestId("notes-body").textContent).toBe("jotted");

    await act(async () => screen.getByTestId("plugin-panels-collapse").click());
    expect(screen.queryByTestId("notes-body")).toBeNull();
    // Collapsed, not gone: the opener is what brings it back.
    expect(screen.getByTestId("plugin-panel-open-notes")).toBeDefined();
  });
});

describe("a plugin page", () => {
  test("replaces the thread while the shell stays put", async () => {
    // Both panel and page, because "the shell stays put" is a claim about the
    // rail as much as the sidebar — `<Panels/>` sits outside `<Routes>` for
    // exactly this reason, and moving it inside would pass a sidebar-only test.
    await mount([notesPage, notesPanel], "/notes");

    await waitFor(() => expect(screen.getByTestId("notes-page")).toBeDefined());
    // The thread and its composer are what the page replaced.
    expect(screen.queryByLabelText("Prompt")).toBeNull();
    // The sidebar and the rail are not, so there is always a way back.
    expect(screen.getByLabelText("Chats")).toBeDefined();
    expect(screen.getByTestId("plugin-panels")).toBeDefined();
    expect(screen.getByTestId("notes-body")).toBeDefined();
  });

  test("is reachable from the sidebar row its label asked for", async () => {
    await mount([notesPage]);

    // On the chat, not the page, until the row is clicked.
    expect(screen.getByLabelText("Prompt")).toBeDefined();
    const row = await waitFor(() => screen.getByTitle("Notes"));

    await act(async () => row.click());
    expect(screen.getByTestId("notes-page")).toBeDefined();
  });

  test("is not listed when it declares no label", async () => {
    const quiet = definePlugin("quiet", (tiny) =>
      tiny.registerRoute("/quiet", { component: () => <p data-testid="quiet-page">quiet</p> }),
    );
    // Counted against a run with no plugins at all: a label-less route rendered
    // as a row would be a row with no title, so looking for one by name proves
    // nothing — only the count does.
    await mount([]);
    // Wait for the conversation list to land before counting: it arrives from
    // IndexedDB a tick after mount, and a count taken either side of that tick
    // is a different number.
    await waitFor(() => expect(screen.getByText("No chats yet")).toBeDefined());
    const bare = screen.getByLabelText("Chats").querySelectorAll("[data-row]").length;

    cleanup();
    await mount([quiet]);
    await waitFor(() => expect(screen.getByText("No chats yet")).toBeDefined());
    expect(screen.getByLabelText("Chats").querySelectorAll("[data-row]").length).toBe(bare);

    // Still addressable — a command or `ctx.navigate` is how it is reached.
    cleanup();
    await mount([quiet], "/quiet");
    await waitFor(() => expect(screen.getByTestId("quiet-page")).toBeDefined());
  });

  test("gets a highlighted row while the user is on it", async () => {
    await mount([notesPage], "/notes");

    const row = await waitFor(() => screen.getByTitle("Notes"));
    expect(row.className).toContain("bg-hover-2");
  });

  test("an unknown path falls back to the chat rather than an empty shell", async () => {
    await mount([], "/gone");

    // The catch-all is all that stands between a stale bookmark and a shell with
    // a void where the thread should be.
    await waitFor(() => expect(screen.getByLabelText("Prompt")).toBeDefined());
  });

  test("is not answered with the chat while the plugins are still loading", async () => {
    // The factories run in an effect, so there is a window where no plugin page
    // exists yet. Answering a bookmarked plugin URL from the catch-all during
    // that window paints the wrong screen — briefly for a bundled plugin, and
    // for as long as a compile takes for an installed one.
    render(
      <PluginHost plugins={[notesPage]}>
        <MemoryRouter initialEntries={["/notes"]}>
          <App />
        </MemoryRouter>
      </PluginHost>,
    );

    // Before the registry lands: no page yet, and no chat pretending to be one.
    expect(screen.queryByTestId("notes-page")).toBeNull();
    expect(screen.queryByLabelText("Prompt")).toBeNull();

    await waitFor(() => expect(screen.getByTestId("notes-page")).toBeDefined());
  });

  test("cannot take a path the app already owns", async () => {
    const greedy = definePlugin("greedy", (tiny) =>
      tiny.registerRoute("/c/:id", { component: () => <p data-testid="hijacked">mine now</p> }),
    );
    await mount([greedy], "/c/abc");

    // The app's own routes are declared first, and React Router breaks a
    // specificity tie by declaration order — so the chat still wins.
    await waitFor(() => expect(screen.getByLabelText("Prompt")).toBeDefined());
    expect(screen.queryByTestId("hijacked")).toBeNull();
  });
});
