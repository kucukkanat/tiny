import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { memoryRoot } from "@tiny/plugin-fs/testing";
import { memoryManifest } from "../src/inMemoryManifest.ts";
import { type Installed, openInstalled } from "../src/installed.ts";
import { ManagerDialog } from "../src/ManagerDialog.tsx";

// The dialog drives a real store over a real in-memory filesystem, so an
// install in these tests is the same install the app performs.

// bun:test hooks aren't globals, so testing-library can't auto-register this.
afterEach(cleanup);

const HELLO = 'export default (pi) => pi.registerCommand("hello", { handler: () => {} });';

let root: FileSystemDirectoryHandle;
let store: Installed;
let changes: number;

beforeEach(() => {
  root = memoryRoot();
  store = openInstalled({ root: () => Promise.resolve(root), manifest: memoryManifest() });
  changes = 0;
});

const show = () =>
  render(
    <ManagerDialog
      store={store}
      onChanged={() => {
        changes += 1;
      }}
      onClose={() => {}}
    />,
  );

/** Walks the paste flow from an empty list to one installed plugin. */
const pasteInstall = async (source = HELLO, name = "Hello") => {
  fireEvent.click(screen.getByTestId("mode-paste"));
  fireEvent.change(screen.getByTestId("add-source"), { target: { value: source } });
  fireEvent.click(screen.getByTestId("review-plugin"));
  await screen.findByTestId("review-step");
  fireEvent.change(screen.getByTestId("review-name"), { target: { value: name } });
  fireEvent.click(screen.getByTestId("confirm-install"));
};

describe("listing", () => {
  test("says so when nothing is installed", async () => {
    show();
    expect(await screen.findByText("Nothing installed yet.")).toBeTruthy();
  });

  test("shows an installed plugin and where it came from", async () => {
    await store.install({ name: "Hello", source: HELLO });
    show();

    expect(await screen.findByText("Hello")).toBeTruthy();
    expect(screen.getByText("pasted source")).toBeTruthy();
    expect(screen.getByTestId<HTMLInputElement>("toggle-Hello").checked).toBe(true);
  });

  test("warns about a plugin whose source changed, and does not offer to run it", async () => {
    const installed = await store.install({ name: "Hello", source: HELLO });
    const directory = await root.getDirectoryHandle("plugins");
    const writable = await (await directory.getFileHandle(`${installed.id}.js`)).createWritable();
    await writable.write("export default () => {};");
    await writable.close();

    show();
    expect(await screen.findByText(/source changed since you approved it/)).toBeTruthy();
  });
});

describe("adding by paste", () => {
  test("shows the source for approval before anything is stored", async () => {
    show();
    fireEvent.click(screen.getByTestId("mode-paste"));
    fireEvent.change(screen.getByTestId("add-source"), { target: { value: HELLO } });
    fireEvent.click(screen.getByTestId("review-plugin"));

    expect((await screen.findByTestId("review-source")).textContent).toBe(HELLO);
    expect(store.list()).toEqual([]);
  });

  test("installs on approval and reports the change", async () => {
    show();
    await pasteInstall();

    await waitFor(() => expect(store.list()).toHaveLength(1));
    expect(store.list()[0]?.name).toBe("Hello");
    expect(changes).toBe(1);
    expect(await screen.findByTestId("installed-plugin")).toBeTruthy();
  });

  test("cancelling the review stores nothing", async () => {
    show();
    fireEvent.click(screen.getByTestId("mode-paste"));
    fireEvent.change(screen.getByTestId("add-source"), { target: { value: HELLO } });
    fireEvent.click(screen.getByTestId("review-plugin"));
    fireEvent.click(await screen.findByTestId("cancel-install"));

    expect(await screen.findByTestId("installed-list")).toBeTruthy();
    expect(store.list()).toEqual([]);
  });

  test("reports source that is not a plugin instead of storing it", async () => {
    show();
    await pasteInstall("export const nope = 1;", "Not a plugin");

    expect((await screen.findByTestId("manager-error")).textContent).toContain(
      "must `export default` a function",
    );
    expect(store.list()).toEqual([]);
  });
});

describe("adding by URL", () => {
  test("fetches, installs and offers an update", async () => {
    const server = Bun.serve({ port: 0, fetch: () => new Response(HELLO) });
    try {
      show();
      fireEvent.change(screen.getByTestId("add-url"), {
        target: { value: `${server.url.origin}/hello.js` },
      });
      fireEvent.click(screen.getByTestId("review-plugin"));

      // The name is suggested from the URL's filename.
      await waitFor(() =>
        expect(screen.getByTestId<HTMLInputElement>("review-name").value).toBe("hello"),
      );
      fireEvent.click(screen.getByTestId("confirm-install"));

      await waitFor(() => expect(store.list()).toHaveLength(1));
      expect(store.list()[0]?.url).toBe(`${server.url.origin}/hello.js`);
      expect(await screen.findByTestId("update-hello")).toBeTruthy();
    } finally {
      server.stop(true);
    }
  });

  test("reports an unreachable URL", async () => {
    show();
    fireEvent.change(screen.getByTestId("add-url"), {
      target: { value: "ftp://example.com/x.js" },
    });
    fireEvent.click(screen.getByTestId("review-plugin"));

    expect((await screen.findByTestId("manager-error")).textContent).toContain("Only http(s) URLs");
  });
});

describe("managing", () => {
  test("disabling reports a change and survives a re-open", async () => {
    await store.install({ name: "Hello", source: HELLO });
    const { unmount } = show();

    fireEvent.click(await screen.findByTestId("toggle-Hello"));
    await waitFor(() => expect(changes).toBe(1));
    expect(store.list()[0]?.enabled).toBe(false);

    unmount();
    show();
    await waitFor(() =>
      expect(screen.getByTestId<HTMLInputElement>("toggle-Hello").checked).toBe(false),
    );
  });

  test("removing drops it from the list and reports a change", async () => {
    await store.install({ name: "Hello", source: HELLO });
    show();

    fireEvent.click(await screen.findByTestId("remove-Hello"));
    await waitFor(() => expect(changes).toBe(1));
    expect(store.list()).toEqual([]);
    expect(await screen.findByText("Nothing installed yet.")).toBeTruthy();
  });
});
