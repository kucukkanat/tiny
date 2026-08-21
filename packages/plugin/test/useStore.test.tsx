import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createExternalStore, type ReadableStore, useStore } from "../src/externalStore.ts";

afterEach(cleanup);

describe("useStore", () => {
  test("renders the current value and re-renders when it changes", () => {
    const store = createExternalStore("first");
    function Shown() {
      return <span data-testid="value">{useStore(store)}</span>;
    }

    render(<Shown />);
    expect(screen.getByTestId("value").textContent).toBe("first");

    act(() => store.set("second"));

    expect(screen.getByTestId("value").textContent).toBe("second");
  });

  test("stops listening once the component is gone", () => {
    const store = createExternalStore(0);
    function Shown() {
      return <span>{useStore(store)}</span>;
    }

    const { unmount } = render(<Shown />);
    unmount();

    // A live subscription here would be a leak, and setting would warn about
    // updating an unmounted component rather than doing nothing.
    expect(() => store.set(1)).not.toThrow();
    expect(store.get()).toBe(1);
  });

  test("takes a store that only exposes reads", () => {
    const backing = createExternalStore("held");
    // What a plugin hands out when writes are its own business — @tiny/plugin-hitl's
    // pending question is settled by answering it, never by assignment.
    const readable: ReadableStore<string> = { subscribe: backing.subscribe, get: backing.get };

    function Shown() {
      return <span data-testid="value">{useStore(readable)}</span>;
    }

    render(<Shown />);
    expect(screen.getByTestId("value").textContent).toBe("held");

    act(() => backing.set("changed"));

    expect(screen.getByTestId("value").textContent).toBe("changed");
  });
});
