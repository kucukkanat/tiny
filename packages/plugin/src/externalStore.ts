import { useSyncExternalStore } from "react";

/**
 * A value React can subscribe to from outside React.
 *
 * Plugin state cannot live in component state: a command handler, a shortcut and
 * a contributed component are three call sites that need the same switch, and
 * only the last of them is a component. So the value lives in the plugin's
 * closure and components read it with `useSyncExternalStore`.
 *
 * ```ts
 * const open = createExternalStore(false);
 *
 * function Overlay() {
 *   const shown = useStore(open);
 *   return shown ? <Dialog onClose={() => open.set(false)} /> : null;
 * }
 *
 * tiny.registerCommand("settings", { handler: () => open.set(true) });
 * tiny.contribute("app.overlays", Overlay);
 * ```
 */
/**
 * The half of a store a component needs: watch it, read it.
 *
 * Separate from `ExternalStore` so a plugin can hand components a value to read
 * while keeping the writes to itself — `@tiny/plugin-hitl`'s pending question is
 * settled by answering it, never by assignment, and its store says so by
 * exposing this and not `set`.
 */
export type ReadableStore<T> = {
  /** Registers a listener and returns the function that removes it. */
  subscribe(listener: () => void): () => void;
  get(): T;
};

export type ExternalStore<T> = ReadableStore<T> & {
  /** Replaces the value and notifies every listener. */
  set(next: T): void;
};

/**
 * Reads a store from a component, re-rendering when it changes.
 *
 * `useSyncExternalStore(store.subscribe, store.get, store.get)` is the whole
 * body, and every plugin that kept state outside React was writing that line —
 * including the third argument twice, which is the part that is easy to get
 * wrong: omit it and the component throws when the app is server-rendered.
 * A store's value is the same on both sides here, so the getter serves as both.
 */
export const useStore = <T>(store: ReadableStore<T>): T =>
  useSyncExternalStore(store.subscribe, store.get, store.get);

export const createExternalStore = <T>(initial: T): ExternalStore<T> => {
  let current = initial;
  const listeners = new Set<() => void>();

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    get: () => current,
    set: (next) => {
      current = next;
      for (const listener of listeners) listener();
    },
  };
};
