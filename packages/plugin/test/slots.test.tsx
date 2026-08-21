import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { PluginHost } from "../src/PluginHost.tsx";
import { Slot } from "../src/Slot.tsx";
import { definePlugin } from "../src/tiny.ts";

afterEach(cleanup);

/**
 * A slot a *plugin* owns, declared the way a plugin declares one.
 *
 * This is the whole mechanism: augment `SlotProps`, render a `Slot` with that
 * name somewhere you own, and other plugins can contribute to it with their
 * components typed. Nothing is registered, and the core is not edited.
 */
declare module "../src/Slot.tsx" {
  interface SlotProps {
    "notes.toolbar": { readonly noteId: string };
  }
}

const mount = async (
  children: React.ReactNode,
  plugins: Parameters<typeof PluginHost>[0]["plugins"],
) => {
  await act(async () => {
    render(<PluginHost plugins={plugins}>{children}</PluginHost>);
  });
};

describe("a slot a plugin declares", () => {
  test("carries a second plugin's component, with the props its owner passes", async () => {
    // The owner: renders the region, and is the only one that knows the noteId.
    const notes = definePlugin("notes", (tiny) => {
      tiny.contribute("app.overlays", () => <Slot name="notes.toolbar" noteId="n-42" />);
    });
    // The contributor: never edited the core, never asked the owner's permission.
    const stamp = definePlugin("stamp", (tiny) => {
      tiny.contribute("notes.toolbar", ({ noteId }) => <span>stamped {noteId}</span>);
    });

    await mount(<Slot name="app.overlays" />, [notes, stamp]);

    await waitFor(() => expect(screen.getByText("stamped n-42")).toBeDefined());
  });

  test("renders nothing when nobody contributes to it", async () => {
    const notes = definePlugin("notes", (tiny) => {
      tiny.contribute("app.overlays", () => (
        <div data-testid="rail">
          <Slot name="notes.toolbar" noteId="n-1" />
        </div>
      ));
    });

    await mount(<Slot name="app.overlays" />, [notes]);

    await waitFor(() => expect(screen.getByTestId("rail")).toBeDefined());
    expect(screen.getByTestId("rail").textContent).toBe("");
  });

  test("keeps contributions to different slots apart", async () => {
    const both = definePlugin("both", (tiny) => {
      tiny.contribute("app.overlays", () => <Slot name="notes.toolbar" noteId="n-1" />);
      tiny.contribute("notes.toolbar", () => <span>toolbar</span>);
      tiny.contribute("composer.actions", () => <span>composer</span>);
    });

    await mount(<Slot name="app.overlays" />, [both]);

    await waitFor(() => expect(screen.getByText("toolbar")).toBeDefined());
    expect(screen.queryByText("composer")).toBeNull();
  });
});

describe("slot props are checked against the slot", () => {
  test("message.actions hands its component a message and an index", async () => {
    const reader = definePlugin("reader", (tiny) => {
      // Both non-optional: this slot always passes them, and now says so. The
      // old shared `SlotProps` made every field optional for every slot, so
      // this component had to null-check a value that is always there.
      tiny.contribute("message.actions", ({ message, index }) => (
        <span>{`${index}:${message.content}`}</span>
      ));
    });

    await mount(
      <Slot name="message.actions" message={{ role: "assistant", content: "hi" }} index={3} />,
      [reader],
    );

    await waitFor(() => expect(screen.getByText("3:hi")).toBeDefined());
  });

  test("a component whose props do not match its slot is a compile error", () => {
    definePlugin("wrong", (tiny) => {
      // @ts-expect-error — `message.actions` passes a PluginMessage, not a string.
      tiny.contribute("message.actions", ({ message }: { message: string }) => (
        <span>{message}</span>
      ));
      // @ts-expect-error — `sidebar.footer` passes nothing at all.
      tiny.contribute("sidebar.footer", ({ noteId }: { noteId: string }) => <span>{noteId}</span>);
    });
    expect(true).toBe(true);
  });

  test("rendering a slot without the props it declares is a compile error", () => {
    const missing = (
      // @ts-expect-error — `message.actions` needs both `message` and `index`.
      <Slot name="message.actions" />
    );
    expect(missing).toBeDefined();
  });
});
