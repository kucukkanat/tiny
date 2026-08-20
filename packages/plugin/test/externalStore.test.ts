import { describe, expect, test } from "bun:test";
import { createExternalStore } from "../src/externalStore.ts";

describe("createExternalStore", () => {
  test("hands back the value it was created with", () => {
    expect(createExternalStore(false).get()).toBe(false);
  });

  test("set replaces the value and notifies every listener", () => {
    const store = createExternalStore("first");
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.get()));
    store.subscribe(() => seen.push(`also ${store.get()}`));

    store.set("second");

    expect(store.get()).toBe("second");
    expect(seen).toEqual(["second", "also second"]);
  });

  test("unsubscribing stops the notifications, leaving the others", () => {
    const store = createExternalStore(0);
    const kept: number[] = [];
    const unsubscribe = store.subscribe(() => kept.push(-1));
    store.subscribe(() => kept.push(store.get()));

    unsubscribe();
    store.set(1);

    expect(kept).toEqual([1]);
  });

  test("a listener reads the new value, not the one it replaced", () => {
    const store = createExternalStore<string | undefined>(undefined);
    let observed: string | undefined = "unset";
    store.subscribe(() => {
      observed = store.get();
    });

    store.set("ready");

    expect(observed).toBe("ready");
  });
});
